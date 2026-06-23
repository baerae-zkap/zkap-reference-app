import {
  SUPPORTED_CHAINS,
  getEnabledChains,
  getAllChains,
  getChainById,
  getChainByName,
  isChainEnabled,
  getDefaultChain,
  getExplorerTxUrl,
  getExplorerAddressUrl,
} from '../supportedChains';

describe('SUPPORTED_CHAINS', () => {
  it('contains exactly one chain (Base Sepolia)', () => {
    expect(SUPPORTED_CHAINS).toHaveLength(1);
    expect(SUPPORTED_CHAINS[0].chainId).toBe(84532);
  });

  it('Base Sepolia entry has expected fields', () => {
    const base = SUPPORTED_CHAINS[0];
    expect(base.name).toBe('base-sepolia');
    expect(base.displayName).toBe('Base Sepolia');
    expect(base.rpcUrl).toBe('https://sepolia.base.org');
    expect(base.explorerUrl).toBe('https://sepolia.basescan.org');
    expect(base.isTestnet).toBe(true);
    expect(base.isEnabled).toBe(true);
    expect(base.nativeCurrency).toEqual({ name: 'Ethereum', symbol: 'ETH', decimals: 18 });
  });
});

describe('getEnabledChains', () => {
  it('returns the single Base Sepolia entry', () => {
    const enabled = getEnabledChains();
    expect(enabled).toHaveLength(1);
    expect(enabled[0].chainId).toBe(84532);
  });
});

describe('getAllChains', () => {
  it('returns the single Base Sepolia entry', () => {
    const all = getAllChains();
    expect(all).toHaveLength(1);
    expect(all[0].chainId).toBe(84532);
  });
});

describe('getChainById', () => {
  it('returns Base Sepolia for chainId 84532', () => {
    const chain = getChainById(84532);
    expect(chain).toBeDefined();
    expect(chain?.name).toBe('base-sepolia');
  });

  it('returns undefined for unknown chainId', () => {
    expect(getChainById(9999)).toBeUndefined();
  });
});

describe('getChainByName', () => {
  it('returns Base Sepolia for "base-sepolia"', () => {
    const chain = getChainByName('base-sepolia');
    expect(chain).toBeDefined();
    expect(chain?.chainId).toBe(84532);
  });

  it('returns undefined for unknown name', () => {
    expect(getChainByName('nonexistent')).toBeUndefined();
  });
});

describe('isChainEnabled', () => {
  it('returns true for Base Sepolia', () => {
    expect(isChainEnabled(84532)).toBe(true);
  });

  it('returns false for unknown chainId', () => {
    expect(isChainEnabled(9999)).toBe(false);
  });
});

describe('getDefaultChain', () => {
  it('returns Base Sepolia', () => {
    const defaultChain = getDefaultChain();
    expect(defaultChain.chainId).toBe(84532);
  });
});

describe('getExplorerTxUrl', () => {
  it('builds a tx URL for Base Sepolia', () => {
    const txHash = '0xabc';
    const url = getExplorerTxUrl(84532, txHash);
    expect(url).toBe('https://sepolia.basescan.org/tx/0xabc');
  });

  it('returns undefined for unknown chainId', () => {
    expect(getExplorerTxUrl(9999, '0xabc')).toBeUndefined();
  });
});

describe('getExplorerAddressUrl', () => {
  it('builds an address URL for Base Sepolia', () => {
    const address = '0xdef';
    const url = getExplorerAddressUrl(84532, address);
    expect(url).toBe('https://sepolia.basescan.org/address/0xdef');
  });

  it('returns undefined for unknown chainId', () => {
    expect(getExplorerAddressUrl(9999, '0xdef')).toBeUndefined();
  });
});
