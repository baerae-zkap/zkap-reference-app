// ── Mocks ────────────────────────────────────────────────────────

jest.mock('@/libs/zkap/passkeyReconnect');
jest.mock('@/libs/passkey/passkey');
jest.mock('@/libs/passkey/passkeyStore');

import { reconnectPasskey } from '@/libs/zkap/passkeyReconnect';
import { verifyWithPasskey, createChallenge } from '@/libs/passkey/passkey';
import { savePasskey, getStoredPasskey } from '@/libs/passkey/passkeyStore';
import {
  checkReconnectionAvailable,
  attemptPasskeyReconnection,
  needsReconnection,
} from '../passkeyReconnectionService';

const mockReconnectPasskey = reconnectPasskey as jest.MockedFunction<typeof reconnectPasskey>;
const mockVerifyWithPasskey = verifyWithPasskey as jest.MockedFunction<typeof verifyWithPasskey>;
const mockCreateChallenge = createChallenge as jest.MockedFunction<typeof createChallenge>;
const mockSavePasskey = savePasskey as jest.MockedFunction<typeof savePasskey>;
const mockGetStoredPasskey = getStoredPasskey as jest.MockedFunction<typeof getStoredPasskey>;

const WALLET = '0x' + '11'.repeat(20);
const CHAIN_ID = 84532;

const KEY_1 = {
  credentialId: 'cred-1',
  publicKey: { x: '0x' + 'aa'.repeat(32), y: '0x' + 'bb'.repeat(32) },
};
const KEY_2 = {
  credentialId: 'cred-2',
  publicKey: { x: '0x' + 'cc'.repeat(32), y: '0x' + 'dd'.repeat(32) },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateChallenge.mockReturnValue('test-challenge');
  mockSavePasskey.mockResolvedValue(undefined);
});

// ── checkReconnectionAvailable ──────────────────────────────────

describe('checkReconnectionAvailable', () => {
  it('returns available=true when matching keys found', async () => {
    mockReconnectPasskey.mockResolvedValueOnce([KEY_1]);

    const result = await checkReconnectionAvailable(WALLET, CHAIN_ID);

    expect(result).toEqual({ available: true, matchCount: 1 });
  });

  it('returns available=false when no matching keys', async () => {
    mockReconnectPasskey.mockResolvedValueOnce([]);

    const result = await checkReconnectionAvailable(WALLET, CHAIN_ID);

    expect(result).toEqual({ available: false, matchCount: 0 });
  });

  it('returns available=false on RPC error', async () => {
    mockReconnectPasskey.mockRejectedValueOnce(new Error('network'));

    const result = await checkReconnectionAvailable(WALLET, CHAIN_ID);

    expect(result).toEqual({ available: false, matchCount: 0 });
  });

  it('returns correct matchCount for multiple keys', async () => {
    mockReconnectPasskey.mockResolvedValueOnce([KEY_1, KEY_2]);

    const result = await checkReconnectionAvailable(WALLET, CHAIN_ID);

    expect(result).toEqual({ available: true, matchCount: 2 });
  });
});

// ── attemptPasskeyReconnection ──────────────────────────────────

describe('attemptPasskeyReconnection', () => {
  it('succeeds when first key verification passes', async () => {
    mockReconnectPasskey.mockResolvedValueOnce([KEY_1]);
    mockVerifyWithPasskey.mockResolvedValueOnce({
      credentialId: 'cred-1',
      clientDataJSON: '',
      authenticatorData: '',
      signature: '',
    });

    const result = await attemptPasskeyReconnection(WALLET, CHAIN_ID);

    expect(result.success).toBe(true);
    expect(result.credentialId).toBe('cred-1');
    expect(result.publicKey).toEqual(KEY_1.publicKey);
    expect(mockSavePasskey).toHaveBeenCalledWith({
      credentialId: 'cred-1',
      publicKey: KEY_1.publicKey,
    });
  });

  it('tries second key when first fails', async () => {
    mockReconnectPasskey.mockResolvedValueOnce([KEY_1, KEY_2]);
    mockVerifyWithPasskey
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce({
        credentialId: 'cred-2',
        clientDataJSON: '',
        authenticatorData: '',
        signature: '',
      });

    const result = await attemptPasskeyReconnection(WALLET, CHAIN_ID);

    expect(result.success).toBe(true);
    expect(result.credentialId).toBe('cred-2');
    expect(mockVerifyWithPasskey).toHaveBeenCalledTimes(2);
  });

  it('returns no_onchain_key when no matching keys', async () => {
    mockReconnectPasskey.mockResolvedValueOnce([]);

    const result = await attemptPasskeyReconnection(WALLET, CHAIN_ID);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('no_onchain_key');
    expect(mockVerifyWithPasskey).not.toHaveBeenCalled();
  });

  it('returns passkey_not_available when all verifications fail', async () => {
    mockReconnectPasskey.mockResolvedValueOnce([KEY_1, KEY_2]);
    mockVerifyWithPasskey
      .mockRejectedValueOnce(new Error('not found'))
      .mockRejectedValueOnce(new Error('not found'));

    const result = await attemptPasskeyReconnection(WALLET, CHAIN_ID);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('passkey_not_available');
    expect(mockSavePasskey).not.toHaveBeenCalled();
  });

  it('passes challenge to verifyWithPasskey', async () => {
    mockCreateChallenge.mockReturnValue('my-challenge');
    mockReconnectPasskey.mockResolvedValueOnce([KEY_1]);
    mockVerifyWithPasskey.mockResolvedValueOnce({
      credentialId: 'cred-1',
      clientDataJSON: '',
      authenticatorData: '',
      signature: '',
    });

    await attemptPasskeyReconnection(WALLET, CHAIN_ID);

    expect(mockVerifyWithPasskey).toHaveBeenCalledWith({
      challenge: 'my-challenge',
      credentialId: 'cred-1',
    });
  });
});

// ── needsReconnection ───────────────────────────────────────────

describe('needsReconnection', () => {
  it('returns true when no stored passkey', async () => {
    mockGetStoredPasskey.mockResolvedValueOnce(null);

    expect(await needsReconnection()).toBe(true);
  });

  it('returns false when stored passkey exists', async () => {
    mockGetStoredPasskey.mockResolvedValueOnce({
      credentialId: 'cred-1',
      publicKey: { x: '0x1', y: '0x2' },
    });

    expect(await needsReconnection()).toBe(false);
  });
});
