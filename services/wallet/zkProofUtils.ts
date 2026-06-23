import { RecoveryAccount } from '@/libs/recovery/recoveryAccountStore';
import type { SocialProvider } from '@/stores/authStore';
import { getChainConfig } from '@/services/chains/chainConfigService';
import { computePoseidonHash, computePoseidonHashHex } from '@/services/api/zkp';
import { extractJwtKid, decodeIdToken } from '@/libs/jwt/decodeIdToken';
import { googleSignIn } from '@/services/auth/googleAuth';
import { UnpackedUserOperation } from '@/services/api/bundler';
import { fetchGcsJson } from '@/services/api/gcsClient';
import { ethers } from 'ethers';
import * as Crypto from 'expo-crypto';
import { withRetry } from '@/libs/utils/retry';
import type { ZkapBuilder } from '@baerae/zkap-aa';
import {
  prove as nativeProve,
  generateAnchor as nativeGenerateAnchor,
} from '@baerae/zkap-zkp';
import { fetchRsaPublicKey } from '@/services/zkNative/jwksService';
import { ensureProvingBundle, ensureWitnessGen } from '@/services/zkNative/provingKeyManager';
import {
  CIRCUIT_CONFIGS,
  type CircuitType,
} from '@/services/zkNative/circuitConfigs';

// ── Types ────────────────────────────────────────────────────────

// Local ProofResult shape — host backend has been removed (see plan).
// Native ZK proof (`@baerae/zkap-zkp`) returns this same structure.
export interface ProofResult {
  sharedInputs: string[];
  jwtExpList: string[];
  partialRhsList: string[];
  proofs: string[][];
}

export interface MerkleData {
  merklePaths: string[][];
  leafIndices: number[];
  root: string;
}

export interface CollectedToken {
  idToken: string;
  kid: string;
  provider: string;
}

// ── Merkle GCS types + cache ─────────────────────────────────────

interface MerkleLeaf {
  leafHash: string;
  leafIndex: number;
  chainId: number;
  provider: string;
  keyId: string;
}

interface MerkleLeavesResponse {
  chainId: number;
  updatedAt: string;
  leaves: MerkleLeaf[];
}

const MERKLE_CACHE_TTL = 5 * 60 * 1000; // 5 min, matches GCS Cache-Control: max-age=300
const merkleCache = new Map<number, { data: MerkleLeavesResponse; fetchedAt: number }>();

async function fetchMerkleLeaves(chainId: number): Promise<MerkleLeavesResponse> {
  const cached = merkleCache.get(chainId);
  if (cached && Date.now() - cached.fetchedAt < MERKLE_CACHE_TTL) {
    return cached.data;
  }
  const data = await fetchGcsJson<MerkleLeavesResponse>(`merkle/${chainId}.json`);
  merkleCache.set(chainId, { data, fetchedAt: Date.now() });
  return data;
}

// ── validateNonceSupport ─────────────────────────────────────────

/**
 * Google-only environment: nonce is always supported. Re-add branching if
 * multi-provider support is restored.
 */
export function validateNonceSupport(_accounts: RecoveryAccount[] = []): void {
  // no-op: google-only environment, nonce always supported
}

// ── computeZkNonce ───────────────────────────────────────────────

/**
 * Compute the zkNonce used in both recovery and deployment flows.
 * Poseidon(rawUserOpHash, random) — no EIP-191 prefix.
 * ZkapAccount.sol passes the raw userOpHash directly to the verifier, so the
 * prover must receive the same raw value.
 */
export async function computeZkNonce(userOpHash: string): Promise<{
  zkNonce: string;
  signedUserOpHash: string;
  random: string;
}> {
  // Raw userOpHash — no EIP-191 prefix
  const signedUserOpHash = userOpHash;

  const random = ethers.hexlify(Crypto.getRandomBytes(31));

  // nonce = Poseidon(h_sign_user_op, random) as 0x-hex (JWT nonce field).
  // The circuit verifies the nonce as a hex string, so produce hex not decimal.
  const zkNonce = await withRetry(
    () => computePoseidonHashHex([signedUserOpHash, random]),
    { maxAttempts: 3 }
  );

  return { zkNonce, signedUserOpHash, random };
}

// ── getIdTokenWithNonce ──────────────────────────────────────────

/**
 * Sign in with a known recovery account and obtain an idToken bound to the given nonce.
 */
export async function getIdTokenWithNonce(
  account: RecoveryAccount,
  nonce: string,
  onProgress?: (provider: string, status: 'pending' | 'success' | 'error') => void,
  forceAccountSelection?: boolean
): Promise<CollectedToken> {
  onProgress?.(account.provider, 'pending');

  let result: { idToken: string };
  switch (account.provider) {
    case 'google':
      result = await googleSignIn({ nonce, forceAccountSelection: forceAccountSelection ?? false });
      break;
    default:
      throw new Error(`Unsupported provider: ${account.provider}`);
  }

  const decoded = decodeIdToken(result.idToken);
  if (decoded.sub !== account.sub) {
    throw new Error(`Account mismatch: expected ${account.identifier}, got different account`);
  }

  const kid = extractJwtKid(result.idToken);
  onProgress?.(account.provider, 'success');
  return { idToken: result.idToken, kid, provider: account.provider };
}

