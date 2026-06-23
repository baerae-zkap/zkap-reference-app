import {
  ZkapCreator,
  AccountKeyBuilder,
  PrimitiveAccountKeyTypes,
  KeyInfo,
  WebAuthnKeyData,
  ZkOAuthRS256KeyData,
  PasskeySigner,
} from '@baerae/zkap-aa';
import { ethers } from 'ethers';
import { getChainConfig, refreshChainConfig, ChainConfig } from '../chains/chainConfigService';
import { computeAnchor, buildSecretsFromRecoveryAccounts } from '../api/zkp';
import { computeDeterministicSalt } from '@/libs/wallet/saltManager';
import { getRpIdHash, getOrigin } from '@/libs/wallet/webAuthnUtils';
import { getRecoveryAccountsByChain, RecoveryAccount } from '@/libs/recovery/recoveryAccountStore';
import { getStoredPasskey, StoredPasskey } from '@/libs/passkey/passkeyStore';
import { WalletStatus, useWalletStore } from '@/stores/walletStore';
import { withRetry } from '@/libs/utils/retry';
import { AppError } from '@/libs/errors';
import { verifyWithPasskey as verifyWithPasskeyPrimitive } from '@/libs/passkey/passkey';
import { createDummyPasskeySignature } from './dummyPasskeySignature';
import { saveWalletRecord, getWalletRecord, markWalletDeployed } from '@/libs/wallet/addressStore';
import { toUnpackedUserOp } from './zkProofUtils';
import { bundlerApi, getPimlicoGasPrice } from '../api/bundler';
import { initProviderConfig, getCanonicalClientId } from '@/libs/wallet/providerConfigHelper';
import { generateAudHash as nativeGenerateAudHash } from '@baerae/zkap-zkp';
import { CIRCUIT_CONFIGS } from '@/services/zkNative/circuitConfigs';

// Wrapper for PasskeySigner - SDK expects { response: { signature, authenticatorData, clientDataJSON } }
const verifyWithPasskeyForSigner = async (credentialId: string, challenge: string) => {
  const result = await verifyWithPasskeyPrimitive({ challenge, credentialId });
  return {
    response: {
      signature: result.signature,
      authenticatorData: result.authenticatorData,
      clientDataJSON: result.clientDataJSON,
    },
  };
};

// ZkOAuthRS256 parameters (fixed)
const ZK_N = 3;
const ZK_K = 3;

export interface WalletCreationParams {
  chainId: number;
}

export interface WalletCreationResult {
  address: string;
  status: WalletStatus;
  txHash?: string;
}

export type WalletCreationProgress =
  | { type: 'building_initcode' }
  | { type: 'estimating_gas' }
  | { type: 'checking_balance' }
  | { type: 'signing' }
  | { type: 'submitting' }
  | { type: 'confirming' };

export enum WalletErrorCode {
  CHAIN_CONFIG_FAILED = 'CHAIN_CONFIG_FAILED',
  ANCHOR_COMPUTATION_FAILED = 'ANCHOR_COMPUTATION_FAILED',
  DERIVATION_FAILED = 'DERIVATION_FAILED',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  DEPLOYMENT_FAILED = 'DEPLOYMENT_FAILED',
  VERIFICATION_FAILED = 'VERIFICATION_FAILED',
  PASSKEY_ERROR = 'PASSKEY_ERROR',
  NO_RECOVERY_ACCOUNTS = 'NO_RECOVERY_ACCOUNTS',
  NETWORK_ERROR = 'NETWORK_ERROR',
}

export class WalletCreationError extends AppError {
  constructor(
    message: string,
    code: WalletErrorCode,
    recoverable: boolean
  ) {
    super(message, code, recoverable);
    this.name = 'WalletCreationError';
  }
}

/**
 * Derive the counterfactual wallet address without deploying.
 *
 * Single 3-of-3 path: the address MUST be derived from the exact same inputs the
 * genesis deploy uses, or the derived address won't match the deployed one
 * (funding/recovery would target a different account — unrecoverable).
 *
 * Identical-input invariant (AC-2) — both here and in `deployWallet()`:
 *   - salt            = computeDeterministicSalt(getCanonicalClientId(provider), sub)  (NOT getOrCreateSalt — random salt would diverge)
 *   - encodedMasterKey = buildEncodedMasterKey3of3(anchor3of3, chainConfig, provider)
 *   - encodedTxKey     = buildEncodedTxKeyFromPasskey(passkey, chainConfig)
 *
 * The sender is derived from the canonical aud, so we resolve the canonical client id
 * (after initProviderConfig() has built the provider config from .env).
 */
