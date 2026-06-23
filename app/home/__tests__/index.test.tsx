import { fireEvent, render, waitFor } from '@testing-library/react-native';
import Home from '../index';
import { clearPasskey } from '@/libs/passkey/passkeyStore';

let mockWalletState: any;
const mockOpenActivation = jest.fn();
const mockGetBalance = jest.fn(() => Promise.resolve(0n));
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockLogout = jest.fn();
const mockUpdateUser = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

jest.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: jest.fn(() => ({
      getBalance: mockGetBalance,
    })),
    formatEther: jest.fn(() => '0.0000'),
  },
}));

jest.mock('@/stores/authStore', () => ({
  useAuthStore: jest.fn(() => ({
    logout: mockLogout,
    updateUser: mockUpdateUser,
  })),
}));

jest.mock('@/stores/walletStore', () => {
  const useWalletStore = jest.fn((selector) => selector(mockWalletState)) as jest.Mock & {
    getState: jest.Mock;
  };
  useWalletStore.getState = jest.fn(() => mockWalletState);

  return {
    WalletStatus: {
      NOT_CREATED: 'NOT_CREATED',
      DERIVED: 'DERIVED',
      DEPLOYED: 'DEPLOYED',
    },
    useWalletStore,
  };
});

jest.mock('@/libs/passkey/passkeyStore', () => ({
  clearPasskey: jest.fn(),
}));

const mockClearPasskey = clearPasskey as jest.MockedFunction<typeof clearPasskey>;

jest.mock('@/components/WalletActivation', () => ({
  WalletActivationStep: {
    FUNDING: 0,
    CREATING: 1,
    COMPLETE: 2,
  },
  useWalletActivation: () => ({
    open: mockOpenActivation,
  }),
}));

describe('Home', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWalletState = {
      wallets: [
        {
          address: '0x1234567890abcdef1234567890abcdef12345678',
          chainId: 84532,
          status: 'DERIVED',
          createdAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    };
  });

  it('auto-opens wallet activation for a derived wallet on home arrival', async () => {
    render(<Home />);

    await waitFor(() => {
      expect(mockOpenActivation).toHaveBeenCalledWith(0, 84532);
    });
  });

  it('does not auto-open wallet activation for a deployed wallet', async () => {
    mockWalletState.wallets[0].status = 'DEPLOYED';

    render(<Home />);

    await waitFor(() => {
      expect(mockGetBalance).toHaveBeenCalled();
    });
    expect(mockOpenActivation).not.toHaveBeenCalled();
  });

  it('does not repeatedly auto-open for the same wallet in one home session', async () => {
    const { rerender } = render(<Home />);

    await waitFor(() => {
      expect(mockOpenActivation).toHaveBeenCalledTimes(1);
    });

    rerender(<Home />);

    expect(mockOpenActivation).toHaveBeenCalledTimes(1);
  });

  it('debug passkey reset clears the local passkey in-session (no logout/redirect)', async () => {
    mockWalletState.wallets[0].status = 'DEPLOYED';
    mockClearPasskey.mockResolvedValue(undefined);

    const { getByText, getByTestId } = render(<Home />);

    fireEvent.press(getByText('home.debug.resetPasskeyOnly'));

    expect(getByText('home.debug.resetPasskeyTitle')).toBeTruthy();
    expect(getByText('home.debug.resetPasskeyMessage')).toBeTruthy();

    fireEvent.press(getByTestId('home-reset-passkey-primary'));

    await waitFor(() => {
      expect(mockClearPasskey).toHaveBeenCalledTimes(1);
      expect(mockUpdateUser).toHaveBeenCalledWith({ hasPasskey: false });
    });
    // ④ is an in-session action — it neither logs out nor redirects to sign-in.
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalledWith('/sign-in');
  });
});
