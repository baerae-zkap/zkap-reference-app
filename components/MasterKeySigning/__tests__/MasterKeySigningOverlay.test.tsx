import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { MasterKeySigningOverlay } from '../MasterKeySigningOverlay';
import type { MasterKeySigningOverlayProps } from '../MasterKeySigningOverlay';
import type { RecoveryAccount } from '@/libs/recovery/recoveryAccountStore';

// ── Fixtures ─────────────────────────────────────────────────────

const makeAccount = (provider: string, sub: string, identifier: string): RecoveryAccount => ({
  provider: provider as any,
  iss: `https://${provider}.example`,
  sub,
  aud: 'test-client-id',
  identifier,
  isDefault: false,
});

const googleAccount = makeAccount('google', 'google-sub-1', 'user@gmail.com');
const google2Account = makeAccount('google', 'google-sub-2', 'user2@gmail.com');
const google3Account = makeAccount('google', 'google-sub-3', 'user3@gmail.com');

const defaultProps: MasterKeySigningOverlayProps = {
  visible: true,
  accounts: [googleAccount, google2Account],
  accountStatuses: ['pending', 'pending'],
  currentPhase: null,
  verifiedCount: 0,
  onConfirmLogin: jest.fn(),
  onCancel: jest.fn(),
};

// ── Tests ────────────────────────────────────────────────────────

