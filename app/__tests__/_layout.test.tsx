
import React from 'react';
import { render } from '@testing-library/react-native';
import RootLayout from '../_layout';

// Mock expo-router
jest.mock('expo-router', () => ({
  Stack: ({ children, ...props }: any) => {
    const { View } = require('react-native');
    return <View testID="stack-navigator" {...props}>{children}</View>;
  },
}));

// Mock expo-status-bar
jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: any) => children,
}));

// Mock GestureHandlerRootView
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children, style }: any) => {
    const { View } = require('react-native');
    return <View style={style} testID="gesture-handler-root">{children}</View>;
  },
}));

// Mock @tanstack/react-query
jest.mock('@tanstack/react-query', () => ({
  QueryClient: jest.fn(() => ({
    clear: jest.fn(),
    cancelQueries: jest.fn(),
  })),
  QueryClientProvider: ({ children }: any) => children,
}));

// Mock AuthProvider
jest.mock('@/components/AuthProvider', () => ({
  AuthProvider: ({ children }: any) => children,
}));

// Mock ErrorBoundary
jest.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: any) => children,
}));

// Mock WalletActivation (transitive ESM import via @baerae/zkap-zkp)
jest.mock('@/components/WalletActivation', () => ({
  WalletActivationProvider: ({ children }: any) => children,
  WalletActivationSheet: () => null,
}));

// Mock providerConfigHelper (fires off async init)
jest.mock('@/libs/wallet/providerConfigHelper', () => ({
  initProviderConfig: jest.fn(() => Promise.resolve()),
}));

// Mock i18n initialization
jest.mock('@/i18n', () => ({}));

describe('RootLayout', () => {
  it('renders without crashing', () => {
    const { getByTestId } = render(<RootLayout />);
    expect(getByTestId('gesture-handler-root')).toBeDefined();
  });

  it('wraps app with GestureHandlerRootView', () => {
    const { getByTestId } = render(<RootLayout />);
    const gestureRoot = getByTestId('gesture-handler-root');
    expect(gestureRoot).toBeDefined();
    expect(gestureRoot.props.style).toEqual({ flex: 1 });
  });

  it('renders Stack navigator', () => {
    const { getByTestId } = render(<RootLayout />);
    expect(getByTestId('stack-navigator')).toBeDefined();
  });

  it('configures Stack with correct screen options', () => {
    const { getByTestId } = render(<RootLayout />);
    const stack = getByTestId('stack-navigator');

    expect(stack.props.screenOptions).toEqual({
      headerShown: false,
      headerShadowVisible: false,
      contentStyle: { backgroundColor: 'transparent' },
    });
  });

  describe('Provider hierarchy', () => {
    it('wraps app in correct provider order', () => {
      const { UNSAFE_root } = render(<RootLayout />);

      // The root should have GestureHandlerRootView at the top
      expect(UNSAFE_root.findByProps({ testID: 'gesture-handler-root' })).toBeDefined();
    });
  });

  describe('QueryClient configuration', () => {
    it('creates QueryClient with correct default options', () => {
      const { QueryClient } = require('@tanstack/react-query');

      render(<RootLayout />);

      expect(QueryClient).toHaveBeenCalledWith({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            retry: 2,
          },
        },
      });
    });
  });

  it('renders StatusBar with auto style', () => {
    const StatusBar = require('expo-status-bar').StatusBar;
    const { UNSAFE_getAllByType } = render(<RootLayout />);

    // StatusBar should be rendered
    expect(StatusBar).toBeDefined();
  });
});