export async function deriveWalletAddress(
  params: WalletCreationParams
): Promise<string> {
  const { chainId } = params;

  const chainConfig = await withRetry(() => getChainConfig(chainId), {
    maxAttempts: 3,
  }).catch((error) => {
    throw new WalletCreationError(
      `Failed to get chain config: ${error.message}`,
      WalletErrorCode.CHAIN_CONFIG_FAILED,
      true
    );
  });

  const passkey = await getStoredPasskey();
  if (!passkey?.credentialPubkeyCose) {
    throw new WalletCreationError(
      'Passkey COSE public key not found. Please re-register your passkey.',
      WalletErrorCode.PASSKEY_ERROR,
      false
    );
  }

  const recoveryAccounts = await getRecoveryAccountsByChain(chainId);
  const mainAccount = recoveryAccounts?.find((a) => a.isDefault);
  if (!recoveryAccounts || recoveryAccounts.length === 0 || !mainAccount) {
    throw new WalletCreationError(
      'No recovery accounts configured. Please add at least one recovery account.',
      WalletErrorCode.NO_RECOVERY_ACCOUNTS,
      false
    );
  }

  // Provider config must run before getCanonicalClientId/computeAnchor.
  await initProviderConfig();

  // 3-of-3 anchor over recovery accounts (1 account is padded [s1,s1,s1]).
  const secrets3 = buildSecretsFromRecoveryAccounts(recoveryAccounts);
  const anchor3of3 = await withRetry(() => computeAnchor(secrets3), { maxAttempts: 3 })
    .catch((error) => {
      throw new WalletCreationError(
        `Failed to compute anchor: ${error.message}`,
        WalletErrorCode.ANCHOR_COMPUTATION_FAILED,
        true
      );
    });

  // Shared with deployWallet() — byte-identical CREATE2 inputs (AC-2).
  const { salt, encodedMasterKey, encodedTxKey } = await buildGenesisInputs({
    mainAccount,
    passkey,
    chainConfig,
    anchor3of3,
  });

  try {
    const creator = new ZkapCreator({
      chainId,
      entryPoint: chainConfig.contracts.entryPoint,
      zkapFactory: chainConfig.contracts.zkapFactory,
      enUrl: chainConfig.rpcUrl,
      salt,
      encodedMasterKey,
      encodedTxKey,
    });
    return await creator.deriveZkapAddress();
  } catch (error) {
    throw new WalletCreationError(
      `Failed to derive wallet address: ${error}`,
      WalletErrorCode.DERIVATION_FAILED,
      true
    );
  }
}

/**
 * Get wallet balance
 */
export async function getWalletBalance(
  address: string,
  chainId: number
): Promise<bigint> {
  const chainConfig = await getChainConfig(chainId);
  const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl, chainConfig.chainId, { staticNetwork: true });
  return withRetry(() => provider.getBalance(address), { maxAttempts: 3 });
}

/**
 * Check if wallet is deployed on-chain
 */
export async function checkWalletDeployed(
  address: string,
  chainId: number
): Promise<boolean> {
  const chainConfig = await getChainConfig(chainId);
  const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl, chainConfig.chainId, { staticNetwork: true });
  const code = await withRetry(() => provider.getCode(address), {
    maxAttempts: 3,
  });
  return code !== '0x' && code !== '0x0';
}

/**
 * Verify wallet is deployed on-chain via getCode, then mark as DEPLOYED in store.
 * @param alreadyVerified - skip getCode if caller just checked (avoids double RPC)
 * Throws WalletCreationError(VERIFICATION_FAILED) if not deployed on-chain.
 */
