import * as SecureStore from 'expo-secure-store';
import { getChainById } from '@/libs/chains/supportedChains';
import { fetchGcsJson } from '@/services/api/gcsClient';

const CACHE_PREFIX = 'chain_config_';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export interface ChainContracts {
  entryPoint: string;
  zkapFactory: string;
  zkapAccountImpl: string;
  merkleTreeDirectory: string;
  zkOAuthVerifier3of3: string;
  addressKeyImpl: string;
  webAuthnImpl: string;
  paymaster: string;
  bundler: string;
}

export interface ChainConfig {
  chainId: number;
  name: string;
  isActive: boolean;
  explorerUrl?: string;
  contracts: ChainContracts;
  rpcUrl: string;
  cachedAt?: number;
}

interface CachedChainConfig extends ChainConfig {
  cachedAt: number;
}

/**
 * Get chain configuration from cache or API
 */
export async function getChainConfig(chainId: number): Promise<ChainConfig> {
  // Try to load from cache first
  const cached = await loadFromCache(chainId);

  if (cached && isChainConfigValid(cached)) {
    // Always use the latest RPC URL from supportedChains (env may change)
    const supportedChain = getChainById(chainId);
    if (supportedChain) {
      cached.rpcUrl = supportedChain.rpcUrl;
    }
    return cached;
  }

  // Fetch from API
  return refreshChainConfig(chainId);
}

/**
 * Force refresh chain configuration from API
 */
export async function refreshChainConfig(chainId: number): Promise<ChainConfig> {
  try {
    const data = await fetchGcsJson<{
      chainId: number;
      name: string;
      isActive: boolean;
      explorerUrl?: string;
      contracts: ChainContracts;
    }>(`chains/${chainId}.json`);

    // Get RPC URL from supportedChains
    const supportedChain = getChainById(chainId);
    if (!supportedChain) {
      throw new Error(`Chain ${chainId} is not supported`);
    }

    const config: ChainConfig = {
      ...data,
      rpcUrl: supportedChain.rpcUrl,
      cachedAt: Date.now(),
    };

    // Save to cache
    await saveToCache(chainId, config);

    return config;
  } catch (error) {
    // If API fails, try to use expired cache
    const cached = await loadFromCache(chainId);
    if (cached) {
      console.warn(`API failed, using expired cache for chain ${chainId}`);
      return cached;
    }

    throw new Error(`Failed to get chain config for ${chainId}: ${error}`);
  }
}

/**
 * Check if cached config is still valid
 */
export function isChainConfigValid(config: CachedChainConfig): boolean {
  if (!config.cachedAt) return false;
  // Invalidate cache if schema is outdated (missing required new-schema fields)
  if (!config.contracts?.zkOAuthVerifier3of3 || !config.contracts?.webAuthnImpl) return false;
  return Date.now() - config.cachedAt < CACHE_TTL;
}

async function loadFromCache(chainId: number): Promise<CachedChainConfig | null> {
  try {
    const key = `${CACHE_PREFIX}${chainId}`;
    const data = await SecureStore.getItemAsync(key);

    if (!data) return null;

    return JSON.parse(data) as CachedChainConfig;
  } catch (error) {
    console.error('Failed to load chain config from cache:', error);
    return null;
  }
}

async function saveToCache(chainId: number, config: ChainConfig): Promise<void> {
  try {
    const key = `${CACHE_PREFIX}${chainId}`;
    await SecureStore.setItemAsync(key, JSON.stringify(config));
  } catch (error) {
    console.error('Failed to save chain config to cache:', error);
  }
}
