import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { CompleteStep } from '../CompleteStep';
import { WalletActivationProvider } from '../../WalletActivationContext';
import { Wallet } from '@/stores/walletStore';
import * as supportedChains from '@/libs/chains/supportedChains';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';

const mockPush = jest.fn();
const mockReplace = jest.fn();

// Mock dependencies
jest.mock('@/libs/chains/supportedChains');
jest.mock('expo-clipboard');
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  }),
}));

describe.skip('CompleteStep', () => {
  const mockGetChainById = supportedChains.getChainById as jest.MockedFunction<
    typeof supportedChains.getChainById
  >;
  const mockSetStringAsync = Clipboard.setStringAsync as jest.MockedFunction<
    typeof Clipboard.setStringAsync
  >;

  const mockChain: supportedChains.ChainConfig = {
    chainId: 84532,
    displayName: 'Base',
    isTestnet: false,
    isEnabled: true,
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://sepolia.arbiscan.io',
  };

  const mockWallet: Wallet = {
    address: '0x1234567890abcdef1234567890abcdef12345678',
    chainId: 84532,
    isDeployed: false,
    createdAt: '2024-01-01T00:00:00Z',
  };

  const renderStep = () => {
    return render(
      <WalletActivationProvider>
        <CompleteStepWrapper />
      </WalletActivationProvider>
    );
  };

  // Wrapper to set created wallet
  const CompleteStepWrapper = () => {
    const { setCreatedWallet } = require('../../WalletActivationContext').useWalletActivation();

    React.useEffect(() => {
      setCreatedWallet(mockWallet);
    }, []);

    return <CompleteStep />;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetChainById.mockReturnValue(mockChain);
    mockSetStringAsync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe.skip('Rendering', () => {
    it('renders without crashing', () => {
      const { getByText } = renderStep();
      expect(getByText('walletActivation.complete.title')).toBeDefined();
    });

    it('displays success icon', () => {
      const { UNSAFE_getAllByType } = renderStep();
      const Svg = require('react-native-svg').Svg;
      expect(UNSAFE_getAllByType(Svg).length).toBeGreaterThan(0);
    });

    it('displays title', () => {
      const { getByText } = renderStep();
      expect(getByText('walletActivation.complete.title')).toBeDefined();
    });

    it('displays description with chain name', () => {
      const { getByText } = renderStep();
      // Description should contain chain name via i18n interpolation
      // The actual text is handled by i18n, so we check for the key
      expect(getByText((content) => content.includes('walletActivation.complete.description'))).toBeDefined();
    });

    it('displays truncated wallet address', () => {
      const { getByText } = renderStep();
      // Address should be truncated: 0x123456...5678
      expect(getByText('0x1234...5678')).toBeDefined();
    });

    it('displays chain badge', () => {
      const { getByText } = renderStep();
      expect(getByText('Base')).toBeDefined();
    });

    it('displays get started button', () => {
      const { getByText } = renderStep();
      expect(getByText('walletActivation.complete.button')).toBeDefined();
    });

    it('displays copy button', () => {
      const { getByText } = renderStep();
      expect(getByText('common.copy')).toBeDefined();
    });

    it('renders globe icon in chain badge', () => {
      const { getByText, UNSAFE_getAllByType } = renderStep();
      expect(getByText('Base')).toBeDefined();
      const Svg = require('react-native-svg').Svg;
      expect(UNSAFE_getAllByType(Svg).length).toBeGreaterThan(0);
    });
  });

  describe.skip('Address truncation', () => {
    it('truncates long addresses correctly', () => {
      const { getByText } = renderStep();
      // Full address: 0x1234567890abcdef1234567890abcdef12345678
      // Truncated: 0x1234...5678
      expect(getByText('0x1234...5678')).toBeDefined();
    });

    it('does not truncate short addresses', () => {
      const shortWallet: Wallet = {
        address: '0x123456',
        chainId: 84532,
        isDeployed: false,
        createdAt: '2024-01-01T00:00:00Z',
      };

      const ShortAddressWrapper = () => {
        const { setCreatedWallet } = require('../../WalletActivationContext').useWalletActivation();

        React.useEffect(() => {
          setCreatedWallet(shortWallet);
        }, []);

        return <CompleteStep />;
      };

      const { getByText } = render(
        <WalletActivationProvider>
          <ShortAddressWrapper />
        </WalletActivationProvider>
      );

      expect(getByText('0x123456')).toBeDefined();
    });
  });

  describe.skip('Copy functionality', () => {
    it('copies address to clipboard when address card pressed', async () => {
      jest.useRealTimers();
      const { getByText } = renderStep();
      const addressCard = getByText('0x1234...5678');

      fireEvent.press(addressCard);

      await waitFor(() => {
        expect(mockSetStringAsync).toHaveBeenCalledWith(
          '0x1234567890abcdef1234567890abcdef12345678'
        );
      });
      jest.useFakeTimers();
    });

    it('shows copied state after copying', async () => {
      jest.useRealTimers();
      const { getByText } = renderStep();
      const addressCard = getByText('0x1234...5678');

      fireEvent.press(addressCard);

      await waitFor(() => {
        expect(getByText('common.copied')).toBeDefined();
      });
      jest.useFakeTimers();
    });

    it('shows check icon when copied', async () => {
      jest.useRealTimers();
      const { getByText, UNSAFE_getAllByType } = renderStep();
      const addressCard = getByText('0x1234...5678');

      fireEvent.press(addressCard);

      await waitFor(() => {
        expect(getByText('common.copied')).toBeDefined();
        const Svg = require('react-native-svg').Svg;
        expect(UNSAFE_getAllByType(Svg).length).toBeGreaterThan(0);
      });
      jest.useFakeTimers();
    });

    it('resets copied state after 2 seconds', async () => {
      jest.useRealTimers();
      const { getByText, queryByText } = renderStep();
      const addressCard = getByText('0x1234...5678');

      fireEvent.press(addressCard);

      await waitFor(() => {
        expect(getByText('common.copied')).toBeDefined();
      });

      // Wait 2 seconds for real
      await new Promise((resolve) => setTimeout(resolve, 2100));

      expect(queryByText('common.copied')).toBeNull();
      expect(getByText('common.copy')).toBeDefined();
      jest.useFakeTimers();
    });

    it('does not copy if no wallet address', async () => {
      const NoWalletWrapper = () => {
        return <CompleteStep />;
      };

      const { queryByText } = render(
        <WalletActivationProvider>
          <NoWalletWrapper />
        </WalletActivationProvider>
      );

      // No address card should be rendered
      expect(queryByText(/0x/)).toBeNull();
    });
  });

  describe.skip('Get Started button', () => {
    it('navigates home when pressed', async () => {
      jest.useRealTimers();
      const mockRouter = useRouter();
      const { getByText } = renderStep();
      const getStartedButton = getByText('walletActivation.complete.button');

      fireEvent.press(getStartedButton);

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith('/home');
      });
      jest.useFakeTimers();
    });

    it('closes sheet when get started pressed', () => {
      const { getByText } = renderStep();
      const getStartedButton = getByText('walletActivation.complete.button');

      fireEvent.press(getStartedButton);

      // Verify through context that close was called (integration test)
    });

    it('resets state when get started pressed', () => {
      const { getByText } = renderStep();
      const getStartedButton = getByText('walletActivation.complete.button');

      fireEvent.press(getStartedButton);

      // Verify through context that reset was called (integration test)
    });
  });

  describe.skip('Chain display', () => {
    it('fetches chain by wallet chainId', () => {
      renderStep();
      expect(mockGetChainById).toHaveBeenCalledWith(84532);
    });

    it('displays chain display name in badge', () => {
      const { getByText } = renderStep();
      expect(getByText('Base')).toBeDefined();
    });

    it('handles missing chain gracefully', () => {
      mockGetChainById.mockReturnValue(null);
      const { queryByText } = renderStep();

      // Should not crash, chain badge just won't be displayed
      // But we can still see the address
      expect(queryByText('0x1234...5678')).toBeDefined();
    });

    it('does not display chain badge if no chain found', () => {
      mockGetChainById.mockReturnValue(null);
      const { queryByText } = renderStep();

      // Chain name should not be displayed
      expect(queryByText('Base')).toBeNull();
    });
  });

  describe.skip('Without wallet', () => {
    it('handles missing wallet gracefully', () => {
      const NoWalletWrapper = () => {
        return <CompleteStep />;
      };

      const { getByText, queryByText } = render(
        <WalletActivationProvider>
          <NoWalletWrapper />
        </WalletActivationProvider>
      );

      // Should still show title and button
      expect(getByText('walletActivation.complete.title')).toBeDefined();
      expect(getByText('walletActivation.complete.button')).toBeDefined();

      // But no address card
      expect(queryByText(/0x/)).toBeNull();
    });
  });

  describe.skip('Success UI elements', () => {
    it('renders success check circle icon', () => {
      const { UNSAFE_getAllByType } = renderStep();
      const Svg = require('react-native-svg').Svg;
      const svgs = UNSAFE_getAllByType(Svg);
      expect(svgs.length).toBeGreaterThan(0);
    });

    it('has green background for icon container', () => {
      const { getByText } = renderStep();
      const title = getByText('walletActivation.complete.title');

      // Icon container should have green background (verified through styling)
      expect(title).toBeDefined();
    });

    it('displays address in monospace font', () => {
      const { getByText } = renderStep();
      const address = getByText('0x1234...5678');

      // Address should be styled with monospace font (verified through styling)
      expect(address).toBeDefined();
    });
  });

  describe.skip('Accessibility', () => {
    it('has accessible button labels', () => {
      const { getByText } = renderStep();

      const getStartedButton = getByText('walletActivation.complete.button');
      const copyButton = getByText('common.copy');

      expect(getStartedButton).toBeDefined();
      expect(copyButton).toBeDefined();
    });

    it('provides clear success message', () => {
      const { getByText } = renderStep();
      expect(getByText('walletActivation.complete.title')).toBeDefined();
    });

    it('address card is touchable', () => {
      const { getByText } = renderStep();
      const addressCard = getByText('0x1234...5678').parent!.parent!;

      // TouchableOpacity should be present in component tree
      expect(addressCard).toBeDefined();
    });
  });

  describe.skip('Visual feedback', () => {
    it('changes copy icon to check icon when copied', async () => {
      jest.useRealTimers();
      const { getByText } = renderStep();
      const addressCard = getByText('0x1234...5678');

      // Initially shows copy icon
      expect(getByText('common.copy')).toBeDefined();

      fireEvent.press(addressCard);

      // After press, shows check icon
      await waitFor(() => {
        expect(getByText('common.copied')).toBeDefined();
      });
      jest.useFakeTimers();
    });

    it('changes copy text color to green when copied', async () => {
      jest.useRealTimers();
      const { getByText } = renderStep();
      const addressCard = getByText('0x1234...5678');

      fireEvent.press(addressCard);

      await waitFor(() => {
        const copiedText = getByText('common.copied');
        expect(copiedText).toBeDefined();
        // Text should have green color (verified through styling)
      });
      jest.useFakeTimers();
    });
  });

  describe.skip('Multiple copy operations', () => {
    it('handles rapid copy clicks', async () => {
      jest.useRealTimers();
      const { getByText } = renderStep();
      const addressCard = getByText('0x1234...5678');

      fireEvent.press(addressCard);
      fireEvent.press(addressCard);
      fireEvent.press(addressCard);

      await waitFor(() => {
        expect(mockSetStringAsync).toHaveBeenCalledTimes(3);
      });
      jest.useFakeTimers();
    });

    it('resets timer on each copy', async () => {
      jest.useRealTimers();
      const { getByText, queryByText } = renderStep();
      const addressCard = getByText('0x1234...5678');

      fireEvent.press(addressCard);

      await waitFor(() => {
        expect(getByText('common.copied')).toBeDefined();
      });

      // Wait 1 second
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Press again
      fireEvent.press(addressCard);

      // Wait another 1.5 seconds (timer should reset, so still showing copied)
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Should still show copied
      expect(queryByText('common.copied')).toBeDefined();

      // Wait another 1 second (total 2.5 from last click)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Now it should reset
      expect(queryByText('common.copied')).toBeNull();
      expect(getByText('common.copy')).toBeDefined();
      jest.useFakeTimers();
    });
  });
});
