import { ethers } from 'ethers';
import { ZkapBuilder } from '@baerae/zkap-aa';
import { getChainConfig } from '@/services/chains/chainConfigService';
import { StoredPasskey } from '@/libs/passkey/passkeyStore';
import { RecoveryAccount } from '@/libs/recovery/recoveryAccountStore';
import { AppError } from '@/libs/errors';
import { withRetry } from '@/libs/utils/retry';
import { bundlerApi } from '@/services/api/bundler';
import { toUnpackedUserOp, type CollectedToken } from './zkProofUtils';
import { signWithMasterKey, MasterKeySigningStep } from './masterKeySigningService';
import { buildEncodedTxKeyFromPasskey } from './walletCreationService';
import { createPasskey } from '@/libs/passkey/passkey';
import { savePasskey } from '@/libs/passkey/passkeyStore';

// ============================================================
// Error Types
// ============================================================

export enum TxKeyRecoveryErrorCode {
  CHAIN_CONFIG_FAILED = 'CHAIN_CONFIG_FAILED',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  BUILD_FAILED = 'BUILD_FAILED',
  CORRUPTED_PASSKEY = 'CORRUPTED_PASSKEY',
  SIGNATURE_FAILED = 'SIGNATURE_FAILED',
  SUBMISSION_FAILED = 'SUBMISSION_FAILED',
}

export class TxKeyRecoveryError extends AppError {
  constructor(
    message: string,
    code: TxKeyRecoveryErrorCode,
    recoverable: boolean,
  ) {
    super(message, code, recoverable);
    this.name = 'TxKeyRecoveryError';
  }
}

// ============================================================
// Progress Types
// ============================================================

export type TxKeyUpdateStep =
  | { type: 'building_userop' }
  | { type: 'checking_balance' }
  | { type: 'reading_anchor' }
  | { type: 'signing'; signingStep: MasterKeySigningStep }
  | { type: 'submitting' }
  | { type: 'confirming' }
  | { type: 'completed'; txHash: string }
  | { type: 'error'; message: string };

// ============================================================
// Parameters
// ============================================================

export interface ApplyTxKeyUpdateParams {
  chainId: number;
  sender: string;
  localPasskey: StoredPasskey;
  /** Known recovery accounts (scenario ④). Omit when using collectTokens. */
  currentAccounts?: RecoveryAccount[];
  onProgress?: (step: TxKeyUpdateStep) => void;
  /** Waits for user confirmation before logging in each account */
  onConfirmRequired?: (accountIndex: number, account: RecoveryAccount) => Promise<void>;
  /** Recovery scenario: receives the zkNonce and lets the UI select recovery accounts via OAuth; tokens are used directly as proof tokens. */
  collectTokens?: (zkNonce: string) => Promise<CollectedToken[]>;
  abortSignal?: AbortSignal;
  /** Caller already handled proving bundle download consent/network checks. */
  skipProvingKeyNetworkCheck?: boolean;
}

// ============================================================
// On-chain masterKey info
// ============================================================

/**
 * Read the on-chain masterKey verifier type and anchor for the given account.
 * Returns whether the masterKey uses the 3-of-3 verifier circuit and the current anchor.
 */
export async function readOnChainMasterKeyInfo(
  sender: string,
  chainId: number,
  provider: ethers.JsonRpcProvider,
  chainConfig: Awaited<ReturnType<typeof getChainConfig>>,
): Promise<{ oldAnchor: string[] }> {
  const zkapAccountAbi = [
    'function masterKeyList(uint256) view returns (address logic, uint256 keyId)',
  ];
  const verifierAbi = [
    'function getAnchor(uint8 purpose, address account, uint256 keyId) view returns (uint256[])',
  ];

  const zkapAccount = new ethers.Contract(sender, zkapAccountAbi, provider);
  const masterKeyRef = await withRetry(() => zkapAccount.masterKeyList(0), {
    maxAttempts: 3,
  });

  if (!masterKeyRef.logic || masterKeyRef.logic === ethers.ZeroAddress) {
    throw new TxKeyRecoveryError(
      'masterKeyList returned invalid address',
      TxKeyRecoveryErrorCode.BUILD_FAILED,
      true,
    );
  }

  if (masterKeyRef.logic.toLowerCase() !== chainConfig.contracts.zkOAuthVerifier3of3.toLowerCase()) {
    throw new TxKeyRecoveryError(
      `Unsupported masterKey verifier: ${masterKeyRef.logic}`,
      TxKeyRecoveryErrorCode.BUILD_FAILED,
      true,
    );
  }

  const verifier = new ethers.Contract(masterKeyRef.logic, verifierAbi, provider);
  const onChainAnchor = await withRetry(
    () => verifier.getAnchor(0, sender, masterKeyRef.keyId),
    { maxAttempts: 3 },
  );

  return {
    oldAnchor: onChainAnchor.map((x: bigint) => x.toString()),
  };
}

// ============================================================
// Main Function
// ============================================================

/**
 * Update the on-chain txKey to match the local passkey.
 *
 * Flow:
 * 1. Build encodedTxKey from local passkey
 * 2. Build UserOp with setUpdateTxKeyCallData
 * 3. Check wallet balance vs estimated gas
 * 4. Read old anchor from on-chain masterKey
 * 5. Sign with masterKey (social login → ZK proof)
 * 6. Submit to bundler
 * 7. Wait for confirmation
 */
