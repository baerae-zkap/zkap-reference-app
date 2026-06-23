import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { CreatingStep } from '../CreatingStep';
import { WalletActivationProvider } from '../../WalletActivationContext';
import { WalletStatus } from '@/stores/walletStore';

// Mock expo-router
const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, number>) => {
      if (key === 'walletActivation.creating.downloadProgress' && params) {
        return `${params.downloaded}MB / ${params.total}MB`;
      }
      return key;
    },
  }),
}));

// Mock supportedChains
jest.mock('@/libs/chains/supportedChains', () => ({
  getChainById: jest.fn().mockReturnValue({
    chainId: 84532,
    displayName: 'Base',
    isTestnet: false,
  }),
}));

// Wallet store mocks
const mockAddWallet = jest.fn();
const mockUpdateWallet = jest.fn();
const mockSetIsCreating = jest.fn();
const mockGetWalletByChainId = jest.fn();

jest.mock('@/stores/walletStore', () => ({
  useWalletStore: jest.fn(() => ({
    addWallet: mockAddWallet,
    updateWallet: mockUpdateWallet,
    setIsCreating: mockSetIsCreating,
    getWalletByChainId: mockGetWalletByChainId,
  })),
  WalletStatus: {
    NOT_CREATED: 'NOT_CREATED',
    DERIVED: 'DERIVED',
    DEPLOYED: 'DEPLOYED',
  },
}));

// walletCreationService mocks
const mockDeriveWalletAddress = jest.fn();
const mockCheckWalletDeployed = jest.fn();
const mockVerifyAndMarkDeployed = jest.fn();
const mockDeployWallet = jest.fn();

jest.mock('@/services/wallet/walletCreationService', () => ({
  deriveWalletAddress: (...args: any[]) => mockDeriveWalletAddress(...args),
  checkWalletDeployed: (...args: any[]) => mockCheckWalletDeployed(...args),
  verifyAndMarkDeployed: (...args: any[]) => mockVerifyAndMarkDeployed(...args),
  deployWallet: (...args: any[]) => mockDeployWallet(...args),
  WalletCreationError: class WalletCreationError extends Error {
    code: string;
    recoverable: boolean;
    constructor(code: string, message: string, recoverable = false) {
      super(message);
      this.code = code;
      this.recoverable = recoverable;
    }
  },
  WalletErrorCode: {
    CHAIN_CONFIG_FAILED: 'CHAIN_CONFIG_FAILED',
    ANCHOR_COMPUTATION_FAILED: 'ANCHOR_COMPUTATION_FAILED',
    DERIVATION_FAILED: 'DERIVATION_FAILED',
    INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
    DEPLOYMENT_FAILED: 'DEPLOYMENT_FAILED',
    VERIFICATION_FAILED: 'VERIFICATION_FAILED',
    PASSKEY_ERROR: 'PASSKEY_ERROR',
    NO_RECOVERY_ACCOUNTS: 'NO_RECOVERY_ACCOUNTS',
    NETWORK_ERROR: 'NETWORK_ERROR',
  },
}));

const mockCheckNetworkForDownload = jest.fn();
const mockGetNetworkStatus = jest.fn();
const mockGetCachedProvingKeyPath = jest.fn();

jest.mock('@/libs/network/networkCheck', () => ({
  checkNetworkForDownload: (...args: any[]) => mockCheckNetworkForDownload(...args),
  getNetworkStatus: (...args: any[]) => mockGetNetworkStatus(...args),
}));

jest.mock('@/services/zkNative/provingKeyManager', () => ({
  getCachedProvingKeyPath: (...args: any[]) => mockGetCachedProvingKeyPath(...args),
}));

// WalletActivation context mocks
const mockNextStep = jest.fn();
const mockSetCreatedWallet = jest.fn();
const mockSetError = jest.fn();
const mockClose = jest.fn();
const mockReset = jest.fn();

// Shared state that tests can override
let mockSelectedChainId: number | null = 84532;
let mockError: any = null;

jest.mock('../../WalletActivationContext', () => ({
  WalletActivationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  WalletActivationStep: {
    FUNDING: 0,
    CREATING: 1,
    COMPLETE: 2,
  },
  useWalletActivation: jest.fn(() => ({
    selectedChainId: mockSelectedChainId,
    nextStep: mockNextStep,
    setCreatedWallet: mockSetCreatedWallet,
    setError: mockSetError,
    error: mockError,
    close: mockClose,
    reset: mockReset,
  })),
}));

