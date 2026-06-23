import { ethers } from 'ethers';
import { RecoveryAccount } from '@/libs/recovery/recoveryAccountStore';
import { AppError } from '@/libs/errors';
import {
  validateNonceSupport,
  computeZkNonce,
  getIdTokenWithNonce,
  collectMerkleData,
  generateZkProof,
  CollectedToken,
} from './zkProofUtils';
import { decodeIdToken } from '@/libs/jwt/decodeIdToken';
import { getChainConfig } from '@/services/chains/chainConfigService';
import {
  ensureProvingKey,
  isProvingKeyCached,
  getCachedProvingKeyPath,
  DownloadProgress,
} from '@/services/zkNative/provingKeyManager';
import { getHAud, initProviderConfig } from '@/libs/wallet/providerConfigHelper';

// ── Types ────────────────────────────────────────────────────────

export type SigningAccountStatus = 'pending' | 'waiting_user' | 'signing' | 'verified' | 'error';

export type MasterKeySigningStep =
  | { type: 'computing_nonce' }
  | { type: 'downloading_keys'; progress?: { downloaded: number; total: number; percent: number } }
  | { type: 'account_signing'; accountIndex: number; account: RecoveryAccount; status: SigningAccountStatus }
  | { type: 'collecting_merkle_data' }
  | { type: 'generating_proof' }
  | { type: 'encoding_signature' }
  | { type: 'completed' };

export interface MasterKeySigningParams {
  /** Known recovery accounts (scenarios ④/③: loaded from SecureStore). Omit when using collectTokens. */
  accounts?: RecoveryAccount[];
  userOpHash: string;
  anchor: string[];
  chainId: number;
  chainConfig: Awaited<ReturnType<typeof getChainConfig>>;
  onProgress?: (step: MasterKeySigningStep) => void;
  /** If provided, called before each account's OAuth login so the UI can prompt the user to confirm. */
  onConfirmRequired?: (accountIndex: number, account: RecoveryAccount) => Promise<void>;
  /**
   * Recovery scenario (no pre-known accounts): receives the zkNonce and lets the UI
   * select 1–3 recovery accounts via OAuth, returning tokens to use directly as proof
   * tokens. When provided, replaces the per-account re-auth loop driven by `accounts`.
   */
  collectTokens?: (zkNonce: string) => Promise<CollectedToken[]>;
  abortSignal?: AbortSignal;
  /** Whether to force account selection on Google sign-in. Recommended true for recovery flows. */
  forceAccountSelection?: boolean;
  /** Download consent/network checks may be handled by the caller for explicit UX. */
  skipProvingKeyNetworkCheck?: boolean;
}

export interface MasterKeySigningResult {
  signature: string;
  userName?: string;
}

// ── Errors ───────────────────────────────────────────────────────

export enum MasterKeySigningErrorCode {
  INVALID_ACCOUNTS = 'INVALID_ACCOUNTS',
  PLATFORM_UNSUPPORTED = 'PLATFORM_UNSUPPORTED',
  NONCE_FAILED = 'NONCE_FAILED',
  ACCOUNT_MISMATCH = 'ACCOUNT_MISMATCH',
  TOKEN_COLLECTION_FAILED = 'TOKEN_COLLECTION_FAILED',
  MERKLE_DATA_FAILED = 'MERKLE_DATA_FAILED',
  PROVING_KEY_DOWNLOAD_FAILED = 'PROVING_KEY_DOWNLOAD_FAILED',
  PROOF_GENERATION_FAILED = 'PROOF_GENERATION_FAILED',
  CANCELLED = 'CANCELLED',
}

export class MasterKeySigningError extends AppError {
  constructor(
    message: string,
    code: MasterKeySigningErrorCode,
    recoverable: boolean,
  ) {
    super(message, code, recoverable);
    this.name = 'MasterKeySigningError';
  }
}

// ── padToThree ───────────────────────────────────────────────────

/**
 * Pad an array to exactly 3 elements as required by the 3-of-3 circuit.
 * 1 element → [a,a,a], 2 elements → [a,b,a], 3 elements → [a,b,c].
 */
export function padToThree<T>(arr: T[]): [T, T, T] {
  if (arr.length === 0 || arr.length > 3) {
    throw new MasterKeySigningError(
      `Expected 1-3 items, got ${arr.length}`,
      MasterKeySigningErrorCode.INVALID_ACCOUNTS,
      false,
    );
  }
  if (arr.length === 1) return [arr[0], arr[0], arr[0]];
  if (arr.length === 2) return [arr[0], arr[1], arr[0]];
  return [arr[0], arr[1], arr[2]];
}

