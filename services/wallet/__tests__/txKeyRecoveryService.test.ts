import { ethers } from 'ethers';

// ── Mocks ────────────────────────────────────────────────────────

const mockMasterKeyList = jest.fn();
const mockGetAnchor = jest.fn();

jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      JsonRpcProvider: jest.fn().mockImplementation(() => ({
        getBalance: jest.fn().mockResolvedValue(BigInt('1000000000000000000')), // 1 ETH
      })),
      Contract: jest.fn().mockImplementation((_address: string, abi: string[]) => {
        // Route to correct mock based on ABI
        if (abi[0]?.includes('masterKeyList')) {
          return { masterKeyList: mockMasterKeyList };
        }
        if (abi[0]?.includes('getAnchor')) {
          return { getAnchor: mockGetAnchor };
        }
        return {};
      }),
      ZeroAddress: actual.ethers.ZeroAddress,
      AbiCoder: actual.ethers.AbiCoder,
      formatEther: actual.ethers.formatEther,
    },
  };
});

jest.mock('@/services/chains/chainConfigService', () => ({
  getChainConfig: jest.fn(),
}));

jest.mock('@baerae/zkap-aa', () => ({
  ZkapBuilder: jest.fn().mockImplementation(() => ({
    setSender: jest.fn(),
    setUpdateTxKeyCallData: jest.fn(),
    autoFillUserOp: jest.fn().mockResolvedValue(undefined),
    getUserOp: jest.fn().mockReturnValue({
      maxFeePerGas: '1000000000',
      verificationGasLimit: '100000',
      callGasLimit: '100000',
      preVerificationGas: '50000',
    }),
    getUserOpHash: jest.fn().mockReturnValue('0xmockUserOpHash'),
    setSignature: jest.fn(),
  })),
}));

jest.mock('../masterKeySigningService', () => ({
  signWithMasterKey: jest.fn().mockResolvedValue({ signature: '0xmockSignature' }),
}));

jest.mock('../walletCreationService', () => ({
  buildEncodedTxKeyFromPasskey: jest.fn().mockReturnValue('0xmockEncodedTxKey'),
}));

jest.mock('../zkProofUtils', () => ({
  toUnpackedUserOp: jest.fn().mockReturnValue({}),
}));

jest.mock('@/services/api/bundler', () => ({
  bundlerApi: {
    submitUnpackedUserOp: jest.fn().mockResolvedValue({ userOpHash: '0xsubmittedHash' }),
    waitForConfirmation: jest.fn().mockResolvedValue('0xtxHash'),
  },
}));

jest.mock('@/libs/utils/retry', () => ({
  withRetry: jest.fn((fn: () => any) => fn()),
}));

import { getChainConfig } from '@/services/chains/chainConfigService';
import { signWithMasterKey } from '../masterKeySigningService';
import {
  readOnChainMasterKeyInfo,
  applyTxKeyUpdate,
  TxKeyRecoveryError,
  TxKeyRecoveryErrorCode,
} from '../txKeyRecoveryService';
import type { RecoveryAccount } from '@/libs/recovery/recoveryAccountStore';
import type { StoredPasskey } from '@/libs/passkey/passkeyStore';

const mockGetChainConfig = getChainConfig as jest.MockedFunction<typeof getChainConfig>;
const mockSignWithMasterKey = signWithMasterKey as jest.MockedFunction<typeof signWithMasterKey>;

// ── Fixtures ─────────────────────────────────────────────────────

const VERIFIER_3OF3 = '0x3of3VerifierAddress';
const VERIFIER_1OF1 = '0x1of1VerifierAddress';

const mockChainConfig = {
  rpcUrl: 'http://localhost:8545',
  contracts: {
    entryPoint: '0xEntryPoint',
    zkOAuthVerifier1of1: VERIFIER_1OF1,
    zkOAuthVerifier3of3: VERIFIER_3OF3,
    merkleTreeDirectory: '0xMerkleTree',
    webAuthnImpl: '0xWebAuthn',
  },
} as any;

