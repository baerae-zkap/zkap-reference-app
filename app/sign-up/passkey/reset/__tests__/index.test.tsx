import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import ResetPasskey from '../index';
import { getRecoveryAccountsByChain } from '@/libs/recovery/recoveryAccountStore';

// --- router ---
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

// --- balance / gas gate ---
const mockGetBalance = jest.fn(() => Promise.resolve(1000000000000000n)); // 0.001 ETH (>= buffer)
const mockFormatEther = jest.fn((wei: bigint) =>
  wei === 1000000000000000n ? '0.001' : wei === 0n ? '0.0' : String(wei),
);
jest.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: jest.fn(() => ({ getBalance: mockGetBalance })),
    formatEther: (wei: bigint) => mockFormatEther(wei),
    // gasGate.isInsufficientForGas uses parseEther; delegate to the real impl
    parseEther: jest.requireActual('ethers').ethers.parseEther,
  },
}));

// --- clipboard / linking ---
const mockSetString = jest.fn((..._args: any[]) => Promise.resolve());
jest.mock('expo-clipboard', () => ({
  setStringAsync: (...args: any[]) => mockSetString(...args),
}));
const mockOpenURL = jest
  .spyOn(Linking, 'openURL')
  .mockImplementation(() => Promise.resolve(true));

// --- stores ---
let mockWalletState: any = { wallet: { address: '0xWALLET', chainId: 84532 } };
jest.mock('@/stores/walletStore', () => ({
  useWalletStore: (selector: any) => selector(mockWalletState),
}));

const mockAuthenticate = jest.fn();
jest.mock('@/stores/authStore', () => ({
  useAuthStore: Object.assign(
    () => ({ authenticate: mockAuthenticate, user: { email: 'a@b.com', nickname: 'A' } }),
    { getState: () => ({ user: { nickname: 'A' } }) },
  ),
}));

// --- recovery owner store (⑤ pre-fill) ---
jest.mock('@/stores/recoveryOwnerStore', () => ({
  useRecoveryOwnerStore: { getState: () => ({ owner: null, setOwner: jest.fn(), clear: jest.fn() }) },
}));

// --- recovery accounts store ---
jest.mock('@/libs/recovery/recoveryAccountStore', () => ({
  getRecoveryAccountsByChain: jest.fn(() => Promise.resolve([])),
  saveRecoveryAccountsForChain: jest.fn(() => Promise.resolve()),
}));

// --- zk proof utils (native deps) — only pickIdTokenWithNonce is used by reset ---
jest.mock('@/services/wallet/zkProofUtils', () => ({
  pickIdTokenWithNonce: jest.fn(),
}));

// --- passkey ---
jest.mock('@/libs/passkey/passkey', () => ({
  createChallenge: jest.fn(() => 'chal'),
  createPasskey: jest.fn(() =>
    Promise.resolve({
      credentialId: 'cred',
      publicKey: 'pk',
      credentialPubkeyCose: 'cose',
      attestationObject: 'att',
    }),
  ),
}));
jest.mock('@/libs/passkey/passkeyStore', () => ({
  savePasskey: jest.fn(() => Promise.resolve()),
  clearPasskey: jest.fn(() => Promise.resolve()),
  getStoredPasskey: jest.fn(() => Promise.resolve(null)),
}));

// --- tx key update service ---
const mockApplyTxKeyUpdate = jest.fn((..._args: any[]) => Promise.resolve('0xtxHash'));
jest.mock('@/services/wallet/txKeyRecoveryService', () => ({
  applyTxKeyUpdate: (...args: any[]) => mockApplyTxKeyUpdate(...args),
}));

// --- proving bundle consent (auto-approve) ---
jest.mock('@/components/ProvingBundleDownloadConsent', () => ({
  useProvingBundleDownloadConsent: () => ({
    confirmProvingBundleReady: jest.fn(() => Promise.resolve(true)),
    consentModal: null,
  }),
}));

