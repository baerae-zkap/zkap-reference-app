
import React from 'react';
import { Linking } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import RecoverySetup from '../index';
import { useAuthStore } from '@/stores/authStore';

const mockWalletState = {
  wallet: {
    chainId: 84532,
    address: '0x1234567890abcdef',
    status: 'DEPLOYED',
  },
  activeChainId: 84532,
  getWalletByChainId: (chainId: number) => ({
    chainId,
    address: '0x1234567890abcdef',
    status: 'DEPLOYED',
  }),
};
const mockApplyRecoveryUpdate = jest.fn<Promise<void>, [any]>(() => Promise.resolve());
const mockConfirmProvingBundleReady = jest.fn<Promise<boolean>, [string]>(() => Promise.resolve(true));

// Gas gate reads the active wallet balance via ethers before showing Review.
// Default to a funded balance ('1.0') so the Review step is reached; individual
// tests override mockGetBalance to exercise the gas-gate path.
const mockGetBalance = jest.fn(() => Promise.resolve(1000000000000000000n));
const mockOpenURL = jest.fn(() => Promise.resolve());
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(() => Promise.resolve()),
}));
// Keep the real ethers (zkap-aa/providerConfigHelper need Interface, etc.) and
// only stub the JSON-RPC balance read used by the gas gate. formatEther/parseEther
// stay real so gasGate.isInsufficientForGas is exercised faithfully.
jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      JsonRpcProvider: jest.fn(() => ({ getBalance: mockGetBalance })),
    },
  };
});

// Mock expo-router
const mockBack = jest.fn();
const mockRouter = {
  back: mockBack,
};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ chainId: '84532' }),
}));

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: any) => {
      if (params) {
        return `${key}:${JSON.stringify(params)}`;
      }
      return key;
    },
  }),
}));

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, ...props }: any) => {
    const { View } = require('react-native');
    return <View {...props}>{children}</View>;
  },
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Mock authStore
jest.mock('@/stores/authStore', () => ({
  useAuthStore: jest.fn(),
  AuthProvider: {},
}));

// Mock walletStore
jest.mock('@/stores/walletStore', () => ({
  useWalletStore: (selector?: any) =>
    selector ? selector(mockWalletState) : mockWalletState,
}));

// Mock SocialAccountPicker
jest.mock('@/components/SocialAccountPicker', () => ({
  SocialAccountPicker: ({ visible, onSelect }: any) => {
    if (!visible) return null;
    const { View, TouchableOpacity, Text } = require('react-native');
    return (
      <View>
        <TouchableOpacity onPress={() => onSelect('google')}>
          <Text>Pick Google</Text>
        </TouchableOpacity>
      </View>
    );
  },
}));

// Mock recoveryAccountStore
const mockGetRecoveryAccountsByChain = jest.fn();
const mockSaveRecoveryAccountsForChain = jest.fn();
jest.mock('@/libs/recovery/recoveryAccountStore', () => ({
  getRecoveryAccountsByChain: (...args: any[]) => mockGetRecoveryAccountsByChain(...args),
  saveRecoveryAccountsForChain: (...args: any[]) => mockSaveRecoveryAccountsForChain(...args),
}));

// Mock supportedChains
jest.mock('@/libs/chains/supportedChains', () => ({
  getChainById: (chainId: number) => ({
    chainId,
    displayName: 'Base Sepolia',
    nativeCurrency: { symbol: 'ETH' },
    isTestnet: true,
  }),
  getEnabledChains: () => [
    { chainId: 84532, displayName: 'Base Sepolia' },
  ],
}));

// Mock decodeIdToken
jest.mock('@/libs/jwt/decodeIdToken', () => ({
  decodeIdToken: jest.fn(() => ({
    iss: 'https://accounts.google.com',
    sub: 'mock-sub',
    aud: 'mock-aud',
    identifier: 'user@gmail.com',
  })),
}));

// Mock auth services
jest.mock('@/services/auth/googleAuth', () => ({
  googleSignIn: jest.fn(() => Promise.resolve({ idToken: 'mock-google-id-token', userName: 'Google User', email: 'user@gmail.com' })),
}));
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signOut: jest.fn(() => Promise.resolve()),
  },
}));

// Mock recoveryService
jest.mock('@/services/wallet/recoveryService', () => ({
  applyRecoveryUpdate: (params: any) => mockApplyRecoveryUpdate(params),
  RecoveryServiceError: class RecoveryServiceError extends Error {},
}));

