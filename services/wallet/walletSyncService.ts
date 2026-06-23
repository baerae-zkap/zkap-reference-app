import { checkWalletDeployed } from './walletCreationService';
import { useWalletStore, Wallet, WalletStatus } from '@/stores/walletStore';

export interface SyncResult {
  address: string;
  chainId: number;
  previousStatus: WalletStatus;
  newStatus: WalletStatus;
  changed: boolean;
}

/**
 * Sync wallet deployment status with on-chain state.
 * Promotes DERIVED → DEPLOYED if confirmed on-chain.
 * Demotes DEPLOYED → DERIVED if not found on-chain.
 *
 * Non-blocking, best-effort. Network errors are silently ignored per wallet.
 */
export async function syncWalletDeploymentStatus(
  wallets: Wallet[]
): Promise<SyncResult[]> {
  const walletsToCheck = wallets.filter(
    (w) => w.status === WalletStatus.DEPLOYED || w.status === WalletStatus.DERIVED
  );

  if (walletsToCheck.length === 0) return [];

  const results = await Promise.allSettled(
    walletsToCheck.map(async (wallet): Promise<SyncResult> => {
      const isDeployed = await checkWalletDeployed(wallet.address, wallet.chainId);

      console.log(
        `[WalletSync] chain=${wallet.chainId} addr=${wallet.address} was=${wallet.status} ` +
        `onchain=${isDeployed ? 'DEPLOYED' : 'NOT_FOUND'}`
      );

      if (isDeployed && wallet.status === WalletStatus.DERIVED) {
        return {
          address: wallet.address,
          chainId: wallet.chainId,
          previousStatus: WalletStatus.DERIVED,
          newStatus: WalletStatus.DEPLOYED,
          changed: true,
        };
      }

      if (!isDeployed && wallet.status === WalletStatus.DEPLOYED) {
        return {
          address: wallet.address,
          chainId: wallet.chainId,
          previousStatus: WalletStatus.DEPLOYED,
          newStatus: WalletStatus.DERIVED,
          changed: true,
        };
      }

      return {
        address: wallet.address,
        chainId: wallet.chainId,
        previousStatus: wallet.status,
        newStatus: wallet.status,
        changed: false,
      };
    })
  );

  // Apply changes to store
  const syncResults: SyncResult[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      const syncResult = result.value;
      syncResults.push(syncResult);

      if (syncResult.changed) {
        // Verify current state before applying (TOCTOU guard)
        const current = useWalletStore.getState().wallets.find(
          (w) =>
            w.address === syncResult.address &&
            w.chainId === syncResult.chainId &&
            w.status === syncResult.previousStatus
        );

        if (current) {
          useWalletStore.setState((state) => ({
            wallets: state.wallets.map((w) =>
              w.address === syncResult.address && w.chainId === syncResult.chainId
                ? {
                    ...w,
                    status: syncResult.newStatus,
                    ...(syncResult.newStatus === WalletStatus.DEPLOYED
                      ? { deployedAt: new Date().toISOString() }
                      : {}),
                  }
                : w
            ),
          }));

          if (syncResult.newStatus === WalletStatus.DEPLOYED) {
            console.log(
              `[WalletSync] Wallet chain=${syncResult.chainId} promoted DERIVED→DEPLOYED`
            );
          } else {
            console.warn(
              `[WalletSync] Wallet chain=${syncResult.chainId} demoted DEPLOYED→DERIVED (not found on-chain)`
            );
          }
        }
      }
    }
    // Rejected promises (network errors) are silently ignored - conservative approach
  }

  return syncResults;
}
