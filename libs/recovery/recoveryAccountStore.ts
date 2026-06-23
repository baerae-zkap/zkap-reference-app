import * as SecureStore from 'expo-secure-store';
import type { SocialProvider } from '@/stores/authStore';

export interface RecoveryAccount {
  provider: SocialProvider;
  iss: string;
  sub: string;
  aud: string;
  identifier: string;
  isDefault: boolean;
}

const KEYS = {
  COUNT: 'recovery_accounts_count',
  ACCOUNT_PREFIX: 'recovery_account_',
} as const;

function getChainScopedKeys(chainId: number) {
  return {
    COUNT: `recovery_accounts_count_${chainId}`,
    ACCOUNT_PREFIX: `recovery_account_${chainId}_`,
  };
}

async function readSlots<T>(countKey: string, slotPrefix: string): Promise<T[]> {
  const countStr = await SecureStore.getItemAsync(countKey);
  const count = parseInt(countStr ?? '0', 10);
  const items: T[] = [];
  for (let i = 0; i < count; i++) {
    const data = await SecureStore.getItemAsync(`${slotPrefix}${i}`);
    if (data) {
      try {
        items.push(JSON.parse(data) as T);
      } catch {
        console.warn(`[recoveryAccountStore] Failed to parse slot ${slotPrefix}${i}`);
      }
    }
  }
  return items;
}

async function writeSlots<T>(countKey: string, slotPrefix: string, items: T[]): Promise<void> {
  const oldCountStr = await SecureStore.getItemAsync(countKey);
  const oldCount = parseInt(oldCountStr ?? '0', 10);

  for (let i = 0; i < items.length; i++) {
    await SecureStore.setItemAsync(`${slotPrefix}${i}`, JSON.stringify(items[i]));
  }

  for (let i = items.length; i < oldCount; i++) {
    await SecureStore.deleteItemAsync(`${slotPrefix}${i}`);
  }

  await SecureStore.setItemAsync(countKey, String(items.length));
}

/**
 * Get recovery accounts for a specific chain.
 * Falls back to global accounts when no chain-scoped record exists.
 */
export async function getRecoveryAccountsByChain(chainId: number): Promise<RecoveryAccount[] | null> {
  try {
    const keys = getChainScopedKeys(chainId);
    const countStr = await SecureStore.getItemAsync(keys.COUNT);

    if (countStr !== null) {
      const count = parseInt(countStr, 10);
      if (count === 0) {
        // tombstone written by clearRecoveryAccountsForChain — allow global fallback
        return getRecoveryAccounts();
      }
      const accounts = await readSlots<RecoveryAccount>(keys.COUNT, keys.ACCOUNT_PREFIX);
      return accounts.length > 0 ? accounts : null;
    }

    // No chain-scoped key exists yet — fall back to global accounts.
    return getRecoveryAccounts();
  } catch (error) {
    console.error('Failed to get recovery accounts by chain:', error);
    return getRecoveryAccounts();
  }
}

/**
 * Persist recovery accounts scoped to a chain. Call after chain activation succeeds.
 */
export async function saveRecoveryAccountsForChain(
  chainId: number,
  accounts: RecoveryAccount[]
): Promise<void> {
  try {
    const keys = getChainScopedKeys(chainId);
    await writeSlots(keys.COUNT, keys.ACCOUNT_PREFIX, accounts);
  } catch (error) {
    console.error('Failed to save recovery accounts for chain:', error);
    throw error;
  }
}

/**
 * Returns true if chain-scoped recovery accounts exist.
 */
export async function hasRecoveryAccountsForChain(chainId: number): Promise<boolean> {
  try {
    const keys = getChainScopedKeys(chainId);
    const countStr = await SecureStore.getItemAsync(keys.COUNT);
    return countStr !== null && parseInt(countStr, 10) > 0;
  } catch {
    return false;
  }
}

/**
 * Delete chain-scoped recovery accounts and write a tombstone (count="0").
 *
 * The tombstone keeps the COUNT key present so getRecoveryAccountsByChain()
 * does not fall through to global accounts. The COUNT write is the commit
 * point and must succeed — propagate errors if it fails.
 */
export async function clearRecoveryAccountsForChain(chainId: number): Promise<void> {
  const keys = getChainScopedKeys(chainId);

  // Delete individual slots best-effort; tombstone proceeds even on failure.
  try {
    const countStr = await SecureStore.getItemAsync(keys.COUNT);
    if (countStr) {
      const count = parseInt(countStr, 10);
      for (let i = 0; i < count; i++) {
        await SecureStore.deleteItemAsync(`${keys.ACCOUNT_PREFIX}${i}`);
      }
    }
  } catch {
    // Ignore individual slot deletion failures.
  }

  // Tombstone — must succeed to prevent global accounts from re-surfacing.
  await SecureStore.setItemAsync(keys.COUNT, '0');
}

/**
 * Fully remove chain-scoped recovery accounts without writing a tombstone.
 * After this call, getRecoveryAccountsByChain() will fall back to global accounts.
 * Use when switching accounts and global accounts should take over.
 */
export async function removeRecoveryAccountsForChain(chainId: number): Promise<void> {
  const keys = getChainScopedKeys(chainId);

  try {
    const countStr = await SecureStore.getItemAsync(keys.COUNT);
    if (countStr) {
      const count = parseInt(countStr, 10);
      for (let i = 0; i < count; i++) {
        await SecureStore.deleteItemAsync(`${keys.ACCOUNT_PREFIX}${i}`);
      }
    }
  } catch {
    // Ignore individual slot deletion failures.
  }

  // Delete the COUNT key itself (no tombstone) — allows global fallback.
  await SecureStore.deleteItemAsync(keys.COUNT);
}