export async function verifyAndMarkDeployed(
  address: string,
  chainId: number,
  options?: { alreadyVerified?: boolean }
): Promise<void> {
  if (!options?.alreadyVerified) {
    // Retry with delay to handle RPC propagation latency after deployment
    const MAX_ATTEMPTS = 5;
    const RETRY_DELAY_MS = 2000;
    let isDeployed = false;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      isDeployed = await checkWalletDeployed(address, chainId);
      if (isDeployed) break;
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }
    }
    if (!isDeployed) {
      throw new WalletCreationError(
        'Wallet deployment could not be verified on-chain',
        WalletErrorCode.VERIFICATION_FAILED,
        true
      );
    }
  }
  useWalletStore.getState().updateWallet(address, chainId, {
    status: WalletStatus.DEPLOYED,
    deployedAt: new Date().toISOString(),
  });
}

/**
 * Resolve current wallet state for a chain.
 *
 * Returns:
 * - { status: 'deployed', address } — counterfactual address already has on-chain code
 * - { status: 'needs_deploy', address } — wallet derived but not yet deployed (caller invokes deployWallet)
 */
export interface ActivationStatus {
  status: 'deployed' | 'needs_deploy';
  address: string;
}

export async function resolveActivationStatus(
  params: WalletCreationParams
): Promise<ActivationStatus> {
  const { chainId } = params;

  await initProviderConfig();

  // owner = genesis main(default) recovery account, used as the per-owner record key
  const recoveryAccounts = await getRecoveryAccountsByChain(chainId);
  const mainAccount = recoveryAccounts?.find((a) => a.isDefault) ?? recoveryAccounts?.[0];
  const owner = mainAccount ? { iss: mainAccount.iss, sub: mainAccount.sub } : undefined;

  // Prefer the persisted address (source-of-truth, passkey-independent). Genesis
  // deploy is passkey-dependent, so re-deriving without a passkey is not always
  // possible; the stored address lets recovery proceed regardless. Falls back to
  // re-derivation only when nothing was persisted yet.
  const record = await getWalletRecord(chainId, owner);
  const address = record?.address ?? (await deriveWalletAddress({ chainId }));
  const isDeployed = await checkWalletDeployed(address, chainId);
  if (isDeployed) {
    await verifyAndMarkDeployed(address, chainId, { alreadyVerified: true });
    await markWalletDeployed(chainId, owner);
    return { status: 'deployed', address };
  }
  return { status: 'needs_deploy', address };
}

/**
 * Host-native wallet deployment — genesis 3-of-3 + passkey txKey (passkey-signed,
 * empty-callData deploy).
 *
 * The account is deployed directly in its final 3-of-3 master + WebAuthn txKey
 * shape, so no 1-of-1 ZK proof / 700MB proving-key download is needed at creation.
 *
 * Flow:
 *  1. Load chain config + passkey + main recovery account
 *  2. Build initCode (3-of-3 masterKey + passkey txKey + deterministic salt)
 *  3. Derive counterfactual address via ZkapCreator
 *  4. Persist address (rollback-safe, before submit) so recovery survives passkey loss
 *  5. setSignerKeyTypes([keyWebAuthn]) + dummy passkey signature → autoFillUserOp for gas
 *  6. Sign the empty-callData userOp with the passkey (WebAuthn / PasskeySigner)
 *  7. Submit UserOp to bundler + wait for confirmation
 *  8. Mark deployed in walletStore via setDeployed(address)
 */
