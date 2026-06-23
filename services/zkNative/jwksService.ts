/**
 * JWKS lookup service.
 *
 * Fetches RSA public keys from an OAuth provider's JWKS endpoint.
 * Results are cached to avoid redundant network requests.
 */

import { Buffer } from 'buffer';

interface JwksKey {
  kty: string;
  kid: string;
  use?: string;
  alg?: string;
  n: string; // RSA modulus (base64url)
  e: string; // RSA exponent (base64url)
}

interface JwksResponse {
  keys: JwksKey[];
}

interface CachedJwks {
  keys: JwksKey[];
  fetchedAt: number;
}

const JWKS_ENDPOINTS: Record<string, string> = {
  google: 'https://www.googleapis.com/oauth2/v3/certs',
};

// Cache TTL: 1 hour
const CACHE_TTL_MS = 60 * 60 * 1000;

const jwksCache = new Map<string, CachedJwks>();

/**
 * Fetch the key list from the JWKS endpoint (with caching).
 */
async function fetchJwks(provider: string): Promise<JwksKey[]> {
  const endpoint = JWKS_ENDPOINTS[provider];
  if (!endpoint) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const cached = jwksCache.get(provider);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.keys;
  }

  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch JWKS from ${provider}: ${response.status}`,
    );
  }

  const data: JwksResponse = await response.json();
  jwksCache.set(provider, {
    keys: data.keys,
    fetchedAt: Date.now(),
  });

  return data.keys;
}

/**
 * Look up an RSA public key by kid and provider.
 *
 * @returns RSA modulus and exponent as byte arrays
 */
export async function fetchRsaPublicKey(
  kid: string,
  provider: string,
): Promise<{ n: Uint8Array; e: Uint8Array; nBase64: string; nBase64Url: string }> {
  const keys = await fetchJwks(provider);
  const key = keys.find((k) => k.kid === kid && k.kty === 'RSA');

  if (!key) {
    throw new Error(`RSA key with kid=${kid} not found for ${provider}`);
  }

  // base64url → base64 → bytes
  const nBase64 = base64UrlToBase64(key.n);
  const nBytes = Buffer.from(nBase64, 'base64');
  const eBytes = Buffer.from(base64UrlToBase64(key.e), 'base64');

  return {
    n: new Uint8Array(nBytes),
    e: new Uint8Array(eBytes),
    nBase64,
    nBase64Url: key.n,
  };
}

/**
 * Convert base64url to standard base64.
 * React Native's Buffer polyfill does not support the 'base64url' encoding.
 */
function base64UrlToBase64(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad) {
    base64 += '='.repeat(4 - pad);
  }
  return base64;
}

/**
 * Clear the JWKS cache.
 */
export function clearJwksCache(): void {
  jwksCache.clear();
}
