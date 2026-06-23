import { useEffect, createContext, useContext, ReactNode, useState } from 'react';
import { useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { hasStoredPasskey } from '@/libs/passkey/passkeyStore';
import { hasRecoveryAccounts } from '@/libs/recovery/recoveryAccountStore';


interface AuthContextValue {
  isReady: boolean;
}

const AuthContext = createContext<AuthContextValue>({ isReady: false });

export const useAuthContext = () => useContext(AuthContext);

interface AuthProviderProps {
  children: ReactNode;
}

/** Where an authenticated user should land based on their onboarding flow. */
function postAuthRoute(user: { authFlow?: 'walletRecovery' | 'walletCreation' }): string {
  if (user.authFlow === 'walletRecovery') return '/sign-up/passkey/reset';
  if (user.authFlow === 'walletCreation') return '/sign-up/create';
  return '/home';
}

export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const { isAuthenticated, isLoading, user, setLoading, updateUser } = useAuthStore();
  const [isHydrated, setIsHydrated] = useState(false);

  // Wait for Zustand persistence hydration to complete before reading auth state.
  useEffect(() => {
    const unsubscribe = useAuthStore.persist.onFinishHydration(() => {
      setIsHydrated(true);
    });

    // Already hydrated (e.g. fast re-render after first mount)
    if (useAuthStore.persist.hasHydrated()) {
      setIsHydrated(true);
    }

    return () => {
      unsubscribe();
    };
  }, []);

  // Initialize auth state on mount (runs after hydration).
  useEffect(() => {
    if (!isHydrated) return;

    const initializeAuth = async () => {
      setLoading(true);
      try {
        const { user } = useAuthStore.getState();

        if (user) {
          // Client-side state reconciliation — no server calls.
          // Correct hasPasskey/hasRecovery against actual SecureStore contents.
          const [passkeyExists, recoveryExists] = await Promise.all([
            hasStoredPasskey(),
            hasRecoveryAccounts(),
          ]);

          // Reconcile if store state diverged from SecureStore reality.
          if (user.hasPasskey !== passkeyExists || user.hasRecovery !== recoveryExists) {
            updateUser({
              hasPasskey: passkeyExists,
              hasRecovery: recoveryExists,
            });
          }

          console.log('Auth initialized from local storage:', {
            hasPasskey: passkeyExists,
            hasRecovery: recoveryExists,
          });
        }
      } catch (error) {
        console.error('Auth initialization failed:', error);
        // Do not sign out on local validation failure — preserve existing state.
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, [isHydrated, setLoading, updateUser]);

  // Handle navigation based on auth state
  useEffect(() => {
    // Wait for navigation, auth, and hydration to be ready
    if (!navigationState?.key || isLoading || !isHydrated) return;

    const inProtectedGroup =
      segments[0] === 'wallet' || segments[0] === 'home';
    const isRootRoute = !segments[0] || segments[0] === 'index' || segments[0] === '(index)';

    if (!isAuthenticated && inProtectedGroup) {
      router.replace('/sign-in');
    } else if (isAuthenticated && segments[0] === 'sign-in') {
      if (user) {
        router.replace(postAuthRoute(user));
      }
    } else if (isRootRoute) {
      if (!isAuthenticated) {
        router.replace('/sign-in');
      } else if (user) {
        router.replace(postAuthRoute(user));
      }
    }
  }, [isAuthenticated, isLoading, isHydrated, segments, navigationState?.key, user, router]);

  const isReady = !isLoading && !!navigationState?.key && isHydrated;

  return (
    <AuthContext.Provider value={{ isReady }}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthProvider;
