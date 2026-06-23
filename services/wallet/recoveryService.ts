import {
  ZkapBuilder,
  AccountKeyBuilder,
  PrimitiveAccountKeyTypes,
  KeyInfo,
  ZkOAuthRS256KeyData,
} from '@baerae/zkap-aa';
import { computeAnchor, buildSecretsFromRecoveryAccounts } from '@/services/api/zkp';
import { getChainConfig } from '@/services/chains/chainConfigService';
import { RecoveryAccount } from '@/libs/recovery/recoveryAccountStore';
import { withRetry } from '@/libs/utils/retry';
import { AppError } from '@/libs/errors';
import { bundlerApi, getPimlicoGasPrice } from '@/services/api/bundler';
import { ethers } from 'ethers';
import { toUnpackedUserOp } from './zkProofUtils';
import { signWithMasterKey } from './masterKeySigningService';
import { generateAudHash as nativeGenerateAudHash } from '@baerae/zkap-zkp';
import { CIRCUIT_CONFIGS } from '@/services/zkNative/circuitConfigs';
import { getCanonicalClientId, initProviderConfig } from '@/libs/wallet/providerConfigHelper';

const ZK_N = 3;
const ZK_K = 3;
// Values are read at call time so any override applied by initProviderConfig() is reflected.

// Error types
export enum RecoveryErrorCode {
  CHAIN_CONFIG_FAILED = 'CHAIN_CONFIG_FAILED',
  ANCHOR_COMPUTATION_FAILED = 'ANCHOR_COMPUTATION_FAILED',
  BUILD_FAILED = 'BUILD_FAILED',
  GAS_ESTIMATION_FAILED = 'GAS_ESTIMATION_FAILED',
  INVALID_ACCOUNTS = 'INVALID_ACCOUNTS',
  ACCOUNT_MISMATCH = 'ACCOUNT_MISMATCH',
  PROOF_GENERATION_FAILED = 'PROOF_GENERATION_FAILED',
  SIGNATURE_FAILED = 'SIGNATURE_FAILED',
  SUBMISSION_FAILED = 'SUBMISSION_FAILED',
  PLATFORM_UNSUPPORTED = 'PLATFORM_UNSUPPORTED',
}

export class RecoveryServiceError extends AppError {
  constructor(
    message: string,
    code: RecoveryErrorCode,
    recoverable: boolean
  ) {
    super(message, code, recoverable);
    this.name = 'RecoveryServiceError';
  }
}

export interface UpdateMasterKeyParams {
  chainId: number;
  sender: string;
  newRecoveryAccounts: RecoveryAccount[];
}

async function compute3of3HAudList(accounts: RecoveryAccount[]): Promise<string> {
  if (accounts.length === 0 || accounts.length > 3) {
    throw new RecoveryServiceError(
      'Recovery accounts must be 1-3',
      RecoveryErrorCode.INVALID_ACCOUNTS,
      false
    );
  }

  // The 3-of-3 prover builds the aud_list with ONE entry per credential after
  // padToThree (1→[a,a,a], 2→[a,b,a], 3→[a,b,c]) → generateAudHash([aud_0,aud_1,aud_2])
  // = Poseidon([H(aud)…, H(forbidden) pad]). The registered h_aud_list MUST match
  // that exact list, so register one canonical aud per padded slot — NOT a single
  // entry (which reverts every proof with InvalidAudienceList, 0x629fa140 → AA23).
  const audOf = (a: RecoveryAccount) => getCanonicalClientId(a.provider);
  const slots: string[] =
    accounts.length === 1
      ? [audOf(accounts[0]), audOf(accounts[0]), audOf(accounts[0])]
      : accounts.length === 2
        ? [audOf(accounts[0]), audOf(accounts[1]), audOf(accounts[0])]
        : [audOf(accounts[0]), audOf(accounts[1]), audOf(accounts[2])];
  const { hAudList } = await nativeGenerateAudHash(CIRCUIT_CONFIGS['3-of-3'], slots);
  return hAudList;
}

