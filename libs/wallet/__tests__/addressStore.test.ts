jest.mock('expo-secure-store');

import * as SecureStore from 'expo-secure-store';
import {
  saveWalletRecord,
  getWalletRecord,
  getStoredWalletAddress,
  markWalletDeployed,
  clearWalletRecord,
  DeployedWalletRecord,
} from '../addressStore';

const mockSet = SecureStore.setItemAsync as jest.MockedFunction<typeof SecureStore.setItemAsync>;
const mockGet = SecureStore.getItemAsync as jest.MockedFunction<typeof SecureStore.getItemAsync>;
const mockDel = SecureStore.deleteItemAsync as jest.MockedFunction<typeof SecureStore.deleteItemAsync>;

// In-memory SecureStore so round-trip reads observe prior writes.
const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  jest.clearAllMocks();
  mockSet.mockImplementation(async (k: string, v: string) => { store.set(k, v); });
  mockGet.mockImplementation(async (k: string) => (store.has(k) ? store.get(k)! : null));
  mockDel.mockImplementation(async (k: string) => { store.delete(k); });
});

const CHAIN_ID = 84532;
const ADDR_A = '0xE7d136a5DBB16d4F137daae37bF25d75aA80c8ee'; // jaewoong
const ADDR_B = '0xB0bB0bB0bB0bB0bB0bB0bB0bB0bB0bB0bB0bB0bB'; // leejw1496
const OWNER_A = { iss: 'https://accounts.google.com', sub: 'jaewoong-sub' };
const OWNER_B = { iss: 'https://accounts.google.com', sub: 'leejw1496-sub' };

function record(over: Partial<DeployedWalletRecord> = {}): DeployedWalletRecord {
  return {
    address: ADDR_A,
    chainId: CHAIN_ID,
    owner: OWNER_A,
    deployed: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('saveWalletRecord / getWalletRecord (per-owner keys)', () => {
  it('round-trips a record under a per-owner key', async () => {
    await saveWalletRecord(record({ deployed: true }));

    expect(mockSet).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^wallet_record_${CHAIN_ID}_[0-9a-f]{8}$`)),
      expect.any(String),
    );
    const r = await getWalletRecord(CHAIN_ID, OWNER_A);
    expect(r).toMatchObject({ address: ADDR_A, owner: OWNER_A, deployed: true });
  });

  it('isolates owners: B never sees A\'s record', async () => {
    await saveWalletRecord(record({ owner: OWNER_A, address: ADDR_A, deployed: true }));

    expect(await getWalletRecord(CHAIN_ID, OWNER_B)).toBeNull();
    expect(await getWalletRecord(CHAIN_ID, OWNER_A)).toMatchObject({ address: ADDR_A });
  });

  // The reported bug: A deploys, B logs in (defers deploy), A returns → must still resolve.
  it('keeps A\'s record after B activity (cross-account survival)', async () => {
    await saveWalletRecord(record({ owner: OWNER_A, address: ADDR_A, deployed: true }));
    // B logs in and derives but does NOT deploy → no record written for B.
    expect(await getWalletRecord(CHAIN_ID, OWNER_B)).toBeNull();
    // A returns → record intact.
    expect(await getWalletRecord(CHAIN_ID, OWNER_A)).toMatchObject({ address: ADDR_A, deployed: true });
  });

  it('keeps both records when both owners deploy', async () => {
    await saveWalletRecord(record({ owner: OWNER_A, address: ADDR_A, deployed: true }));
    await saveWalletRecord(record({ owner: OWNER_B, address: ADDR_B, deployed: true }));

    expect((await getWalletRecord(CHAIN_ID, OWNER_A))?.address).toBe(ADDR_A);
    expect((await getWalletRecord(CHAIN_ID, OWNER_B))?.address).toBe(ADDR_B);
  });

  it('returns null when nothing is stored', async () => {
    expect(await getWalletRecord(CHAIN_ID, OWNER_A)).toBeNull();
  });
});

describe('legacy migration', () => {
  it('reads a v2 chain-single record when its owner matches', async () => {
    store.set(`wallet_record_${CHAIN_ID}`, JSON.stringify(record({ owner: OWNER_A, deployed: true })));

    expect((await getWalletRecord(CHAIN_ID, OWNER_A))?.address).toBe(ADDR_A);
    // A different owner must NOT inherit the v2 single-key record.
    expect(await getWalletRecord(CHAIN_ID, OWNER_B)).toBeNull();
  });

  it('migrates a v1 bare address into an owner-less record for any login', async () => {
    store.set(`wallet_address_${CHAIN_ID}`, ADDR_A);

    const r = await getWalletRecord(CHAIN_ID, OWNER_A);
    expect(r).toEqual({ address: ADDR_A, chainId: CHAIN_ID, owner: null, deployed: false, updatedAt: '' });
  });
});

describe('markWalletDeployed', () => {
  it('flips deployed=true for the owner record', async () => {
    await saveWalletRecord(record({ owner: OWNER_A, deployed: false }));

    await markWalletDeployed(CHAIN_ID, OWNER_A);

    const r = await getWalletRecord(CHAIN_ID, OWNER_A);
    expect(r?.deployed).toBe(true);
    expect(r?.deployedAt).toBeTruthy();
  });

  it('is a no-op when no record exists', async () => {
    await markWalletDeployed(CHAIN_ID, OWNER_A);
    expect(await getWalletRecord(CHAIN_ID, OWNER_A)).toBeNull();
  });
});

describe('getStoredWalletAddress', () => {
  it('returns the owner record address', async () => {
    await saveWalletRecord(record({ owner: OWNER_A, address: ADDR_A }));
    expect(await getStoredWalletAddress(CHAIN_ID, OWNER_A)).toBe(ADDR_A);
  });

  it('returns null when no record for that owner', async () => {
    await saveWalletRecord(record({ owner: OWNER_A }));
    expect(await getStoredWalletAddress(CHAIN_ID, OWNER_B)).toBeNull();
  });
});

describe('clearWalletRecord', () => {
  it('removes the owner record and legacy keys', async () => {
    await saveWalletRecord(record({ owner: OWNER_A }));
    await clearWalletRecord(CHAIN_ID, OWNER_A);
    expect(await getWalletRecord(CHAIN_ID, OWNER_A)).toBeNull();
    expect(mockDel).toHaveBeenCalledWith(`wallet_record_${CHAIN_ID}`);
    expect(mockDel).toHaveBeenCalledWith(`wallet_address_${CHAIN_ID}`);
  });
});
