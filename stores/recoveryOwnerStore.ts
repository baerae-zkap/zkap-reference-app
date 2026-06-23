import { create } from 'zustand';
import type { RecoveryAccount } from '@/libs/recovery/recoveryAccountStore';

/**
 * Transient store for scenario ⑤ (new-device recovery).
 *
 * When the sign-in flow locates a wallet via the owner account, it stores that
 * account (masterKey slot 0) here so the passkey-reset screen can pre-fill it
 * as a pending slot 0, guiding the user on which account to authenticate and
 * in what order. The reset screen re-authenticates this slot to obtain a
 * zkNonce-bound proof token.
 *
 * Note: the idToken from sign-in is NOT bound to zkNonce and cannot be reused
 * for the proof — this store is for identity display and slot ordering only.
 */
interface RecoveryOwnerState {
  owner: RecoveryAccount | null;
  setOwner: (owner: RecoveryAccount | null) => void;
  clear: () => void;
}

export const useRecoveryOwnerStore = create<RecoveryOwnerState>((set) => ({
  owner: null,
  setOwner: (owner) => set({ owner }),
  clear: () => set({ owner: null }),
}));
