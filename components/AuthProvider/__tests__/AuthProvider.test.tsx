// All mocks MUST be at the very top, before any imports
// Unmock AuthProvider since it's globally mocked in jest.setup.js
jest.unmock('@/components/AuthProvider/AuthProvider');

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    replace: jest.fn(),
  })),
  useSegments: jest.fn(() => []),
  useRootNavigationState: jest.fn(() => ({ key: 'root-key' })),
}));

jest.mock('@/stores/authStore', () => {
  const mockOnFinishHydration = jest.fn((callback) => {
    callback();
    return jest.fn();
  });
  const mockHasHydrated = jest.fn(() => true);
  const mockGetState = jest.fn();

  const mockStore = jest.fn();
  mockStore.persist = {
    onFinishHydration: mockOnFinishHydration,
    hasHydrated: mockHasHydrated,
  };
  mockStore.getState = mockGetState;

  return {
    useAuthStore: mockStore,
  };
});

jest.mock('@/stores/walletStore', () => ({
  useHasWallet: jest.fn(() => false),
  useWalletStore: jest.fn((selector) => selector({ wallets: [] })),
  WalletStatus: { NOT_CREATED: 'NOT_CREATED', DERIVED: 'DERIVED', DEPLOYED: 'DEPLOYED' },
}));

jest.mock('@/libs/passkey/passkeyStore', () => ({
  hasStoredPasskey: jest.fn(),
}));

jest.mock('@/libs/recovery/recoveryAccountStore', () => ({
  hasRecoveryAccounts: jest.fn(),
}));

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useHasWallet } from '@/stores/walletStore';
import { hasStoredPasskey } from '@/libs/passkey/passkeyStore';
import { hasRecoveryAccounts } from '@/libs/recovery/recoveryAccountStore';
import { AuthProvider, useAuthContext } from '../AuthProvider';

// Test component to access auth context
const TestComponent = () => {
  const { isReady } = useAuthContext();
  return <Text testID="is-ready">{isReady ? 'ready' : 'not-ready'}</Text>;
};

