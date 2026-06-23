import type { RecoveryAccount } from '@/libs/recovery/recoveryAccountStore';
import {
  generateHash as nativeGenerateHash,
  generateAnchor as nativeGenerateAnchor,
} from '@baerae/zkap-zkp';
import {
  CIRCUIT_CONFIGS,
} from '@/services/zkNative/circuitConfigs';

// Host backend has been removed (see plan). All ZK helpers now run native-only.
// Failure throws — no server fallback.

export interface OAuthSecret {
  // Raw claim values — the SDK (generateAnchor/generateAudHash) wraps each in
  // JSON-style quotes internally. Do NOT pre-quote here (would double-quote and
  // break anchor↔JWT consistency).
  /** Client ID (application ID) */
  aud: string;
  /** Issuer (e.g. accounts.google.com) */
  iss: string;
  /** Subject (unique user ID from provider) */
  sub: string;
}

/**
 * The native SDK returns 0x-prefixed hex. Convert to decimal for contract compatibility.
 */
function hexToDecimalField(value: string): string {
  if (value.startsWith('0x') || value.startsWith('0X')) {
    return BigInt(value).toString();
  }
  return value;
}

/**
 * Compute anchor from OAuth secrets (3-of-3 circuit only).
 * Native-only after host backend removal.
 */
export async function computeAnchor(secrets: OAuthSecret[]): Promise<string[]> {
  if (secrets.length !== 3) {
    throw new Error('Secrets must be exactly 3 (3-of-3 circuit)');
  }
  const config = CIRCUIT_CONFIGS['3-of-3'];
  const { evaluations } = await nativeGenerateAnchor(config, secrets);
  return evaluations.map(hexToDecimalField);
}

/**
 * Build secrets array from recovery accounts
 *
 * Rules:
 * - 1 account: [s1, s1, s1]
 * - 2 accounts: [s1, s2, s1]
 * - 3 accounts: [s1, s2, s3]
 */
export function buildSecretsFromRecoveryAccounts(
  accounts: RecoveryAccount[]
): OAuthSecret[] {
  if (accounts.length === 0) {
    throw new Error('At least one recovery account is required');
  }

  const toSecret = (account: RecoveryAccount): OAuthSecret => ({
    aud: account.aud,
    iss: account.iss,
    sub: account.sub,
  });

  const s1 = toSecret(accounts[0]);
  if (accounts.length === 1) return [s1, s1, s1];

  const s2 = toSecret(accounts[1]);
  if (accounts.length === 2) return [s1, s2, s1];

  const s3 = toSecret(accounts[2]);
  return [s1, s2, s3];
}

/**
 * Compute a Poseidon hash — native-only.
 */
export async function computePoseidonHash(inputs: string[]): Promise<string> {
  const hex = await nativeGenerateHash(inputs);
  return hexToDecimalField(hex);
}

/**
 * Poseidon hash returning the raw 0x-prefixed hex (NOT decimal).
 *
 * Use for the JWT `nonce` claim: the circuit reads `nonce` as a string and
 * compares it byte-wise to the 0x-hex form of `Poseidon(h_sign_user_op, random)`
 * (see zkap-circuit `gen_proof_fixture.rs`: nonce = `generate_poseidon_hash(...)`
 * = 0x-hex). Passing a decimal string makes the nonce-binding constraint fail —
 * the witness still synthesizes but the proof fails post-proof verification.
 */
export async function computePoseidonHashHex(inputs: string[]): Promise<string> {
  return nativeGenerateHash(inputs);
}

