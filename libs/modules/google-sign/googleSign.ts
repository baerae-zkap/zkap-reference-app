import { createChallenge } from '@/libs/passkey/passkey';
import { signin as signinGoogle } from '@/modules/google-sign';
import { decodeIdToken } from '@/libs/jwt/decodeIdToken';
import { performSocialSignIn } from '../socialSignIn';
import Constants from 'expo-constants';

// NOTE: This client ID is used only for the OAuth sign-in flow. For wallet address
// derivation, use providerConfigHelper.getCanonicalClientId('google') instead.
const WEB_CLIENT_ID = Constants.expoConfig?.extra?.googleWebClientId ?? process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

export const getGoogleIdToken = async (params?: { nonce?: string }) => {
  const nonceToUse = params?.nonce ?? createChallenge();
  const idToken = await signinGoogle(WEB_CLIENT_ID, nonceToUse);

  return idToken;
};

export const googleSignIn = async () => {
  return performSocialSignIn(async (nonce) => {
    return signinGoogle(WEB_CLIENT_ID, nonce);
  });
};
