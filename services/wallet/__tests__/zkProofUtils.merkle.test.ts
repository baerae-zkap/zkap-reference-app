// Mock native modules BEFORE any imports that transitively require them
jest.mock('expo-file-system/next', () => ({ File: jest.fn(), Directory: jest.fn(), Paths: {} }), { virtual: true });
jest.mock('expo-file-system/legacy', () => ({ downloadAsync: jest.fn(), getInfoAsync: jest.fn() }), { virtual: true });
jest.mock('expo-file-system', () => ({ downloadAsync: jest.fn(), getInfoAsync: jest.fn() }), { virtual: true });
jest.mock('expo-crypto', () => ({ getRandomBytes: jest.fn(() => new Uint8Array(31)), digestStringAsync: jest.fn() }));
jest.mock('@baerae/zkap-zkp', () => ({
  prove: jest.fn(),
  generateAnchor: jest.fn(),
}));
jest.mock('@/services/zkNative/provingKeyManager', () => ({
  ensureProvingBundle: jest.fn(),
  ensureProvingKey: jest.fn(),
  ensureWitnessGen: jest.fn().mockResolvedValue({
    witnessGenPath: '/mock/witness_gen.wasm',
    witnessGenSidecarPath: '/mock/witness_gen.json',
  }),
}));
jest.mock('@/services/zkNative/jwksService', () => ({ fetchRsaPublicKey: jest.fn() }));
jest.mock('@/services/api/gcsClient');
// '@/services/api/zkpProof' was removed with the host backend (see plan).
jest.mock('@/services/api/zkp', () => ({ computePoseidonHash: jest.fn() }));
jest.mock('@/services/auth/googleAuth', () => ({ googleSignIn: jest.fn() }));
jest.mock('@/libs/jwt/decodeIdToken', () => ({ extractJwtKid: jest.fn(), decodeIdToken: jest.fn() }));
jest.mock('@/libs/recovery/recoveryAccountStore', () => ({}));
jest.mock('@/services/chains/chainConfigService', () => ({ getChainConfig: jest.fn() }));
jest.mock('ethers', () => {
  const toBigInt = (v: any) => BigInt(v);
  return {
    ethers: {
      JsonRpcProvider: jest.fn().mockImplementation(() => ({})),
      Contract: jest.fn().mockImplementation(() => ({
        getMerklePath: jest.fn().mockResolvedValue([1n, 2n, 3n]),
        getRoot: jest.fn().mockResolvedValue(999n),
      })),
      toBigInt,
      hexlify: jest.fn(() => '0x00'),
    },
  };
});

import { collectMerkleData } from '../zkProofUtils';
import { fetchGcsJson } from '@/services/api/gcsClient';

const mockFetchGcsJson = fetchGcsJson as jest.MockedFunction<typeof fetchGcsJson>;

const mockLeavesResponse = {
  chainId: 84532,
  updatedAt: '2026-04-07T06:05:09.813Z',
  leaves: [
    { leafHash: '0xABC', leafIndex: 1, chainId: 84532, provider: 'GOOGLE', keyId: 'google-kid-1' },
    { leafHash: '0xDEF', leafIndex: 2, chainId: 84532, provider: 'KAKAO', keyId: 'kakao-kid-1' },
    { leafHash: '0x123', leafIndex: 3, chainId: 84532, provider: 'APPLE', keyId: 'apple-kid-1' },
  ],
};

const mockChainConfig = {
  chainId: 84532,
  name: 'Base Sepolia',
  isActive: true,
  rpcUrl: 'https://sepolia.base.org',
  contracts: {
    merkleTreeDirectory: '0xMerkleDir',
    entryPoint: '0x1',
    zkapFactory: '0x2',
    zkapAccountImpl: '0x3',
    zkOAuthVerifier3of3: '0x6',
    addressKeyImpl: '0x7',
    webAuthnImpl: '0x8',
    paymaster: '0x9',
    bundler: '0xA',
  },
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('collectMerkleData - GCS leaf filtering', () => {
  it('fetches leaves from GCS and filters by provider + keyId', async () => {
    mockFetchGcsJson.mockResolvedValue(mockLeavesResponse);

    const result = await collectMerkleData(
      ['google-kid-1'],
      ['google'],
      84532,
      mockChainConfig as any
    );

    expect(mockFetchGcsJson).toHaveBeenCalledWith('merkle/84532.json');
    expect(result.leafIndices).toEqual([1]);
  });

  it('handles multiple kids from different providers', async () => {
    mockFetchGcsJson.mockResolvedValue(mockLeavesResponse);

    const result = await collectMerkleData(
      ['google-kid-1', 'kakao-kid-1', 'apple-kid-1'],
      ['google', 'kakao', 'apple'],
      84532,
      mockChainConfig as any
    );

    expect(result.leafIndices).toEqual([1, 2, 3]);
  });

  it('throws descriptive error when leaf not found', async () => {
    mockFetchGcsJson.mockResolvedValue(mockLeavesResponse);

    await expect(
      collectMerkleData(
        ['nonexistent-kid'],
        ['google'],
        84532,
        mockChainConfig as any
      )
    ).rejects.toThrow('Merkle leaf not found: provider=GOOGLE, kid=nonexistent-kid, chainId=84532');
  });

  it('uses in-memory cache on second call within TTL', async () => {
    const chain8216Response = {
      ...mockLeavesResponse,
      chainId: 84532,
      leaves: mockLeavesResponse.leaves.map(l => ({ ...l, chainId: 84532 })),
    };
    const chain8216Config = { ...mockChainConfig, chainId: 84532 };
    mockFetchGcsJson.mockResolvedValue(chain8216Response);

    await collectMerkleData(['google-kid-1'], ['google'], 84532, chain8216Config as any);
    mockFetchGcsJson.mockClear();
    await collectMerkleData(['kakao-kid-1'], ['kakao'], 84532, chain8216Config as any);

    // Second call should use cache, not fetch again
    expect(mockFetchGcsJson).toHaveBeenCalledTimes(0);
  });
});