/**
 * Persist the default recovery account (slot 0). Called on sign-in.
 */
export async function saveDefaultRecoveryAccount(
  account: Omit<RecoveryAccount, 'isDefault'>
): Promise<void> {
  try {
    const existing = await getRecoveryAccounts();
    if (existing && existing.length > 0) {
      // Overwrite the existing default account.
      await SecureStore.setItemAsync(
        `${KEYS.ACCOUNT_PREFIX}0`,
        JSON.stringify({ ...account, isDefault: true })
      );
    } else {
      // First save — initialize count.
      await SecureStore.setItemAsync(KEYS.COUNT, '1');
      await SecureStore.setItemAsync(
        `${KEYS.ACCOUNT_PREFIX}0`,
        JSON.stringify({ ...account, isDefault: true })
      );
    }
  } catch (error) {
    console.error('Failed to save default recovery account:', error);
    throw new Error('Failed to save the default recovery account.');
  }
}

/**
 * Add an additional recovery account (slots 1–2).
 */
export async function addRecoveryAccount(
  account: Omit<RecoveryAccount, 'isDefault'>
): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await getRecoveryAccounts();
    if (!existing) {
      return { success: false, error: 'No default account' };
    }

    if (existing.length >= 3) {
      return { success: false, error: 'Maximum 3 accounts allowed' };
    }

    // Reject duplicates (same provider + same sub).
    const isDuplicate = existing.some(
      (a) => a.provider === account.provider && a.sub === account.sub
    );
    if (isDuplicate) {
      return { success: false, error: 'Account already registered' };
    }

    const newIndex = existing.length;
    await SecureStore.setItemAsync(
      `${KEYS.ACCOUNT_PREFIX}${newIndex}`,
      JSON.stringify({ ...account, isDefault: false })
    );
    await SecureStore.setItemAsync(KEYS.COUNT, String(newIndex + 1));

    return { success: true };
  } catch (error) {
    console.error('Failed to add recovery account:', error);
    return { success: false, error: 'Failed to save account' };
  }
}

/**
 * Remove a recovery account by index. The default account (index 0) cannot be removed.
 */
export async function removeRecoveryAccount(index: number): Promise<boolean> {
  if (index === 0) return false; // Default account cannot be removed.

  try {
    const existing = await getRecoveryAccounts();
    if (!existing || index >= existing.length) return false;

    // Remove and compact the slot array.
    const updated = existing.filter((_, i) => i !== index);
    await writeSlots(KEYS.COUNT, KEYS.ACCOUNT_PREFIX, updated);

    return true;
  } catch (error) {
    console.error('Failed to remove recovery account:', error);
    return false;
  }
}

/**
 * Get all global recovery accounts.
 */
export async function getRecoveryAccounts(): Promise<RecoveryAccount[] | null> {
  try {
    const countStr = await SecureStore.getItemAsync(KEYS.COUNT);
    if (!countStr) return null;

    const accounts = await readSlots<RecoveryAccount>(KEYS.COUNT, KEYS.ACCOUNT_PREFIX);
    return accounts.length > 0 ? accounts : null;
  } catch (error) {
    console.error('Failed to get recovery accounts:', error);
    return null;
  }
}

/**
 * Delete all global recovery accounts.
 */
export async function clearRecoveryAccounts(): Promise<void> {
  try {
    const countStr = await SecureStore.getItemAsync(KEYS.COUNT);
    if (countStr) {
      const count = parseInt(countStr, 10);
      for (let i = 0; i < count; i++) {
        await SecureStore.deleteItemAsync(`${KEYS.ACCOUNT_PREFIX}${i}`);
      }
    }
    await SecureStore.deleteItemAsync(KEYS.COUNT);
  } catch {
    // Ignore deletion failures.
  }
}

/**
 * Returns true if any global recovery accounts exist.
 */
export async function hasRecoveryAccounts(): Promise<boolean> {
  try {
    const countStr = await SecureStore.getItemAsync(KEYS.COUNT);
    return countStr !== null && parseInt(countStr, 10) > 0;
  } catch {
    return false;
  }
}

/**
 * Replace all global recovery accounts atomically. Call after a successful on-chain apply.
 *
 * Atomicity: new slots are written first, then COUNT is updated (commit point),
 * then stale trailing slots are pruned. A crash before the COUNT write leaves
 * the old data intact; a crash after leaves all new data present.
 */
export async function replaceAllRecoveryAccounts(
  accounts: RecoveryAccount[]
): Promise<void> {
  // 1. Write new accounts into slots before touching COUNT.
  for (let i = 0; i < accounts.length; i++) {
    await SecureStore.setItemAsync(
      `${KEYS.ACCOUNT_PREFIX}${i}`,
      JSON.stringify(accounts[i])
    );
  }

  // 2. Read previous count so we can prune stale trailing slots.
  const prevCountStr = await SecureStore.getItemAsync(KEYS.COUNT);
  const prevCount = prevCountStr ? parseInt(prevCountStr, 10) : 0;

  // 3. Update COUNT — this is the commit point.
  await SecureStore.setItemAsync(KEYS.COUNT, String(accounts.length));

  // 4. Prune slots that existed before but are no longer needed.
  for (let i = accounts.length; i < prevCount; i++) {
    await SecureStore.deleteItemAsync(`${KEYS.ACCOUNT_PREFIX}${i}`);
  }
}