const makeAccount = (provider: string, sub: string): RecoveryAccount => ({
  provider: provider as any,
  iss: `https://${provider}.example`,
  sub,
  aud: 'test-client-id',
  identifier: `${sub}@${provider}.com`,
  isDefault: false,
});

const googleAccount = makeAccount('google', 'google-sub-1');
const google2Account = makeAccount('google', 'google-sub-2');

const mockPasskey: StoredPasskey = {
  credentialId: 'mock-cred-id',
  credentialPubkeyCose: 'mock-cose-key',
  rpId: 'test.example.com',
} as any;

// ── Tests ────────────────────────────────────────────────────────

const mockProvider = {} as any; // Provider is injected, not constructed inside

describe('readOnChainMasterKeyInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAnchor.mockResolvedValue([111n, 222n]);
  });

  it('should return anchor when on-chain logic matches zkOAuthVerifier3of3', async () => {
    mockMasterKeyList.mockResolvedValue({
      logic: VERIFIER_3OF3,
      keyId: 0n,
    });

    const result = await readOnChainMasterKeyInfo('0xSender', 84532, mockProvider, mockChainConfig);

    expect(result.oldAnchor).toEqual(['111', '222']);
  });

  it('should throw BUILD_FAILED when on-chain logic matches an unsupported verifier (1-of-1)', async () => {
    mockMasterKeyList.mockResolvedValue({
      logic: VERIFIER_1OF1,
      keyId: 0n,
    });

    await expect(
      readOnChainMasterKeyInfo('0xSender', 84532, mockProvider, mockChainConfig)
    ).rejects.toMatchObject({
      code: TxKeyRecoveryErrorCode.BUILD_FAILED,
    });
  });

  it('should compare addresses case-insensitively and succeed for 3-of-3', async () => {
    mockMasterKeyList.mockResolvedValue({
      logic: VERIFIER_3OF3.toUpperCase(),
      keyId: 0n,
    });

    const result = await readOnChainMasterKeyInfo('0xSender', 84532, mockProvider, mockChainConfig);

    expect(result.oldAnchor).toEqual(['111', '222']);
  });

  it('should convert bigint anchor values to strings', async () => {
    mockMasterKeyList.mockResolvedValue({
      logic: VERIFIER_3OF3,
      keyId: 0n,
    });
    mockGetAnchor.mockResolvedValue([999n, 888n, 777n]);

    const result = await readOnChainMasterKeyInfo('0xSender', 84532, mockProvider, mockChainConfig);

    expect(result.oldAnchor).toEqual(['999', '888', '777']);
  });

  it('should throw BUILD_FAILED when masterKeyList returns zero address', async () => {
    mockMasterKeyList.mockResolvedValue({
      logic: ethers.ZeroAddress,
      keyId: 0n,
    });

    await expect(
      readOnChainMasterKeyInfo('0xSender', 84532, mockProvider, mockChainConfig)
    ).rejects.toMatchObject({
      code: TxKeyRecoveryErrorCode.BUILD_FAILED,
    });
  });

  it('should throw BUILD_FAILED when masterKeyList returns null logic', async () => {
    mockMasterKeyList.mockResolvedValue({
      logic: null,
      keyId: 0n,
    });

    await expect(
      readOnChainMasterKeyInfo('0xSender', 84532, mockProvider, mockChainConfig)
    ).rejects.toMatchObject({
      code: TxKeyRecoveryErrorCode.BUILD_FAILED,
    });
  });
});

