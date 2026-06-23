import * as SecureStore from 'expo-secure-store';

/**
 * Persistent store for deployed wallet records (SecureStore).
 *
 * The CREATE2 wallet address depends on the passkey txKey used at genesis
 * (3-of-3 master + passkey). If the passkey is replaced (scenario ⑤ reset),
 * the address cannot be re-derived from the social identity alone, so it is
 * persisted here at deploy time. This record is the source-of-truth for the
 * address in recovery and re-login flows — `walletStore` (zustand) holds only
 * UI/session state and is hydrated from here on login.
 *
 * v3: Records are keyed per owner (`wallet_record_{chainId}_{ownerKey}`).
 *  - Multiple accounts' deployed wallets can coexist on one device. Switching
 *    from account A to B (passkey/session are single-tenant and are wiped) and
 *    back to A will find A's record intact. (v2 was one record per chain, so
 *    logging in as B would overwrite A's record.)
 *  - The owner key guarantees that a lookup for the signed-in account's owner
 *    only returns that account's wallet.
 *  - `deployed: true` lets re-login navigate home without a live RPC call
 *    (fail-open on balance fetches).
 *
 * ⚠️ passkey/recovery/walletStore are single-tenant (wiped on account switch).
 * Returning to another account's wallet shows the address but the signing
 * passkey belongs to a different account — transactions require scenario ⑤
 * (passkey re-registration) first.
 *
 * WARNING: SecureStore is device-local; it is not restored on a new device or
 * after reinstallation.
 */

export interface WalletOwner {
  iss: string;
  sub: string;
}

export interface DeployedWalletRecord {
  address: string;
  chainId: number;
  /** Genesis (default) recovery account. null for legacy v1/v2 migration records. */
  owner: WalletOwner | null;
  /** true once on-chain deployment is confirmed. */
  deployed: boolean;
  deployedAt?: string;
  updatedAt: string;
}

/** Maps iss|sub to a short, stable, SecureStore-safe id (FNV-1a 32-bit hex). */
function ownerKey(owner: WalletOwner): string {
  const s = `${owner.iss}|${owner.sub}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** v3 per-owner key. */
function recordKey(chainId: number, owner: WalletOwner): string {
  return `wallet_record_${chainId}_${ownerKey(owner)}`;
}

/** v2 chain-singleton key (read-only, for backward compatibility). */
function legacyRecordKey(chainId: number): string {
  return `wallet_record_${chainId}`;
}

/** v1 bare-address key (read-only, for backward compatibility). */
function legacyAddressKey(chainId: number): string {
  return `wallet_address_${chainId}`;
}

function ownerEquals(a: WalletOwner | null | undefined, b: WalletOwner | null | undefined): boolean {
  return !!a && !!b && a.iss === b.iss && a.sub === b.sub;
}

function parseRecord(raw: string | null, chainId: number): DeployedWalletRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DeployedWalletRecord;
    if (parsed && typeof parsed.address === 'string') {
      return { ...parsed, chainId };
    }
  } catch {
    // Corrupted record — ignore.
  }
  return null;
}

/**
 * Persist a deployed wallet record under its owner-scoped key.
 *
 * The address is deterministic, so saving the same value on retry or re-login
 * is harmless. Records without an owner (legacy) are stored under the v2
 * chain-singleton key.
 */
export async function saveWalletRecord(record: DeployedWalletRecord): Promise<void> {
  const key = record.owner ? recordKey(record.chainId, record.owner) : legacyRecordKey(record.chainId);
  await SecureStore.setItemAsync(key, JSON.stringify(record));
}

/**
 * Return the stored deployed wallet record, or null if not found.
 *
 * When an owner is supplied, the v3 per-owner key is checked first. Falls back
 * to the v2 chain-singleton key (only when the owner matches or is unknown)
 * and then to the v1 bare-address key for legacy records.
 */
export async function getWalletRecord(
  chainId: number,
  owner?: WalletOwner | null,
): Promise<DeployedWalletRecord | null> {
  // v3: per-owner key.
  if (owner) {
    const perOwner = parseRecord(await SecureStore.getItemAsync(recordKey(chainId, owner)), chainId);
    if (perOwner) return perOwner;
  }

  // v2: chain-singleton key (only when owner matches or is unspecified/legacy).
  const single = parseRecord(await SecureStore.getItemAsync(legacyRecordKey(chainId)), chainId);
  if (single && (!owner || !single.owner || ownerEquals(single.owner, owner))) {
    return single;
  }

  // v1: bare address.
  const legacy = await SecureStore.getItemAsync(legacyAddressKey(chainId));
  if (legacy) {
    return { address: legacy, chainId, owner: null, deployed: false, updatedAt: '' };
  }

  return null;
}

/** Convenience helper when only the address is needed. Returns null if not found. */
export async function getStoredWalletAddress(
  chainId: number,
  owner?: WalletOwner | null,
): Promise<string | null> {
  return (await getWalletRecord(chainId, owner))?.address ?? null;
}

/**
 * Mark the wallet record as deployment-confirmed. No-op if no record exists.
 */
export async function markWalletDeployed(chainId: number, owner?: WalletOwner | null): Promise<void> {
  const record = await getWalletRecord(chainId, owner);
  if (!record) return;
  const now = new Date().toISOString();
  await saveWalletRecord({
    ...record,
    deployed: true,
    deployedAt: record.deployedAt ?? now,
    updatedAt: now,
  });
}

/**
 * Delete the stored wallet record.
 *
 * ⚠️ Do NOT call this during an account-mismatch wipe — records are isolated
 * per owner, so a different account logging in must not erase another account's
 * recovery source-of-truth. Use only for explicit cleanup.
 */
export async function clearWalletRecord(chainId: number, owner?: WalletOwner | null): Promise<void> {
  if (owner) {
    await SecureStore.deleteItemAsync(recordKey(chainId, owner));
  }
  await SecureStore.deleteItemAsync(legacyRecordKey(chainId));
  await SecureStore.deleteItemAsync(legacyAddressKey(chainId));
}
