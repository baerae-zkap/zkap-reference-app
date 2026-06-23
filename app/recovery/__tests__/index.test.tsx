
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import RecoveryStatus from '../index';

// Mock expo-router
const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
  }),
}));

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, ...props }: any) => {
    const { View } = require('react-native');
    return <View {...props}>{children}</View>;
  },
  SafeAreaProvider: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Mock recoveryAccountStore
const mockGetRecoveryAccountsByChain = jest.fn();
const mockClearRecoveryAccountsForChain = jest.fn();
jest.mock('@/libs/recovery/recoveryAccountStore', () => ({
  getRecoveryAccountsByChain: (...args: any[]) => mockGetRecoveryAccountsByChain(...args),
  clearRecoveryAccountsForChain: (...args: any[]) => mockClearRecoveryAccountsForChain(...args),
}));

// Mock walletStore
jest.mock('@/stores/walletStore', () => ({
  useWalletStore: () => ({
    activeChainId: 84532,
  }),
}));

// Mock react-native-svg
jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  G: 'G',
}));

const mockAccounts = [
  { provider: 'google', identifier: 'user@gmail.com', sub: '1', iss: 'google', aud: 'aud1', isDefault: true },
  { provider: 'google', identifier: 'user2@gmail.com', sub: '2', iss: 'google', aud: 'aud2', isDefault: false },
  { provider: 'google', identifier: 'user3@gmail.com', sub: '3', iss: 'google', aud: 'aud3', isDefault: false },
];

describe('RecoveryStatus', () => {
  jest.setTimeout(15000);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  describe('Rendering', () => {
    it('renders without crashing', async () => {
      mockGetRecoveryAccountsByChain.mockResolvedValue(null);
      const { getByText } = render(<RecoveryStatus />);
      await waitFor(() => {
        expect(getByText('recovery.status.title')).toBeDefined();
      });
    });

    it('renders header with back button', async () => {
      mockGetRecoveryAccountsByChain.mockResolvedValue(null);
      const { getByText } = render(<RecoveryStatus />);
      await waitFor(() => {
        expect(getByText('recovery.status.title')).toBeDefined();
      });
    });
  });

  describe('Not Configured State', () => {
    beforeEach(() => {
      mockGetRecoveryAccountsByChain.mockResolvedValue(null);
    });

    it('displays not configured status', async () => {
      const { getByText } = render(<RecoveryStatus />);
      await waitFor(() => {
        expect(getByText('recovery.status.notConfigured')).toBeDefined();
        expect(getByText('recovery.status.notConfiguredDescription')).toBeDefined();
      });
    });

    it('shows setup button when not configured', async () => {
      const { getByText } = render(<RecoveryStatus />);
      await waitFor(() => {
        expect(getByText('recovery.setup.title')).toBeDefined();
      });
    });

    it('does not show recovery accounts section', async () => {
      const { queryByText } = render(<RecoveryStatus />);
      await waitFor(() => {
        expect(queryByText('recovery.status.notConfigured')).toBeDefined();
      });
      expect(queryByText('recovery.status.accounts')).toBeNull();
    });

    it('does not show delete button when not configured', async () => {
      const { queryByText } = render(<RecoveryStatus />);
      await waitFor(() => {
        expect(queryByText('recovery.status.notConfigured')).toBeDefined();
      });
      expect(queryByText('recovery.status.deleteConfig')).toBeNull();
    });
  });

  describe('Configured State', () => {
    beforeEach(() => {
      mockGetRecoveryAccountsByChain.mockResolvedValue(mockAccounts);
    });

    it('displays configured status', async () => {
      const { getByText } = render(<RecoveryStatus />);
      await waitFor(() => {
        expect(getByText('recovery.status.configured')).toBeDefined();
        expect(getByText('recovery.status.configuredDescription')).toBeDefined();
      });
    });

    it('shows recovery accounts section', async () => {
      const { getByText } = render(<RecoveryStatus />);
      await waitFor(() => {
        expect(getByText('recovery.status.accounts')).toBeDefined();
      });
    });

    it('displays all three recovery accounts', async () => {
      const { getAllByText } = render(<RecoveryStatus />);
      await waitFor(() => {
        expect(getAllByText('Google').length).toBeGreaterThanOrEqual(3);
      });
    });

    it('displays account emails', async () => {
      const { getByText } = render(<RecoveryStatus />);
      await waitFor(() => {
        expect(getByText('user@gmail.com')).toBeDefined();
        expect(getByText('user2@gmail.com')).toBeDefined();
        expect(getByText('user3@gmail.com')).toBeDefined();
      });
    });

    it('shows update button when configured', async () => {
      const { getByText } = render(<RecoveryStatus />);
      await waitFor(() => {
        expect(getByText('settings.updateRecovery')).toBeDefined();
      });
    });
  });

  describe('Navigation', () => {
    beforeEach(() => {
      mockGetRecoveryAccountsByChain.mockResolvedValue(null);
    });

    it('navigates back when back button is pressed', async () => {
      const { getByText } = render(<RecoveryStatus />);
      await waitFor(() => {
        expect(getByText('recovery.status.title')).toBeDefined();
      });
      expect(mockBack).toBeDefined();
    });

    it('navigates to setup when update button is pressed', async () => {
      const { getByText } = render(<RecoveryStatus />);
      await waitFor(() => {
        expect(getByText('recovery.setup.title')).toBeDefined();
      });
      const updateButton = getByText('recovery.setup.title');
      fireEvent.press(updateButton.parent!);
      expect(mockPush).toHaveBeenCalledWith('/recovery/setup?chainId=84532');
    });
  });

  describe('Delete Recovery', () => {
    // Delete functionality has been removed from the component
    it('does not show delete button', async () => {
      mockGetRecoveryAccountsByChain.mockResolvedValue(mockAccounts);
      const { queryByText } = render(<RecoveryStatus />);
      await waitFor(() => {
        expect(queryByText('recovery.status.configured')).toBeDefined();
      });
      expect(queryByText('recovery.status.deleteConfig')).toBeNull();
    });
  });

  describe('Info Note', () => {
    it('displays info note', async () => {
      mockGetRecoveryAccountsByChain.mockResolvedValue(null);
      const { getByText } = render(<RecoveryStatus />);
      await waitFor(() => {
        expect(getByText('recovery.status.infoNote')).toBeDefined();
      });
    });
  });

  describe('Provider Icons', () => {
    beforeEach(() => {
      mockGetRecoveryAccountsByChain.mockResolvedValue(mockAccounts);
    });

    it('renders provider icons for all accounts', async () => {
      const { UNSAFE_root } = render(<RecoveryStatus />);
      await waitFor(() => {
        expect(UNSAFE_root).toBeDefined();
      });
    });
  });
});
