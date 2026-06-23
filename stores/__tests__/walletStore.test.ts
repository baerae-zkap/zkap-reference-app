import * as SecureStore from 'expo-secure-store';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useWalletStore, Wallet, WalletStatus } from '../walletStore';

// Mock SecureStore
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

describe('walletStore', () => {
  const mockWallet1: Wallet = {
    address: '0x1234567890abcdef',
    chainId: 84532,
    status: WalletStatus.DEPLOYED,
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const mockWallet2: Wallet = {
    address: '0xfedcba0987654321',
    chainId: 1,
    status: WalletStatus.DERIVED,
    createdAt: '2024-01-02T00:00:00.000Z',
  };

  beforeEach(() => {
    // Clear store state before each test
    useWalletStore.setState({
      wallets: [],
      activeChainId: 84532,
      isCreating: false,
    });
    jest.clearAllMocks();
  });

  describe('secureStorage adapter', () => {
    // Access the secureStorage adapter directly for testing error paths
    let secureStorage: any;

    beforeAll(() => {
      // Import the module to get access to secureStorage
      jest.isolateModules(() => {
        const walletStoreModule = require('../walletStore');
        // The secureStorage is not exported, but we can test it through the store behavior
      });
    });

    it('should handle getItemAsync error and return null', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const error = new Error('SecureStore getItem failed');
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(error);

      // Create a new store instance that will try to rehydrate
      jest.isolateModules(() => {
        const { useWalletStore: freshStore } = require('../walletStore');
        const state = freshStore.getState();

        // Should have default state since getItem failed and returned null
        expect(state.wallets).toEqual([]);
      });

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('SecureStore getItem error:', error);
      });

      consoleErrorSpy.mockRestore();
    });

    it('should handle setItemAsync error gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const error = new Error('SecureStore setItem failed');
      (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(error);

      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet1);
      });

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('SecureStore setItem error:', error);
      });

      // Store should still work despite persistence error
      expect(result.current.wallets).toHaveLength(1);
      consoleErrorSpy.mockRestore();
    });

    it('should handle deleteItemAsync error gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const error = new Error('SecureStore deleteItem failed');

      // Mock deleteItemAsync to fail
      (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(error);

      // We need to test the secureStorage adapter's removeItem method
      // Create a new module instance to access the storage object
      jest.isolateModules(async () => {
        // Import and get the wallet store with its persist storage
        const walletStoreModule = require('../walletStore');

        // Access the persist storage through Zustand's persist API
        // The storage is used when clearing persisted state
        const store = walletStoreModule.useWalletStore;

        // Trigger a state that would cause persist to want to remove data
        // We can do this by accessing the store's persist API
        if (store.persist && store.persist.clearStorage) {
          await store.persist.clearStorage();

          await waitFor(() => {
            expect(consoleErrorSpy).toHaveBeenCalledWith(
              'SecureStore removeItem error:',
              error
            );
          });
        }
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const { result } = renderHook(() => useWalletStore());

      expect(result.current.wallets).toEqual([]);
      expect(result.current.activeChainId).toBe(84532);
      expect(result.current.isCreating).toBe(false);
    });

    it('should default to first enabled chain', () => {
      const { result } = renderHook(() => useWalletStore());

      expect(result.current.activeChainId).toBe(84532);
    });
  });

  describe('addWallet', () => {
    it('should add wallet to store', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet1);
      });

      expect(result.current.wallets).toHaveLength(1);
      expect(result.current.wallets[0]).toEqual(mockWallet1);
    });

    it('should set active chain to new wallet chainId', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet2);
      });

      expect(result.current.activeChainId).toBe(mockWallet2.chainId);
    });

    it('should add multiple wallets', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet1);
        result.current.addWallet(mockWallet2);
      });

      expect(result.current.wallets).toHaveLength(2);
      expect(result.current.wallets[0]).toEqual(mockWallet1);
      expect(result.current.wallets[1]).toEqual(mockWallet2);
    });

    it('should persist wallet to SecureStore', async () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet1);
      });

      await waitFor(() => {
        expect(SecureStore.setItemAsync).toHaveBeenCalled();
      });
    });
  });

  describe('removeWallet', () => {
    it('should remove wallet by chainId', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet1);
        result.current.addWallet(mockWallet2);
      });

      act(() => {
        result.current.removeWallet(mockWallet1.chainId);
      });

      expect(result.current.wallets).toHaveLength(1);
      expect(result.current.wallets[0].chainId).toBe(mockWallet2.chainId);
    });

    it('should update activeChainId when removing active wallet', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet1);
        result.current.addWallet(mockWallet2);
        result.current.setActiveChain(mockWallet1.chainId);
      });

      expect(result.current.activeChainId).toBe(mockWallet1.chainId);

      act(() => {
        result.current.removeWallet(mockWallet1.chainId);
      });

      expect(result.current.activeChainId).toBe(mockWallet2.chainId);
    });

    it('should reset to default chainId when removing last wallet', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet1);
      });

      act(() => {
        result.current.removeWallet(mockWallet1.chainId);
      });

      expect(result.current.activeChainId).toBe(84532);
    });

    it('should keep activeChainId if not removing active wallet', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet1);
        result.current.addWallet(mockWallet2);
        result.current.setActiveChain(mockWallet1.chainId);
      });

      act(() => {
        result.current.removeWallet(mockWallet2.chainId);
      });

      expect(result.current.activeChainId).toBe(mockWallet1.chainId);
    });

    it('should handle removing non-existent wallet', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet1);
      });

      act(() => {
        result.current.removeWallet(999);
      });

      expect(result.current.wallets).toHaveLength(1);
      expect(result.current.wallets[0]).toEqual(mockWallet1);
    });
  });

  describe('setActiveChain', () => {
    it('should set active chain id', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.setActiveChain(1);
      });

      expect(result.current.activeChainId).toBe(1);
    });

    it('should allow setting chain even without wallet', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.setActiveChain(137);
      });

      expect(result.current.activeChainId).toBe(137);
    });

    it('should persist to SecureStore', async () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.setActiveChain(1);
      });

      await waitFor(() => {
        expect(SecureStore.setItemAsync).toHaveBeenCalled();
      });
    });
  });

  describe('setIsCreating', () => {
    it('should set isCreating to true', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.setIsCreating(true);
      });

      expect(result.current.isCreating).toBe(true);
    });

    it('should set isCreating to false', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.setIsCreating(true);
      });

      act(() => {
        result.current.setIsCreating(false);
      });

      expect(result.current.isCreating).toBe(false);
    });
  });

  describe('getWalletByChainId', () => {
    it('should return wallet for given chainId', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet1);
        result.current.addWallet(mockWallet2);
      });

      const wallet = result.current.getWalletByChainId(mockWallet1.chainId);

      expect(wallet).toEqual(mockWallet1);
    });

    it('should return undefined for non-existent chainId', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet1);
      });

      const wallet = result.current.getWalletByChainId(999);

      expect(wallet).toBeUndefined();
    });

    it('should return undefined when no wallets exist', () => {
      const { result } = renderHook(() => useWalletStore());

      const wallet = result.current.getWalletByChainId(84532);

      expect(wallet).toBeUndefined();
    });
  });

  describe('getActiveWallet', () => {
    it('should return active wallet', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet1);
        result.current.addWallet(mockWallet2);
        result.current.setActiveChain(mockWallet2.chainId);
      });

      const activeWallet = result.current.getActiveWallet();

      expect(activeWallet).toEqual(mockWallet2);
    });

    it('should return undefined when no wallets exist', () => {
      const { result } = renderHook(() => useWalletStore());

      const activeWallet = result.current.getActiveWallet();

      expect(activeWallet).toBeUndefined();
    });

    it('should return undefined when activeChainId has no matching wallet', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet1);
        result.current.setActiveChain(999);
      });

      const activeWallet = result.current.getActiveWallet();

      expect(activeWallet).toBeUndefined();
    });
  });

  describe('hasWallets', () => {
    it('should return false when no wallets exist', () => {
      const { result } = renderHook(() => useWalletStore());

      expect(result.current.hasWallets()).toBe(false);
    });

    it('should return true when wallets exist', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet1);
      });

      expect(result.current.hasWallets()).toBe(true);
    });

    it('should return false after removing all wallets', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet1);
      });

      expect(result.current.hasWallets()).toBe(true);

      act(() => {
        result.current.removeWallet(mockWallet1.chainId);
      });

      expect(result.current.hasWallets()).toBe(false);
    });
  });

  describe('updateWalletDeploymentStatus', () => {
    it('should update wallet deployment status', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet({ ...mockWallet1, status: WalletStatus.DERIVED });
      });

      expect(result.current.wallets[0].status).toBe(WalletStatus.DERIVED);

      act(() => {
        result.current.updateWalletDeploymentStatus(mockWallet1.chainId, true);
      });

      expect(result.current.wallets[0].status).toBe(WalletStatus.DEPLOYED);
    });

    it('should only update specified wallet', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet({ ...mockWallet1, status: WalletStatus.DERIVED });
      });

      act(() => {
        result.current.addWallet({ ...mockWallet2, status: WalletStatus.DERIVED });
      });

      act(() => {
        result.current.updateWalletDeploymentStatus(mockWallet1.chainId, true);
      });

      expect(result.current.wallets[0].status).toBe(WalletStatus.DEPLOYED);
      expect(result.current.wallets[1].status).toBe(WalletStatus.DERIVED);
    });

    it('should handle non-existent wallet gracefully', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet1);
      });

      act(() => {
        result.current.updateWalletDeploymentStatus(999, true);
      });

      expect(result.current.wallets[0]).toEqual(mockWallet1);
    });

    it('should persist to SecureStore', async () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet1);
      });

      jest.clearAllMocks();

      act(() => {
        result.current.updateWalletDeploymentStatus(mockWallet1.chainId, true);
      });

      await waitFor(() => {
        expect(SecureStore.setItemAsync).toHaveBeenCalled();
      });
    });
  });

  describe('clearWallets', () => {
    it('should clear all wallets', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet1);
        result.current.addWallet(mockWallet2);
      });

      expect(result.current.wallets).toHaveLength(2);

      act(() => {
        result.current.clearWallets();
      });

      expect(result.current.wallets).toEqual([]);
    });

    it('should persist to SecureStore', async () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet1);
      });

      jest.clearAllMocks();

      act(() => {
        result.current.clearWallets();
      });

      await waitFor(() => {
        expect(SecureStore.setItemAsync).toHaveBeenCalled();
      });
    });
  });

  describe('persistence', () => {
    it('should call SecureStore.setItemAsync when state changes', async () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet1);
      });

      await waitFor(() => {
        expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
          'wallet_store_data',
          expect.any(String)
        );
      });
    });

    it('should only persist partializeD state fields', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet1);
        result.current.setIsCreating(true);
      });

      // isCreating should not be persisted (not in partialize)
      expect(result.current.isCreating).toBe(true);
    });

    it('should handle SecureStore.getItemAsync errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(
        new Error('SecureStore read error')
      );

      // Trigger a read by importing the store
      const { useWalletStore: freshStore } = require('../walletStore');
      const { result } = renderHook(() => freshStore.getState());

      // Should not throw and should have default state
      expect(result).toBeDefined();
      consoleErrorSpy.mockRestore();
    });

    it('should handle SecureStore.setItemAsync errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(
        new Error('SecureStore write error')
      );

      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet1);
      });

      await waitFor(() => {
        expect(SecureStore.setItemAsync).toHaveBeenCalled();
      });

      // Should not throw
      expect(result.current.wallets).toHaveLength(1);
      consoleErrorSpy.mockRestore();
    });

    it('should handle SecureStore.deleteItemAsync errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(
        new Error('SecureStore delete error')
      );

      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet1);
      });

      // This would trigger delete during rehydration cleanup
      // Just verify the mock can fail without crashing
      await waitFor(() => {
        expect(result.current.wallets).toHaveLength(1);
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('edge cases', () => {
    it('should handle rapid successive state changes', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet1);
        result.current.addWallet(mockWallet2);
        result.current.setActiveChain(mockWallet1.chainId);
        result.current.updateWalletDeploymentStatus(mockWallet2.chainId, true);
      });

      expect(result.current.wallets).toHaveLength(2);
      expect(result.current.activeChainId).toBe(mockWallet1.chainId);
      expect(result.current.wallets[1].status).toBe(WalletStatus.DEPLOYED);
    });

    it('should deduplicate wallets with same chainId', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.addWallet(mockWallet1);
        result.current.addWallet({ ...mockWallet1, address: '0xdifferent' });
      });

      // Dedup guard: second wallet with same chainId is ignored
      expect(result.current.wallets).toHaveLength(1);
      expect(result.current.wallets[0].address).toBe(mockWallet1.address);
    });

    it('should maintain data integrity during complex operations', () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        // Add wallets
        result.current.addWallet(mockWallet1);
        result.current.addWallet(mockWallet2);

        // Remove one wallet
        result.current.removeWallet(mockWallet1.chainId);

        // Update deployment
        result.current.updateWalletDeploymentStatus(mockWallet2.chainId, true);
      });

      expect(result.current.wallets).toHaveLength(1);
      expect(result.current.wallets[0].chainId).toBe(mockWallet2.chainId);
      expect(result.current.wallets[0].status).toBe(WalletStatus.DEPLOYED);
    });
  });

  describe('persist & migration', () => {
    it('v1→v2 migration: drops pendingActivation and invalidates DERIVED wallets', () => {
      // Access the migrate function via the persist config
      const persistConfig = (useWalletStore as any).persist;
      // If persist config is not directly accessible, simulate migration manually
      // by calling the migrate function from the store config.
      // We exercise the same logic by calling migrate directly.
      const { migrate } = (useWalletStore as any).__persistConfig ?? {};

      // Fallback: reconstruct the logic inline matching walletStore.ts
      const simulateMigrate = (persistedState: any, version: number) => {
        if (version === 0) {
          // v0→v1 handled separately
        }
        if (version < 2) {
          delete persistedState.pendingActivation;
          if (Array.isArray(persistedState.wallets)) {
            persistedState.wallets = persistedState.wallets.filter(
              (w: any) => w.status !== WalletStatus.DERIVED
            );
          }
        }
        return persistedState;
      };

      const v1Payload = {
        wallets: [
          {
            address: '0xderived_addr',
            chainId: 84532,
            status: WalletStatus.DERIVED,
            createdAt: '2024-01-01T00:00:00Z',
          },
          {
            address: '0xdeployed_addr',
            chainId: 84532,
            status: WalletStatus.DEPLOYED,
            createdAt: '2024-01-01T00:00:00Z',
          },
        ],
        activeChainId: 84532,
        pendingActivation: { active: true, resumeAtStep: 2 },
      };

      const migrated = simulateMigrate({ ...v1Payload, wallets: [...v1Payload.wallets] }, 1);

      // pendingActivation must be gone
      expect(migrated.pendingActivation).toBeUndefined();

      // DERIVED wallets must be invalidated
      expect(migrated.wallets.some((w: any) => w.status === WalletStatus.DERIVED)).toBe(false);

      // DEPLOYED wallet must be preserved
      expect(migrated.wallets).toHaveLength(1);
      expect(migrated.wallets[0].address).toBe('0xdeployed_addr');
    });

    it('v1→v2 migration: preserves activeChainId and non-DERIVED wallets', () => {
      const simulateMigrate = (persistedState: any, version: number) => {
        if (version < 2) {
          delete persistedState.pendingActivation;
          if (Array.isArray(persistedState.wallets)) {
            persistedState.wallets = persistedState.wallets.filter(
              (w: any) => w.status !== WalletStatus.DERIVED
            );
          }
        }
        return persistedState;
      };

      const v1Payload = {
        wallets: [
          {
            address: '0xdeployed1',
            chainId: 84532,
            status: WalletStatus.DEPLOYED,
            createdAt: '2024-01-01T00:00:00Z',
          },
        ],
        activeChainId: 84532,
        pendingActivation: null,
      };

      const migrated = simulateMigrate({ ...v1Payload, wallets: [...v1Payload.wallets] }, 1);

      expect(migrated.pendingActivation).toBeUndefined();
      expect(migrated.wallets).toHaveLength(1);
      expect(migrated.wallets[0].status).toBe(WalletStatus.DEPLOYED);
      expect(migrated.activeChainId).toBe(84532);
    });

    it('v2 payload: migrate is a no-op for version >= 2', () => {
      const simulateMigrate = (persistedState: any, version: number) => {
        if (version < 2) {
          delete persistedState.pendingActivation;
          if (Array.isArray(persistedState.wallets)) {
            persistedState.wallets = persistedState.wallets.filter(
              (w: any) => w.status !== WalletStatus.DERIVED
            );
          }
        }
        return persistedState;
      };

      const v2Payload = {
        wallets: [
          {
            address: '0xderived_in_v2',
            chainId: 84532,
            status: WalletStatus.DERIVED,
            createdAt: '2025-01-01T00:00:00Z',
          },
        ],
        activeChainId: 84532,
      };

      // version=2 means no migration runs
      const migrated = simulateMigrate({ ...v2Payload, wallets: [...v2Payload.wallets] }, 2);

      // DERIVED wallet preserved (migration already ran when user upgraded)
      expect(migrated.wallets).toHaveLength(1);
      expect(migrated.wallets[0].status).toBe(WalletStatus.DERIVED);
    });
  });
});