// ── pickIdTokenWithNonce ─────────────────────────────────────────

export interface PickedToken {
  token: CollectedToken;
  account: RecoveryAccount;
}

/**
 * Recovery scenario (no pre-known accounts): the user picks a recovery account
 * via OAuth and the returned idToken, already bound to the zkNonce, is used
 * directly as the proof token — no separate identity-collection pass needed.
 * Identity (sub/iss/aud) is derived from the response token; mismatch is caught
 * by anchor/proof verification. `account.isDefault` is set by the caller based
 * on slot order (false here).
 */
export async function pickIdTokenWithNonce(
  provider: SocialProvider,
  nonce: string,
  forceAccountSelection = true,
): Promise<PickedToken> {
  let result: { idToken: string; email?: string | null; userName?: string };
  switch (provider) {
    case 'google':
      result = await googleSignIn({ nonce, forceAccountSelection });
      break;
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }

  const decoded = decodeIdToken(result.idToken);
  const kid = extractJwtKid(result.idToken);
  const account: RecoveryAccount = {
    provider,
    iss: decoded.iss,
    sub: decoded.sub,
    aud: decoded.aud,
    identifier: result.email || result.userName || decoded.identifier,
    isDefault: false,
  };
  return { token: { idToken: result.idToken, kid, provider }, account };
}

// ── collectMerkleData ────────────────────────────────────────────

/**
 * Fetch Merkle leaf indices and paths for the given key IDs and providers.
 */
export async function collectMerkleData(
  kids: string[],
  providers: string[],
  chainId: number,
  chainConfig: Awaited<ReturnType<typeof getChainConfig>>
): Promise<MerkleData> {
  const rpcProvider = new ethers.JsonRpcProvider(chainConfig.rpcUrl, chainConfig.chainId, { staticNetwork: true });

  const leavesData = await withRetry(
    () => fetchMerkleLeaves(chainId),
    { maxAttempts: 3 }
  );

  const leafIndices = kids.map((kid, i) => {
    const leaf = leavesData.leaves.find(
      l => l.provider === providers[i].toUpperCase() && l.keyId === kid
    );
    if (!leaf) {
      throw new Error(
        `Merkle leaf not found: provider=${providers[i].toUpperCase()}, kid=${kid}, chainId=${chainId}`
      );
    }
    return leaf.leafIndex;
  });

  const merkleTreeContract = new ethers.Contract(
    chainConfig.contracts.merkleTreeDirectory,
    [
      'function getMerklePath(uint256 index) view returns (uint256[] memory)',
      'function getRoot() view returns (uint256)',
    ],
    rpcProvider
  );

  const [root, ...merklePaths] = await withRetry(
    () => Promise.all([
      merkleTreeContract.getRoot().then((r: bigint) => ethers.toBigInt(r).toString()),
      ...leafIndices.map((leafIndex: number) =>
        merkleTreeContract.getMerklePath(leafIndex)
          .then((path: bigint[]) =>
            // Pass the on-chain getMerklePath() output (bottom→root:
            // [leaf_sibling, inner_1, …, inner_top]) verbatim. @baerae/zkap-zkp's
            // prove() reorders it for the circuit via formatMerklePathForCircuit
            // (leaf sibling first, inner siblings reversed). Do NOT reverse here —
            // a second reverse double-reverses and breaks Merkle membership.
            path.map((x: bigint) => ethers.toBigInt(x).toString())
          )
      ),
    ]),
    { maxAttempts: 3 }
  );

  return { merklePaths, leafIndices, root };
}

// ── generateZkProof ──────────────────────────────────────────────

/**
 * On-device ZK proof generation using `@baerae/zkap-zkp`.
 * The host now runs the entire ZK pipeline natively — no server / WebView fallback.
 */