export async function applyTxKeyUpdate(
  params: ApplyTxKeyUpdateParams,
): Promise<string> {
  const {
    chainId,
    sender,
    localPasskey: initialPasskey,
    currentAccounts,
    onProgress,
    onConfirmRequired,
    collectTokens,
    abortSignal,
    skipProvingKeyNetworkCheck,
  } = params;
  let localPasskey = initialPasskey;

  const checkAborted = () => {
    if (abortSignal?.aborted) {
      throw new Error('TxKey update cancelled');
    }
  };

  // If credentialPubkeyCose is missing (e.g., restored via on-chain reconnection),
  // create a new passkey to obtain it. This replaces the old throw-on-missing behavior.
  if (!localPasskey.credentialPubkeyCose) {
    try {
      const newPasskey = await createPasskey({ nickname: 'recovery' });
      localPasskey = {
        ...localPasskey,
        credentialId: newPasskey.credentialId,
        publicKey: newPasskey.publicKey,
        credentialPubkeyCose: newPasskey.credentialPubkeyCose,
        attestationObject: newPasskey.attestationObject,
      };
      await savePasskey(localPasskey);
    } catch (err) {
      throw new TxKeyRecoveryError(
        'Failed to create new passkey for recovery',
        TxKeyRecoveryErrorCode.CORRUPTED_PASSKEY,
        false,
      );
    }
  }

  // Step 1: Load chain config
  const chainConfig = await withRetry(() => getChainConfig(chainId), {
    maxAttempts: 3,
  }).catch((error) => {
    throw new TxKeyRecoveryError(
      `Failed to get chain config: ${error instanceof Error ? error.message : error}`,
      TxKeyRecoveryErrorCode.CHAIN_CONFIG_FAILED,
      true,
    );
  });

  // Step 2: Build UserOp with setUpdateTxKeyCallData
  checkAborted();
  onProgress?.({ type: 'building_userop' });

  const encodedTxKey = buildEncodedTxKeyFromPasskey(localPasskey, chainConfig);

  const builder = new ZkapBuilder({
    chainId,
    entryPoint: chainConfig.contracts.entryPoint,
    enUrl: chainConfig.rpcUrl,
  });
  builder.setSender(sender);
  builder.setUpdateTxKeyCallData(encodedTxKey);

  // autoFillUserOp handles dummy signature internally (same pattern as recoveryService)
  try {
    await builder.autoFillUserOp();
  } catch (error) {
    throw new TxKeyRecoveryError(
      `Failed to build UserOp: ${error instanceof Error ? error.message : error}`,
      TxKeyRecoveryErrorCode.BUILD_FAILED,
      true,
    );
  }

  // Step 3: Check wallet balance before expensive ZK proof
  checkAborted();
  onProgress?.({ type: 'checking_balance' });

  const userOp = builder.getUserOp();
  const maxFeePerGas = BigInt(userOp.maxFeePerGas);
  const totalGas =
    BigInt(userOp.verificationGasLimit) +
    BigInt(userOp.callGasLimit) +
    BigInt(userOp.preVerificationGas);
  const estimatedCost = maxFeePerGas * totalGas;

  const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
  const balance = await withRetry(() => provider.getBalance(sender), { maxAttempts: 3 });

  if (balance < estimatedCost) {
    throw new TxKeyRecoveryError(
      `Insufficient balance: need ${ethers.formatEther(estimatedCost)} ETH, have ${ethers.formatEther(balance)} ETH`,
      TxKeyRecoveryErrorCode.INSUFFICIENT_BALANCE,
      false,
    );
  }

  // Step 4: Read old anchor + verify on-chain verifier type
  checkAborted();
  onProgress?.({ type: 'reading_anchor' });

  const { oldAnchor } = await readOnChainMasterKeyInfo(
    sender, chainId, provider, chainConfig,
  ).catch((error) => {
    if (error instanceof TxKeyRecoveryError) throw error;
    throw new TxKeyRecoveryError(
      `Failed to read on-chain anchor: ${error instanceof Error ? error.message : error}`,
      TxKeyRecoveryErrorCode.BUILD_FAILED,
      true,
    );
  });

  // Step 5: Sign with masterKey (social login → ZK proof, up to ~2 min)
  checkAborted();
  const userOpHash = builder.getUserOpHash();

  const signingResult = await signWithMasterKey({
    accounts: currentAccounts,
    collectTokens,
    userOpHash,
    anchor: oldAnchor,
    chainId,
    chainConfig,
    onConfirmRequired,
    onProgress: (step) => {
      onProgress?.({ type: 'signing', signingStep: step });
    },
    abortSignal,
    skipProvingKeyNetworkCheck,
  }).catch((error) => {
    throw new TxKeyRecoveryError(
      `Signing failed: ${error instanceof Error ? error.message : error}`,
      TxKeyRecoveryErrorCode.SIGNATURE_FAILED,
      true,
    );
  });

  builder.setSignature([0], [signingResult.signature]);

  // Step 6: Submit to bundler
  checkAborted();
  onProgress?.({ type: 'submitting' });

  let submitResult;
  try {
    const unpackedUserOp = toUnpackedUserOp(builder.getUserOp());
    submitResult = await bundlerApi.submitUnpackedUserOp(chainId, unpackedUserOp);
  } catch (error) {
    throw new TxKeyRecoveryError(
      `Failed to submit UserOp: ${error instanceof Error ? error.message : error}`,
      TxKeyRecoveryErrorCode.SUBMISSION_FAILED,
      true,
    );
  }

  // Step 7: Wait for confirmation
  onProgress?.({ type: 'confirming' });

  let txHash: string;
  try {
    txHash = await bundlerApi.waitForConfirmation(submitResult.userOpHash, chainId, 60000);
  } catch (error) {
    throw new TxKeyRecoveryError(
      `Failed to confirm transaction: ${error instanceof Error ? error.message : error}`,
      TxKeyRecoveryErrorCode.SUBMISSION_FAILED,
      true,
    );
  }

  onProgress?.({ type: 'completed', txHash });
  return txHash;
}
