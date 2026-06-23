import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/components/AuthProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { WalletActivationProvider, WalletActivationSheet } from '@/components/WalletActivation';
import { initProviderConfig } from '@/libs/wallet/providerConfigHelper';
import '@/i18n';

// Polyfill Buffer for SDK compatibility
import { Buffer } from 'buffer';
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

// Kick off provider config init (marks config as initialized for wallet creation flows).
// Fire-and-forget: resolves before user reaches wallet creation in normal flows.
void initProviderConfig();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
    },
  },
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <AuthProvider>
            <ErrorBoundary>
              <WalletActivationProvider>
                <StatusBar style="auto" />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    headerShadowVisible: false,
                    contentStyle: { backgroundColor: 'transparent' },
                  }}
                />
                <WalletActivationSheet />
              </WalletActivationProvider>
            </ErrorBoundary>
          </AuthProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
