import { Platform } from 'react-native';
import { ethers } from 'ethers';

// ── Mocks ────────────────────────────────────────────────────────

jest.mock('@/services/zkNative/provingKeyManager', () => ({
  ensureProvingKey: jest.fn().mockResolvedValue('/mock/path/pk.bin'),
  isProvingKeyCached: jest.fn().mockReturnValue(false),
  getCachedProvingKeyPath: jest.fn().mockResolvedValue(null),
}));

jest.mock('../zkProofUtils', () => ({
  validateNonceSupport: jest.fn(),
  computeZkNonce: jest.fn(),
  getIdTokenWithNonce: jest.fn(),
  collectMerkleData: jest.fn(),
  generateZkProof: jest.fn(),
}));

// BYO provider config: stub so signing doesn't need a real OAuth client / native hash.
jest.mock('@/libs/wallet/providerConfigHelper', () => ({
  initProviderConfig: jest.fn().mockResolvedValue(undefined),
  getHAud: jest.fn(() => '0xmock-haud'),
}));

import {
  padToThree,
  signWithMasterKey,
  MasterKeySigningError,
  MasterKeySigningErrorCode,
  type MasterKeySigningParams,
  type MasterKeySigningStep,
} from '../masterKeySigningService';
import {
  validateNonceSupport,
  computeZkNonce,
  getIdTokenWithNonce,
  collectMerkleData,
  generateZkProof,
} from '../zkProofUtils';
import {
  ensureProvingKey,
  getCachedProvingKeyPath,
} from '@/services/zkNative/provingKeyManager';
import type { RecoveryAccount } from '@/libs/recovery/recoveryAccountStore';

const mockValidateNonceSupport = validateNonceSupport as jest.MockedFunction<typeof validateNonceSupport>;
const mockComputeZkNonce = computeZkNonce as jest.MockedFunction<typeof computeZkNonce>;
const mockGetIdTokenWithNonce = getIdTokenWithNonce as jest.MockedFunction<typeof getIdTokenWithNonce>;
const mockCollectMerkleData = collectMerkleData as jest.MockedFunction<typeof collectMerkleData>;
const mockGenerateZkProof = generateZkProof as jest.MockedFunction<typeof generateZkProof>;
const mockEnsureProvingKey = ensureProvingKey as jest.MockedFunction<typeof ensureProvingKey>;
const mockGetCachedProvingKeyPath = getCachedProvingKeyPath as jest.MockedFunction<typeof getCachedProvingKeyPath>;

// ── Fixtures ─────────────────────────────────────────────────────

const makeAccount = (provider: string, sub: string, identifier?: string): RecoveryAccount => ({
  provider: provider as any,
  iss: `https://${provider}.example`,
  sub,
  aud: 'test-client-id',
  identifier: identifier || `${sub}@${provider}.com`,
  isDefault: false,
});

const googleAccount = makeAccount('google', 'google-sub-1', 'user@gmail.com');
const google2Account = makeAccount('google', 'google-sub-2', 'user2@gmail.com');
const google3Account = makeAccount('google', 'google-sub-3', 'user3@gmail.com');

const mockChainConfig = {
  rpcUrl: 'http://localhost:8545',
  contracts: {
    entryPoint: '0xEntryPoint',
    zkOAuthVerifier1of1: '0xVerifier1of1',
    zkOAuthVerifier3of3: '0xVerifier3of3',
    merkleTreeDirectory: '0xMerkleTree',
  },
} as any;

const mockProofResult = {
  sharedInputs: [1n, 2n, 3n, 4n, 5n, 6n],
  jwtExpList: [100n],
  partialRhsList: [200n],
  proofs: [[1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n]],
};

const baseParams: MasterKeySigningParams = {
  accounts: [googleAccount],
  userOpHash: '0xabcdef1234567890',
  anchor: ['12345', '67890'],
  chainId: 84532,
  chainConfig: mockChainConfig,
};

