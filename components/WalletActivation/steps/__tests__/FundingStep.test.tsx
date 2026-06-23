import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { FundingStep } from '../FundingStep';

const mockNextStep = jest.fn();
const mockClose = jest.fn();
const mockGetWalletBalance = jest.fn();
const originalConsoleError = console.error;
let mockWalletState: any;

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

jest.mock('@/stores/walletStore', () => {
  const useWalletStore = jest.fn((selector) => selector(mockWalletState));
  useWalletStore.getState = jest.fn(() => mockWalletState);
  return { useWalletStore };
});

jest.mock('@/services/wallet/walletCreationService', () => ({
  getWalletBalance: (...args: any[]) => mockGetWalletBalance(...args),
}));

jest.mock('../../WalletActivationContext', () => ({
  useWalletActivation: () => ({
    selectedChainId: 84532,
    nextStep: mockNextStep,
    close: mockClose,
  }),
}));

describe('FundingStep', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeAll(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
      const message = args.map(String).join(' ');
      if (message.includes('not wrapped in act')) return;
      originalConsoleError(...args);
    });
  });

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
    mockGetWalletBalance.mockResolvedValue(0n);
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it('shows the prefund address and blocks continue while balance is zero', async () => {
    const { getByTestId, getByText } = render(<FundingStep />);

    await waitFor(() => {
      expect(mockGetWalletBalance).toHaveBeenCalledWith(
        '0x1234567890abcdef1234567890abcdef12345678',
        84532,
      );
    });

    expect(getByText('walletActivation.funding.title')).toBeTruthy();
    expect(getByText('0x123456...345678')).toBeTruthy();

    await waitFor(() => {
      expect(getByText('walletActivation.funding.zeroBalance')).toBeTruthy();
      expect(getByText('0.000000 ETH')).toBeTruthy();
    });

    fireEvent.press(getByTestId('wallet-activation-funding-continue'));

    expect(mockNextStep).not.toHaveBeenCalled();
  });

  it('allows continue after Base Sepolia ETH balance is detected', async () => {
    mockGetWalletBalance.mockResolvedValue(1000000000000000n);

    const { getByTestId, getByText } = render(<FundingStep />);

    await waitFor(() => {
      expect(getByText('walletActivation.funding.funded')).toBeTruthy();
      expect(getByText('0.001000 ETH')).toBeTruthy();
    });

    fireEvent.press(getByTestId('wallet-activation-funding-continue'));

    expect(mockNextStep).toHaveBeenCalledTimes(1);
  });

  it('shows a missing-address message when no derived wallet exists', async () => {
    mockWalletState = { wallets: [] };

    const { getByText } = render(<FundingStep />);

    await waitFor(() => {
      expect(getByText('walletActivation.funding.missingAddress')).toBeTruthy();
    });
    expect(mockGetWalletBalance).not.toHaveBeenCalled();
  });
});
