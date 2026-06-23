export interface ChainConfig {
  chainId: number;
  name: string;
  displayName: string;
  rpcUrl: string;
  explorerUrl: string;
  isTestnet: boolean;
  isEnabled: boolean;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export const SUPPORTED_CHAINS: ChainConfig[] = [
  {
    chainId: 84532,
    name: 'base-sepolia',
    displayName: 'Base Sepolia',
    rpcUrl: 'https://sepolia.base.org',
    explorerUrl: 'https://sepolia.basescan.org',
    isTestnet: true,
    isEnabled: true,
    nativeCurrency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
    },
  },
];

export function getEnabledChains(): ChainConfig[] {
  return SUPPORTED_CHAINS.filter((chain) => chain.isEnabled);
}

export function getAllChains(): ChainConfig[] {
  return SUPPORTED_CHAINS;
}

export function getChainById(chainId: number): ChainConfig | undefined {
  return SUPPORTED_CHAINS.find((chain) => chain.chainId === chainId);
}

export function getChainByName(name: string): ChainConfig | undefined {
  return SUPPORTED_CHAINS.find((chain) => chain.name === name);
}

export function isChainEnabled(chainId: number): boolean {
  const chain = getChainById(chainId);
  return chain?.isEnabled ?? false;
}

export function getDefaultChain(): ChainConfig {
  return SUPPORTED_CHAINS[0];
}

export function getExplorerTxUrl(chainId: number, txHash: string): string | undefined {
  const chain = getChainById(chainId);
  if (!chain) return undefined;
  return `${chain.explorerUrl}/tx/${txHash}`;
}

export function getExplorerAddressUrl(chainId: number, address: string): string | undefined {
  const chain = getChainById(chainId);
  if (!chain) return undefined;
  return `${chain.explorerUrl}/address/${address}`;
}