// --- overlay stub ---
jest.mock('@/components/MasterKeySigning/MasterKeySigningOverlay', () => ({
  MasterKeySigningOverlay: ({ visible }: any) => {
    if (!visible) return null;
    const { View, Text } = require('react-native');
    return (
      <View>
        <Text>MasterKeySigningOverlay</Text>
      </View>
    );
  },
}));

const recoveryStore = getRecoveryAccountsByChain as jest.MockedFunction<
  typeof getRecoveryAccountsByChain
>;

const ACCOUNTS = [
  { provider: 'google', identifier: 'a@b.com', sub: 's1', aud: 'aud', isDefault: true } as any,
  { provider: 'google', identifier: 'c@d.com', sub: 's2', aud: 'aud' } as any,
  { provider: 'google', identifier: 'e@f.com', sub: 's3', aud: 'aud' } as any,
];

beforeEach(() => {
  jest.clearAllMocks();
  mockWalletState = { wallet: { address: '0xWALLET', chainId: 84532 } };
  mockGetBalance.mockResolvedValue(1000000000000000n);
  recoveryStore.mockResolvedValue([]);
});

jest.setTimeout(15000);

describe('ResetPasskey Screen', () => {
  describe('Rendering (intro step)', () => {
    it('renders without crashing', () => {
      const { root } = render(<ResetPasskey />);
      expect(root).toBeTruthy();
    });

    it('renders title and subtitle', () => {
      const { getByText } = render(<ResetPasskey />);
      expect(getByText('onboarding.passkey.resetTitle')).toBeTruthy();
      expect(getByText('onboarding.passkey.resetSubtitle')).toBeTruthy();
    });

    it('renders the create CTA', () => {
      const { getByText } = render(<ResetPasskey />);
      expect(getByText('onboarding.passkey.createButton')).toBeTruthy();
    });
  });

  describe('Direct create (scenario ④)', () => {
    it('pressing the CTA runs create+recover directly (no intermediate review)', async () => {
      recoveryStore.mockResolvedValue(ACCOUNTS);
      const { getByText, queryByTestId } = render(<ResetPasskey />);
      fireEvent.press(getByText('onboarding.passkey.createButton'));
      await waitFor(() => expect(mockApplyTxKeyUpdate).toHaveBeenCalledTimes(1));
      // the standalone review screen no longer exists
      expect(queryByTestId('passkey-review-start')).toBeNull();
    });
  });

  describe('New-device (⑤) in-flow picker', () => {
    it('uses collectTokens (in-flow picker) when no stored accounts — no redirect', async () => {
      recoveryStore.mockResolvedValue([]);
      const { getByText } = render(<ResetPasskey />);
      fireEvent.press(getByText('onboarding.passkey.createButton'));
      await waitFor(() => expect(mockApplyTxKeyUpdate).toHaveBeenCalledTimes(1));
      // ⑤: does not navigate to a separate re-entry screen; selects in-flow via the collectTokens callback.
      const arg = mockApplyTxKeyUpdate.mock.calls[0][0];
      expect(typeof arg.collectTokens).toBe('function');
      expect(arg.currentAccounts).toBeUndefined();
      expect(mockPush).not.toHaveBeenCalledWith('/sign-up/passkey/reset/recovery-accounts');
    });

    it('passes known accounts (④) directly — no picker', async () => {
      recoveryStore.mockResolvedValue(ACCOUNTS);
      const { getByText } = render(<ResetPasskey />);
      fireEvent.press(getByText('onboarding.passkey.createButton'));
      await waitFor(() => expect(mockApplyTxKeyUpdate).toHaveBeenCalledTimes(1));
      const arg = mockApplyTxKeyUpdate.mock.calls[0][0];
      expect(arg.currentAccounts).toHaveLength(3);
      expect(arg.collectTokens).toBeUndefined();
    });
  });

  describe('Gas gate', () => {
    it('shows the deposit-guide sheet when balance is insufficient', async () => {
      recoveryStore.mockResolvedValue(ACCOUNTS);
      mockGetBalance.mockResolvedValue(0n); // 0 ETH < buffer
      const { getByText, queryByTestId } = render(<ResetPasskey />);
      fireEvent.press(getByText('onboarding.passkey.createButton'));
      await waitFor(() => expect(getByText('recovery.gasGate.title')).toBeTruthy());
      // gated: no review, no proving
      expect(queryByTestId('passkey-review-start')).toBeNull();
    });

    it('faucet primary opens the faucet URL', async () => {
      recoveryStore.mockResolvedValue(ACCOUNTS);
      mockGetBalance.mockResolvedValue(0n);
      const { getByText, getByTestId } = render(<ResetPasskey />);
      fireEvent.press(getByText('onboarding.passkey.createButton'));
      await waitFor(() => expect(getByText('recovery.gasGate.title')).toBeTruthy());
      fireEvent.press(getByTestId('action-sheet-primary'));
      expect(mockOpenURL).toHaveBeenCalledWith('https://www.alchemy.com/faucets/base-sepolia');
    });

    it('copy-address secondary copies the wallet address', async () => {
      recoveryStore.mockResolvedValue(ACCOUNTS);
      mockGetBalance.mockResolvedValue(0n);
      const { getByText, getByTestId } = render(<ResetPasskey />);
      fireEvent.press(getByText('onboarding.passkey.createButton'));
      await waitFor(() => expect(getByText('recovery.gasGate.title')).toBeTruthy());
      fireEvent.press(getByTestId('action-sheet-secondary'));
      expect(mockSetString).toHaveBeenCalledWith('0xWALLET');
    });

    it('does NOT gate when balance fetch fails (null) — proceeds to create', async () => {
      recoveryStore.mockResolvedValue(ACCOUNTS);
      mockGetBalance.mockRejectedValue(new Error('rpc down'));
      const { getByText } = render(<ResetPasskey />);
      fireEvent.press(getByText('onboarding.passkey.createButton'));
      await waitFor(() => expect(mockApplyTxKeyUpdate).toHaveBeenCalledTimes(1));
    });
  });

  describe('Success / error sheets', () => {
    it('success → success sheet → router.replace(/home)', async () => {
      recoveryStore.mockResolvedValue(ACCOUNTS);
      const { getByText, getByTestId } = render(<ResetPasskey />);
      fireEvent.press(getByText('onboarding.passkey.createButton'));
      await waitFor(() => expect(mockApplyTxKeyUpdate).toHaveBeenCalled());
      // success sheet then navigate
      await waitFor(() => expect(getByTestId('action-sheet-primary')).toBeTruthy());
      fireEvent.press(getByTestId('action-sheet-primary'));
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });

    it('non-cancel error → error sheet, no navigation', async () => {
      recoveryStore.mockResolvedValue(ACCOUNTS);
      mockApplyTxKeyUpdate.mockRejectedValueOnce(new Error('boom'));
      const { getByText } = render(<ResetPasskey />);
      fireEvent.press(getByText('onboarding.passkey.createButton'));
      await waitFor(() => expect(getByText('recovery.initiate.resetPasskeyFailed')).toBeTruthy());
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('user-cancel stays SILENT (no error sheet)', async () => {
      recoveryStore.mockResolvedValue(ACCOUNTS);
      mockApplyTxKeyUpdate.mockRejectedValueOnce(new Error('TxKey update cancelled'));
      const { getByText, queryByText } = render(<ResetPasskey />);
      fireEvent.press(getByText('onboarding.passkey.createButton'));
      await waitFor(() => expect(mockApplyTxKeyUpdate).toHaveBeenCalled());
      expect(queryByText('recovery.initiate.resetPasskeyFailed')).toBeNull();
    });
  });
});