// BYO provider config: stub so the screen doesn't need a real OAuth client / native hash.
jest.mock('@/libs/wallet/providerConfigHelper', () => ({
  initProviderConfig: jest.fn().mockResolvedValue(undefined),
  getCanonicalClientId: jest.fn(() => 'mock-canonical-client-id'),
}));

jest.mock('@/components/ProvingBundleDownloadConsent', () => ({
  useProvingBundleDownloadConsent: () => ({
    confirmProvingBundleReady: (circuit: string) => mockConfirmProvingBundleReady(circuit),
    consentModal: null,
  }),
}));

jest.mock('@/components/MasterKeySigning', () => ({
  MasterKeySigningOverlay: ({ visible, onConfirmLogin, onCancel }: any) => {
    if (!visible) return null;
    const { View, Pressable, Text } = require('react-native');
    return (
      <View>
        <Text>MasterKeySigningOverlay</Text>
        <Pressable testID="confirm-signing" onPress={onConfirmLogin}>
          <Text>Confirm Login</Text>
        </Pressable>
        <Pressable testID="cancel-signing" onPress={onCancel}>
          <Text>Cancel Signing</Text>
        </Pressable>
      </View>
    );
  },
}));

// Mock providers
jest.mock('@/libs/constants/providers', () => ({
  SUPPORTED_SOCIAL_PROVIDERS: ['google'],
  isSupportedProvider: () => true,
}));

// Mock react-native-svg
jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
}));

const mockUseAuthStore = useAuthStore as jest.MockedFunction<typeof useAuthStore>;

