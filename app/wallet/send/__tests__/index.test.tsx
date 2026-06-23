import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import SendScreen from '../index';
import { transactionService } from '@/services/wallet/transactionService';
import { getStoredPasskey } from '@/libs/passkey/passkeyStore';

const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
  }),
}));

jest.mock('expo-clipboard', () => ({
  getStringAsync: jest.fn(),
  setStringAsync: jest.fn(),
}));

jest.mock('@/stores/walletStore', () => ({
  useWalletStore: (selector: (state: unknown) => unknown) =>
    selector({
      wallet: {
        address: '0x1111111111111111111111111111111111111111',
        chainId: 84532,
      },
    }),
}));

jest.mock('@/libs/passkey/passkeyStore', () => ({
  getStoredPasskey: jest.fn(),
}));

jest.mock('@/services/wallet/transactionService', () => ({
  transactionService: {
    sendETH: jest.fn(),
  },
  WalletNotDeployedError: class WalletNotDeployedError extends Error {},
  PasskeyMismatchError: class PasskeyMismatchError extends Error {},
  InsufficientBalanceError: class InsufficientBalanceError extends Error {},
}));

jest.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: jest.fn().mockImplementation(() => ({
      getBalance: jest.fn().mockResolvedValue(100000000000000000n),
    })),
    isAddress: jest.fn((value: string) => /^0x[a-fA-F0-9]{40}$/.test(value)),
    parseEther: jest.fn((value: string) => BigInt(Math.round(Number(value) * 1e18))),
    formatEther: jest.fn((value: bigint) => (Number(value) / 1e18).toString()),
  },
}));

const mockGetStoredPasskey = getStoredPasskey as jest.MockedFunction<typeof getStoredPasskey>;
const mockSendETH = transactionService.sendETH as jest.MockedFunction<typeof transactionService.sendETH>;

describe('SendScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStoredPasskey.mockResolvedValue({
      credentialId: 'credential-id',
      publicKey: 'public-key',
    } as never);
    mockSendETH.mockResolvedValue({
      txHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      userOpHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows a success modal with only the transaction hash after sending ETH', async () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<SendScreen />);

    fireEvent.changeText(
      getByPlaceholderText('0x...'),
      '0x2222222222222222222222222222222222222222',
    );
    fireEvent.changeText(getByPlaceholderText('0.0'), '0.01');
    fireEvent.press(getByText('wallet.send.submit'));

    await waitFor(() => {
      expect(getByText('wallet.send.success')).toBeTruthy();
      expect(getByText('wallet.send.txHash')).toBeTruthy();
      expect(getByText('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBeTruthy();
      expect(queryByText('UserOp Hash')).toBeNull();
      expect(queryByText('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).toBeNull();
    });
  });

  it('shows a fallback message without exposing userOpHash when txHash is unavailable', async () => {
    mockSendETH.mockResolvedValue({
      txHash: '',
      userOpHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    });

    const { getByPlaceholderText, getByText, queryByText } = render(<SendScreen />);

    fireEvent.changeText(
      getByPlaceholderText('0x...'),
      '0x2222222222222222222222222222222222222222',
    );
    fireEvent.changeText(getByPlaceholderText('0.0'), '0.01');
    fireEvent.press(getByText('wallet.send.submit'));

    await waitFor(() => {
      expect(getByText('wallet.send.txHashPending')).toBeTruthy();
      expect(queryByText('UserOp Hash')).toBeNull();
      expect(queryByText('0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc')).toBeNull();
    });
  });

  it('shows an in-app passkey recovery sheet when the local passkey is missing', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockGetStoredPasskey.mockResolvedValue(null as never);

    const { getByPlaceholderText, getByText, getByTestId } = render(<SendScreen />);

    fireEvent.changeText(
      getByPlaceholderText('0x...'),
      '0x2222222222222222222222222222222222222222',
    );
    fireEvent.changeText(getByPlaceholderText('0.0'), '0.01');
    fireEvent.press(getByText('wallet.send.submit'));

    await waitFor(() => {
      expect(getByText('wallet.send.passkeyNotFoundTitle')).toBeTruthy();
      expect(getByText('wallet.send.passkeyNotFoundMessage')).toBeTruthy();
    });

    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockSendETH).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('action-sheet-primary'));

    expect(mockReplace).toHaveBeenCalledWith('/sign-up/passkey/reset');
  });

  it('shows an inline error and disables send for an invalid recipient (no OS alert)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByPlaceholderText, getByText, queryByText } = render(<SendScreen />);

    fireEvent.changeText(getByPlaceholderText('0x...'), '0xnotanaddress');
    fireEvent.changeText(getByPlaceholderText('0.0'), '0.01');

    // Inline field error is shown (i18n key in test env), not an OS alert.
    expect(getByText('wallet.send.invalidAddress')).toBeTruthy();

    // Pressing the disabled send button does nothing — no tx, no alert.
    fireEvent.press(getByText('wallet.send.submit'));
    await waitFor(() => {
      expect(mockSendETH).not.toHaveBeenCalled();
    });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(queryByText('wallet.send.success')).toBeNull();
  });

  it('shows an inline error for a zero amount and blocks send', async () => {
    const { getByPlaceholderText, getByText } = render(<SendScreen />);

    fireEvent.changeText(
      getByPlaceholderText('0x...'),
      '0x2222222222222222222222222222222222222222',
    );
    fireEvent.changeText(getByPlaceholderText('0.0'), '0');

    expect(getByText('wallet.send.amountTooSmall')).toBeTruthy();
    fireEvent.press(getByText('wallet.send.submit'));
    await waitFor(() => {
      expect(mockSendETH).not.toHaveBeenCalled();
    });
  });

  it('blocks inline when the amount exceeds the balance (mock balance = 0.1 ETH)', async () => {
    const { getByPlaceholderText, getByText } = render(<SendScreen />);
    // Let the balance effect resolve (0.1 ETH).
    await waitFor(() => expect(getByText('wallet.send.balanceLine')).toBeTruthy());

    fireEvent.changeText(
      getByPlaceholderText('0x...'),
      '0x2222222222222222222222222222222222222222',
    );
    fireEvent.changeText(getByPlaceholderText('0.0'), '0.2'); // > 0.1 balance

    expect(getByText('wallet.send.exceedsBalance')).toBeTruthy();
    fireEvent.press(getByText('wallet.send.submit'));
    await waitFor(() => {
      expect(mockSendETH).not.toHaveBeenCalled();
    });
  });

  it('shows a friendly sheet (not the raw revert) on InsufficientBalanceError', async () => {
    const { InsufficientBalanceError } = jest.requireMock('@/services/wallet/transactionService');
    mockSendETH.mockRejectedValue(new InsufficientBalanceError());

    const { getByPlaceholderText, getByText, queryByText } = render(<SendScreen />);
    await waitFor(() => expect(getByText('wallet.send.balanceLine')).toBeTruthy());

    fireEvent.changeText(
      getByPlaceholderText('0x...'),
      '0x2222222222222222222222222222222222222222',
    );
    fireEvent.changeText(getByPlaceholderText('0.0'), '0.05'); // <= 0.1 balance, passes inline

    fireEvent.press(getByText('wallet.send.submit'));

    await waitFor(() => {
      expect(getByText('wallet.send.insufficientBalanceTitle')).toBeTruthy();
      expect(getByText('wallet.send.insufficientBalanceMessage')).toBeTruthy();
    });
    // No raw revert text leaked.
    expect(queryByText(/CALL_EXCEPTION|estimateGas|missing revert data/)).toBeNull();
  });
});
