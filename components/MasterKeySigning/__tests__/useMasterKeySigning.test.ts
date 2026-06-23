import { renderHook, act } from '@testing-library/react-native';

jest.mock('@/services/wallet/masterKeySigningService', () => ({
  signWithMasterKey: jest.fn(),
}));

import { useMasterKeySigning } from '../useMasterKeySigning';
import { signWithMasterKey } from '@/services/wallet/masterKeySigningService';
import type { MasterKeySigningStep } from '@/services/wallet/masterKeySigningService';
import type { RecoveryAccount } from '@/libs/recovery/recoveryAccountStore';

const mockSignWithMasterKey = signWithMasterKey as jest.MockedFunction<typeof signWithMasterKey>;

// ── Fixtures ─────────────────────────────────────────────────────

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

const mockChainConfig = {
  rpcUrl: 'http://localhost:8545',
  contracts: {},
} as any;

const baseSigningParams = {
  accounts: [googleAccount, google2Account],
  userOpHash: '0xabcdef',
  anchor: ['12345'],
  chainId: 84532,
  chainConfig: mockChainConfig,
};

// ── Tests ────────────────────────────────────────────────────────

describe('useMasterKeySigning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('should return initial state correctly', () => {
      const { result } = renderHook(() => useMasterKeySigning());

      expect(result.current.isSigning).toBe(false);
      expect(result.current.accountStatuses).toEqual([]);
      expect(result.current.currentPhase).toBeNull();
      expect(result.current.verifiedCount).toBe(0);
    });
  });

  describe('startSigning', () => {
    it('should set isSigning to true during signing', async () => {
      let resolveSigning: (value: any) => void;
      mockSignWithMasterKey.mockImplementation(() => new Promise(resolve => {
        resolveSigning = resolve;
      }));

      const { result } = renderHook(() => useMasterKeySigning());

      let signingPromise: Promise<any>;
      act(() => {
        signingPromise = result.current.startSigning(baseSigningParams);
      });

      expect(result.current.isSigning).toBe(true);

      await act(async () => {
        resolveSigning!({ signature: '0xsig' });
        await signingPromise!;
      });

      expect(result.current.isSigning).toBe(false);
    });

    it('should initialize accountStatuses to pending', () => {
      mockSignWithMasterKey.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useMasterKeySigning());

      act(() => {
        result.current.startSigning(baseSigningParams);
      });

      expect(result.current.accountStatuses).toEqual(['pending', 'pending']);
    });

    it('should return signing result on success', async () => {
      mockSignWithMasterKey.mockResolvedValue({ signature: '0xresult' });

      const { result } = renderHook(() => useMasterKeySigning());

      let signingResult: any;
      await act(async () => {
        signingResult = await result.current.startSigning(baseSigningParams);
      });

      expect(signingResult).toEqual({ signature: '0xresult' });
    });

    it('should pass onProgress and abortSignal to signWithMasterKey', async () => {
      mockSignWithMasterKey.mockResolvedValue({ signature: '0xsig' });

      const { result } = renderHook(() => useMasterKeySigning());

      await act(async () => {
        await result.current.startSigning(baseSigningParams);
      });

      expect(mockSignWithMasterKey).toHaveBeenCalledWith(
        expect.objectContaining({
          accounts: baseSigningParams.accounts,
          onProgress: expect.any(Function),
          abortSignal: expect.any(AbortSignal),
        })
      );
    });

    it('should set isSigning to false after error', async () => {
      mockSignWithMasterKey.mockRejectedValue(new Error('Failed'));

      const { result } = renderHook(() => useMasterKeySigning());

      await act(async () => {
        await result.current.startSigning(baseSigningParams).catch(() => {});
      });

      expect(result.current.isSigning).toBe(false);
    });
  });

  describe('progress tracking', () => {
    it('should update accountStatuses on account_signing progress', async () => {
      mockSignWithMasterKey.mockImplementation(async (params) => {
        params.onProgress?.({
          type: 'account_signing',
          accountIndex: 0,
          account: googleAccount,
          status: 'verified',
        });
        return { signature: '0xsig' };
      });

      const { result } = renderHook(() => useMasterKeySigning());

      await act(async () => {
        await result.current.startSigning(baseSigningParams);
      });

      expect(result.current.accountStatuses[0]).toBe('verified');
    });

    it('should update currentPhase on progress', async () => {
      mockSignWithMasterKey.mockImplementation(async (params) => {
        params.onProgress?.({ type: 'generating_proof', proofMode: 'server' });
        return { signature: '0xsig' };
      });

      const { result } = renderHook(() => useMasterKeySigning());

      await act(async () => {
        await result.current.startSigning(baseSigningParams);
      });

      expect(result.current.currentPhase).toEqual({ type: 'generating_proof', proofMode: 'server' });
    });

    it('should calculate verifiedCount correctly', async () => {
      mockSignWithMasterKey.mockImplementation(async (params) => {
        params.onProgress?.({
          type: 'account_signing',
          accountIndex: 0,
          account: googleAccount,
          status: 'verified',
        });
        params.onProgress?.({
          type: 'account_signing',
          accountIndex: 1,
          account: google2Account,
          status: 'verified',
        });
        return { signature: '0xsig' };
      });

      const { result } = renderHook(() => useMasterKeySigning());

      await act(async () => {
        await result.current.startSigning(baseSigningParams);
      });

      expect(result.current.verifiedCount).toBe(2);
    });

    it('should initialize accountStatuses on computing_nonce', async () => {
      mockSignWithMasterKey.mockImplementation(async (params) => {
        params.onProgress?.({ type: 'computing_nonce' });
        return { signature: '0xsig' };
      });

      const { result } = renderHook(() => useMasterKeySigning());

      await act(async () => {
        await result.current.startSigning(baseSigningParams);
      });

      expect(result.current.accountStatuses).toEqual(['pending', 'pending']);
    });
  });

  describe('cancel', () => {
    it('should abort the signing process', async () => {
      let capturedSignal: AbortSignal | undefined;
      mockSignWithMasterKey.mockImplementation(async (params) => {
        capturedSignal = params.abortSignal;
        return new Promise(() => {}); // Never resolves
      });

      const { result } = renderHook(() => useMasterKeySigning());

      act(() => {
        result.current.startSigning(baseSigningParams);
      });

      act(() => {
        result.current.cancel();
      });

      expect(capturedSignal?.aborted).toBe(true);
    });
  });

  describe('retry', () => {
    it('should throw if no previous params', async () => {
      const { result } = renderHook(() => useMasterKeySigning());

      await expect(
        act(async () => {
          await result.current.retry();
        })
      ).rejects.toThrow('No previous signing params to retry');
    });

    it('should retry with last params', async () => {
      mockSignWithMasterKey.mockResolvedValue({ signature: '0xsig' });

      const { result } = renderHook(() => useMasterKeySigning());

      await act(async () => {
        await result.current.startSigning(baseSigningParams);
      });

      mockSignWithMasterKey.mockClear();
      mockSignWithMasterKey.mockResolvedValue({ signature: '0xretry' });

      await act(async () => {
        const retryResult = await result.current.retry();
        expect(retryResult).toEqual({ signature: '0xretry' });
      });

      expect(mockSignWithMasterKey).toHaveBeenCalledWith(
        expect.objectContaining({
          accounts: baseSigningParams.accounts,
          userOpHash: baseSigningParams.userOpHash,
        })
      );
    });
  });
});
