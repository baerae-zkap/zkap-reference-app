import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import { getDefaultChain, getChainById } from '@/libs/chains/supportedChains';

const WALLET_STORE_KEY = 'wallet_store_data';

/**
 * Migrate legacy wallet data (isDeployed) to new format (status)
 */
function migrateWallet(wallet: Wallet): Wallet {
  // Already migrated
  if (wallet.status) {
    return wallet;
  }

  // Migrate from isDeployed to status
  const { isDeployed, ...rest } = wallet;
  return {
    ...rest,
    status: isDeployed ? WalletStatus.DEPLOYED : WalletStatus.NOT_CREATED,
  };
}

// Zustand StateStorage adapter backed by expo-secure-store.
const secureStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(name);
    } catch (error) {
      console.error('SecureStore getItem error:', error);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(name, value);
    } catch (error) {
      console.error('SecureStore setItem error:', error);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch (error) {
      console.error('SecureStore removeItem error:', error);
    }
  },
};

export enum WalletStatus {
  NOT_CREATED = 'NOT_CREATED',
  DERIVED = 'DERIVED',
  DEPLOYED = 'DEPLOYED',
}

export interface Wallet {
  address: string;
  chainId: number;
  status: WalletStatus;
  createdAt: string;
  derivedAt?: string;
  deployedAt?: string;
  /** @deprecated Use status instead. Kept for migration only. */
  isDeployed?: boolean;
}

interface WalletState {
  wallets: Wallet[];
  activeChainId: number;
  isCreating: boolean;

  // Actions
  addWallet: (wallet: Wallet) => void;
  removeWallet: (chainId: number) => void;
  setActiveChain: (chainId: number) => void;
  setIsCreating: (isCreating: boolean) => void;
  getWalletByChainId: (chainId: number) => Wallet | undefined;
  getActiveWallet: () => Wallet | undefined;
  hasWallets: () => boolean;
  /** @deprecated Use updateWallet instead */
  updateWalletDeploymentStatus: (chainId: number, isDeployed: boolean) => void;
  updateWallet: (address: string, chainId: number, updates: Partial<Wallet>) => void;
  /**
   * Schema-agnostic helper — works on multi (Step 4) and single (Step 7) wallet schema.
   * Marks the wallet matching `address` as DEPLOYED with current timestamp.
   */
  setDeployed: (address: string) => void;
  getDerivedWallets: () => Wallet[];
  clearWallets: () => void;
  restoreWallets: (wallets: Wallet[], activeChainId: number) => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      wallets: [],
      activeChainId: getDefaultChain().chainId,
      isCreating: false,

      addWallet: (wallet: Wallet) => {
        // Dedup guard: skip if wallet for this chainId already exists
        const existing = get().wallets.find((w) => w.chainId === wallet.chainId);
        if (existing) return;

        set((state) => ({
          wallets: [...state.wallets, wallet],
          activeChainId: wallet.chainId,
        }));

      },

      removeWallet: (chainId: number) => {
        set((state) => {
          const newWallets = state.wallets.filter((w) => w.chainId !== chainId);

          return {
            wallets: newWallets,
            // Update activeChainId if the removed wallet was active
            activeChainId:
              state.activeChainId === chainId
                ? newWallets[0]?.chainId ?? getDefaultChain().chainId
                : state.activeChainId,
          };
        });
      },

      setActiveChain: (chainId: number) => {
        set({ activeChainId: chainId });
      },

      setIsCreating: (isCreating: boolean) => {
        set({ isCreating });
      },

      getWalletByChainId: (chainId: number) => {
        return get().wallets.find((w) => w.chainId === chainId);
      },

      getActiveWallet: () => {
        const state = get();
        return state.wallets.find((w) => w.chainId === state.activeChainId);
      },

      hasWallets: () => {
        return get().wallets.length > 0;
      },