async function readOnChainMasterKeyInfo(
  sender: string,
  provider: ethers.JsonRpcProvider,
  chainConfig: Awaited<ReturnType<typeof getChainConfig>>
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
    throw new Error('masterKeyList returned invalid address');
  }

  const logic = masterKeyRef.logic.toLowerCase();
  const verifier3of3 = chainConfig.contracts.zkOAuthVerifier3of3.toLowerCase();

  if (logic !== verifier3of3) {
    throw new Error(`Unsupported masterKey verifier: ${masterKeyRef.logic}`);
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

function setDummyZkSignature(builder: ZkapBuilder): void {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const fill = ethers.MaxUint256;
  const dummySignature = abiCoder.encode(
    ['uint256[6]', 'uint256[]', 'uint256[]', 'uint256[8][]'],
    [new Array(6).fill(fill), [fill], [fill], [new Array(8).fill(fill)]],
  );
  builder.setSignature([0], [dummySignature]);
}

async function applyPvgBoost(builder: ZkapBuilder, chainId: number): Promise<void> {
  const pimlicoGas = await getPimlicoGasPrice(chainId);
  if (!pimlicoGas) {
    throw new RecoveryServiceError(
      `Pimlico gas price unavailable for chainId=${chainId}. Retry once network recovers.`,
      RecoveryErrorCode.GAS_ESTIMATION_FAILED,
      true,
    );
  }
  builder.setMaxFeePerGas(pimlicoGas.maxFeePerGas);
  builder.setMaxPriorityFeePerGas(pimlicoGas.maxPriorityFeePerGas);
  const userOp = builder.getUserOp();
  builder.setPreVerificationGas('0x' + (BigInt(userOp.preVerificationGas) * 4n).toString(16));
}

/**
 * Build the encodedMasterKey for a new set of recovery accounts.
 *
 * @param accounts - recovery account array (1–3 entries)
 * @param chainId - chain ID
 * @returns encodedMasterKey hex string
 */
export async function buildEncodedMasterKey(
  accounts: RecoveryAccount[],
  chainId: number
): Promise<string> {
  if (accounts.length === 0 || accounts.length > 3) {
    throw new RecoveryServiceError(
      'Recovery accounts must be 1-3',
      RecoveryErrorCode.INVALID_ACCOUNTS,
      false
    );
  }

  await initProviderConfig();

  const chainConfig = await withRetry(() => getChainConfig(chainId), {
    maxAttempts: 3,
  }).catch((error) => {
    throw new RecoveryServiceError(
      `Failed to get chain config: ${error.message}`,
      RecoveryErrorCode.CHAIN_CONFIG_FAILED,
      true
    );
  });

  const secrets = buildSecretsFromRecoveryAccounts(accounts);

  const anchor = await withRetry(() => computeAnchor(secrets), {
    maxAttempts: 3,
  }).catch((error) => {
    throw new RecoveryServiceError(
      `Failed to compute anchor: ${error.message}`,
      RecoveryErrorCode.ANCHOR_COMPUTATION_FAILED,
      true
    );
  });

  const masterKeyInfo: KeyInfo = {
    keyType: PrimitiveAccountKeyTypes.keyZkOAuthRS256,
    logicContract: chainConfig.contracts.zkOAuthVerifier3of3,
    weight: 1,
    keyData: {
      n: ZK_N,
      k: ZK_K,
      hAudList: await compute3of3HAudList(accounts),
      commitment: anchor,
      poseidonMerkleTreeDirectory: chainConfig.contracts.merkleTreeDirectory,
    } as ZkOAuthRS256KeyData,
  };

  const masterKeyBuilder = new AccountKeyBuilder(1, [masterKeyInfo]);
  return masterKeyBuilder.getEncodedKey();
}

/**
 * Build a UserOp that updates the on-chain masterKey.
 *
 * @param params - chainId, sender, newRecoveryAccounts
 * @returns encodedMasterKey, unsigned builder, anchor (input to ZK proof)
 */
export async function buildUpdateMasterKeyUserOp(
  params: UpdateMasterKeyParams & { chainConfig?: Awaited<ReturnType<typeof getChainConfig>> }
): Promise<{ encodedMasterKey: string; builder: ZkapBuilder; anchor: string[] }> {
  const { chainId, sender, newRecoveryAccounts } = params;

  await initProviderConfig();

  const chainConfig = params.chainConfig ?? await withRetry(() => getChainConfig(chainId), {
    maxAttempts: 3,
  }).catch((error) => {
    throw new RecoveryServiceError(
      `Failed to get chain config: ${error.message}`,
      RecoveryErrorCode.CHAIN_CONFIG_FAILED,
      true
    );
  });

  // 1. Compute anchor from new recovery accounts
  const secrets = buildSecretsFromRecoveryAccounts(newRecoveryAccounts);
  const anchor = await withRetry(() => computeAnchor(secrets), {
    maxAttempts: 3,
  }).catch((error) => {
    throw new RecoveryServiceError(
      `Failed to compute anchor: ${error.message}`,
      RecoveryErrorCode.ANCHOR_COMPUTATION_FAILED,
      true
    );
  });

  // 2. Build masterKey encoding (reuses the anchor computed above)
  const masterKeyInfo: KeyInfo = {
    keyType: PrimitiveAccountKeyTypes.keyZkOAuthRS256,
    logicContract: chainConfig.contracts.zkOAuthVerifier3of3,
    weight: 1,
    keyData: {
      n: ZK_N,
      k: ZK_K,
      hAudList: await compute3of3HAudList(newRecoveryAccounts),
      commitment: anchor,
      poseidonMerkleTreeDirectory: chainConfig.contracts.merkleTreeDirectory,
    } as ZkOAuthRS256KeyData,
  };
  const masterKeyBuilder = new AccountKeyBuilder(1, [masterKeyInfo]);
  const encodedMasterKey = masterKeyBuilder.getEncodedKey();

  // 3. Build UserOp
  const builder = new ZkapBuilder({
    chainId,
    entryPoint: chainConfig.contracts.entryPoint,
    enUrl: chainConfig.rpcUrl,
  });
  builder.setSender(sender);
  builder.setUpdateMasterKeyCallData(encodedMasterKey);

  // 4. Gas estimation
  try {
    setDummyZkSignature(builder);
    await builder.autoFillUserOp();
    await applyPvgBoost(builder, chainId);
  } catch (error) {
    throw new RecoveryServiceError(
      `Failed to estimate gas: ${error}`,
      RecoveryErrorCode.GAS_ESTIMATION_FAILED,
      true
    );
  }

  return { encodedMasterKey, builder, anchor };
}

// ── ApplyStep types ───────────────────────────────────────────────

export type ApplyStep =
  | { type: 'building_userop' }
  | { type: 'downloading_keys'; progress?: { downloaded: number; total: number; percent: number } }
  | { type: 'collecting_tokens'; provider: string; status: 'pending' | 'waiting_user' | 'success' | 'error'; accountIndex: number }
  | { type: 'collecting_merkle_data' }
  | { type: 'generating_proof' }
  | { type: 'signing' }
  | { type: 'submitting' }
  | { type: 'waiting_confirmation' }
  | { type: 'completed'; txHash: string }
  | { type: 'error'; message: string };

export interface ApplyRecoveryUpdateParams {
  chainId: number;
  sender: string;
  currentAccounts: RecoveryAccount[];
  newAccounts: RecoveryAccount[];
  onProgress?: (step: ApplyStep) => void;
  /** Called before each account's OAuth login; resolving the promise proceeds with login. */
  onConfirmRequired?: (accountIndex: number, account: RecoveryAccount) => Promise<void>;
  abortSignal?: AbortSignal;
  /** Caller already handled proving bundle download consent/network checks. */
  skipProvingKeyNetworkCheck?: boolean;
}

// ── applyRecoveryUpdate ───────────────────────────────────────────

export async function applyRecoveryUpdate(
  params: ApplyRecoveryUpdateParams
): Promise<string> {
  const {
    chainId,
    sender,
    currentAccounts,
    newAccounts,
    onProgress,
    onConfirmRequired,
    abortSignal,
    skipProvingKeyNetworkCheck,
  } = params;

  const checkAborted = () => {
    if (abortSignal?.aborted) {
      throw new Error('Recovery update cancelled');
    }
  };

  const timings: Record<string, number> = {};
  const startTimer = (label: string) => { timings[label] = Date.now(); };
  const endTimer = (label: string) => {
    if (timings[label]) {
      const elapsed = ((Date.now() - timings[label]) / 1000).toFixed(2);
      console.log(`[RecoveryUpdate] ${label}: ${elapsed}s`);
      timings[label] = Date.now() - timings[label];
    }
  };

  const totalStart = Date.now();

  // Fetch chain config once — shared across all steps
  startTimer('chainConfig');
  const chainConfig = await withRetry(() => getChainConfig(chainId), {
    maxAttempts: 3,
  }).catch((error) => {
    throw new RecoveryServiceError(
      `Failed to get chain config: ${error.message}`,
      RecoveryErrorCode.CHAIN_CONFIG_FAILED,
      true
    );
  });
  endTimer('chainConfig');

  // Step 1: Build UserOp (with new anchor for masterKey)
  checkAborted();
  onProgress?.({ type: 'building_userop' });
  startTimer('buildUserOp');
  const { builder } = await buildUpdateMasterKeyUserOp({
    chainId,
    sender,
    newRecoveryAccounts: newAccounts,
    chainConfig,
  });
  const userOpHash = builder.getUserOpHash();
  endTimer('buildUserOp');

  // Read old anchor and verifier type from the current on-chain masterKey.
  startTimer('readAnchor');
  const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl, chainConfig.chainId, { staticNetwork: true });
  const { oldAnchor } = await readOnChainMasterKeyInfo(
    sender,
    provider,
    chainConfig,
  ).catch((error) => {
    throw new RecoveryServiceError(
      `Failed to read on-chain anchor: ${error instanceof Error ? error.message : error}`,
      RecoveryErrorCode.ANCHOR_COMPUTATION_FAILED,
      true
    );
  });

  endTimer('readAnchor');

  // Steps 2-5: Collect tokens, merkle data, generate ZK proof, encode signature
  checkAborted();
  startTimer('signWithMasterKey');
  const signingResult = await signWithMasterKey({
    accounts: currentAccounts,
    userOpHash,
    anchor: oldAnchor,
    chainId,
    chainConfig,
    onConfirmRequired,
    skipProvingKeyNetworkCheck,
    onProgress: (step) => {
      switch (step.type) {
        case 'computing_nonce':
          break;
        case 'downloading_keys':
          onProgress?.({ type: 'downloading_keys', progress: step.progress });
          break;
        case 'account_signing': {
          const status = step.status === 'verified' ? 'success'
                       : step.status === 'error' ? 'error'
                       : step.status === 'waiting_user' ? 'waiting_user'
                       : 'pending';
          onProgress?.({ type: 'collecting_tokens', provider: step.account.provider, status, accountIndex: step.accountIndex });
          break;
        }
        case 'collecting_merkle_data':
          onProgress?.({ type: 'collecting_merkle_data' });
          break;
        case 'generating_proof':
          onProgress?.({ type: 'generating_proof' });
          break;
        case 'encoding_signature':
          onProgress?.({ type: 'signing' });
          break;
      }
    },
    abortSignal,
  });
  builder.setSignature([0], [signingResult.signature]);
  endTimer('signWithMasterKey');

  // Step 6: Submit to bundler
  checkAborted();
  onProgress?.({ type: 'submitting' });
  startTimer('submitUserOp');
  const userOp = toUnpackedUserOp(builder.getUserOp());
  const submitResult = await bundlerApi.submitUnpackedUserOp(chainId, userOp);
  endTimer('submitUserOp');

  // Step 7: Wait for confirmation
  onProgress?.({ type: 'waiting_confirmation' });
  startTimer('waitConfirmation');
  const bundleHash = await bundlerApi.waitForConfirmation(submitResult.userOpHash, chainId);
  endTimer('waitConfirmation');

  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(2);
  console.log(`[RecoveryUpdate] ─── TOTAL: ${totalElapsed}s ───`);
  console.log(`[RecoveryUpdate] Breakdown:`, JSON.stringify(
    Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, `${(v / 1000).toFixed(2)}s`]))
  ));

  onProgress?.({ type: 'completed', txHash: bundleHash });
  return bundleHash;
}
