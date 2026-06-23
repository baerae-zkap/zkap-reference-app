import { reconnectPasskey } from '@/libs/zkap/passkeyReconnect';
import { verifyWithPasskey, createChallenge } from '@/libs/passkey/passkey';
import { savePasskey, getStoredPasskey } from '@/libs/passkey/passkeyStore';

export interface ReconnectionResult {
  success: boolean;
  credentialId?: string;
  publicKey?: { x: string; y: string };
  reason?: 'no_onchain_key' | 'passkey_not_available' | 'verification_failed';
}

/**
 * Silent check: query on-chain txKeyList for matching rpId keys.
 * No biometric prompt — only RPC calls.
 */
export async function checkReconnectionAvailable(
  walletAddress: string,
  chainId: number,
): Promise<{ available: boolean; matchCount: number }> {
  try {
    const keys = await reconnectPasskey(walletAddress, chainId);
    return { available: keys.length > 0, matchCount: keys.length };
  } catch {
    return { available: false, matchCount: 0 };
  }
}

/**
 * Attempt passkey reconnection: read on-chain keys, then try biometric
 * verification for each matching key until one succeeds.
 *
 * On success, saves credentialId + publicKey to local SecureStore.
 */
export async function attemptPasskeyReconnection(
  walletAddress: string,
  chainId: number,
): Promise<ReconnectionResult> {
  const matchingKeys = await reconnectPasskey(walletAddress, chainId);

  if (matchingKeys.length === 0) {
    return { success: false, reason: 'no_onchain_key' };
  }

  const challenge = createChallenge();

  for (const key of matchingKeys) {
    try {
      await verifyWithPasskey({ challenge, credentialId: key.credentialId });

      // Biometric succeeded — passkey exists on this device
      await savePasskey({
        credentialId: key.credentialId,
        publicKey: key.publicKey,
      });

      return {
        success: true,
        credentialId: key.credentialId,
        publicKey: key.publicKey,
      };
    } catch {
      // This key's passkey not available on device — try next
      continue;
    }
  }

  return { success: false, reason: 'passkey_not_available' };
}

/**
 * Check if passkey reconnection is needed (local store empty but wallet deployed).
 */
export async function needsReconnection(): Promise<boolean> {
  const stored = await getStoredPasskey();
  return stored === null;
}