describe('MasterKeySigningOverlay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Visibility ──────────────────────────────────────────────

  describe('visibility', () => {
    it('should render when visible=true', () => {
      const { getByText } = render(<MasterKeySigningOverlay {...defaultProps} />);
      expect(getByText('masterKeySigning.title')).toBeTruthy();
    });

    it('should not render when visible=false', () => {
      const { queryByText } = render(
        <MasterKeySigningOverlay {...defaultProps} visible={false} />
      );
      expect(queryByText('masterKeySigning.title')).toBeNull();
    });
  });

  // ── Phase pills ─────────────────────────────────────────────

  describe('phase pills', () => {
    it('renders the three phase labels', () => {
      const { getByText } = render(<MasterKeySigningOverlay {...defaultProps} />);
      expect(getByText('masterKeySigning.phaseAuth')).toBeTruthy();
      expect(getByText('masterKeySigning.phaseProof')).toBeTruthy();
      expect(getByText('masterKeySigning.phaseDone')).toBeTruthy();
    });
  });

  // ── Auth phase: account display ─────────────────────────────

  describe('auth phase account display', () => {
    it('should display all account identifiers', () => {
      const { getByText } = render(<MasterKeySigningOverlay {...defaultProps} />);
      expect(getByText('user@gmail.com')).toBeTruthy();
      expect(getByText('user2@gmail.com')).toBeTruthy();
    });

    it('should display account indices (1-based)', () => {
      const { getByText } = render(<MasterKeySigningOverlay {...defaultProps} />);
      expect(getByText('1.')).toBeTruthy();
      expect(getByText('2.')).toBeTruthy();
    });

    it('should show single account', () => {
      const { getByText } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accounts={[googleAccount]}
          accountStatuses={['pending']}
        />
      );
      expect(getByText('user@gmail.com')).toBeTruthy();
      expect(getByText('1.')).toBeTruthy();
    });

    it('should show 3 accounts', () => {
      const { getByText } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accounts={[googleAccount, google2Account, google3Account]}
          accountStatuses={['pending', 'pending', 'pending']}
        />
      );
      expect(getByText('1.')).toBeTruthy();
      expect(getByText('2.')).toBeTruthy();
      expect(getByText('3.')).toBeTruthy();
    });
  });

  // ── Auth phase: status display ──────────────────────────────

  describe('auth phase status display', () => {
    it('should show pending status for pending accounts', () => {
      const { getAllByText } = render(<MasterKeySigningOverlay {...defaultProps} />);
      const pendingTexts = getAllByText('masterKeySigning.statusPending');
      expect(pendingTexts.length).toBe(2);
    });

    it('should show verified status', () => {
      const { getByText } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accountStatuses={['verified', 'pending']}
          verifiedCount={1}
        />
      );
      expect(getByText('masterKeySigning.statusVerified')).toBeTruthy();
    });

    it('should show error status', () => {
      const { getByText } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accountStatuses={['error', 'pending']}
        />
      );
      expect(getByText('masterKeySigning.statusError')).toBeTruthy();
    });

    it('should show signing status', () => {
      const { getByText } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accountStatuses={['signing', 'pending']}
        />
      );
      expect(getByText('masterKeySigning.statusSigning')).toBeTruthy();
    });

    it('should show status icons: ✓ for verified, ✕ for error', () => {
      const { getByText } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accountStatuses={['verified', 'error']}
        />
      );
      expect(getByText('✓')).toBeTruthy();
      expect(getByText('✕')).toBeTruthy();
    });
  });

  // ── Auth phase: guidance & confirm button ───────────────────

  describe('auth phase guidance and confirm button', () => {
    it('should show auto-verifying text initially for waiting_user', () => {
      const { getByText } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accountStatuses={['waiting_user', 'pending']}
          currentPhase={{
            type: 'account_signing',
            accountIndex: 0,
            account: googleAccount,
            status: 'waiting_user',
          }}
        />
      );
      expect(getByText('masterKeySigning.statusAutoVerifying')).toBeTruthy();
    });

    it('should show guidance text after 500ms grace period', () => {
      const { getByText, queryByText } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accountStatuses={['waiting_user', 'pending']}
          currentPhase={{
            type: 'account_signing',
            accountIndex: 0,
            account: googleAccount,
            status: 'waiting_user',
          }}
        />
      );

      // Before 500ms: no guidance
      expect(queryByText('masterKeySigning.accountGuidance')).toBeNull();

      // After 500ms: guidance appears
      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(getByText('masterKeySigning.accountGuidance')).toBeTruthy();
      expect(getByText('masterKeySigning.statusWaitingUser')).toBeTruthy();
    });

    it('should show the provider login button after 500ms when onConfirmLogin is provided', () => {
      const onConfirmLogin = jest.fn();
      const { getByText, queryByText } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accountStatuses={['waiting_user', 'pending']}
          currentPhase={{
            type: 'account_signing',
            accountIndex: 0,
            account: googleAccount,
            status: 'waiting_user',
          }}
          onConfirmLogin={onConfirmLogin}
        />
      );

      // Before 500ms: no login button
      expect(queryByText('masterKeySigning.loginWith')).toBeNull();

      // After 500ms: provider login button appears
      act(() => {
        jest.advanceTimersByTime(500);
      });

      const button = getByText('masterKeySigning.loginWith');
      expect(button).toBeTruthy();

      fireEvent.press(button);
      expect(onConfirmLogin).toHaveBeenCalledTimes(1);
    });

    it('should not show the login button when onConfirmLogin is not provided', () => {
      const { queryByText } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accountStatuses={['waiting_user', 'pending']}
          currentPhase={{
            type: 'account_signing',
            accountIndex: 0,
            account: googleAccount,
            status: 'waiting_user',
          }}
          onConfirmLogin={undefined}
        />
      );

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(queryByText('masterKeySigning.loginWith')).toBeNull();
    });

    it('should render the saved-account label on the account card', () => {
      const { getAllByText } = render(<MasterKeySigningOverlay {...defaultProps} />);
      // one savedAccount label per account row in the Auth phase
      expect(getAllByText('masterKeySigning.savedAccount').length).toBe(2);
    });

    it('should not show guidance for signing status', () => {
      const { queryByText } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accountStatuses={['signing', 'pending']}
          currentPhase={{
            type: 'account_signing',
            accountIndex: 0,
            account: googleAccount,
            status: 'signing',
          }}
        />
      );

      act(() => {
        jest.advanceTimersByTime(600);
      });

      expect(queryByText('masterKeySigning.accountGuidance')).toBeNull();
    });

    it('should show the "n/N · next" footer while an account is active', () => {
      const { getByText } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accountStatuses={['waiting_user', 'pending']}
          currentPhase={{
            type: 'account_signing',
            accountIndex: 0,
            account: googleAccount,
            status: 'waiting_user',
          }}
        />
      );
      expect(getByText(/masterKeySigning\.authStepTitle/)).toBeTruthy();
    });
  });

  // ── Auth phase: computing nonce ─────────────────────────────

  describe('auth phase pre-signing', () => {
    it('should show computing nonce phase (still in auth)', () => {
      const { getByText } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          currentPhase={{ type: 'computing_nonce' }}
        />
      );
      expect(getByText('masterKeySigning.computingNonce')).toBeTruthy();
      // still showing the auth title
      expect(getByText('masterKeySigning.title')).toBeTruthy();
    });
  });

  // ── Concurrent key download during auth (MEDIUM regression) ─

  describe('concurrent key download during auth', () => {
    it('keeps the account card visible when a download event interleaves between account_signing events', () => {
      // 1st account is signing in; key download has not finished, only 1/2 verified
      const { getByText, rerender } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accountStatuses={['verified', 'waiting_user']}
          verifiedCount={1}
          currentPhase={{
            type: 'account_signing',
            accountIndex: 1,
            account: google2Account,
            status: 'waiting_user',
          }}
        />
      );
      expect(getByText('user2@gmail.com')).toBeTruthy();

      // A downloading_keys progress tick arrives mid-auth (verifiedCount < total)
      rerender(
        <MasterKeySigningOverlay
          {...defaultProps}
          accountStatuses={['verified', 'waiting_user']}
          verifiedCount={1}
          currentPhase={{
            type: 'downloading_keys',
            progress: { downloaded: 100 * 1024 * 1024, total: 700 * 1024 * 1024, percent: 14 },
          }}
        />
      );

      // Phase must stay Auth: the account card + auth title remain visible,
      // and the in-Auth download bar shows. NOT the Proof title.
      expect(getByText('user@gmail.com')).toBeTruthy();
      expect(getByText('user2@gmail.com')).toBeTruthy();
      expect(getByText('masterKeySigning.title')).toBeTruthy();
      expect(getByText('14%')).toBeTruthy();
      expect(getByText('proofMode.downloadFirstTimeNotice')).toBeTruthy();

      // Back to account_signing — account card still there
      rerender(
        <MasterKeySigningOverlay
          {...defaultProps}
          accountStatuses={['verified', 'waiting_user']}
          verifiedCount={1}
          currentPhase={{
            type: 'account_signing',
            accountIndex: 1,
            account: google2Account,
            status: 'waiting_user',
          }}
        />
      );
      expect(getByText('user2@gmail.com')).toBeTruthy();
    });

    it('advances to Proof once auth is complete (all verified)', () => {
      const { getByText, queryByText } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accountStatuses={['verified', 'verified']}
          verifiedCount={2}
          currentPhase={{
            type: 'downloading_keys',
            progress: { downloaded: 700 * 1024 * 1024, total: 700 * 1024 * 1024, percent: 100 },
          }}
        />
      );
      // Now it's the Proof phase (auth done): proof title shown, auth card gone
      expect(getByText('masterKeySigning.proofTitle')).toBeTruthy();
      expect(queryByText('masterKeySigning.title')).toBeNull();
    });
  });

  // ── Proof phase ─────────────────────────────────────────────

  describe('proof phase', () => {
    it('should show the proof title and secure notice', () => {
      const { getByText } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accountStatuses={['verified', 'verified']}
          verifiedCount={2}
          currentPhase={{ type: 'generating_proof' }}
        />
      );
      expect(getByText('masterKeySigning.proofTitle')).toBeTruthy();
      expect(getByText('masterKeySigning.proofSecure')).toBeTruthy();
    });

    it('should show collecting merkle data as the active step', () => {
      const { getByText } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accountStatuses={['verified', 'verified']}
          verifiedCount={2}
          currentPhase={{ type: 'collecting_merkle_data' }}
        />
      );
      expect(getByText('masterKeySigning.collectingMerkleData')).toBeTruthy();
    });

    it('should show generating proof as the active step', () => {
      const { getByText } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accountStatuses={['verified', 'verified']}
          verifiedCount={2}
          currentPhase={{ type: 'generating_proof' }}
        />
      );
      expect(getByText('masterKeySigning.generatingProof')).toBeTruthy();
    });

    it('should show encoding signature as the active step', () => {
      const { getByText } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accountStatuses={['verified', 'verified']}
          verifiedCount={2}
          currentPhase={{ type: 'encoding_signature' }}
        />
      );
      expect(getByText('masterKeySigning.encodingSignature')).toBeTruthy();
    });

    it('should show the first-time download bar with percent (auth complete)', () => {
      const { getByText } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accountStatuses={['verified', 'verified']}
          verifiedCount={2}
          currentPhase={{
            type: 'downloading_keys',
            progress: { downloaded: 350 * 1024 * 1024, total: 700 * 1024 * 1024, percent: 50 },
          }}
        />
      );
      expect(getByText('masterKeySigning.proofTitle')).toBeTruthy();
      expect(getByText('proofMode.downloadingKeys')).toBeTruthy();
      expect(getByText('50%')).toBeTruthy();
      expect(getByText('proofMode.downloadFirstTimeNotice')).toBeTruthy();
    });
  });

  // ── Done phase ──────────────────────────────────────────────

  describe('done phase', () => {
    it('should show the completed text and the close button', () => {
      const { getByText } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accountStatuses={['verified', 'verified']}
          verifiedCount={2}
          currentPhase={{ type: 'completed' }}
        />
      );
      expect(getByText('masterKeySigning.completed')).toBeTruthy();
      expect(getByText('masterKeySigning.doneButton')).toBeTruthy();
    });
  });

  // ── Cancel button ───────────────────────────────────────────

  describe('cancel button', () => {
    it('should call onCancel when pressed', () => {
      const onCancel = jest.fn();
      const { getByText } = render(
        <MasterKeySigningOverlay {...defaultProps} onCancel={onCancel} />
      );

      fireEvent.press(getByText('masterKeySigning.cancelButton'));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('should call onCancel from the done-phase close button', () => {
      const onCancel = jest.fn();
      const { getByText } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accountStatuses={['verified', 'verified']}
          verifiedCount={2}
          currentPhase={{ type: 'completed' }}
          onCancel={onCancel}
        />
      );

      fireEvent.press(getByText('masterKeySigning.doneButton'));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  // ── ⑤ pick mode (Auth phase as account picker) ──────────────

  describe('pick mode (⑤ recovery account picker)', () => {
    const onAddAccount = jest.fn();
    const onVerifyPending = jest.fn();
    const onRemove = jest.fn();
    const onDone = jest.fn();
    const basePick = { active: true, busy: false, onAddAccount, onVerifyPending, onRemove, onDone };
    const verifiedSlots = [{ account: googleAccount, verified: true }];

    it('renders the picker in the Auth phase with add/done buttons (all verified)', () => {
      const { getByText, getByTestId, queryByText } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accounts={[]}
          accountStatuses={[]}
          currentPhase={null}
          verifiedCount={0}
          pick={{ ...basePick, accounts: verifiedSlots }}
        />
      );
      expect(getByText('masterKeySigning.title')).toBeTruthy();
      expect(getByText('masterKeySigning.pickSubtitle')).toBeTruthy();
      expect(getByText('user@gmail.com')).toBeTruthy();
      expect(getByTestId('recovery-pick-add')).toBeTruthy();
      expect(getByTestId('recovery-pick-done')).toBeTruthy();
      expect(getByText('masterKeySigning.addAccount')).toBeTruthy();
      expect(getByText('masterKeySigning.pickDone')).toBeTruthy();
      expect(queryByText('masterKeySigning.subtitle')).toBeNull();
    });

    it('makes the pending owner row tappable to verify; bottom CTA stays uniform with done disabled', () => {
      const { getByText, getByTestId } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accounts={[]}
          accountStatuses={[]}
          currentPhase={null}
          verifiedCount={0}
          pick={{ ...basePick, accounts: [{ account: googleAccount, verified: false }] }}
        />
      );
      expect(getByText('masterKeySigning.pickOwnerHint')).toBeTruthy();
      // bottom CTA stays uniform (add + done always present); done disabled while pending
      expect(getByTestId('recovery-pick-add')).toBeTruthy();
      expect(getByTestId('recovery-pick-done').props.accessibilityState?.disabled).toBe(true);
      // the whole pending row is the tap target — no standalone verify button
      fireEvent.press(getByTestId('recovery-pick-verify'));
      expect(onVerifyPending).toHaveBeenCalledTimes(1);
    });

    it('stays in Auth even with a proof-ish currentPhase while picking', () => {
      const { getByText, queryByText } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accounts={[]}
          accountStatuses={[]}
          currentPhase={{ type: 'generating_proof' }}
          verifiedCount={1}
          pick={{ ...basePick, accounts: verifiedSlots }}
        />
      );
      expect(getByText('masterKeySigning.pickSubtitle')).toBeTruthy();
      expect(queryByText('masterKeySigning.proofTitle')).toBeNull();
    });

    it('fires onAddAccount and onDone from the picker buttons', () => {
      const { getByTestId } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accounts={[]}
          accountStatuses={[]}
          currentPhase={null}
          verifiedCount={0}
          pick={{ ...basePick, accounts: verifiedSlots }}
        />
      );
      fireEvent.press(getByTestId('recovery-pick-add'));
      expect(onAddAccount).toHaveBeenCalledTimes(1);
      fireEvent.press(getByTestId('recovery-pick-done'));
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it('fires onRemove from a slot remove button', () => {
      const { getByTestId } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accounts={[]}
          accountStatuses={[]}
          currentPhase={null}
          verifiedCount={0}
          pick={{ ...basePick, accounts: verifiedSlots }}
        />
      );
      fireEvent.press(getByTestId('recovery-pick-remove-0'));
      expect(onRemove).toHaveBeenCalledWith(0);
    });

    it('keeps the in-Auth download progress bar visible during selection', () => {
      const { getByText } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accounts={[]}
          accountStatuses={[]}
          currentPhase={{
            type: 'downloading_keys',
            progress: { downloaded: 350 * 1024 * 1024, total: 700 * 1024 * 1024, percent: 50 },
          }}
          verifiedCount={0}
          pick={{ ...basePick, accounts: verifiedSlots }}
        />
      );
      expect(getByText('masterKeySigning.pickSubtitle')).toBeTruthy();
      expect(getByText('50%')).toBeTruthy();
      expect(getByText('proofMode.downloadFirstTimeNotice')).toBeTruthy();
    });

    it('disables the done button when no account is selected yet', () => {
      const { getByTestId } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accounts={[]}
          accountStatuses={[]}
          currentPhase={null}
          verifiedCount={0}
          pick={{ ...basePick, accounts: [] }}
        />
      );
      expect(getByTestId('recovery-pick-done').props.accessibilityState?.disabled).toBe(true);
    });
  });

  // ── Timer cleanup ───────────────────────────────────────────

  describe('timer cleanup', () => {
    it('should clear timer when account transitions away from waiting_user', () => {
      const { rerender } = render(
        <MasterKeySigningOverlay
          {...defaultProps}
          accountStatuses={['waiting_user', 'pending']}
          currentPhase={{
            type: 'account_signing',
            accountIndex: 0,
            account: googleAccount,
            status: 'waiting_user',
          }}
        />
      );

      // Transition to signing (timer should be cleared)
      rerender(
        <MasterKeySigningOverlay
          {...defaultProps}
          accountStatuses={['signing', 'pending']}
          currentPhase={{
            type: 'account_signing',
            accountIndex: 0,
            account: googleAccount,
            status: 'signing',
          }}
        />
      );

      // Advancing timers should not cause issues
      act(() => {
        jest.advanceTimersByTime(1000);
      });
    });
  });
});
