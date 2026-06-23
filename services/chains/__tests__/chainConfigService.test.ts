import { refreshChainConfig, getChainConfig, isChainConfigValid } from '../chainConfigService';
import { fetchGcsJson } from '@/services/api/gcsClient';
import * as SecureStore from 'expo-secure-store';
import { getChainById } from '@/libs/chains/supportedChains';

jest.mock('@/services/api/gcsClient');
jest.mock('expo-secure-store');
jest.mock('@/libs/chains/supportedChains');

const mockFetchGcsJson = fetchGcsJson as jest.MockedFunction<typeof fetchGcsJson>;
const mockGetChainById = getChainById as jest.MockedFunction<typeof getChainById>;
const mockGetItemAsync = SecureStore.getItemAsync as jest.MockedFunction<typeof SecureStore.getItemAsync>;
const mockSetItemAsync = SecureStore.setItemAsync as jest.MockedFunction<typeof SecureStore.setItemAsync>;

const mockGcsResponse = {
  chainId: 84532,
  name: 'Base Sepolia',
  isActive: true,
  explorerUrl: 'https://sepolia.basescan.org',
  contracts: {
    entryPoint: '0x1',
    zkapFactory: '0x2',
    zkapAccountImpl: '0x3',
    merkleTreeDirectory: '0x4',
    zkOAuthVerifier3of3: '0x6',
    addressKeyImpl: '0x7',
    webAuthnImpl: '0x8',
    paymaster: '0x9',
    bundler: '0xA',
  },
};

const mockSupportedChain = {
  chainId: 84532,
  rpcUrl: 'https://sepolia.base.org',
  displayName: 'Base Sepolia',
  nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
  isTestnet: true,
  isEnabled: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetChainById.mockReturnValue(mockSupportedChain as any);
});

describe('refreshChainConfig', () => {
  it('fetches from GCS and merges rpcUrl from supportedChains', async () => {
    mockFetchGcsJson.mockResolvedValue(mockGcsResponse);

    const config = await refreshChainConfig(84532);

    expect(mockFetchGcsJson).toHaveBeenCalledWith('chains/84532.json');
    expect(config.chainId).toBe(84532);
    expect(config.rpcUrl).toBe('https://sepolia.base.org');
    expect(config.contracts.entryPoint).toBe('0x1');
    expect(config.cachedAt).toBeDefined();
  });

  it('saves fetched config to SecureStore', async () => {
    mockFetchGcsJson.mockResolvedValue(mockGcsResponse);

    await refreshChainConfig(84532);

    expect(mockSetItemAsync).toHaveBeenCalledWith(
      'chain_config_84532',
      expect.stringContaining('"chainId":84532')
    );
  });

  it('throws if chain is not in supportedChains', async () => {
    mockFetchGcsJson.mockResolvedValue(mockGcsResponse);
    mockGetChainById.mockReturnValue(undefined as any);

    await expect(refreshChainConfig(9999)).rejects.toThrow('not supported');
  });

  it('falls back to expired cache when GCS fails', async () => {
    mockFetchGcsJson.mockRejectedValue(new Error('GCS fetch failed'));
    const cachedConfig = {
      ...mockGcsResponse,
      rpcUrl: 'https://old-rpc.example.com',
      cachedAt: Date.now() - 48 * 60 * 60 * 1000, // 48hr old
    };
    mockGetItemAsync.mockResolvedValue(JSON.stringify(cachedConfig));

    const config = await refreshChainConfig(84532);

    expect(config.chainId).toBe(84532);
  });

  it('throws when GCS fails and no cache exists', async () => {
    mockFetchGcsJson.mockRejectedValue(new Error('GCS fetch failed'));
    mockGetItemAsync.mockResolvedValue(null);

    await expect(refreshChainConfig(84532)).rejects.toThrow('Failed to get chain config');
  });
});

describe('isChainConfigValid', () => {
  it('returns false when cachedAt is missing', () => {
    expect(isChainConfigValid({ cachedAt: 0 } as any)).toBe(false);
  });

  it('returns false when zkOAuthVerifier3of3 is missing', () => {
    expect(isChainConfigValid({
      cachedAt: Date.now(),
      contracts: { webAuthnImpl: '0x8' },
    } as any)).toBe(false);
  });

  it('returns false when webAuthnImpl is missing', () => {
    expect(isChainConfigValid({
      cachedAt: Date.now(),
      contracts: { zkOAuthVerifier3of3: '0x6' },
    } as any)).toBe(false);
  });

  it('returns true for fresh valid config with required new-schema fields', () => {
    expect(isChainConfigValid({
      cachedAt: Date.now(),
      contracts: { zkOAuthVerifier3of3: '0x6', webAuthnImpl: '0x8' },
    } as any)).toBe(true);
  });

  it('returns false for expired config', () => {
    expect(isChainConfigValid({
      cachedAt: Date.now() - 25 * 60 * 60 * 1000,
      contracts: { zkOAuthVerifier3of3: '0x6', webAuthnImpl: '0x8' },
    } as any)).toBe(false);
  });
});
