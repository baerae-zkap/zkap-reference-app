import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { ethers } from 'ethers';

const SALT_KEY = 'wallet_creation_salt';

/**
 * Compute a deterministic salt from (aud, sub).
 *
 * The same social account always produces the same salt and therefore the same
 * wallet address. The formula must match exactly what the SDK and circuit expect
 * so that the CREATE2 address is reproducible. The `additional` parameter must
 * NOT be used in production paths — inserting it would fork the address space.
 */
export function computeDeterministicSalt(aud: string, sub: string, additional?: string): string {
  if (additional) {
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['string', 'string', 'string'],
        [aud, sub, additional]
      )
    );
  }
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['string', 'string'],
      [aud, sub]
    )
  );
}

/**
 * Get or create a unique salt for wallet derivation
 *
 * The salt is permanently stored and used for calculating the wallet address.
 * WARNING: Losing the salt means the wallet address cannot be re-derived.
 */
export async function getOrCreateSalt(): Promise<string> {
  const existing = await SecureStore.getItemAsync(SALT_KEY);

  if (existing) {
    return existing;
  }

  // Generate 32 bytes random salt
  const randomBytes = Crypto.getRandomBytes(32);
  const salt = ethers.hexlify(randomBytes);

  await SecureStore.setItemAsync(SALT_KEY, salt);
  return salt;
}

/**
 * Check if a salt already exists
 * Useful for wallet recovery scenarios
 */
export async function hasSalt(): Promise<boolean> {
  const salt = await SecureStore.getItemAsync(SALT_KEY);
  return !!salt;
}

/**
 * Get the existing salt without creating a new one
 * Returns null if no salt exists
 */
export async function getSalt(): Promise<string | null> {
  return SecureStore.getItemAsync(SALT_KEY);
}

/**
 * Save a specific salt value (used during backup restore)
 */
export async function saveSalt(salt: string): Promise<void> {
  await SecureStore.setItemAsync(SALT_KEY, salt);
}

/**
 * Clear the stored salt
 * WARNING: This will make it impossible to re-derive the same wallet address
 */
export async function clearSalt(): Promise<void> {
  await SecureStore.deleteItemAsync(SALT_KEY);
}