describe('CreatingStep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelectedChainId = 84532;
    mockError = null;
    mockGetWalletByChainId.mockReturnValue(undefined);
    mockDeriveWalletAddress.mockResolvedValue('0xderived_address');
    mockCheckWalletDeployed.mockResolvedValue(false);
    mockVerifyAndMarkDeployed.mockResolvedValue(undefined);
    mockDeployWallet.mockResolvedValue({ address: '0xdeployed_address' });
    mockCheckNetworkForDownload.mockResolvedValue(true);
    mockGetNetworkStatus.mockResolvedValue('wifi');
    mockGetCachedProvingKeyPath.mockResolvedValue(null);
  });

  const renderStep = () =>
    render(
      <WalletActivationProvider>
        <CreatingStep />
      </WalletActivationProvider>
    );

  describe('(a) short-circuit: existing DERIVED/DEPLOYED wallet skips deriveWalletAddress', () => {
    it('does NOT call deriveWalletAddress when wallet has status DERIVED', async () => {
      mockGetWalletByChainId.mockReturnValue({
        address: '0xexisting_derived',
        chainId: 84532,
        status: WalletStatus.DERIVED,
        createdAt: '2024-01-01T00:00:00Z',
      });
      mockCheckWalletDeployed.mockResolvedValue(false);

      renderStep();

      await waitFor(() => {
        expect(mockDeployWallet).toHaveBeenCalledWith(
          expect.objectContaining({ chainId: 84532 })
        );
      });

      expect(mockDeriveWalletAddress).not.toHaveBeenCalled();
    });

    it('does NOT call deriveWalletAddress when wallet has status DEPLOYED', async () => {
      mockGetWalletByChainId.mockReturnValue({
        address: '0xexisting_deployed',
        chainId: 84532,
        status: WalletStatus.DEPLOYED,
        createdAt: '2024-01-01T00:00:00Z',
        deployedAt: '2024-01-02T00:00:00Z',
      });
      mockCheckWalletDeployed.mockResolvedValue(true);
      mockVerifyAndMarkDeployed.mockResolvedValue(undefined);

      renderStep();

      await waitFor(() => {
        expect(mockNextStep).toHaveBeenCalled();
      });

      expect(mockDeriveWalletAddress).not.toHaveBeenCalled();
    });
  });

  describe('(b) checkWalletDeployed returns true → COMPLETE path', () => {
    it('calls verifyAndMarkDeployed, setCreatedWallet, and nextStep', async () => {
      mockCheckWalletDeployed.mockResolvedValue(true);
      mockVerifyAndMarkDeployed.mockResolvedValue(undefined);

      renderStep();

      await waitFor(() => {
        expect(mockVerifyAndMarkDeployed).toHaveBeenCalledWith(
          '0xderived_address',
          84532,
          { alreadyVerified: true }
        );
      });

      expect(mockSetCreatedWallet).toHaveBeenCalledWith(
        expect.objectContaining({
          address: '0xderived_address',
          chainId: 84532,
          status: WalletStatus.DEPLOYED,
        })
      );
      expect(mockNextStep).toHaveBeenCalled();
      expect(mockRouterPush).not.toHaveBeenCalled();
    });
  });

  describe('(c) checkWalletDeployed returns false → native deploy path', () => {
    it('deploys wallet natively and advances to COMPLETE', async () => {
      mockCheckWalletDeployed.mockResolvedValue(false);

      renderStep();

      await waitFor(() => {
        expect(mockDeployWallet).toHaveBeenCalledWith(
          expect.objectContaining({
            chainId: 84532,
            onProgress: expect.any(Function),
          })
        );
      });

      expect(mockSetCreatedWallet).toHaveBeenCalledWith(
        expect.objectContaining({
          address: '0xdeployed_address',
          chainId: 84532,
          status: WalletStatus.DEPLOYED,
        })
      );
      expect(mockNextStep).toHaveBeenCalled();
      expect(mockRouterPush).not.toHaveBeenCalled();
    });

    it('does not show a download consent gate before deploying', async () => {
      mockCheckWalletDeployed.mockResolvedValue(false);

      const { queryByTestId } = renderStep();

      await waitFor(() => {
        expect(mockDeployWallet).toHaveBeenCalled();
      });
      expect(queryByTestId('wallet-activation-download-consent')).toBeNull();
    });

    it('shows signing phase message when deployWallet emits signing progress', async () => {
      mockCheckWalletDeployed.mockResolvedValue(false);
      mockDeployWallet.mockImplementation(({ onProgress }) => {
        onProgress?.({ type: 'signing' });
        return new Promise(() => {});
      });

      const { getByText } = renderStep();

      await waitFor(() => {
        expect(getByText('walletActivation.creating.signing')).toBeTruthy();
      });
    });

    it('shows submitting phase message when deployWallet emits submitting progress', async () => {
      mockCheckWalletDeployed.mockResolvedValue(false);
      mockDeployWallet.mockImplementation(({ onProgress }) => {
        onProgress?.({ type: 'submitting' });
        return new Promise(() => {});
      });

      const { getByText } = renderStep();

      await waitFor(() => {
        expect(getByText('walletActivation.creating.submitting')).toBeTruthy();
      });
    });
  });

  describe('(d) error path: deriveWalletAddress throws → setError called, retry shown', () => {
    it('calls setError when deriveWalletAddress throws', async () => {
      mockDeriveWalletAddress.mockRejectedValue(new Error('network timeout'));

      renderStep();

      await waitFor(() => {
        expect(mockSetError).toHaveBeenCalledWith(
          expect.objectContaining({
            recoverable: true,
            action: 'retry',
          })
        );
      });
    });

    it('shows retry button when error has action=retry', async () => {
      // Simulate error state being set in context
      mockError = {
        code: 'NETWORK_ERROR',
        message: 'walletActivation.errors.networkError',
        recoverable: true,
        action: 'retry',
      };

      const { getByText } = renderStep();

      await waitFor(() => {
        expect(getByText('common.retry')).toBeTruthy();
      });
    });

    it('shows back button when error has action=back', async () => {
      mockError = {
        code: 'DERIVATION_FAILED',
        message: 'walletActivation.errors.derivationFailed',
        recoverable: false,
        action: 'back',
      };

      const { getByText } = renderStep();

      await waitFor(() => {
        expect(getByText('common.back')).toBeTruthy();
      });
    });
  });

  describe('no chain selected', () => {
    it('does not call deriveWalletAddress when selectedChainId is null', () => {
      mockSelectedChainId = null;

      renderStep();

      expect(mockDeriveWalletAddress).not.toHaveBeenCalled();
      expect(mockSetIsCreating).not.toHaveBeenCalled();
    });
  });
});