function setupSuccessMocks() {
  mockValidateNonceSupport.mockImplementation(() => {});
  mockComputeZkNonce.mockResolvedValue({
    zkNonce: '0xnonce123',
    signedUserOpHash: '0xabcdef1234567890',
    random: '0xrandom456',
  });
  mockGetIdTokenWithNonce.mockResolvedValue({
    idToken: 'mock-id-token',
    kid: 'mock-kid',
    provider: 'google',
  });
    mockCollectMerkleData.mockResolvedValue({
      merklePaths: [['path1', 'path2']],
      leafIndices: [0],
      root: 'mock-root',
    });
  mockGenerateZkProof.mockResolvedValue(mockProofResult as any);
}

// ── Tests ────────────────────────────────────────────────────────

describe('padToThree', () => {
  it('should pad 1 item to [a, a, a]', () => {
    expect(padToThree(['x'])).toEqual(['x', 'x', 'x']);
  });

  it('should pad 2 items to [a, b, a]', () => {
    expect(padToThree(['x', 'y'])).toEqual(['x', 'y', 'x']);
  });

  it('should keep 3 items as [a, b, c]', () => {
    expect(padToThree(['x', 'y', 'z'])).toEqual(['x', 'y', 'z']);
  });

  it('should throw for 0 items', () => {
    expect(() => padToThree([])).toThrow(MasterKeySigningError);
    expect(() => padToThree([])).toThrow('Expected 1-3 items');
  });

  it('should throw for 4+ items', () => {
    expect(() => padToThree([1, 2, 3, 4])).toThrow(MasterKeySigningError);
  });

  it('should throw with INVALID_ACCOUNTS error code', () => {
    try {
      padToThree([]);
    } catch (e) {
      expect(e).toBeInstanceOf(MasterKeySigningError);
      expect((e as MasterKeySigningError).code).toBe(MasterKeySigningErrorCode.INVALID_ACCOUNTS);
    }
  });
});

