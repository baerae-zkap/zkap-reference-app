import { ethers } from 'ethers';
import { ZkapBuilder, PasskeySigner } from '@baerae/zkap-aa';
import { bundlerApi, getPimlicoGasPrice } from '@/services/api/bundler';
import { toUnpackedUserOp } from './zkProofUtils';
import { getChainConfig } from '@/services/chains/chainConfigService';
import { AppError } from '@/libs/errors';
import { verifyWithPasskeyForSigner } from '@/services/wallet/walletCreationService';
import { isSignatureValidationError, checkPasskeyMatchesOnChain } from './passkeyMismatchService';
import { getStoredPasskey } from '@/libs/passkey/passkeyStore';
import { createDummyPasskeySignature } from './dummyPasskeySignature';

async function applyPvgBoost(builder: InstanceType<typeof ZkapBuilder>, chainId: number): Promise<void> {
  const pimlicoGas = await getPimlicoGasPrice(chainId);
  if (!pimlicoGas) {
    throw new TransactionError(
      `Pimlico gas price unavailable for chainId=${chainId}. Retry once network recovers.`,
      'PIMLICO_GAS_PRICE_UNAVAILABLE',
      true,
    );
  }
  builder.setMaxFeePerGas(pimlicoGas.maxFeePerGas);
  builder.setMaxPriorityFeePerGas(pimlicoGas.maxPriorityFeePerGas);
  const sdkOp = builder.getUserOp();
  const boosted = BigInt(sdkOp.preVerificationGas) * 4n;
  builder.setPreVerificationGas('0x' + boosted.toString(16));
}

// ============================================================
// Types
// ============================================================

export interface TransactionRequest {
  to: string;           // destination address
  value: bigint;        // ETH amount in wei
  data: string;         // calldata ('0x' for plain ETH transfers)
}

export interface TransactionConfig {
  chainId: number;
  sender: string;       // wallet address
  credentialId: string; // passkey credential ID
}

export interface TransactionResult {
  userOpHash: string;
  txHash: string;
}

// ============================================================
// Errors
// ============================================================

export class WalletNotDeployedError extends AppError {
  constructor(message: string = 'Wallet not deployed. Please fund your wallet first.') {
    super(message, 'WALLET_NOT_DEPLOYED', false);
    this.name = 'WalletNotDeployedError';
  }
}

export class TransactionError extends AppError {
  constructor(
    message: string,
    code: string,
    recoverable: boolean
  ) {
    super(message, code, recoverable);
    this.name = 'TransactionError';
  }
}

/** Local passkey does not match the on-chain txKey; recovery accounts can update it. */
export class PasskeyMismatchError extends AppError {
  constructor(message: string = 'Local passkey does not match on-chain txKey') {
    super(message, 'PASSKEY_MISMATCH', true);
    this.name = 'PasskeyMismatchError';
  }
}

export class InsufficientBalanceError extends AppError {
  constructor(message: string = 'Insufficient balance to cover the amount plus the network fee') {
    super(message, 'INSUFFICIENT_BALANCE', false);
    this.name = 'InsufficientBalanceError';
  }
}

/**
 * Returns true if the error likely originated from gas estimation.
 * Without a paymaster the most common cause is transfer amount + fee exceeding balance
 * (ethers v6: code=CALL_EXCEPTION / "missing revert data").
 */
function isGasEstimationError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  if (code === 'CALL_EXCEPTION' || code === 'INSUFFICIENT_FUNDS') return true;
  const msg = error instanceof Error ? error.message : String(error);
  return /estimateGas|missing revert data|insufficient funds|CALL_EXCEPTION/i.test(msg);
}

// ============================================================
// TransactionService
// ============================================================

/**
 * Executes transactions from an already-deployed wallet via ZkapBuilder.
 *
 * - Use setExecuteCallData() or setExecuteBatchCallData() only.
 * - Do not call setCallData() directly (signerKeyTypes must be pre-set).
 * - Do not call setInitCode() (wallet is already deployed).
 */