describe('applyTxKeyUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetChainConfig.mockResolvedValue(mockChainConfig);
    mockMasterKeyList.mockResolvedValue({
      logic: VERIFIER_3OF3,
      keyId: 0n,
    });
    mockGetAnchor.mockResolvedValue([123n, 456n]);
    mockSignWithMasterKey.mockResolvedValue({ signature: '0xmockSig' });
  });

  describe('3-of-3 verifier with 1 account (no INSUFFICIENT_ACCOUNTS)', () => {
    it('should NOT throw INSUFFICIENT_ACCOUNTS with 1 account + 3-of-3 verifier', async () => {
      const result = await applyTxKeyUpdate({
        chainId: 84532,
        sender: '0xSender',
        localPasskey: mockPasskey,
        currentAccounts: [googleAccount],
      });

      expect(result).toBe('0xtxHash');
    });

    it('should call signWithMasterKey with the old anchor when verifier is 3-of-3', async () => {
      await applyTxKeyUpdate({
        chainId: 84532,
        sender: '0xSender',
        localPasskey: mockPasskey,
        currentAccounts: [googleAccount],
      });

      expect(mockSignWithMasterKey).toHaveBeenCalledWith(
        expect.objectContaining({
          anchor: ['123', '456'],
        }),
      );
    });

    it('should throw BUILD_FAILED when verifier is unsupported (1-of-1)', async () => {
      mockMasterKeyList.mockResolvedValue({
        logic: VERIFIER_1OF1,
        keyId: 0n,
      });

      await expect(applyTxKeyUpdate({
        chainId: 84532,
        sender: '0xSender',
        localPasskey: mockPasskey,
        currentAccounts: [googleAccount],
      })).rejects.toMatchObject({
        code: TxKeyRecoveryErrorCode.BUILD_FAILED,
      });
    });

    it('passes proving key network check skip through to masterKey signing', async () => {
      await applyTxKeyUpdate({
        chainId: 84532,
        sender: '0xSender',
        localPasskey: mockPasskey,
        currentAccounts: [googleAccount],
        skipProvingKeyNetworkCheck: true,
      });

      expect(mockSignWithMasterKey).toHaveBeenCalledWith(
        expect.objectContaining({
          skipProvingKeyNetworkCheck: true,
        }),
      );
    });
  });

  describe('3-of-3 verifier with 2 accounts', () => {
    it('should succeed with 2 accounts + 3-of-3 verifier', async () => {
      const result = await applyTxKeyUpdate({
        chainId: 84532,
        sender: '0xSender',
        localPasskey: mockPasskey,
        currentAccounts: [googleAccount, google2Account],
      });

      expect(result).toBe('0xtxHash');
    });
  });

  describe('passkey validation', () => {
    it('should throw CORRUPTED_PASSKEY when credentialPubkeyCose is missing and createPasskey fails', async () => {
      const badPasskey = { ...mockPasskey, credentialPubkeyCose: undefined } as any;

      await expect(
        applyTxKeyUpdate({
          chainId: 84532,
          sender: '0xSender',
          localPasskey: badPasskey,
          currentAccounts: [googleAccount],
        })
      ).rejects.toMatchObject({
        code: TxKeyRecoveryErrorCode.CORRUPTED_PASSKEY,
      });
    });
  });

  describe('abort signal', () => {
    it('should throw when aborted before signing', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        applyTxKeyUpdate({
          chainId: 84532,
          sender: '0xSender',
          localPasskey: mockPasskey,
          currentAccounts: [googleAccount],
          abortSignal: controller.signal,
        })
      ).rejects.toThrow('TxKey update cancelled');
    });
  });

  describe('progress callbacks', () => {
    it('should emit progress steps in order', async () => {
      const steps: any[] = [];

      await applyTxKeyUpdate({
        chainId: 84532,
        sender: '0xSender',
        localPasskey: mockPasskey,
        currentAccounts: [googleAccount],
        onProgress: (step) => steps.push(step.type),
      });

      expect(steps).toEqual([
        'building_userop',
        'checking_balance',
        'reading_anchor',
        'submitting',
        'confirming',
        'completed',
      ]);
    });
  });

});
