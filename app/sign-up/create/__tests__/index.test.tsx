import { render, fireEvent, waitFor } from '@testing-library/react-native';
import CreateWallet from '../index';

const mockCreatePasskey = jest.fn(() =>
  Promise.resolve({
    credentialId: 'cred',
    publicKey: 'pub',
    attestationObject: 'att',
    credentialPubkeyCose: 'cose',
  }),
);

jest.mock('@/libs/passkey/passkey', () => ({
  createPasskey: () => mockCreatePasskey(),
  createChallenge: jest.fn(() => 'challenge'),
}));

jest.mock('@/libs/passkey/passkeyStore', () => ({
  getStoredPasskey: jest.fn(() => Promise.resolve(null)),
  savePasskey: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/services/wallet/walletCreationService', () => ({
  deriveWalletAddress: jest.fn(() => Promise.resolve('0xabc')),
  WalletCreationError: class WalletCreationError extends Error {},
}));

describe('CreateWallet onboarding', () => {
  beforeEach(() => {
    mockCreatePasskey.mockClear();
  });

  describe('Rendering', () => {
    it('renders without crashing', () => {
      const { root } = render(<CreateWallet />);
      expect(root).toBeTruthy();
    });

    it('renders the intro title + subtitle', () => {
      const { getByText } = render(<CreateWallet />);
      expect(getByText('onboarding.create.title')).toBeTruthy();
      expect(getByText('onboarding.create.subtitle')).toBeTruthy();
    });

    it('shows the passkey CTA button', () => {
      const { getByText } = render(<CreateWallet />);
      expect(getByText('onboarding.create.createButton')).toBeTruthy();
    });
  });

  describe('CTA-driven passkey creation (UX fix)', () => {
    it('does NOT trigger passkey creation on mount', () => {
      render(<CreateWallet />);
      expect(mockCreatePasskey).not.toHaveBeenCalled();
    });

    it('triggers passkey creation only after the user taps the CTA', async () => {
      const { getByText } = render(<CreateWallet />);
      expect(mockCreatePasskey).not.toHaveBeenCalled();
      fireEvent.press(getByText('onboarding.create.createButton'));
      await waitFor(() => expect(mockCreatePasskey).toHaveBeenCalledTimes(1));
    });
  });

  describe('TODO Implementation', () => {
    it.todo('navigates to /home after a successful derive');
    it.todo('returns to intro silently when the passkey prompt is cancelled');
    it.todo('shows the error card on a real creation failure');
  });
});
