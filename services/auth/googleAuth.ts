import {
  GoogleSignin,
  statusCodes,
  isErrorWithCode,
} from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';
import { signin as signinGoogleNative } from '@/modules/google-sign';
import { jwtDecode } from 'jwt-decode';
import { useAuthStore } from '@/stores/authStore';

// Get client IDs from environment
// CRITICAL — Google idToken `aud` invariant (do not reintroduce a per-platform split):
// The wallet anchor, CREATE2 address salt, and masterKey hAudList are all derived from
// the canonical web client aud (= getCanonicalClientId('google'), which resolves to
// EXPO_PUBLIC_GOOGLE_IOS_WEB_CLIENT_ID ?? EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID). The Google
// idToken's `aud` equals the webClientId used to sign in, so that webClientId MUST be the
// canonical one on EVERY platform — otherwise the proof's anchor/aud binding mismatches
// ("Anchor mismatch"). If you maintain more than one web client, point the canonical var
// at the single one your addresses are derived from (a device is authorized by the GCP
// Android client + SHA-1, not by which web client id is passed as the serverClientId).
const WEB_CLIENT_ID_DEFAULT = Constants.expoConfig?.extra?.googleWebClientId ?? process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const WEB_CLIENT_ID_CANONICAL =
  Constants.expoConfig?.extra?.googleIosWebClientId ??
  process.env.EXPO_PUBLIC_GOOGLE_IOS_WEB_CLIENT_ID ??
  WEB_CLIENT_ID_DEFAULT;
// Same canonical web client id on all platforms so idToken aud == wallet anchor aud.
const WEB_CLIENT_ID = WEB_CLIENT_ID_CANONICAL;
const IOS_CLIENT_ID = Constants.expoConfig?.extra?.googleIosClientId ?? process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

let isConfigured = false;

export const configureGoogleSignIn = () => {
  if (isConfigured) return;

  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    iosClientId: IOS_CLIENT_ID,
    offlineAccess: false,
  });
  isConfigured = true;
};

export type GoogleSignInResult = {
  idToken: string;
  userName: string;
  email: string;
};

export const googleSignIn = async (options?: {
  forceAccountSelection?: boolean;
  nonce?: string;
}): Promise<GoogleSignInResult> => {
  try {
    configureGoogleSignIn();

    // Android/iOS + nonce: use custom native module (Credential Manager / GIDSignIn)
    if (options?.nonce) {
      const idToken = await signinGoogleNative(WEB_CLIENT_ID, options.nonce);
      const decoded = jwtDecode<{ name?: string; email?: string }>(idToken);
      return {
        idToken,
        userName: decoded.name ?? decoded.email ?? 'Unknown',
        email: decoded.email ?? '',
      };
    }

    // Check if play services are available (Android only)
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    // Force account selection by signing out first
    if (options?.forceAccountSelection) {
      await GoogleSignin.signOut();
    }

    // Sign in
    const response = await GoogleSignin.signIn();

    if (response.type === 'cancelled') {
      throw new Error('Sign in cancelled');
    }

    if (response.type === 'success') {
      const { data } = response;

      if (!data.idToken) {
        throw new Error('No ID token returned from Google');
      }

      return {
        idToken: data.idToken,
        userName: data.user.name ?? data.user.email ?? 'Unknown',
        email: data.user.email,
      };
    }

    throw new Error('Unexpected sign in response');
  } catch (error) {
    if (isErrorWithCode(error)) {
      switch (error.code) {
        case statusCodes.IN_PROGRESS:
          throw new Error('Sign in already in progress');
        case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
          throw new Error('Play services not available');
        default:
          throw error;
      }
    }
    throw error;
  }
};

export const googleSignOut = async (): Promise<void> => {
  try {
    await GoogleSignin.signOut();
  } catch (error) {
    console.error('Google sign out error:', error);
  }
};

export const isGoogleSignedIn = async (): Promise<boolean> => {
  try {
    const currentUser = await GoogleSignin.getCurrentUser();
    return currentUser !== null;
  } catch {
    return false;
  }
};

// Google Drive backup scope
const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.appdata'];

/**
 * Silently ensure a GoogleSignin session exists.
 * Returns true if session is available, false otherwise.
 * NEVER shows login UI — signInSilently() only.
 */
export const ensureGoogleSessionSilent = async (): Promise<boolean> => {
  configureGoogleSignIn();

  let currentUser = await GoogleSignin.getCurrentUser();

  // Account mismatch check (same as getGoogleDriveAccessToken)
  if (currentUser) {
    const { user } = useAuthStore.getState();
    if (user?.email && currentUser.user.email !== user.email) {
      await GoogleSignin.signOut();
      currentUser = null;
    }
  }

  if (!currentUser) {
    try {
      const result = await GoogleSignin.signInSilently();
      return result.type === 'success';
    } catch {
      return false;
    }
  }

  return true;
};

/**
 * Get Google Drive access token for cloud backup.
 * Handles the case where user signed in via Credential Manager (no GoogleSignin session).
 */
export const getGoogleDriveAccessToken = async (): Promise<string> => {
  // 1. Ensure GoogleSignin is configured
  configureGoogleSignIn();

  // 2. Check current GoogleSignin session
  let currentUser = await GoogleSignin.getCurrentUser();

  // 2.5. Verify session matches the login account to prevent recovery account session contamination.
  if (currentUser) {
    const { user } = useAuthStore.getState();
    if (user?.email && currentUser.user.email !== user.email) {
      console.warn('[Backup] GoogleSignin session mismatch — clearing stale session');
      await GoogleSignin.signOut();
      currentUser = null;
    }
  }

  // 3. If no session (e.g., signed in via Credential Manager), try to recover
  if (!currentUser) {
    try {
      const silentResult = await GoogleSignin.signInSilently();
      if (silentResult.type === 'success') {
        currentUser = silentResult.data;
      }
    } catch {
      // Silent sign-in failed, will try explicit sign-in below
    }
  }

  if (!currentUser) {
    const signInResult = await GoogleSignin.signIn();
    if (signInResult.type !== 'success') {
      throw new Error('Google sign-in is required for cloud backup');
    }
  }

  // 4. Request Drive scope (shows consent screen to user)
  const scopeResult = await GoogleSignin.addScopes({ scopes: DRIVE_SCOPES });
  if (scopeResult === null) {
    throw new Error('Google Drive permission was denied. Please grant access to back up your wallet.');
  }

  // 5. Get access token
  const tokens = await GoogleSignin.getTokens();
  if (!tokens.accessToken) {
    throw new Error('Failed to get Google Drive access token');
  }
  return tokens.accessToken;
};