      updateWalletDeploymentStatus: (chainId: number, isDeployed: boolean) => {
        console.error('[WalletStore] updateWalletDeploymentStatus is deprecated. Use verifyAndMarkDeployed() instead.');
        // Deprecated — updates status field for backward compatibility.
        set((state) => ({
          wallets: state.wallets.map((w) =>
            w.chainId === chainId
              ? {
                  ...w,
                  status: isDeployed ? WalletStatus.DEPLOYED : WalletStatus.DERIVED,
                  deployedAt: isDeployed ? new Date().toISOString() : w.deployedAt,
                }
              : w
          ),
        }));
      },

      updateWallet: (address: string, chainId: number, updates: Partial<Wallet>) => {
        set((state) => ({
          wallets: state.wallets.map((w) =>
            w.address === address && w.chainId === chainId ? { ...w, ...updates } : w
          ),
        }));
      },

      setDeployed: (address: string) => {
        set((state) => {
          const idx = state.wallets.findIndex(
            (w) => w.address.toLowerCase() === address.toLowerCase()
          );
          if (idx === -1) return state;
          const next = [...state.wallets];
          next[idx] = {
            ...next[idx],
            status: WalletStatus.DEPLOYED,
            deployedAt: new Date().toISOString(),
          };
          return { wallets: next };
        });
      },

      getDerivedWallets: () => {
        return get().wallets.filter((w) => w.status === WalletStatus.DERIVED);
      },

      clearWallets: () => {
        set({ wallets: [] });
      },

      restoreWallets: (wallets, activeChainId) => {
        set({ wallets, activeChainId });
      },
    }),
    {
      name: WALLET_STORE_KEY,
      version: 2,
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        wallets: state.wallets,
        activeChainId: state.activeChainId,
      }),
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          // v0→v1: Reset activeChainId if the stored chain is no longer supported.
          if (!getChainById(persistedState.activeChainId)) {
            persistedState.activeChainId = getDefaultChain().chainId;
          }
        }
        if (version < 2) {
          // v1→v2:
          //   1) Remove the pendingActivation field (dropped with RecoveryConfirmStep).
          //   2) DERIVED addresses computed before 2026-03-24 may have used the wrong
          //      audience (host OAuth client), so invalidate them. DEPLOYED wallets
          //      are preserved — their on-chain address is already fixed.
          delete persistedState.pendingActivation;
          if (Array.isArray(persistedState.wallets)) {
            persistedState.wallets = persistedState.wallets.filter(
              (w: Wallet) => w.status !== WalletStatus.DERIVED
            );
          }
        }
        return persistedState;
      },
      // Migrate legacy wallet data (isDeployed → status) on rehydration.
      onRehydrateStorage: () => (state) => {
        if (state?.wallets) {
          state.wallets = state.wallets.map(migrateWallet);
        }

        // Async on-chain verification (non-blocking, best-effort)
        if (state?.wallets && state.wallets.length > 0) {
          import('../services/wallet/walletSyncService')
            .then(({ syncWalletDeploymentStatus }) =>
              syncWalletDeploymentStatus(state.wallets)
            )
            .catch((err) => {
              console.warn('[WalletStore] Startup sync failed:', err);
            });

          // Silent passkey reconnection check (no biometric — RPC only)
          import('../services/wallet/passkeyReconnectionService')
            .then(async ({ needsReconnection, checkReconnectionAvailable }) => {
              if (!(await needsReconnection())) return;
              const deployed = state.wallets.find((w) => w.status === WalletStatus.DEPLOYED);
              if (!deployed) return;
              const result = await checkReconnectionAvailable(deployed.address, deployed.chainId);
              if (result.available) {
                console.log('[WalletStore] Passkey reconnection available:', result.matchCount, 'key(s)');
              }
            })
            .catch((err) => {
              console.warn('[WalletStore] Passkey reconnection check failed:', err);
            });
        }
      },
    }
  )
);

/** Derived selector: true when at least one DERIVED or DEPLOYED wallet exists */
export const useHasWallet = () =>
  useWalletStore((state) => state.wallets.some((w) => w.status !== WalletStatus.NOT_CREATED));

/** Imperative version for non-hook contexts */
export function getHasWallet(): boolean {
  return useWalletStore.getState().wallets.some((w) => w.status !== WalletStatus.NOT_CREATED);
}
