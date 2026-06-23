import { Platform } from 'react-native';
import { ethers } from 'ethers';

/**
 * The passkey Relying Party (RP) ID = your domain that hosts
 * `/.well-known/assetlinks.json`. REQUIRED, fail-closed (no built-in default): it is
 * hashed into the WebAuthn key when the wallet is created (see `getRpIdHash`), so it
 * becomes part of the wallet identity and must stay stable. Refusing a default means
 * passkeys are never silently bound to some other party's domain.
 */
export function requireRpId(): string {
  const rpId = process.env.EXPO_PUBLIC_RP_ID;
  if (!rpId) {
    throw new Error(
      'EXPO_PUBLIC_RP_ID is required (your passkey RP domain that hosts ' +
        '/.well-known/assetlinks.json).',
    );
  }
  return rpId;
}

/**
 * Calculate SHA256 hash of the RP ID for WebAuthn verification.
 * Baked into the wallet when creating a WebAuthn key — part of the wallet identity.
 */
export function getRpIdHash(): string {
  const rpIdBytes = ethers.toUtf8Bytes(requireRpId());
  return ethers.sha256(rpIdBytes);
}

/**
 * Get the origin string for WebAuthn verification
 * Android uses apk-key-hash format, iOS/web use the RP ID
 */
export function getOrigin(): string {
  if (Platform.OS === 'android') {
    const androidOrigin = process.env.EXPO_PUBLIC_ORIGIN_ANDROID;
    if (!androidOrigin) {
      throw new Error(
        'EXPO_PUBLIC_ORIGIN_ANDROID env var is required on Android. ' +
        'Set it to android:apk-key-hash:<base64url-SHA256-of-signing-cert>',
      );
    }
    return androidOrigin;
  }
  // iOS and web use the https:// origin of your RP domain
  return `https://${requireRpId()}`;
}