class TransactionService {
  /**
   * Checks that the wallet is deployed. autoFillUserOp() fails on undeployed wallets,
   * so this guard runs first.
   */
  private async checkWalletDeployed(rpcUrl: string, chainId: number, sender: string): Promise<void> {
    const provider = new ethers.JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });
    const code = await provider.getCode(sender);
    if (code === '0x' || code === '0x0') {
      throw new WalletNotDeployedError();
    }
  }

  /**
   * Convenience wrapper for a plain ETH transfer.
   */
  async sendETH(
    config: TransactionConfig,
    to: string,
    amount: bigint
  ): Promise<TransactionResult> {
    return this.execute(config, { to, value: amount, data: '0x' });
  }

  /**
   * ERC-20 token transfer.
   */
  async sendERC20(
    config: TransactionConfig,
    token: string,
    to: string,
    amount: bigint
  ): Promise<TransactionResult> {
    const iface = new ethers.Interface(['function transfer(address to, uint256 amount)']);
    const data = iface.encodeFunctionData('transfer', [to, amount]);
    return this.execute(config, { to: token, value: 0n, data });
  }

  /**
   * Execute a single transaction from the wallet.
   */
  async execute(
    config: TransactionConfig,
    tx: TransactionRequest
  ): Promise<TransactionResult> {
    // 1. Load chain config
    const chainConfig = await getChainConfig(config.chainId);

    // 2. Guard: wallet must be deployed before building a ZkapBuilder UserOp
    await this.checkWalletDeployed(chainConfig.rpcUrl, config.chainId, config.sender);

    // 3. Build UserOp with ZkapBuilder (not ZkapCreator — wallet is already deployed)
    const builder = new ZkapBuilder({
      chainId: config.chainId,
      entryPoint: chainConfig.contracts.entryPoint,
      enUrl: chainConfig.rpcUrl,
      // no paymaster — user pays gas directly
    });

    // 4. Set sender (already-deployed wallet address)
    builder.setSender(config.sender);

    // 5. setExecuteCallData sets signerKeyTypes=keyWebAuthn and initCode='0x' automatically
    builder.setExecuteCallData(tx.to, tx.value, tx.data);

    // 6. Dummy passkey signature — MUST be set before autoFillUserOp().
    // Without this, SDK estimates preVerificationGas against an empty signature
    // and the bundler rejects the actual userOp with
    // "preVerificationGas is not enough" once the real WebAuthn signature
    // (~440 bytes ABI-encoded) inflates the calldata.
    const dummy = createDummyPasskeySignature();
    builder.setSignature(dummy.keyIndexList, dummy.keySignatureList);

    // 7. Gas estimation and nonce auto-fill
    console.log('Estimating gas...');
    try {
      await builder.autoFillUserOp();
    } catch (error) {
      // Classify estimateGas reverts: without a paymaster the most common cause is
      // transfer amount + fee exceeding balance. Re-read balance to confirm and surface
      // a human-readable InsufficientBalanceError instead of a raw revert dump.
      if (isGasEstimationError(error)) {
        try {
          const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl, config.chainId, { staticNetwork: true });
          const bal = await provider.getBalance(config.sender);
          // value alone exceeds balance → definite insufficient balance.
          // For a plain ETH transfer (data='0x') that passes value but fails estimation,
          // assume value + fee exceeds balance.
          if (bal <= tx.value || (tx.value > 0n && tx.data === '0x')) {
            throw new InsufficientBalanceError();
          }
        } catch (e) {
          if (e instanceof InsufficientBalanceError) throw e;
          // balance query itself failed — fall through to generic estimation error below
        }
        throw new TransactionError(
          'Gas estimation failed. The transaction may revert or the wallet cannot cover the network fee.',
          'GAS_ESTIMATION_FAILED',
          true,
        );
      }
      throw error;
    }

    // 7.1. Apply Pimlico gas price + PVG boost for Pimlico-supported chains.
    await applyPvgBoost(builder, config.chainId);

    // 8. Passkey signing
    console.log('Starting passkey signing...');
    const passkeySigner = new PasskeySigner(config.credentialId, verifyWithPasskeyForSigner);
    const userOpHash = builder.getUserOpHash();
    const signatures = await passkeySigner.signUserOpHash(userOpHash);
    builder.setSignature([0], signatures);  // keyIndex 0 = WebAuthn key
    console.log('Passkey signing succeeded');

    // 9. Submit to bundler and wait for confirmation (with passkey mismatch detection)
    const userOp = builder.getUserOp();
    const unpackedUserOp = toUnpackedUserOp(userOp);

    try {
      console.log('Submitting UserOp via server bundler...');
      console.log('UserOp sender:', userOp.sender);
      console.log('UserOp initCode:', userOp.initCode);  // must be '0x' for deployed wallets
      const result = await bundlerApi.submitUnpackedUserOp(config.chainId, unpackedUserOp);
      console.log('UserOp submitted, hash:', result.userOpHash);

      console.log('Waiting for UserOp confirmation...');
      const txHash = await bundlerApi.waitForConfirmation(result.userOpHash, config.chainId, 60000);
      console.log('UserOp confirmed, txHash:', txHash);

      return { userOpHash: result.userOpHash, txHash };
    } catch (error) {
      const isSigError = isSignatureValidationError(error);
      console.log('[TxService] Error caught, isSigValidationError:', isSigError, 'message:', error instanceof Error ? error.message : String(error));
      if (isSigError) {
        const passkey = await getStoredPasskey();
        console.log('[TxService] Passkey loaded:', !!passkey);
        if (passkey) {
          try {
            const matchResult = await checkPasskeyMatchesOnChain({
              sender: config.sender,
              chainId: config.chainId,
              localPasskey: passkey,
            });
            console.log('[TxService] On-chain match result:', JSON.stringify(matchResult));
            if (!matchResult.match && matchResult.reason === 'key_mismatch') {
              throw new PasskeyMismatchError();
            }
          } catch (matchError) {
            if (matchError instanceof PasskeyMismatchError) throw matchError;
            console.error('[TxService] checkPasskeyMatchesOnChain failed:', matchError instanceof Error ? matchError.message : String(matchError));
          }
        }
      }
      throw error;
    }
  }

  /**
   * Execute multiple transactions atomically in a single UserOp.
   */
  async executeBatch(
    config: TransactionConfig,
    txs: TransactionRequest[]
  ): Promise<TransactionResult> {
    if (txs.length === 0) {
      throw new TransactionError('No transactions to execute', 'EMPTY_BATCH', false);
    }

    const chainConfig = await getChainConfig(config.chainId);
    await this.checkWalletDeployed(chainConfig.rpcUrl, config.chainId, config.sender);

    const builder = new ZkapBuilder({
      chainId: config.chainId,
      entryPoint: chainConfig.contracts.entryPoint,
      enUrl: chainConfig.rpcUrl,
    });

    builder.setSender(config.sender);

    // setExecuteBatchCallData sets signerKeyTypes=keyWebAuthn and initCode='0x' automatically
    builder.setExecuteBatchCallData(
      txs.map(tx => tx.to),
      txs.map(tx => tx.value),
      txs.map(tx => tx.data)
    );

    // Dummy passkey signature for accurate PVG estimation (same rationale as
    // execute() above).
    const dummy = createDummyPasskeySignature();
    builder.setSignature(dummy.keyIndexList, dummy.keySignatureList);

    console.log('Estimating gas for batch...');
    await builder.autoFillUserOp();

    await applyPvgBoost(builder, config.chainId);

    console.log('Starting passkey signing...');
    const passkeySigner = new PasskeySigner(config.credentialId, verifyWithPasskeyForSigner);
    const userOpHash = builder.getUserOpHash();
    const signatures = await passkeySigner.signUserOpHash(userOpHash);
    builder.setSignature([0], signatures);
    console.log('Passkey signing succeeded');

    const userOp = builder.getUserOp();
    const unpackedUserOp = toUnpackedUserOp(userOp);

    try {
      console.log('Submitting batch UserOp...');
      const result = await bundlerApi.submitUnpackedUserOp(config.chainId, unpackedUserOp);
      console.log('Batch UserOp submitted, hash:', result.userOpHash);

      console.log('Waiting for confirmation...');
      const txHash = await bundlerApi.waitForConfirmation(result.userOpHash, config.chainId, 60000);
      console.log('Batch transaction confirmed:', txHash);

      return { userOpHash: result.userOpHash, txHash };
    } catch (error) {
      if (isSignatureValidationError(error)) {
        const passkey = await getStoredPasskey();
        if (passkey) {
          const matchResult = await checkPasskeyMatchesOnChain({
            sender: config.sender,
            chainId: config.chainId,
            localPasskey: passkey,
          });
          if (!matchResult.match && matchResult.reason === 'key_mismatch') {
            throw new PasskeyMismatchError();
          }
        }
      }
      throw error;
    }
  }
}

export const transactionService = new TransactionService();
