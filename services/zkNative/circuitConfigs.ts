import type { CircuitConfig } from '@baerae/zkap-zkp';

/**
 * Circuit configuration for 3-of-3.
 *
 * Must match the server-side CRS config. Update together with the CRS
 * whenever values change.
 */
const SHARED_CONFIG = {
  maxJwtB64Len: 1024,
  maxPayloadB64Len: 896,
  maxAudLen: 155,
  maxExpLen: 20,
  maxIssLen: 93,
  maxNonceLen: 93,
  maxSubLen: 93,
  treeHeight: 15,
  numAudienceLimit: 5,
  claims: ['aud', 'exp', 'iss', 'nonce', 'sub'],
  forbiddenString: 'forbidden',
} as const;

export type CircuitType = '3-of-3';

export const CIRCUIT_CONFIGS: Record<CircuitType, CircuitConfig> = {
  '3-of-3': { ...SHARED_CONFIG, n: 3, k: 3, claims: [...SHARED_CONFIG.claims] },
};

/**
 * Resolve the circuit type from the number of secrets (3-of-3 only).
 */
export function circuitTypeForSecretCount(n: number): CircuitType {
  if (n === 3) return '3-of-3';
  throw new Error(`Unsupported secret count for circuit: ${n}`);
}

export function getCircuitConfig(type: CircuitType): CircuitConfig {
  return CIRCUIT_CONFIGS[type];
}