export async function deployWallet(
  params: WalletCreationParams & {
    onProgress?: (step: WalletCreationProgress) => void;
    abortSignal?: AbortSignal;
  }
): Promise<WalletCreationResult> {
  const { chainId, onProgress } = params;

  // 0. Collect required data (force refresh to pick up redeployed contracts)
  const chainConfig = await refreshChainConfig(chainId);
  const passkey = await getStoredPasskey();
  const recoveryAccounts = await getRecoveryAccountsByChain(chainId);
  const mainAccount = recoveryAccounts?.find((a) => a.isDefault);

  if (!passkey?.credentialPubkeyCose) {
    throw new WalletCreationError(
      'Passkey COSE public key not found',
      WalletErrorCode.PASSKEY_ERROR,
      false,
    );
  }
  if (!recoveryAccounts || recoveryAccounts.length === 0 || !mainAccount) {
    throw new WalletCreationError(
      'No default recovery account configured',
      WalletErrorCode.NO_RECOVERY_ACCOUNTS,
      false,
    );
  }

  // 1. Provider config — must run before getCanonicalClientId/computeAnchor
  await initProviderConfig();

  // 2. Build initCode (3-of-3 masterKey + passkey txKey + deterministic salt).
  // MUST match deriveWalletAddress() byte-for-byte (AC-2) or the deployed address
  // diverges from the funded/derived one — hence the shared buildGenesisInputs().
  onProgress?.({ type: 'building_initcode' });

  // Always 3-of-3 (1 account is padded to [s1,s1,s1]); all recovery operations use the 3-of-3 circuit.
  const secrets3 = buildSecretsFromRecoveryAccounts(recoveryAccounts);
  const anchor3of3 = await computeAnchor(secrets3);
  const { salt, encodedMasterKey, encodedTxKey } = await buildGenesisInputs({
    mainAccount,
    passkey,
    chainConfig,
    anchor3of3,
  });

  const creator = new ZkapCreator({
    chainId,
    entryPoint: chainConfig.contracts.entryPoint,
    zkapFactory: chainConfig.contracts.zkapFactory,
    enUrl: chainConfig.rpcUrl,
    salt,
    encodedMasterKey,
    encodedTxKey,
  });

  // Derive address — deriveZkapAddress() internally calls setSender()
  const address = await creator.deriveZkapAddress();

  // 3. Persist record BEFORE submit (rollback-safe). The genesis address is
  // passkey-dependent, so once we know it we store it immediately; this closes
  // the "deploy succeeded + persist failed → unrecoverable" window. The address
  // is deterministic, so storing it again on retry/re-login is harmless. owner =
  // genesis main(default) account → same-account re-login resolves to home;
  // deployed flips to true after on-chain confirmation (step 8).
  await saveWalletRecord({
    address,
    chainId,
    owner: { iss: mainAccount.iss, sub: mainAccount.sub },
    deployed: false,
    updatedAt: new Date().toISOString(),
  });

  // 4. Gas estimation. callData stays empty ('0x') — the SDK "wallet creation
  // only" path handles this. setSignerKeyTypes([keyWebAuthn]) is load-bearing:
  // with no callData, nothing else sets signerKeyTypes, and autoFillUserOp throws
  // if it is unset. The dummy passkey signature pads calldata to its real size so
  // preVerificationGas is estimated accurately (see createDummyPasskeySignature).
  creator.setSignerKeyTypes([PrimitiveAccountKeyTypes.keyWebAuthn]);
  const dummy = createDummyPasskeySignature();
  creator.setSignature(dummy.keyIndexList, dummy.keySignatureList);
  // Genesis deploy has no execute call, so callData is empty. The SDK's autoFillUserOp
  // defaults initCode/preVerificationGas/signature before calculatePreVerificationGas →
  // packUserOp → encodeUserOp, but NOT callData — leaving it unset makes ethers throw
  // `invalid BytesLike value (value=null)` while ABI-encoding the userOp. Set it to '0x'.
  creator.setCallData('0x');

  onProgress?.({ type: 'estimating_gas' });
  try {
    await creator.autoFillUserOp();
  } catch (error) {
    throw new WalletCreationError(
      `Failed to estimate gas: ${error}`,
      WalletErrorCode.DEPLOYMENT_FAILED,
      true,
    );
  }

  // 4.1. Apply Pimlico gas price + preVerificationGas safety margin.
  // autoFillUserOp() estimated PVG against the dummy signature; the real WebAuthn
  // signature's calldata may differ, so Pimlico recomputes a higher required PVG
  // and rejects the op ("preVerificationGas is not enough"). It also needs a
  // non-zero priority fee. This MUST run before getUserOpHash() — preVerificationGas
  // and the fee fields are part of the userOpHash, and the passkey signature binds
  // to that hash, so boosting after signing would invalidate the signature.
  // (Mirrors transactionService.applyPvgBoost; kept inline to avoid an import cycle.)
  const pimlicoGas = await getPimlicoGasPrice(chainId);
  if (!pimlicoGas) {
    throw new WalletCreationError(
      `Pimlico gas price unavailable for chainId=${chainId}. Retry once network recovers.`,
      WalletErrorCode.DEPLOYMENT_FAILED,
      true,
    );
  }
  creator.setMaxFeePerGas(pimlicoGas.maxFeePerGas);
  creator.setMaxPriorityFeePerGas(pimlicoGas.maxPriorityFeePerGas);
  const filled = creator.getUserOp();
  creator.setPreVerificationGas('0x' + (BigInt(filled.preVerificationGas) * 4n).toString(16));

  // 4.2. Prefund gate — this reference app has no paymaster, so the
  // counterfactual wallet itself must already hold enough Base Sepolia ETH.
  onProgress?.({ type: 'checking_balance' });
  const estimatedUserOp = creator.getUserOp();
  const estimatedCost =
    BigInt(estimatedUserOp.maxFeePerGas) *
    (
      BigInt(estimatedUserOp.verificationGasLimit) +
      BigInt(estimatedUserOp.callGasLimit) +
      BigInt(estimatedUserOp.preVerificationGas)
    );
  const provider = new ethers.JsonRpcProvider(
    chainConfig.rpcUrl,
    chainConfig.chainId,
    { staticNetwork: true },
  );
  const balance = await withRetry(() => provider.getBalance(address), { maxAttempts: 3 });
  if (balance < estimatedCost) {
    throw new WalletCreationError(
      `Insufficient prefund: need ${ethers.formatEther(estimatedCost)} ETH, have ${ethers.formatEther(balance)} ETH`,
      WalletErrorCode.INSUFFICIENT_BALANCE,
      false,
    );
  }

  // 5-6. Sign the empty-callData userOp with the passkey (WebAuthn). The OS
  // passkey dialog fires here. getUserOpHash() must come after the PVG boost
  // above — preVerificationGas and the fee fields are part of the hash.
  onProgress?.({ type: 'signing' });
  const userOpHash = creator.getUserOpHash();
  const passkeySigner = new PasskeySigner(passkey.credentialId, verifyWithPasskeyForSigner);
  const signatures = await passkeySigner.signUserOpHash(userOpHash);
  creator.setSignature([0], signatures);

  // 7. Submit & confirm
  onProgress?.({ type: 'submitting' });

  // Address mismatch handling — after contract redeployment, CREATE2 address may change.
  // Update stored address only if not yet deployed; refuse to change a DEPLOYED wallet.
  const existingWallet = useWalletStore.getState().getWalletByChainId(chainId);
  if (existingWallet && existingWallet.address.toLowerCase() !== address.toLowerCase()) {
    if (existingWallet.status === WalletStatus.DEPLOYED) {
      throw new WalletCreationError(
        `Address mismatch: deployed=${existingWallet.address}, new=${address}`,
        WalletErrorCode.DERIVATION_FAILED,
        false,
      );
    }
    useWalletStore.getState().updateWallet(existingWallet.address, chainId, { address });
  }

  const userOp = creator.getUserOp();
  const unpackedUserOp = toUnpackedUserOp(userOp);

  let submitResult;
  try {
    submitResult = await bundlerApi.submitUnpackedUserOp(chainId, unpackedUserOp);
  } catch (error) {
    throw new WalletCreationError(
      `Failed to submit UserOp: ${error instanceof Error ? error.message : error}`,
      WalletErrorCode.DEPLOYMENT_FAILED,
      true,
    );
  }

  onProgress?.({ type: 'confirming' });
  let txHash: string;
  try {
    txHash = await bundlerApi.waitForConfirmation(submitResult.userOpHash, chainId, 60000);
  } catch (error) {
    throw new WalletCreationError(
      `Failed to confirm deployment: ${error instanceof Error ? error.message : error}`,
      WalletErrorCode.DEPLOYMENT_FAILED,
      true,
    );
  }

  // 8. Mark deployed (schema-agnostic helper — works on multi/single wallet schema)
  useWalletStore.getState().setDeployed(address);
  // Flip the persisted record's deployed flag so a later re-login resolves to home
  // via the stored owner record without depending on a live RPC check (fail-open).
  await markWalletDeployed(chainId, { iss: mainAccount.iss, sub: mainAccount.sub });

  return { address, status: WalletStatus.DEPLOYED, txHash };
}