describe('AuthProvider', () => {
  const mockRouter = {
    replace: jest.fn(),
  };

  const mockAuthStore = {
    isAuthenticated: false,
    isLoading: false,
    user: null,
    setLoading: jest.fn(),
    updateUser: jest.fn(),
  };

  beforeEach(() => {
    // Clear only the mocks we need to reset, not all mocks
    mockRouter.replace.mockClear();
    mockAuthStore.setLoading.mockClear();
    mockAuthStore.updateUser.mockClear();

    // Get the mocked useAuthStore
    const mockUseAuthStore = useAuthStore as jest.Mock;
    const mockOnFinishHydration = mockUseAuthStore.persist.onFinishHydration as jest.Mock;
    const mockHasHydrated = mockUseAuthStore.persist.hasHydrated as jest.Mock;

    // Reset the persist mocks
    mockOnFinishHydration.mockClear();
    mockOnFinishHydration.mockImplementation((callback) => {
      callback();
      return jest.fn();
    });
    mockHasHydrated.mockReturnValue(true);

    // Reset walletStore mock
    (useHasWallet as jest.Mock).mockReturnValue(false);

    // Setup router mocks
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useSegments as jest.Mock).mockReturnValue([]);
    (useRootNavigationState as jest.Mock).mockReturnValue({ key: 'root-key' });

    // Setup store mock
    (useAuthStore as jest.Mock).mockReturnValue(mockAuthStore);
    (useAuthStore as jest.Mock).getState.mockReturnValue(mockAuthStore);

    // Setup storage mocks
    (hasStoredPasskey as jest.Mock).mockResolvedValue(false);
    (hasRecoveryAccounts as jest.Mock).mockResolvedValue(false);
  });

  describe('Basic Rendering', () => {
    it('renders children', () => {
      render(
        <AuthProvider>
          <Text>Test Child</Text>
        </AuthProvider>
      );
      expect(screen.getByText('Test Child')).toBeTruthy();
    });

    it('provides auth context to children', () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
      expect(screen.getByTestId('is-ready')).toBeTruthy();
    });
  });

  describe('Context Hook', () => {
    it('useAuthContext returns correct values when ready', async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('ready')).toBeTruthy();
      });
    });

    it('useAuthContext returns not ready when loading', () => {
      (useAuthStore as jest.Mock).mockReturnValue({
        ...mockAuthStore,
        isLoading: true,
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      expect(screen.getByText('not-ready')).toBeTruthy();
    });

    it('useAuthContext returns not ready when navigation state is missing', () => {
      (useRootNavigationState as jest.Mock).mockReturnValue(null);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      expect(screen.getByText('not-ready')).toBeTruthy();
    });
  });

  describe('Initialization', () => {
    it('becomes ready after initialization completes', async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('ready')).toBeTruthy();
      });
    });

    it('calls setLoading during initialization', async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(mockAuthStore.setLoading).toHaveBeenCalledWith(true);
        expect(mockAuthStore.setLoading).toHaveBeenCalledWith(false);
      });
    });

    it('checks passkey and recovery accounts during initialization', async () => {
      const storeWithAuth = {
        ...mockAuthStore,
        isAuthenticated: true,
        user: { hasPasskey: false, hasRecovery: false },


      };
      (useAuthStore as jest.Mock).mockReturnValue(storeWithAuth);
      (useAuthStore as jest.Mock).getState.mockReturnValue(storeWithAuth);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(hasStoredPasskey).toHaveBeenCalled();
        expect(hasRecoveryAccounts).toHaveBeenCalled();
      });
    });

    it('updates user if passkey or recovery state differs', async () => {
      const storeWithAuth = {
        ...mockAuthStore,
        isAuthenticated: true,
        user: { hasPasskey: false, hasRecovery: false },


      };
      (useAuthStore as jest.Mock).mockReturnValue(storeWithAuth);
      (useAuthStore as jest.Mock).getState.mockReturnValue(storeWithAuth);
      (hasStoredPasskey as jest.Mock).mockResolvedValue(true);
      (hasRecoveryAccounts as jest.Mock).mockResolvedValue(true);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(mockAuthStore.updateUser).toHaveBeenCalledWith({
          hasPasskey: true,
          hasRecovery: true,
        });
      });
    });

    it('does not update user if passkey and recovery state match', async () => {
      (useHasWallet as jest.Mock).mockReturnValue(true);
      const storeWithAuth = {
        ...mockAuthStore,
        isAuthenticated: true,
        user: { hasPasskey: true, hasRecovery: true },


      };
      (useAuthStore as jest.Mock).mockReturnValue(storeWithAuth);
      (useAuthStore as jest.Mock).getState.mockReturnValue(storeWithAuth);
      (hasStoredPasskey as jest.Mock).mockResolvedValue(true);
      (hasRecoveryAccounts as jest.Mock).mockResolvedValue(true);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(mockAuthStore.setLoading).toHaveBeenCalledWith(false);
      });

      expect(mockAuthStore.updateUser).not.toHaveBeenCalled();
    });
  });

  describe('Navigation - Unauthenticated Users', () => {
    it('redirects unauthenticated users from protected routes to sign-in', async () => {
      (useSegments as jest.Mock).mockReturnValue(['home']);
      (useAuthStore as jest.Mock).mockReturnValue({
        ...mockAuthStore,
        isAuthenticated: false,
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith('/sign-in');
      });
    });

    it('redirects from wallet route when not authenticated', async () => {
      (useSegments as jest.Mock).mockReturnValue(['wallet']);
      (useAuthStore as jest.Mock).mockReturnValue({
        ...mockAuthStore,
        isAuthenticated: false,
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith('/sign-in');
      });
    });

    it('does not redirect unauthenticated users on auth routes', async () => {
      (useSegments as jest.Mock).mockReturnValue(['sign-in']);
      (useAuthStore as jest.Mock).mockReturnValue({
        ...mockAuthStore,
        isAuthenticated: false,
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('ready')).toBeTruthy();
      });

      expect(mockRouter.replace).not.toHaveBeenCalled();
    });
  });

  describe('Navigation - Authenticated Users', () => {
    it('routes authenticated user without passkey straight to home (activation deferred to dashboard)', async () => {
      (useSegments as jest.Mock).mockReturnValue(['sign-in']);
      (useAuthStore as jest.Mock).mockReturnValue({
        ...mockAuthStore,
        isAuthenticated: true,
        user: { hasPasskey: false, hasRecovery: false },
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith('/home');
      });
    });

    it('routes wallet recovery auth flow from sign-in to passkey reset', async () => {
      (useSegments as jest.Mock).mockReturnValue(['sign-in']);
      (useAuthStore as jest.Mock).mockReturnValue({
        ...mockAuthStore,
        isAuthenticated: true,
        user: { hasPasskey: false, hasRecovery: false, authFlow: 'walletRecovery' },
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith('/sign-up/passkey/reset');
      });
    });

    it('routes authenticated user without wallet straight to home (activation deferred to dashboard)', async () => {
      (useSegments as jest.Mock).mockReturnValue(['sign-in']);
      (useAuthStore as jest.Mock).mockReturnValue({
        ...mockAuthStore,
        isAuthenticated: true,
        user: { hasPasskey: true, hasRecovery: true },
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith('/home');
      });
    });

    it('redirects fully setup authenticated user to home', async () => {
      (useSegments as jest.Mock).mockReturnValue(['sign-in']);
      (useHasWallet as jest.Mock).mockReturnValue(true);
      (useAuthStore as jest.Mock).mockReturnValue({
        ...mockAuthStore,
        isAuthenticated: true,
        user: { hasPasskey: true, hasRecovery: true },
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith('/home');
      });
    });

    it('does not redirect authenticated user on protected routes', async () => {
      (useSegments as jest.Mock).mockReturnValue(['home']);
      (useHasWallet as jest.Mock).mockReturnValue(true);
      (useAuthStore as jest.Mock).mockReturnValue({
        ...mockAuthStore,
        isAuthenticated: true,
        user: { hasPasskey: true, hasRecovery: true },
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('ready')).toBeTruthy();
      });

      expect(mockRouter.replace).not.toHaveBeenCalled();
    });
  });

  describe('Hydration', () => {
    it('waits for hydration before initialization', async () => {
      const mockUseAuthStore = useAuthStore as jest.Mock;
      const mockHasHydrated = mockUseAuthStore.persist.hasHydrated as jest.Mock;
      const mockOnFinishHydration = mockUseAuthStore.persist.onFinishHydration as jest.Mock;

      mockHasHydrated.mockReturnValue(false);
      mockOnFinishHydration.mockImplementation((callback) => {
        // Don't call callback immediately to simulate waiting
        return jest.fn();
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      expect(mockAuthStore.setLoading).not.toHaveBeenCalled();
      expect(mockOnFinishHydration).toHaveBeenCalled();
    });

    it('proceeds with initialization if already hydrated', async () => {
      const mockUseAuthStore = useAuthStore as jest.Mock;
      const mockHasHydrated = mockUseAuthStore.persist.hasHydrated as jest.Mock;

      mockHasHydrated.mockReturnValue(true);

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(mockAuthStore.setLoading).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('handles initialization errors gracefully', async () => {
      (useHasWallet as jest.Mock).mockReturnValue(true);
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      const storeWithAuth = {
        ...mockAuthStore,
        isAuthenticated: true,
        user: { hasPasskey: true, hasRecovery: true },


      };
      (useAuthStore as jest.Mock).mockReturnValue(storeWithAuth);
      (useAuthStore as jest.Mock).getState.mockReturnValue(storeWithAuth);
      (hasStoredPasskey as jest.Mock).mockRejectedValue(new Error('Storage error'));

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          'Auth initialization failed:',
          expect.any(Error)
        );
        expect(mockAuthStore.setLoading).toHaveBeenCalledWith(false);
      });

      consoleError.mockRestore();
    });
  });
});