// ── signWithMasterKey ────────────────────────────────────────────

/**
 * End-to-end master key signing pipeline (on-device only).
 *
 * 3-of-3 circuit: tokens are padded to 3 via padToThree before proving.
 *
 * @returns ABI-encoded signature ready for setSignature()
 */
export async function signWithMasterKey(
  params: MasterKeySigningParams,
): Promise<MasterKeySigningResult> {
  const {
    accounts = [],
    userOpHash,
    anchor,
    chainId,
    chainConfig,
    onProgress,
    onConfirmRequired,
    collectTokens,
    abortSignal,
    forceAccountSelection,
    skipProvingKeyNetworkCheck,
  } = params;

  // Validate account count upfront; when collectTokens is used, count is re-validated after collection
  if (!collectTokens && (accounts.length === 0 || accounts.length > 3)) {
    throw new MasterKeySigningError(
      `Invalid accounts count: ${accounts.length}. Expected 1-3.`,
      MasterKeySigningErrorCode.INVALID_ACCOUNTS,
      false,
    );
  }

  const checkAborted = () => {
    if (abortSignal?.aborted) {
      throw new MasterKeySigningError(
        'Signing cancelled',
        MasterKeySigningErrorCode.CANCELLED,
        false,
      );
    }
  };

  const signingTimings: Record<string, number> = {};
  const startT = (label: string) => { signingTimings[label] = Date.now(); };
  const endT = (label: string) => {
    if (signingTimings[label]) {
      const elapsed = ((Date.now() - signingTimings[label]) / 1000).toFixed(2);
      console.log(`[MasterKeySigning] ${label}: ${elapsed}s`);
      signingTimings[label] = Date.now() - signingTimings[label];
    }
  };

  // 1. Platform validation
  try {
    validateNonceSupport(accounts);
  } catch (error) {
    throw new MasterKeySigningError(
      error instanceof Error ? error.message : 'Platform validation failed',
      MasterKeySigningErrorCode.PLATFORM_UNSUPPORTED,
      false,
    );
  }

  // 2. Start proving key download in background (parallel with token collection)
  const circuitType = '3-of-3';
  let manifestDir = await getCachedProvingKeyPath(circuitType) ?? undefined;
  let keyDownloadPromise: Promise<string> | null = null;
  if (!manifestDir && !isProvingKeyCached(circuitType)) {
    checkAborted();
    onProgress?.({ type: 'downloading_keys' });
    keyDownloadPromise = ensureProvingKey(
      circuitType,
      (dp: DownloadProgress) => {
        onProgress?.({
          type: 'downloading_keys',
          progress: {
            downloaded: dp.totalBytesWritten,
            total: dp.totalBytesExpectedToWrite,
            percent: dp.percent,
          },
        });
      },
      { skipNetworkCheck: skipProvingKeyNetworkCheck },
    );
  }

  // 3. Compute zkNonce (concurrent with key download)
  checkAborted();
  onProgress?.({ type: 'computing_nonce' });
  startT('computeNonce');
  const { zkNonce, signedUserOpHash, random } = await computeZkNonce(userOpHash).catch((error) => {
    throw new MasterKeySigningError(
      `Failed to compute zkNonce: ${error instanceof Error ? error.message : error}`,
      MasterKeySigningErrorCode.NONCE_FAILED,
      true,
    );
  });

  endT('computeNonce');

  // 4. Collect idTokens
  checkAborted();
  startT('collectTokens');
  let tokens: CollectedToken[];
  if (collectTokens) {
    // Recovery path: UI selects 1–3 recovery accounts via OAuth using the zkNonce;
    // tokens are used directly as proof tokens. Identity is derived from the tokens,
    // so there is no pre-validation — wrong accounts or ordering surfaces as an anchor
    // mismatch (proof failure).
    tokens = await collectTokens(zkNonce);
    checkAborted();
    if (tokens.length === 0 || tokens.length > 3) {
      throw new MasterKeySigningError(
        `Invalid collected token count: ${tokens.length}. Expected 1-3.`,
        MasterKeySigningErrorCode.INVALID_ACCOUNTS,
        false,
      );
    }
  } else {
    const collected: CollectedToken[] = [];
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      checkAborted();

      onProgress?.({ type: 'account_signing', accountIndex: i, account, status: 'waiting_user' });

      if (onConfirmRequired) {
        await onConfirmRequired(i, account);
        checkAborted();
      }

      try {
        const token = await getIdTokenWithNonce(
          account,
          zkNonce,
          (_provider, status) => {
            const mappedStatus: SigningAccountStatus =
              status === 'pending' ? 'signing' : status === 'success' ? 'verified' : 'error';
            onProgress?.({ type: 'account_signing', accountIndex: i, account, status: mappedStatus });
          },
          forceAccountSelection,
        );
        collected.push(token);
      } catch (error) {
        onProgress?.({ type: 'account_signing', accountIndex: i, account, status: 'error' });

        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('Account mismatch')) {
          throw new MasterKeySigningError(
            errorMsg,
            MasterKeySigningErrorCode.ACCOUNT_MISMATCH,
            true,
          );
        }

        throw new MasterKeySigningError(
          `Token collection failed for ${account.provider}: ${errorMsg}`,
          MasterKeySigningErrorCode.TOKEN_COLLECTION_FAILED,
          true,
        );
      }
    }
    tokens = collected;
  }

  endT('collectTokens');

  // 5. Pad tokens for 3-of-3 circuit
  const proofTokens = padToThree(tokens);

  // 6. Await proving key download before proof generation
  if (keyDownloadPromise) {
    try {
      manifestDir = await keyDownloadPromise;
    } catch (error) {
      throw new MasterKeySigningError(
        `Proving key download failed: ${error instanceof Error ? error.message : error}`,
        MasterKeySigningErrorCode.PROVING_KEY_DOWNLOAD_FAILED,
        true,
      );
    }
  }

  // 7. Collect Merkle data
  checkAborted();
  onProgress?.({ type: 'collecting_merkle_data' });
  startT('collectMerkle');
  const merkleData = await collectMerkleData(
    proofTokens.map(t => t.kid),
    proofTokens.map(t => t.provider),
    chainId,
    chainConfig,
  ).catch((error) => {
    throw new MasterKeySigningError(
      `Failed to collect merkle data: ${error instanceof Error ? error.message : error}`,
      MasterKeySigningErrorCode.MERKLE_DATA_FAILED,
      true,
    );
  });

  endT('collectMerkle');

  // 8. Generate ZK proof (on-device only)
  checkAborted();
  startT('generateProof');
  onProgress?.({ type: 'generating_proof' });
  // The native on-device prove() call blocks the JS thread for a long time. Without
  // yielding here, the 'generating_proof' phase emitted above never gets a chance to
  // commit and paint in React — the overlay stays on 'collecting_merkle_data' until
  // prove() returns and 'generating_proof' flashes by too fast to see. One macrotask
  // yield lets React render the phase before the heavy work begins.
  await new Promise((resolve) => setTimeout(resolve, 0));
  // Poseidon-hashed aud per token (ZK circuit public input). Ensure the provider config
  // is ready — in custom(BYO) mode it is built asynchronously; in preset mode this is a
  // no-op (config available synchronously). Idempotent + global once resolved.
  await initProviderConfig();
  const audList = proofTokens.map(t => getHAud(t.provider));

  const proofResult = await generateZkProof({
    tokens: proofTokens,
    chainId,
    signedUserOpHash,
    random,
    anchor,
    merkleData,
    abortSignal,
    audList,
    manifestDir,
  }).catch((error) => {
    throw new MasterKeySigningError(
      `Proof generation failed: ${error instanceof Error ? error.message : error}`,
      MasterKeySigningErrorCode.PROOF_GENERATION_FAILED,
      true,
    );
  });

  endT('generateProof');

  // 9. ABI-encode signature
  checkAborted();
  onProgress?.({ type: 'encoding_signature' });
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const signature = abiCoder.encode(
    ['uint256[6]', 'uint256[]', 'uint256[]', 'uint256[8][]'],
    [proofResult.sharedInputs, proofResult.jwtExpList, proofResult.partialRhsList, proofResult.proofs],
  );

  console.log(`[MasterKeySigning] Breakdown:`, JSON.stringify(
    Object.fromEntries(Object.entries(signingTimings).map(([k, v]) => [k, `${(v / 1000).toFixed(2)}s`]))
  ));

  onProgress?.({ type: 'completed' });

  let userName: string | undefined;
  try {
    userName = decodeIdToken(proofTokens[0].idToken).identifier;
  } catch {
    // ignore
  }

  return { signature, userName };
}