describe('signWithMasterKey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureProvingKey.mockResolvedValue('/mock/path/pk.bin');
    mockGetCachedProvingKeyPath.mockResolvedValue(null);
    setupSuccessMocks();
  });

  // ── Validation ─────────────────────────────────────────────

  describe('validation', () => {
    it('should reject 0 accounts', async () => {
      await expect(
        signWithMasterKey({ ...baseParams, accounts: [] })
      ).rejects.toThrow(MasterKeySigningError);

      await expect(
        signWithMasterKey({ ...baseParams, accounts: [] })
      ).rejects.toMatchObject({
        code: MasterKeySigningErrorCode.INVALID_ACCOUNTS,
      });
    });

    it('should reject 4+ accounts', async () => {
      const fourAccounts = [googleAccount, google2Account, google3Account, makeAccount('google', 'sub-4')];
      await expect(
        signWithMasterKey({ ...baseParams, accounts: fourAccounts })
      ).rejects.toMatchObject({
        code: MasterKeySigningErrorCode.INVALID_ACCOUNTS,
      });
    });

    it('should call validateNonceSupport with accounts', async () => {
      await signWithMasterKey(baseParams);
      expect(mockValidateNonceSupport).toHaveBeenCalledWith([googleAccount]);
    });

  });

  // ── Single account (3-of-3 padded) ──────────────────────────

  describe('single account (3-of-3)', () => {
    it('should complete successfully with 1 account', async () => {
      const result = await signWithMasterKey(baseParams);

      expect(result.signature).toBeDefined();
      expect(typeof result.signature).toBe('string');
      expect(result.signature.startsWith('0x')).toBe(true);
    });

    it('should pad 1 account to [t,t,t] for proof', async () => {
      await signWithMasterKey(baseParams);

      // 3-of-3 circuit: single token is padded to 3
      expect(mockCollectMerkleData).toHaveBeenCalledWith(
        ['mock-kid', 'mock-kid', 'mock-kid'],
        ['google', 'google', 'google'],
        84532,
        mockChainConfig,
      );
    });

    it('should call getIdTokenWithNonce once', async () => {
      await signWithMasterKey(baseParams);
      expect(mockGetIdTokenWithNonce).toHaveBeenCalledTimes(1);
    });
  });

  // ── 3-of-3 padding (always) ───────────────────────────────────

  describe('3-of-3 padding', () => {
    it('should pad 1 account to [t,t,t] for 3-of-3 circuit', async () => {
      await signWithMasterKey(baseParams);

      // collectMerkleData should receive 3 kids (padded), not 1
      expect(mockCollectMerkleData).toHaveBeenCalledWith(
        ['mock-kid', 'mock-kid', 'mock-kid'],
        ['google', 'google', 'google'],
        84532,
        mockChainConfig,
      );
    });

    it('should pad 2 accounts to 3 for 3-of-3 circuit', async () => {
      mockGetIdTokenWithNonce
        .mockReset()
        .mockResolvedValueOnce({ idToken: 'token-1', kid: 'kid-1', provider: 'google' })
        .mockResolvedValueOnce({ idToken: 'token-google-2', kid: 'kid-google-2', provider: 'google' });

      await signWithMasterKey({
        ...baseParams,
        accounts: [googleAccount, google2Account],
      });

      expect(mockCollectMerkleData).toHaveBeenCalledWith(
        ['kid-1', 'kid-google-2', 'kid-1'],
        ['google', 'google', 'google'],
        84532,
        mockChainConfig,
      );
    });

    it('should only collect 1 token even though proof is padded to 3', async () => {
      await signWithMasterKey(baseParams);

      // User is prompted only once, token is padded for proof
      expect(mockGetIdTokenWithNonce).toHaveBeenCalledTimes(1);
    });
  });

  // ── Multi account (3-of-3) ──────────────────────────────────

  describe('multi account (3-of-3)', () => {
    const multiParams: MasterKeySigningParams = {
      ...baseParams,
      accounts: [googleAccount, google2Account],
    };

    beforeEach(() => {
      mockGetIdTokenWithNonce
        .mockResolvedValueOnce({ idToken: 'token-google', kid: 'kid-google', provider: 'google' })
        .mockResolvedValueOnce({ idToken: 'token-google-2', kid: 'kid-google-2', provider: 'google' });
    });

    it('should collect tokens sequentially for 2 accounts', async () => {
      await signWithMasterKey(multiParams);
      expect(mockGetIdTokenWithNonce).toHaveBeenCalledTimes(2);
    });

    it('should pad to 3 tokens for 2 accounts', async () => {
      await signWithMasterKey(multiParams);

      // padToThree([google, google2]) = [google, google2, google]
      expect(mockCollectMerkleData).toHaveBeenCalledWith(
        ['kid-google', 'kid-google-2', 'kid-google'],
        ['google', 'google', 'google'],
        84532,
        mockChainConfig,
      );
    });

    it('should complete with 3 accounts without padding', async () => {
      mockGetIdTokenWithNonce
        .mockReset()
        .mockResolvedValueOnce({ idToken: 'token-1', kid: 'kid-1', provider: 'google' })
        .mockResolvedValueOnce({ idToken: 'token-google-2', kid: 'kid-google-2', provider: 'google' })
        .mockResolvedValueOnce({ idToken: 'token-google-3', kid: 'kid-google-3', provider: 'google' });

      const threeAccountParams = {
        ...baseParams,
        accounts: [googleAccount, google2Account, google3Account],
      };

      await signWithMasterKey(threeAccountParams);

      expect(mockCollectMerkleData).toHaveBeenCalledWith(
        ['kid-1', 'kid-google-2', 'kid-google-3'],
        ['google', 'google', 'google'],
        84532,
        mockChainConfig,
      );
    });
  });

  // ── Progress callbacks ──────────────────────────────────────

  describe('progress callbacks', () => {
    it('should emit progress steps in correct order for single account', async () => {
      const steps: MasterKeySigningStep[] = [];
      await signWithMasterKey({
        ...baseParams,
        onProgress: (step) => steps.push(step),
      });

      const types = steps.map(s => s.type);
      expect(types).toEqual([
        'downloading_keys',
        'computing_nonce',
        'account_signing',    // waiting_user
        'collecting_merkle_data',
        'generating_proof',
        'encoding_signature',
        'completed',
      ]);
    });

    it('should skip download progress and pass cached manifestDir to proof generation', async () => {
      mockGetCachedProvingKeyPath.mockResolvedValue('/cached/manifest-dir');
      const steps: MasterKeySigningStep[] = [];

      await signWithMasterKey({
        ...baseParams,
        onProgress: (step) => steps.push(step),
      });

      expect(mockEnsureProvingKey).not.toHaveBeenCalled();
      expect(steps.map(s => s.type)).not.toContain('downloading_keys');
      expect(mockGenerateZkProof).toHaveBeenCalledWith(
        expect.objectContaining({
          manifestDir: '/cached/manifest-dir',
        }),
      );
    });

    it('should emit waiting_user status with account info', async () => {
      const steps: MasterKeySigningStep[] = [];
      await signWithMasterKey({
        ...baseParams,
        onProgress: (step) => steps.push(step),
      });

      const waitingStep = steps.find(
        s => s.type === 'account_signing' && (s as any).status === 'waiting_user'
      ) as any;
      expect(waitingStep).toBeDefined();
      expect(waitingStep.accountIndex).toBe(0);
      expect(waitingStep.account).toBe(googleAccount);
    });

    it('should emit correct accountIndex for each account', async () => {
      mockGetIdTokenWithNonce
        .mockReset()
        .mockResolvedValueOnce({ idToken: 'token-1', kid: 'kid-1', provider: 'google' })
        .mockResolvedValueOnce({ idToken: 'token-google-2', kid: 'kid-google-2', provider: 'google' });

      const steps: MasterKeySigningStep[] = [];
      await signWithMasterKey({
        ...baseParams,
        accounts: [googleAccount, google2Account],
        onProgress: (step) => steps.push(step),
      });

      const accountSteps = steps.filter(s => s.type === 'account_signing') as any[];
      const indices = [...new Set(accountSteps.map(s => s.accountIndex))];
      expect(indices).toEqual([0, 1]);
    });
  });

  // ── onConfirmRequired ───────────────────────────────────────

  describe('onConfirmRequired', () => {
    it('should wait for confirmation before proceeding with login', async () => {
      const callOrder: string[] = [];
      const confirmResolvers: (() => void)[] = [];

      const confirmPromise = signWithMasterKey({
        ...baseParams,
        onConfirmRequired: (_index, _account) => {
          callOrder.push('confirm_requested');
          return new Promise<void>(resolve => {
            confirmResolvers.push(resolve);
          });
        },
      });

      // Wait for the promise to be pending
      await new Promise(r => setTimeout(r, 10));
      expect(callOrder).toEqual(['confirm_requested']);
      expect(mockGetIdTokenWithNonce).not.toHaveBeenCalled();

      // Resolve confirmation
      confirmResolvers[0]();
      await confirmPromise;

      expect(mockGetIdTokenWithNonce).toHaveBeenCalledTimes(1);
    });

    it('should call onConfirmRequired with correct accountIndex and account', async () => {
      const confirmCalls: { index: number; account: RecoveryAccount }[] = [];

      mockGetIdTokenWithNonce
        .mockReset()
        .mockResolvedValueOnce({ idToken: 'token-1', kid: 'kid-1', provider: 'google' })
        .mockResolvedValueOnce({ idToken: 'token-google-2', kid: 'kid-google-2', provider: 'google' });

      await signWithMasterKey({
        ...baseParams,
        accounts: [googleAccount, google2Account],
        onConfirmRequired: (index, account) => {
          confirmCalls.push({ index, account });
          return Promise.resolve();
        },
      });

      expect(confirmCalls).toHaveLength(2);
      expect(confirmCalls[0]).toEqual({ index: 0, account: googleAccount });
      expect(confirmCalls[1]).toEqual({ index: 1, account: google2Account });
    });

    it('should skip confirmation when onConfirmRequired is not provided', async () => {
      await signWithMasterKey(baseParams);
      // Should complete without hanging
      expect(mockGetIdTokenWithNonce).toHaveBeenCalledTimes(1);
    });

    it('should check abort after confirmation', async () => {
      const controller = new AbortController();

      const promise = signWithMasterKey({
        ...baseParams,
        abortSignal: controller.signal,
        onConfirmRequired: async () => {
          controller.abort();
        },
      });

      await expect(promise).rejects.toMatchObject({
        code: MasterKeySigningErrorCode.CANCELLED,
      });
      expect(mockGetIdTokenWithNonce).not.toHaveBeenCalled();
    });
  });

  // ── Abort / Cancel ──────────────────────────────────────────

  describe('abort signal', () => {
    it('should throw CANCELLED when aborted before nonce computation', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        signWithMasterKey({ ...baseParams, abortSignal: controller.signal })
      ).rejects.toMatchObject({
        code: MasterKeySigningErrorCode.CANCELLED,
      });
    });

    it('should throw CANCELLED when aborted between accounts', async () => {
      const controller = new AbortController();
      mockGetIdTokenWithNonce
        .mockReset()
        .mockImplementationOnce(async () => {
          controller.abort();
          return { idToken: 'token-1', kid: 'kid-1', provider: 'google' };
        });

      await expect(
        signWithMasterKey({
          ...baseParams,
          accounts: [googleAccount, google2Account],
          abortSignal: controller.signal,
        })
      ).rejects.toMatchObject({
        code: MasterKeySigningErrorCode.CANCELLED,
      });
    });
  });

  // ── Error handling ──────────────────────────────────────────

  describe('error handling', () => {
    it('should throw NONCE_FAILED when computeZkNonce fails', async () => {
      mockComputeZkNonce.mockRejectedValue(new Error('Poseidon hash failed'));

      await expect(signWithMasterKey(baseParams)).rejects.toMatchObject({
        code: MasterKeySigningErrorCode.NONCE_FAILED,
      });
    });

    it('should throw ACCOUNT_MISMATCH when sub does not match', async () => {
      mockGetIdTokenWithNonce.mockRejectedValue(
        new Error('Account mismatch: expected user@gmail.com, got different account')
      );

      await expect(signWithMasterKey(baseParams)).rejects.toMatchObject({
        code: MasterKeySigningErrorCode.ACCOUNT_MISMATCH,
      });
    });

    it('should throw TOKEN_COLLECTION_FAILED for other token errors', async () => {
      mockGetIdTokenWithNonce.mockRejectedValue(new Error('Network timeout'));

      await expect(signWithMasterKey(baseParams)).rejects.toMatchObject({
        code: MasterKeySigningErrorCode.TOKEN_COLLECTION_FAILED,
      });
    });

    it('should emit error status before throwing token error', async () => {
      mockGetIdTokenWithNonce.mockRejectedValue(new Error('Login cancelled'));
      const steps: MasterKeySigningStep[] = [];

      await signWithMasterKey({
        ...baseParams,
        onProgress: (step) => steps.push(step),
      }).catch(() => {});

      const errorStep = steps.find(
        s => s.type === 'account_signing' && (s as any).status === 'error'
      );
      expect(errorStep).toBeDefined();
    });

    it('should throw MERKLE_DATA_FAILED when collectMerkleData fails', async () => {
      mockCollectMerkleData.mockRejectedValue(new Error('RPC error'));

      await expect(signWithMasterKey(baseParams)).rejects.toMatchObject({
        code: MasterKeySigningErrorCode.MERKLE_DATA_FAILED,
      });
    });

    it('should throw PROOF_GENERATION_FAILED when generateZkProof fails', async () => {
      mockGenerateZkProof.mockRejectedValue(new Error('Proof server timeout'));

      await expect(signWithMasterKey(baseParams)).rejects.toMatchObject({
        code: MasterKeySigningErrorCode.PROOF_GENERATION_FAILED,
      });
    });
  });

  // ── ABI encoding ────────────────────────────────────────────

  describe('ABI encoding', () => {
    it('should return valid hex-encoded signature', async () => {
      const result = await signWithMasterKey(baseParams);

      expect(result.signature).toMatch(/^0x[0-9a-f]+$/i);
    });

    it('should pass anchor directly without toString conversion', async () => {
      const anchor = ['12345', '67890'];
      await signWithMasterKey({ ...baseParams, anchor });

      expect(mockGenerateZkProof).toHaveBeenCalledWith(
        expect.objectContaining({ anchor }),
      );
    });
  });
});
