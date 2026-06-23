import { syncWalletDeploymentStatus, SyncResult } from '../walletSyncService';
import { useWalletStore, WalletStatus, Wallet } from '@/stores/walletStore';

// Mock walletCreationService
jest.mock('../walletCreationService', () => ({
  checkWalletDeployed: jest.fn(),
}));

import { checkWalletDeployed } from '../walletCreationService';
const mockCheckDeployed = checkWalletDeployed as jest.MockedFunction<typeof checkWalletDeployed>;

function makeWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    address: '0xTest',
    chainId: 84532,
    status: WalletStatus.DERIVED,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('syncWalletDeploymentStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWalletStore.setState({ wallets: [] });
  });

  it('should return empty array for no wallets', async () => {
    const results = await syncWalletDeploymentStatus([]);
    expect(results).toEqual([]);
    expect(mockCheckDeployed).not.toHaveBeenCalled();
  });

  it('should skip NOT_CREATED wallets', async () => {
    const wallet = makeWallet({ status: WalletStatus.NOT_CREATED });
    const results = await syncWalletDeploymentStatus([wallet]);
    expect(results).toEqual([]);
    expect(mockCheckDeployed).not.toHaveBeenCalled();
  });

  it('should promote DERIVED → DEPLOYED when on-chain confirmed', async () => {
    const wallet = makeWallet({ status: WalletStatus.DERIVED });
    useWalletStore.setState({ wallets: [wallet] });
    mockCheckDeployed.mockResolvedValue(true);

    const results = await syncWalletDeploymentStatus([wallet]);

    expect(results).toHaveLength(1);
    expect(results[0].changed).toBe(true);
    expect(results[0].newStatus).toBe(WalletStatus.DEPLOYED);

    const storeWallet = useWalletStore.getState().wallets[0];
    expect(storeWallet.status).toBe(WalletStatus.DEPLOYED);
    expect(storeWallet.deployedAt).toBeDefined();
  });

  it('should demote DEPLOYED → DERIVED when not on-chain', async () => {
    const wallet = makeWallet({ status: WalletStatus.DEPLOYED });
    useWalletStore.setState({ wallets: [wallet] });
    mockCheckDeployed.mockResolvedValue(false);

    const results = await syncWalletDeploymentStatus([wallet]);

    expect(results).toHaveLength(1);
    expect(results[0].changed).toBe(true);
    expect(results[0].newStatus).toBe(WalletStatus.DERIVED);

    const storeWallet = useWalletStore.getState().wallets[0];
    expect(storeWallet.status).toBe(WalletStatus.DERIVED);
  });

  it('should not change status when already correct', async () => {
    const wallet = makeWallet({ status: WalletStatus.DEPLOYED });
    useWalletStore.setState({ wallets: [wallet] });
    mockCheckDeployed.mockResolvedValue(true);

    const results = await syncWalletDeploymentStatus([wallet]);

    expect(results).toHaveLength(1);
    expect(results[0].changed).toBe(false);
  });

  it('should handle network errors gracefully (per wallet)', async () => {
    const wallet1 = makeWallet({ address: '0xA', status: WalletStatus.DERIVED });
    const wallet2 = makeWallet({ address: '0xB', status: WalletStatus.DERIVED });
    useWalletStore.setState({ wallets: [wallet1, wallet2] });

    mockCheckDeployed
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(true);

    const results = await syncWalletDeploymentStatus([wallet1, wallet2]);

    // First wallet failed (network error) - not in results
    // Second wallet succeeded
    expect(results.length).toBeGreaterThanOrEqual(1);
    const successResult = results.find(r => r.address === '0xB');
    expect(successResult?.changed).toBe(true);
    expect(successResult?.newStatus).toBe(WalletStatus.DEPLOYED);
  });

  it('should check wallets in parallel with Promise.allSettled', async () => {
    const wallet1 = makeWallet({ address: '0xA', chainId: 1, status: WalletStatus.DERIVED });
    const wallet2 = makeWallet({ address: '0xB', chainId: 2, status: WalletStatus.DERIVED });
    useWalletStore.setState({ wallets: [wallet1, wallet2] });

    mockCheckDeployed.mockResolvedValue(true);

    await syncWalletDeploymentStatus([wallet1, wallet2]);

    expect(mockCheckDeployed).toHaveBeenCalledTimes(2);
    expect(mockCheckDeployed).toHaveBeenCalledWith('0xA', 1);
    expect(mockCheckDeployed).toHaveBeenCalledWith('0xB', 2);
  });
});
