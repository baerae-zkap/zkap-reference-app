import { createChallenge } from '@/libs/passkey/passkey';
import { decodeIdToken } from '@/libs/jwt/decodeIdToken';

export interface SocialSignInResult {
  idToken: string;
  userName: string;
}

// Provider-agnostic helper. Currently google-only; designed for fork-friendly extension via SUPPORTED_SOCIAL_PROVIDERS.
/**
 * Common social sign-in flow:
 * 1. Generate challenge nonce
 * 2. Call provider's native sign-in with nonce
 * 3. Decode JWT to extract user identifier
 */
export async function performSocialSignIn(
  nativeSignIn: (nonce: string) => Promise<string>,
): Promise<SocialSignInResult> {
  const nonce = createChallenge();
  const idToken = await nativeSignIn(nonce);
  const decoded = decodeIdToken(idToken);
  const userName = decoded.identifier;

  if (!userName) {
    throw new Error('userName not exist');
  }

  return { idToken, userName };
}
