import { ethers } from 'ethers';
import { getChainConfig } from '@/services/chains/chainConfigService';
import { StoredPasskey } from '@/libs/passkey/passkeyStore';
import { withRetry } from '@/libs/utils/retry';

// ============================================================
// Types
// ============================================================

export interface PasskeyMatchResult {
  match: boolean;
  reason?: 'key_mismatch' | 'no_onchain_txkey' | 'unknown_key_type';
}

export interface CheckPasskeyParams {
  sender: string;
  chainId: number;
  localPasskey: StoredPasskey;
}

// ============================================================
// AA24 Error Detection
// ============================================================

/**
 * Heuristic check for AA24 signature validation errors.
 *
 * Only the Pimlico bundler path is active; AA24 surfaces via
 * waitForConfirmation() → Error('UserOp failed: AA24 ...'). False positives
 * only add an extra on-chain RPC check.
 */
export function isSignatureValidationError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.message.includes('AA24')) return true;
    // SIG_VALIDATION_FAILED → success=false in UserOperationEvent.
    // checkPasskeyMatchesOnChain() confirms accuracy afterwards.
    if (error.message.includes('UserOp failed')) return true;
  }
  return false;
}

// ============================================================
// On-chain Passkey Comparison
// ============================================================

/**
 * Compare local passkey public key coordinates against on-chain txKey.
 */
export async function checkPasskeyMatchesOnChain(
  params: CheckPasskeyParams,
): Promise<PasskeyMatchResult> {
  const { sender, chainId, localPasskey } = params;

  const chainConfig = await getChainConfig(chainId);
  const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);

  const zkapAccountAbi = [
    'function txKeyList(uint256) view returns (address logic, uint256 keyId)',
  ];
  const zkapAccount = new ethers.Contract(sender, zkapAccountAbi, provider);

  const txKeyRef = await withRetry(() => zkapAccount.txKeyList(0), { maxAttempts: 3 });

  if (!txKeyRef.logic || txKeyRef.logic === ethers.ZeroAddress) {
    return { match: false, reason: 'no_onchain_txkey' };
  }

  if (txKeyRef.logic.toLowerCase() !== chainConfig.contracts.webAuthnImpl.toLowerCase()) {
    return { match: false, reason: 'unknown_key_type' };
  }

  const webAuthnAbi = [
    'function getKeyData(uint8 purpose, address account, uint256 keyId) view returns (bytes32 x, bytes32 y, string credentialId, bytes32 allowedOriginHash, bytes32 allowedRpIdHash)',
  ];
  const webAuthnContract = new ethers.Contract(txKeyRef.logic, webAuthnAbi, provider);

  const keyData = await withRetry(
    () => webAuthnContract.getKeyData(1, sender, txKeyRef.keyId),
    { maxAttempts: 3 },
  );

  const onChainX = ethers.zeroPadValue(ethers.toBeHex(keyData.x), 32).toLowerCase();
  const onChainY = ethers.zeroPadValue(ethers.toBeHex(keyData.y), 32).toLowerCase();

  const ensureHex = (v: string) => (v.startsWith('0x') ? v : `0x${v}`);
  const localX = ethers.zeroPadValue(ensureHex(localPasskey.publicKey.x), 32).toLowerCase();
  const localY = ethers.zeroPadValue(ensureHex(localPasskey.publicKey.y), 32).toLowerCase();

  if (localX === onChainX && localY === onChainY) {
    return { match: true };
  }

  return { match: false, reason: 'key_mismatch' };
}