/**
 * The exact CREATE2 inputs the genesis account is deployed with.
 *
 * AC-2 guard: `deriveWalletAddress()` and `deployWallet()` BOTH build the
 * ZkapCreator from the value this helper returns, so the (salt, encodedMasterKey,
 * encodedTxKey) triple is byte-identical between derive and deploy by construction
 * — there is no second code path that could diverge (e.g. a random getOrCreateSalt
 * salt) and silently deploy/fund a different, unrecoverable address.
 *
 * Pure given its inputs: the network-bound anchor (computeAnchor) is computed by
 * the caller and injected as `anchor3of3`, so this helper is deterministic and
 * unit-testable. `getCanonicalClientId` reads the provider config that
 * `initProviderConfig()` must have populated beforehand (caller's responsibility).
 */
export interface GenesisInputs {
  salt: string;
  encodedMasterKey: string;
  encodedTxKey: string;
}

export async function buildGenesisInputs(params: {
  mainAccount: RecoveryAccount;
  passkey: StoredPasskey;
  chainConfig: ChainConfig;
  anchor3of3: string[];
}): Promise<GenesisInputs> {
  const { mainAccount, passkey, chainConfig, anchor3of3 } = params;
  const canonicalAud = getCanonicalClientId(mainAccount.provider);
  const salt = computeDeterministicSalt(canonicalAud, mainAccount.sub);
  const encodedMasterKey = await buildEncodedMasterKey3of3(anchor3of3, chainConfig, mainAccount.provider);
  const encodedTxKey = buildEncodedTxKeyFromPasskey(passkey, chainConfig);
  return { salt, encodedMasterKey, encodedTxKey };
}