describe('RecoverySetup', () => {
  jest.setTimeout(15000);
  const mockUpdateUser = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRecoveryAccountsByChain.mockResolvedValue(null);
    mockSaveRecoveryAccountsForChain.mockResolvedValue(undefined);
    mockApplyRecoveryUpdate.mockResolvedValue(undefined);
    mockConfirmProvingBundleReady.mockResolvedValue(true);
    // Funded by default so handleApply advances to the Review step.
    mockGetBalance.mockResolvedValue(1000000000000000000n);
    mockOpenURL.mockResolvedValue(undefined);
    jest.spyOn(Linking, 'openURL').mockImplementation(mockOpenURL);
    mockUseAuthStore.mockReturnValue({
      user: { hasRecovery: false },
      updateUser: mockUpdateUser,
    } as any);
  });

  describe('Rendering', () => {
    it('renders without crashing', async () => {
      const { getByText } = render(<RecoverySetup />);
      await waitFor(() => {
        expect(getByText('recovery.setup.title')).toBeDefined();
      });
    });

    it('renders description', async () => {
      const { getByText } = render(<RecoverySetup />);
      await waitFor(() => {
        expect(getByText('recovery.setup.description')).toBeDefined();
      });
    });

    it('renders apply button', async () => {
      const { getByText } = render(<RecoverySetup />);
      await waitFor(() => {
        expect(getByText('recovery.setup.applyButton')).toBeDefined();
      });
    });

    it('shows add account button', async () => {
      const { getByText } = render(<RecoverySetup />);
      await waitFor(() => {
        expect(getByText('onboarding.wallet.addAccount')).toBeDefined();
      });
    });
  });

  describe('Add Account', () => {
    it('shows add account button with remaining count', async () => {
      const { getByText } = render(<RecoverySetup />);
      await waitFor(() => {
        expect(getByText('onboarding.wallet.addAccount')).toBeDefined();
        expect(getByText('onboarding.wallet.addAccountSub:{"remaining":3}')).toBeDefined();
      });
    });

    it('opens picker when add account pressed', async () => {
      const { getByText } = render(<RecoverySetup />);
      await waitFor(() => {
        expect(getByText('onboarding.wallet.addAccount')).toBeDefined();
      });

      // Press the add account button
      const addButton = getByText('onboarding.wallet.addAccount');
      fireEvent.press(addButton);

      // Picker should open (mocked SocialAccountPicker renders "Pick Google")
      await waitFor(() => {
        expect(getByText('Pick Google')).toBeDefined();
      });
    });

    it('adds account when provider selected from picker', async () => {
      const { getByText } = render(<RecoverySetup />);
      await waitFor(() => {
        expect(getByText('onboarding.wallet.addAccount')).toBeDefined();
      });

      // Open picker
      fireEvent.press(getByText('onboarding.wallet.addAccount'));

      await waitFor(() => {
        expect(getByText('Pick Google')).toBeDefined();
      });

      // Select google from picker
      fireEvent.press(getByText('Pick Google'));

      await waitFor(() => {
        expect(getByText('user@gmail.com')).toBeDefined();
      }, { timeout: 3000 });
    });
  });

  describe('Linked Accounts Section', () => {
    it('does not show linked accounts section initially', async () => {
      const { queryByText } = render(<RecoverySetup />);
      await waitFor(() => {
        expect(queryByText('onboarding.wallet.addAccount')).toBeDefined();
      });
      expect(queryByText('settings.linkedAccounts')).toBeNull();
    });

    it('shows linked accounts after adding', async () => {
      const { getByText } = render(<RecoverySetup />);
      await waitFor(() => expect(getByText('onboarding.wallet.addAccount')).toBeDefined());

      fireEvent.press(getByText('onboarding.wallet.addAccount'));
      await waitFor(() => expect(getByText('Pick Google')).toBeDefined());
      fireEvent.press(getByText('Pick Google'));

      await waitFor(() => {
        expect(getByText('user@gmail.com')).toBeDefined();
        expect(getByText('Google')).toBeDefined();
      }, { timeout: 3000 });
    });
  });

  describe('Recovery Note', () => {
    it('displays recovery note', async () => {
      const { getByText } = render(<RecoverySetup />);
      await waitFor(() => {
        expect(getByText('onboarding.wallet.recoveryNote')).toBeDefined();
      });
    });
  });

  describe('Back Navigation', () => {
    it('has back navigation available', async () => {
      const { getByText } = render(<RecoverySetup />);
      await waitFor(() => {
        expect(getByText('recovery.setup.title')).toBeDefined();
      });
      expect(mockBack).toBeDefined();
    });
  });

  describe('Loading Existing Accounts', () => {
    it('loads existing accounts from store', async () => {
      mockGetRecoveryAccountsByChain.mockResolvedValue([
        { provider: 'google', identifier: 'existing@gmail.com', sub: '1', iss: 'google', aud: 'aud1', isDefault: true },
      ]);

      const { getByText } = render(<RecoverySetup />);
      await waitFor(() => {
        expect(getByText('existing@gmail.com')).toBeDefined();
      });
    });

    it('calls getRecoveryAccountsByChain with correct chainId', async () => {
      const { getByText } = render(<RecoverySetup />);
      await waitFor(() => {
        expect(getByText('recovery.setup.title')).toBeDefined();
      });

      expect(mockGetRecoveryAccountsByChain).toHaveBeenCalledWith(84532);
    });
  });

  describe('Apply Changes', () => {
    const existingAccount = {
      provider: 'google',
      identifier: 'existing@gmail.com',
      sub: 'existing-sub',
      iss: 'google',
      aud: 'aud1',
      isDefault: true,
    };

    // The Review path requires >=1 current on-chain account (handleApply guards
    // originalAccounts.length < 1). Load one existing account, then add a second
    // to create the pending change these tests apply.
    it('checks the 3-of-3 proving bundle before applying recovery changes', async () => {
      mockGetRecoveryAccountsByChain.mockResolvedValue([existingAccount]);

      const { getByText, getByTestId } = render(<RecoverySetup />);
      await waitFor(() => expect(getByText('existing@gmail.com')).toBeDefined());

      fireEvent.press(getByText('onboarding.wallet.addAccount'));
      await waitFor(() => expect(getByText('Pick Google')).toBeDefined());
      fireEvent.press(getByText('Pick Google'));
      await waitFor(() => expect(getByText('user@gmail.com')).toBeDefined());

      // Apply now opens the Review step (after the gas gate); confirm there.
      fireEvent.press(getByText('recovery.setup.applyButton'));
      await waitFor(() => expect(getByTestId('recovery-review-start')).toBeDefined());
      fireEvent.press(getByTestId('recovery-review-start'));

      await waitFor(() => {
        expect(mockConfirmProvingBundleReady).toHaveBeenCalledWith('3-of-3');
        expect(mockApplyRecoveryUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            skipProvingKeyNetworkCheck: true,
          }),
        );
      });
    });

    it('shows the before/after Review with the active account count', async () => {
      mockGetRecoveryAccountsByChain.mockResolvedValue([existingAccount]);

      const { getByText } = render(<RecoverySetup />);
      await waitFor(() => expect(getByText('existing@gmail.com')).toBeDefined());

      fireEvent.press(getByText('onboarding.wallet.addAccount'));
      await waitFor(() => expect(getByText('Pick Google')).toBeDefined());
      fireEvent.press(getByText('Pick Google'));
      await waitFor(() => expect(getByText('user@gmail.com')).toBeDefined());

      fireEvent.press(getByText('recovery.setup.applyButton'));

      await waitFor(() => {
        // CTA count is driven by the *current* on-chain accounts (here: 1).
        expect(getByText('recovery.review.start:{"count":1}')).toBeDefined();
      });
      // Proving bundle is only touched after the user confirms the Review.
      expect(mockConfirmProvingBundleReady).not.toHaveBeenCalled();
    });

    it('returns to the editor when Review back is pressed', async () => {
      mockGetRecoveryAccountsByChain.mockResolvedValue([existingAccount]);

      const { getByText, getByTestId, queryByTestId } = render(<RecoverySetup />);
      await waitFor(() => expect(getByText('existing@gmail.com')).toBeDefined());

      fireEvent.press(getByText('onboarding.wallet.addAccount'));
      await waitFor(() => expect(getByText('Pick Google')).toBeDefined());
      fireEvent.press(getByText('Pick Google'));
      await waitFor(() => expect(getByText('user@gmail.com')).toBeDefined());

      fireEvent.press(getByText('recovery.setup.applyButton'));
      await waitFor(() => expect(getByTestId('recovery-review-back')).toBeDefined());
      fireEvent.press(getByTestId('recovery-review-back'));

      await waitFor(() => {
        expect(getByText('recovery.setup.applyButton')).toBeDefined();
        expect(queryByTestId('recovery-review-start')).toBeNull();
      });
      expect(mockApplyRecoveryUpdate).not.toHaveBeenCalled();
    });

    it('gates on insufficient gas and opens the faucet instead of Review', async () => {
      mockGetRecoveryAccountsByChain.mockResolvedValue([existingAccount]);
      // Balance below the 0.0001 ETH buffer → gate fires.
      mockGetBalance.mockResolvedValue(0n);

      const { getByText, getByTestId, queryByTestId } = render(<RecoverySetup />);
      await waitFor(() => expect(getByText('existing@gmail.com')).toBeDefined());

      fireEvent.press(getByText('onboarding.wallet.addAccount'));
      await waitFor(() => expect(getByText('Pick Google')).toBeDefined());
      fireEvent.press(getByText('Pick Google'));
      await waitFor(() => expect(getByText('user@gmail.com')).toBeDefined());

      fireEvent.press(getByText('recovery.setup.applyButton'));

      await waitFor(() => expect(getByText('recovery.gasGate.title')).toBeDefined());
      // Did NOT advance to Review.
      expect(queryByTestId('recovery-review-start')).toBeNull();

      // Primary action opens the Base Sepolia faucet.
      fireEvent.press(getByTestId('action-sheet-primary'));
      await waitFor(() =>
        expect(mockOpenURL).toHaveBeenCalledWith('https://www.alchemy.com/faucets/base-sepolia'),
      );
    });

    it('proceeds to Review when the balance fetch fails (gate fails open)', async () => {
      mockGetRecoveryAccountsByChain.mockResolvedValue([existingAccount]);
      mockGetBalance.mockRejectedValue(new Error('rpc down'));

      const { getByText, getByTestId } = render(<RecoverySetup />);
      await waitFor(() => expect(getByText('existing@gmail.com')).toBeDefined());

      fireEvent.press(getByText('onboarding.wallet.addAccount'));
      await waitFor(() => expect(getByText('Pick Google')).toBeDefined());
      fireEvent.press(getByText('Pick Google'));
      await waitFor(() => expect(getByText('user@gmail.com')).toBeDefined());

      fireEvent.press(getByText('recovery.setup.applyButton'));

      await waitFor(() => expect(getByTestId('recovery-review-start')).toBeDefined());
    });

    it('shows the success sheet and navigates back after a successful apply', async () => {
      mockGetRecoveryAccountsByChain.mockResolvedValue([existingAccount]);

      const { getByText, getByTestId } = render(<RecoverySetup />);
      await waitFor(() => expect(getByText('existing@gmail.com')).toBeDefined());

      fireEvent.press(getByText('onboarding.wallet.addAccount'));
      await waitFor(() => expect(getByText('Pick Google')).toBeDefined());
      fireEvent.press(getByText('Pick Google'));
      await waitFor(() => expect(getByText('user@gmail.com')).toBeDefined());

      fireEvent.press(getByText('recovery.setup.applyButton'));
      await waitFor(() => expect(getByTestId('recovery-review-start')).toBeDefined());
      fireEvent.press(getByTestId('recovery-review-start'));

      await waitFor(() => expect(getByText('recovery.setup.applySuccess')).toBeDefined());
      fireEvent.press(getByTestId('action-sheet-primary'));
      expect(mockBack).toHaveBeenCalled();
    });

    it('shows a danger sheet when the apply fails', async () => {
      mockGetRecoveryAccountsByChain.mockResolvedValue([existingAccount]);
      mockApplyRecoveryUpdate.mockRejectedValue(new Error('on-chain revert'));

      const { getByText, getByTestId } = render(<RecoverySetup />);
      await waitFor(() => expect(getByText('existing@gmail.com')).toBeDefined());

      fireEvent.press(getByText('onboarding.wallet.addAccount'));
      await waitFor(() => expect(getByText('Pick Google')).toBeDefined());
      fireEvent.press(getByText('Pick Google'));
      await waitFor(() => expect(getByText('user@gmail.com')).toBeDefined());

      fireEvent.press(getByText('recovery.setup.applyButton'));
      await waitFor(() => expect(getByTestId('recovery-review-start')).toBeDefined());
      fireEvent.press(getByTestId('recovery-review-start'));

      await waitFor(() => expect(getByText('recovery.setup.applyFailed')).toBeDefined());
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('blocks apply with a warning when there are no current on-chain accounts', async () => {
      // Empty store → originalAccounts is empty; adding one creates a change, but
      // the guard must refuse since there is no current account to authenticate.
      mockGetRecoveryAccountsByChain.mockResolvedValue(null);

      const { getByText, queryByTestId } = render(<RecoverySetup />);
      await waitFor(() => expect(getByText('onboarding.wallet.addAccount')).toBeDefined());

      fireEvent.press(getByText('onboarding.wallet.addAccount'));
      await waitFor(() => expect(getByText('Pick Google')).toBeDefined());
      fireEvent.press(getByText('Pick Google'));
      await waitFor(() => expect(getByText('user@gmail.com')).toBeDefined());

      fireEvent.press(getByText('recovery.setup.applyButton'));

      await waitFor(() => expect(getByText('recovery.setup.walletNotFound')).toBeDefined());
      expect(queryByTestId('recovery-review-start')).toBeNull();
      expect(mockConfirmProvingBundleReady).not.toHaveBeenCalled();
      expect(mockApplyRecoveryUpdate).not.toHaveBeenCalled();
    });

    it('shows an in-app dialog when there are no changes to apply', async () => {
      const { getByText } = render(<RecoverySetup />);
      await waitFor(() => expect(getByText('recovery.setup.applyButton')).toBeDefined());

      fireEvent.press(getByText('recovery.setup.applyButton'));

      await waitFor(() => {
        expect(getByText('recovery.setup.noChanges')).toBeDefined();
      });
    });

    it('confirms account removal with the in-app dialog', async () => {
      mockGetRecoveryAccountsByChain.mockResolvedValue([
        existingAccount,
        {
          provider: 'google',
          identifier: 'second@gmail.com',
          sub: 'second-sub',
          iss: 'google',
          aud: 'aud2',
          isDefault: false,
        },
      ]);

      const { getByText, getByTestId, queryByText } = render(<RecoverySetup />);
      await waitFor(() => expect(getByText('second@gmail.com')).toBeDefined());

      fireEvent.press(getByText('onboarding.wallet.removeAccount'));
      await waitFor(() => expect(getByText('onboarding.wallet.removeAccountConfirm')).toBeDefined());
      fireEvent.press(getByTestId('action-sheet-primary'));

      await waitFor(() => {
        expect(queryByText('second@gmail.com')).toBeNull();
      });
    });

    it('rejects the pending login confirmation when cancel is pressed', async () => {
      mockGetRecoveryAccountsByChain.mockResolvedValue([existingAccount]);
      let confirmPromise: Promise<void> | undefined;
      mockApplyRecoveryUpdate.mockImplementation(async (params: any) => {
        confirmPromise = params.onConfirmRequired(0, existingAccount);
        await confirmPromise;
      });

      const { getByText, getByTestId } = render(<RecoverySetup />);
      await waitFor(() => expect(getByText('existing@gmail.com')).toBeDefined());

      fireEvent.press(getByText('onboarding.wallet.addAccount'));
      await waitFor(() => expect(getByText('Pick Google')).toBeDefined());
      fireEvent.press(getByText('Pick Google'));
      await waitFor(() => expect(getByText('user@gmail.com')).toBeDefined());

      fireEvent.press(getByText('recovery.setup.applyButton'));
      await waitFor(() => expect(getByTestId('recovery-review-start')).toBeDefined());
      fireEvent.press(getByTestId('recovery-review-start'));
      await waitFor(() => expect(getByText('MasterKeySigningOverlay')).toBeDefined());
      await waitFor(() => expect(confirmPromise).toBeDefined());

      await act(async () => {
        fireEvent.press(getByTestId('cancel-signing'));
        await expect(confirmPromise).rejects.toThrow('Recovery update cancelled');
      });
    });
  });
});
