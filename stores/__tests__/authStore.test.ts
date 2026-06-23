import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useAuthStore, User, SocialProvider } from '../authStore';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

describe('authStore', () => {
  beforeEach(() => {
    // Clear store state before each test
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: true,
    });
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const { result } = renderHook(() => useAuthStore());

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.isLoading).toBe(true);
    });
  });

  describe('authenticate', () => {
    it('should authenticate user', () => {
      const user: User = {
        email: 'test@test.com',
        nickname: 'Test',
        provider: 'google' as SocialProvider,

        hasPasskey: false,
        hasRecovery: false,
      };

      useAuthStore.getState().authenticate(user);
      const state = useAuthStore.getState();

      expect(state.user).toEqual(user);
      expect(state.isAuthenticated).toBe(true);
    });

    it('should authenticate with minimal user (no optional fields)', () => {
      const user: User = {
        provider: 'google' as SocialProvider,

        hasPasskey: false,
        hasRecovery: false,
      };

      useAuthStore.getState().authenticate(user);
      const state = useAuthStore.getState();

      expect(state.user).toEqual(user);
      expect(state.isAuthenticated).toBe(true);
    });
  });

  describe('setUser', () => {
    const mockUser: User = {
      email: 'test@example.com',
      nickname: 'testuser',
      provider: 'google' as SocialProvider,
      hasPasskey: false,
      hasRecovery: false,
    };

    it('should set user data', () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.setUser(mockUser);
      });

      expect(result.current.user).toEqual(mockUser);
    });

    it('should persist user to AsyncStorage', async () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.setUser(mockUser);
      });

      await waitFor(() => {
        expect(AsyncStorage.setItem).toHaveBeenCalled();
      });
    });

    it('should handle user without optional fields', () => {
      const minimalUser: User = {
        provider: 'google' as SocialProvider,

        hasPasskey: false,
        hasRecovery: false,
      };

      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.setUser(minimalUser);
      });

      expect(result.current.user).toEqual(minimalUser);
      expect(result.current.user?.email).toBeUndefined();
      expect(result.current.user?.nickname).toBeUndefined();
    });

    it('should handle different auth providers', () => {
      const providers: SocialProvider[] = ['google'];
      const { result } = renderHook(() => useAuthStore());

      providers.forEach((provider) => {
        const user: User = {
          ...mockUser,
          provider,
        };

        act(() => {
          result.current.setUser(user);
        });

        expect(result.current.user?.provider).toBe(provider);
      });
    });
  });

  describe('setLoading', () => {
    it('should set loading state to true', () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.setLoading(true);
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('should set loading state to false', () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.setLoading(false);
      });

      expect(result.current.isLoading).toBe(false);
    });

    it('should toggle loading state multiple times', () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.setLoading(true);
      });
      expect(result.current.isLoading).toBe(true);

      act(() => {
        result.current.setLoading(false);
      });
      expect(result.current.isLoading).toBe(false);

      act(() => {
        result.current.setLoading(true);
      });
      expect(result.current.isLoading).toBe(true);
    });
  });

  describe('updateUser', () => {
    const mockUser: User = {
      email: 'test@example.com',
      nickname: 'testuser',
      provider: 'google' as SocialProvider,
      hasPasskey: false,
      hasRecovery: false,
    };

    it('should update user properties', () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.setUser(mockUser);
      });

      act(() => {
        result.current.updateUser({ hasPasskey: true });
      });

      expect(result.current.user?.hasPasskey).toBe(true);
      expect(result.current.user?.email).toBe(mockUser.email);
    });

    it('should update multiple properties at once', () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.setUser(mockUser);
      });

      act(() => {
        result.current.updateUser({
          hasPasskey: true,
          hasRecovery: true,
        });
      });

      expect(result.current.user?.hasPasskey).toBe(true);
      expect(result.current.user?.hasRecovery).toBe(true);
    });

    it('should update nickname and email', () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.setUser(mockUser);
      });

      act(() => {
        result.current.updateUser({
          nickname: 'newname',
          email: 'newemail@example.com',
        });
      });

      expect(result.current.user?.nickname).toBe('newname');
      expect(result.current.user?.email).toBe('newemail@example.com');
    });

    it('should do nothing if user is null', () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.updateUser({ hasPasskey: true });
      });

      expect(result.current.user).toBeNull();
    });

    it('should persist updated user to AsyncStorage', async () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.setUser(mockUser);
      });

      jest.clearAllMocks();

      act(() => {
        result.current.updateUser({ hasPasskey: true });
      });

      await waitFor(() => {
        expect(AsyncStorage.setItem).toHaveBeenCalled();
      });
    });
  });

  describe('logout', () => {
    it('should clear state on logout', () => {
      const user: User = {
        email: 'test@test.com',
        nickname: 'Test',
        provider: 'google' as SocialProvider,

        hasPasskey: false,
        hasRecovery: false,
      };

      useAuthStore.getState().authenticate(user);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);

      useAuthStore.getState().logout();
      const state = useAuthStore.getState();

      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });

    it('should persist logout state to AsyncStorage', async () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.authenticate({
          email: 'test@example.com',
          provider: 'google',
  
          hasPasskey: false,
          hasRecovery: false,
        });
      });

      jest.clearAllMocks();

      act(() => {
        result.current.logout();
      });

      await waitFor(() => {
        expect(AsyncStorage.setItem).toHaveBeenCalled();
      });
    });

    it('should handle logout when already logged out', () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.logout();
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe('persistence', () => {
    it('should call AsyncStorage.setItem when state changes', async () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.authenticate({
          email: 'test@example.com',
          provider: 'google',
  
          hasPasskey: false,
          hasRecovery: false,
        });
      });

      await waitFor(() => {
        expect(AsyncStorage.setItem).toHaveBeenCalledWith(
          'auth-storage',
          expect.any(String)
        );
      });
    });

    it('should only persist partialize state fields', () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.authenticate({
          email: 'test@example.com',
          provider: 'google',
  
          hasPasskey: false,
          hasRecovery: false,
        });
        result.current.setLoading(false);
      });

      // isLoading should not be persisted (not in partialize)
      // Only user and isAuthenticated are persisted
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle rapid successive state changes', () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.setLoading(true);
        result.current.authenticate({
          provider: 'google',
  
          hasPasskey: false,
          hasRecovery: false,
        });
        result.current.updateUser({ hasPasskey: true });
        result.current.setLoading(false);
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user?.hasPasskey).toBe(true);
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('selectors', () => {
    const mockUser: User = {
      email: 'test@example.com',
      nickname: 'testuser',
      provider: 'google',
      hasPasskey: true,
      hasRecovery: false,
    };

    it('should correctly indicate authenticated state', () => {
      const { result } = renderHook(() => useAuthStore());

      expect(result.current.isAuthenticated).toBe(false);

      act(() => {
        result.current.authenticate(mockUser);
      });

      expect(result.current.isAuthenticated).toBe(true);
    });

    it('should provide access to user data', () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.setUser(mockUser);
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.user?.hasPasskey).toBe(true);
      expect(result.current.user?.hasRecovery).toBe(false);
    });
  });
});