/**
 * 3-of-3 masterKey hAudList — MUST be recomputed from the canonical aud. Do NOT
 * use the config's getHAudLists() here.
 *
 * The 3-of-3 verifier checks the proof's h_aud_list (sharedInputs[5]) against this
 * stored value (AccountKeyZkOAuthRS256Verifier3.sol:240). The prover builds the
 * aud_list with ONE entry PER CREDENTIAL (k=3 after padToThree) — i.e.
 * generateAudHash([aud_0, aud_1, aud_2]) → Poseidon([H(aud)×3, H(forbidden)×2]) —
 * NOT a single-element list. Registering generateAudHash([canonicalAud]) (1 entry)
 * makes every recovery proof revert with InvalidAudienceList (0x629fa140 → AA23).
 * Genesis is a single Google account padded to 3 identical slots, so all three
 * audiences are the canonical aud. Because updateKeys/updateMasterKey can ONLY be
 * authorized by the masterKey itself (ZkapAccount.sol:444-473), a wrong value
 * bricks recovery permanently — it cannot be repaired on-chain.
 */
async function compute3of3HAudList(provider: string): Promise<string> {
  const canonicalAud = getCanonicalClientId(provider);
  const { hAudList } = await nativeGenerateAudHash(
    CIRCUIT_CONFIGS['3-of-3'],
    [canonicalAud, canonicalAud, canonicalAud],
  );
  return hAudList;
}

/**
 * Internal: 3-of-3 masterKey encoding (used during initial deploy)
 */
async function buildEncodedMasterKey3of3(
  anchor: string[],
  chainConfig: ChainConfig,
  provider: string,
): Promise<string> {
  const keyInfo: KeyInfo = {
    keyType: PrimitiveAccountKeyTypes.keyZkOAuthRS256,
    logicContract: chainConfig.contracts.zkOAuthVerifier3of3,
    weight: 1,
    keyData: {
      n: ZK_N,
      k: ZK_K,
      hAudList: await compute3of3HAudList(provider),
      commitment: anchor,
      poseidonMerkleTreeDirectory: chainConfig.contracts.merkleTreeDirectory,
    } as ZkOAuthRS256KeyData,
  };
  return new AccountKeyBuilder(1, [keyInfo]).getEncodedKey();
}

/**
 * Encode a passkey as a txKey for the AccountKeyBuilder.
 */
export function buildEncodedTxKeyFromPasskey(passkey: StoredPasskey, chainConfig: ChainConfig): string {
  const txKeyInfo: KeyInfo = {
    keyType: PrimitiveAccountKeyTypes.keyWebAuthn,
    logicContract: chainConfig.contracts.webAuthnImpl,
    weight: 1,
    keyData: {
      credentialPubkey: passkey.credentialPubkeyCose!,
      credentialId: passkey.credentialId,
      rpIdHash: getRpIdHash(),
      origin: getOrigin(),
    } as WebAuthnKeyData,
  };
  return new AccountKeyBuilder(1, [txKeyInfo]).getEncodedKey();
}

export { verifyWithPasskeyForSigner };