export async function generateZkProof(params: {
  tokens: CollectedToken[];
  chainId: number;
  signedUserOpHash: string;
  random: string;
  anchor: string[];
  merkleData: MerkleData;
  abortSignal?: AbortSignal;
  audList?: string[];
  manifestDir?: string;
  witnessGenPath?: string;
  witnessGenSidecarPath?: string;
}): Promise<ProofResult> {
  const { tokens, signedUserOpHash, random, anchor, merkleData } = params;

  // 1. Fetch RSA public keys for each token's key ID
  const rsaKeys = await Promise.all(
    tokens.map(t => fetchRsaPublicKey(t.kid, t.provider))
  );

  // 2. Ensure proving bundle is available (uses cache; downloads if absent)
  const circuitType: CircuitType = '3-of-3';
  const config = CIRCUIT_CONFIGS[circuitType];
  const manifestDir = params.manifestDir ?? (await ensureProvingBundle(circuitType));

  // witness_gen.wasm + witness_gen.json ship independently of the CRS bundle;
  // fetch them (cached) unless the caller supplied explicit paths.
  const { witnessGenPath, witnessGenSidecarPath } =
    params.witnessGenPath && params.witnessGenSidecarPath
      ? {
          witnessGenPath: params.witnessGenPath,
          witnessGenSidecarPath: params.witnessGenSidecarPath,
        }
      : await ensureWitnessGen();

  // 3. Anchor padding: the contract stores [...evaluations, hanchor].
  //    The SDK ProveRequest takes only the evaluations (hanchor excluded).
  let anchorParts = anchor.map(x => x.toString());
  if (anchorParts.length === 1) {
    // hanchor = PoseidonHash(anchor[0], "0")
    const h = await computePoseidonHash([anchorParts[0], '0']);
    anchorParts = [...anchorParts, h];
  }
  const anchorEvals = anchorParts.slice(0, -1);

  // 4. Prepare native proof inputs.
  // The SDK's generateAnchor/generateAudHash wraps claim values in quotes internally.
  // Wrapping them again here produces double-quoted strings, causing an anchor mismatch
  // against the JWT claim (witness synthesizer "no valid selector"). Pass raw values.
  const proofSecrets = tokens.map(t => {
    const decoded = decodeIdToken(t.idToken);
    return {
      sub: decoded.sub,
      iss: decoded.iss,
      aud: decoded.aud,
    };
  });

  // Rust ZK circuit expects decimal field element strings (not hex)
  const toDecimalField = (hexOrDec: string): string => {
    if (hexOrDec.startsWith('0x') || hexOrDec.startsWith('0X')) {
      return BigInt(hexOrDec).toString();
    }
    return hexOrDec;
  };

  // Anchor consistency check (deployment only — 1 token with 1 anchor slot).
  // Recovery uses a 3-of-3 anchor but collects only 1 token, so the check is skipped there.
  if (tokens.length === 1 && anchor.length === 1) {
    try {
      const { evaluations } = await nativeGenerateAnchor(config, proofSecrets);
      // SDK may return hex (0x...) — normalise both sides to decimal before comparing
      const jwtDerivedAnchor = evaluations.map(toDecimalField);
      const originalAnchor = anchor.map(x => toDecimalField(x.toString()));
      const anchorMatch = JSON.stringify(jwtDerivedAnchor) === JSON.stringify(originalAnchor);
      if (!anchorMatch) {
        throw new Error(
          `Anchor mismatch: native proof requires native-computed anchor. ` +
          `Expected=${JSON.stringify(jwtDerivedAnchor)}, Got=${JSON.stringify(originalAnchor)}.`
        );
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('Anchor mismatch')) {
        throw e;
      }
      console.warn('[ZKP Native] Anchor verification skipped:', e);
    }
  }

  // 5. aud_list is computed internally by the SDK's prove() from the JWT.

  // 6. On-device Groth16 proof generation.
  // h_sign_user_op and random are the same 0x-hex values used in the nonce computation.
  const nativeResult = await nativeProve(config, {
    manifestDir,
    witnessGenPath,
    witnessGenSidecarPath,
    credentials: tokens.map((token, index) => ({
      jwt: token.idToken,
      rsaModulusB64: rsaKeys[index].nBase64,
      merklePath: merkleData.merklePaths[index],
      merkleLeafIdx: merkleData.leafIndices[index],
    })),
    merkleRoot: merkleData.root,
    anchor: anchorEvals,
    hSignUserOp: signedUserOpHash,
    random: random,
  });

  // Rust shared_inputs layout (jwt_exp separated into jwtExpList):
  // [0]=hanchor, [1]=h_a, [2]=root, [3]=h_sign_userop, [4]=lhs, [5]=h_aud_list
  return {
    proofs: nativeResult.proofs,
    sharedInputs: nativeResult.sharedInputs,
    jwtExpList: nativeResult.jwtExpList,
    partialRhsList: nativeResult.partialRhsList,
  };
}

// ── toUnpackedUserOp ─────────────────────────────────────────────

/**
 * Convert an SDK UserOp to the bundler API's UnpackedUserOperation shape.
 */
export function toUnpackedUserOp(sdkUserOp: ReturnType<ZkapBuilder['getUserOp']>): UnpackedUserOperation {
  return {
    sender: sdkUserOp.sender,
    nonce: sdkUserOp.nonce,
    initCode: sdkUserOp.initCode,
    callData: sdkUserOp.callData,
    callGasLimit: sdkUserOp.callGasLimit,
    verificationGasLimit: sdkUserOp.verificationGasLimit,
    preVerificationGas: sdkUserOp.preVerificationGas,
    maxFeePerGas: sdkUserOp.maxFeePerGas,
    maxPriorityFeePerGas: sdkUserOp.maxPriorityFeePerGas,
    paymaster: sdkUserOp.paymaster,
    paymasterVerificationGasLimit: sdkUserOp.paymasterVerificationGasLimit,
    paymasterPostOpGasLimit: sdkUserOp.paymasterPostOpGasLimit,
    paymasterData: sdkUserOp.paymasterData,
    signature: sdkUserOp.signature,
  };
}
