import * as SecureStore from 'expo-secure-store';
import type { PublicKeyCoordinates } from './passkey';

const KEYS = {
  CREDENTIAL_ID: 'passkey_credential_id',
  PUBLIC_KEY_X: 'passkey_public_key_x',
  PUBLIC_KEY_Y: 'passkey_public_key_y',
  ATTESTATION_OBJECT: 'passkey_attestation_object',
  CREDENTIAL_PUBKEY_COSE: 'passkey_credential_pubkey_cose',
} as const;

export interface StoredPasskey {
  credentialId: string;
  publicKey: PublicKeyCoordinates;
  /** Raw attestationObject (base64url) — required for SDK wallet creation. */
  attestationObject?: string;
  /** COSE-encoded public key (hex) — required for SDK WebAuthn key registration. */
  credentialPubkeyCose?: string;
}

/**
 * Persist passkey credentials to SecureStore.
 */
export async function savePasskey(passkey: StoredPasskey): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEYS.CREDENTIAL_ID, passkey.credentialId);
    await SecureStore.setItemAsync(KEYS.PUBLIC_KEY_X, passkey.publicKey.x);
    await SecureStore.setItemAsync(KEYS.PUBLIC_KEY_Y, passkey.publicKey.y);

    // Store optional fields needed for SDK wallet creation and key registration.
    if (passkey.attestationObject) {
      await SecureStore.setItemAsync(KEYS.ATTESTATION_OBJECT, passkey.attestationObject);
    }
    if (passkey.credentialPubkeyCose) {
      await SecureStore.setItemAsync(KEYS.CREDENTIAL_PUBKEY_COSE, passkey.credentialPubkeyCose);
    }
  } catch (error) {
    console.error('Failed to save passkey to SecureStore:', error);
    throw new Error('Failed to save the passkey.');
  }
}

/**
 * Load stored passkey credentials from SecureStore.
 */
export async function getStoredPasskey(): Promise<StoredPasskey | null> {
  try {
    const credentialId = await SecureStore.getItemAsync(KEYS.CREDENTIAL_ID);
    const x = await SecureStore.getItemAsync(KEYS.PUBLIC_KEY_X);
    const y = await SecureStore.getItemAsync(KEYS.PUBLIC_KEY_Y);

    if (!credentialId || !x || !y) {
      return null;
    }

    const attestationObject = await SecureStore.getItemAsync(KEYS.ATTESTATION_OBJECT);
    const credentialPubkeyCose = await SecureStore.getItemAsync(KEYS.CREDENTIAL_PUBKEY_COSE);

    return {
      credentialId,
      publicKey: { x, y },
      attestationObject: attestationObject ?? undefined,
      credentialPubkeyCose: credentialPubkeyCose ?? undefined,
    };
  } catch (error) {
    console.error('Failed to read passkey from SecureStore:', error);
    return null;
  }
}

/**
 * Delete all stored passkey credentials from SecureStore.
 */
export async function clearPasskey(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEYS.CREDENTIAL_ID);
    await SecureStore.deleteItemAsync(KEYS.PUBLIC_KEY_X);
    await SecureStore.deleteItemAsync(KEYS.PUBLIC_KEY_Y);
    await SecureStore.deleteItemAsync(KEYS.ATTESTATION_OBJECT);
    await SecureStore.deleteItemAsync(KEYS.CREDENTIAL_PUBKEY_COSE);
  } catch (error) {
    console.error('Failed to clear passkey from SecureStore:', error);
    // Ignore deletion failures — the next save will overwrite stale values.
  }
}

/**
 * Returns true if a passkey credential is stored.
 */
export async function hasStoredPasskey(): Promise<boolean> {
  try {
    const credentialId = await SecureStore.getItemAsync(KEYS.CREDENTIAL_ID);
    return !!credentialId;
  } catch {
    return false;
  }
}
