import { AccountReader } from '@baerae/zkap-aa';
import type { TxKeyInfo } from '@baerae/zkap-aa';
import { getChainConfig } from '@/services/chains/chainConfigService';
import { getRpIdHash } from '@/libs/wallet/webAuthnUtils';

export interface ReconnectResult {
  credentialId: string;
  publicKey: { x: string; y: string };
}

/**
 * Scan on-chain txKeyList and return ALL WebAuthn keys matching this app's rpId.
 *
 * Returns an array of matching keys with credentialId and public key coordinates.
 * Empty array if no matching key is found — caller should guide user
 * through recover-txkey flow.
 */
export async function reconnectPasskey(
  walletAddress: string,
  chainId: number,
): Promise<ReconnectResult[]> {
  const chainConfig = await getChainConfig(chainId);
  const reader = new AccountReader({ rpcUrl: chainConfig.rpcUrl });
  const rpIdHash = getRpIdHash();

  let matchingKeys: TxKeyInfo[];
  try {
    matchingKeys = await reader.findTxKeysByRpId(walletAddress, rpIdHash);
  } catch (err) {
    console.warn('[reconnectPasskey] on-chain query failed:', err);
    return [];
  }

  return matchingKeys
    .filter((k) => k.webauthn?.credentialId)
    .map((k) => ({
      credentialId: k.webauthn!.credentialId,
      publicKey: { x: k.webauthn!.x, y: k.webauthn!.y },
    }));
}
