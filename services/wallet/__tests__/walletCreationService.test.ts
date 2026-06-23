/**
 * AC-2 / AC-11 silent-brick guards for genesis wallet creation.
 *
 * AC-2: deriveWalletAddress() and deployWallet() MUST build the ZkapCreator from
 *       byte-identical (salt, encodedMasterKey, encodedTxKey). Both now route
 *       through the shared buildGenesisInputs() helper; these tests pin that the
 *       helper is deterministic, that salt === computeDeterministicSalt(canonicalAud,
 *       sub) (NOT a random getOrCreateSalt salt), and that deriveWalletAddress feeds
 *       exactly the helper's triple into ZkapCreator.
 *
 * AC-11: the genesis 3-of-3 masterKey's hAudList MUST equal the value the recovery
 *        proof path uses — nativeGenerateAudHash(CIRCUIT_CONFIGS['3-of-3'],
 *        [canonicalAud]).hAudList. A mismatch bricks recovery permanently (AA23).
 */

// ── Mocks ────────────────────────────────────────────────────────

// Capture ZkapCreator constructor args + AccountKeyBuilder keyData so the test can
// inspect exactly what went into the CREATE2 inputs.
const mockZkapCreatorCtor = jest.fn();
const mockDeriveZkapAddress = jest.fn().mockResolvedValue('0xDerivedAddress');
const mockGetEncodedKey = jest.fn();

jest.mock('@baerae/zkap-aa', () => {
  const PrimitiveAccountKeyTypes = { keyWebAuthn: 1, keyZkOAuthRS256: 2 };
  return {
    PrimitiveAccountKeyTypes,
    ZkapCreator: jest.fn().mockImplementation((info: any) => {
      mockZkapCreatorCtor(info);
      return { deriveZkapAddress: mockDeriveZkapAddress };
    }),
    // Encode the keyData deterministically so identical inputs -> identical string,
    // and so the test can read back the hAudList that was embedded.
    AccountKeyBuilder: jest.fn().mockImplementation((_threshold: number, keys: any[]) => ({
      getEncodedKey: () => {
        mockGetEncodedKey(keys);
        return 'enc:' + JSON.stringify(keys);
      },
    })),
    PasskeySigner: jest.fn(),
  };
});

const mockGenerateAudHash = jest.fn();
jest.mock('@baerae/zkap-zkp', () => ({
  generateAudHash: (...args: any[]) => mockGenerateAudHash(...args),
}));

jest.mock('@/libs/wallet/providerConfigHelper', () => ({
  initProviderConfig: jest.fn().mockResolvedValue(undefined),
  getCanonicalClientId: jest.fn(),
}));

jest.mock('@/libs/wallet/webAuthnUtils', () => ({
  getRpIdHash: jest.fn().mockReturnValue('0xRpIdHash'),
  getOrigin: jest.fn().mockReturnValue('https://example.test'),
}));

jest.mock('../../api/zkp', () => ({
  computeAnchor: jest.fn(),
  buildSecretsFromRecoveryAccounts: jest.fn().mockReturnValue([]),
}));

jest.mock('@/libs/passkey/passkeyStore', () => ({
  getStoredPasskey: jest.fn(),
}));

jest.mock('@/libs/recovery/recoveryAccountStore', () => ({
  getRecoveryAccountsByChain: jest.fn(),
}));

jest.mock('../../chains/chainConfigService', () => ({
  getChainConfig: jest.fn(),
  refreshChainConfig: jest.fn(),
}));

import {
  buildGenesisInputs,
  deriveWalletAddress,
  buildEncodedTxKeyFromPasskey,
} from '../walletCreationService';
import { computeDeterministicSalt } from '@/libs/wallet/saltManager';
import { getCanonicalClientId } from '@/libs/wallet/providerConfigHelper';
import { generateAudHash } from '@baerae/zkap-zkp';
import { CIRCUIT_CONFIGS } from '@/services/zkNative/circuitConfigs';
import { computeAnchor } from '../../api/zkp';
import { getStoredPasskey } from '@/libs/passkey/passkeyStore';
import { getRecoveryAccountsByChain } from '@/libs/recovery/recoveryAccountStore';
import { getChainConfig } from '../../chains/chainConfigService';
import type { RecoveryAccount } from '@/libs/recovery/recoveryAccountStore';
import type { StoredPasskey } from '@/libs/passkey/passkeyStore';
import type { ChainConfig } from '../../chains/chainConfigService';

const mockGetCanonicalClientId = getCanonicalClientId as jest.MockedFunction<typeof getCanonicalClientId>;
const mockComputeAnchor = computeAnchor as jest.MockedFunction<typeof computeAnchor>;
const mockGetStoredPasskey = getStoredPasskey as jest.MockedFunction<typeof getStoredPasskey>;
const mockGetRecoveryAccountsByChain = getRecoveryAccountsByChain as jest.MockedFunction<typeof getRecoveryAccountsByChain>;
const mockGetChainConfig = getChainConfig as jest.MockedFunction<typeof getChainConfig>;

// ── Fixtures ─────────────────────────────────────────────────────

const CANONICAL_AUD = 'canonical-google-client-id';
const HAUD_LIST = '0xdeadbeefAudHash';
const CHAIN_ID = 84532;

const mainAccount: RecoveryAccount = {
  provider: 'google' as any,
  iss: 'https://accounts.google.com',
  sub: 'google-sub-123',
  aud: 'raw-jwt-aud',
  identifier: 'user@gmail.com',
  isDefault: true,
};

const recoveryAccounts: RecoveryAccount[] = [mainAccount];

const passkey: StoredPasskey = {
  credentialId: 'cred-id-abc',
  publicKey: { x: '0x01', y: '0x02' } as any,
  credentialPubkeyCose: '0xCOSEpubkey',
};

const chainConfig = {
  rpcUrl: 'http://localhost:8545',
  chainId: CHAIN_ID,
  contracts: {
    entryPoint: '0xEntryPoint',
    zkapFactory: '0xFactory',
    zkOAuthVerifier3of3: '0xVerifier3of3',
    webAuthnImpl: '0xWebAuthnImpl',
    merkleTreeDirectory: '0xMerkleTree',
  },
} as unknown as ChainConfig;

const anchor3of3 = ['111', '222', '333'];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCanonicalClientId.mockReturnValue(CANONICAL_AUD);
  mockGenerateAudHash.mockResolvedValue({ hAudList: HAUD_LIST });
  mockComputeAnchor.mockResolvedValue(anchor3of3);
  mockGetStoredPasskey.mockResolvedValue(passkey);
  mockGetRecoveryAccountsByChain.mockResolvedValue(recoveryAccounts);
  mockGetChainConfig.mockResolvedValue(chainConfig);
  mockDeriveZkapAddress.mockResolvedValue('0xDerivedAddress');
});

// ── AC-2: identical, deterministic genesis inputs ────────────────

describe('buildGenesisInputs (AC-2)', () => {
  it('uses salt = computeDeterministicSalt(canonicalAud, sub) — not a random salt', async () => {
    const { salt } = await buildGenesisInputs({ mainAccount, passkey, chainConfig, anchor3of3 });

    const expectedSalt = computeDeterministicSalt(CANONICAL_AUD, mainAccount.sub);
    expect(salt).toBe(expectedSalt);
    // Deterministic salts are not 32-byte-random; re-deriving yields the same value.
    expect(salt).toBe(computeDeterministicSalt(CANONICAL_AUD, mainAccount.sub));
  });

  it('is deterministic: same inputs -> byte-identical triple', async () => {
    const a = await buildGenesisInputs({ mainAccount, passkey, chainConfig, anchor3of3 });
    const b = await buildGenesisInputs({ mainAccount, passkey, chainConfig, anchor3of3 });

    expect(a.salt).toBe(b.salt);
    expect(a.encodedMasterKey).toBe(b.encodedMasterKey);
    expect(a.encodedTxKey).toBe(b.encodedTxKey);
  });

  it('txKey equals buildEncodedTxKeyFromPasskey(passkey, chainConfig)', async () => {
    const { encodedTxKey } = await buildGenesisInputs({ mainAccount, passkey, chainConfig, anchor3of3 });
    expect(encodedTxKey).toBe(buildEncodedTxKeyFromPasskey(passkey, chainConfig));
  });

  it('deriveWalletAddress constructs ZkapCreator with exactly the helper triple', async () => {
    const expected = await buildGenesisInputs({ mainAccount, passkey, chainConfig, anchor3of3 });

    const address = await deriveWalletAddress({ chainId: CHAIN_ID });

    expect(address).toBe('0xDerivedAddress');
    expect(mockZkapCreatorCtor).toHaveBeenCalledTimes(1);
    const ctorArg = mockZkapCreatorCtor.mock.calls[0][0];
    expect(ctorArg.salt).toBe(expected.salt);
    expect(ctorArg.encodedMasterKey).toBe(expected.encodedMasterKey);
    expect(ctorArg.encodedTxKey).toBe(expected.encodedTxKey);
    // And the salt is the deterministic one (structural proof getOrCreateSalt is unused).
    expect(ctorArg.salt).toBe(computeDeterministicSalt(CANONICAL_AUD, mainAccount.sub));
  });
});

// ── AC-11: genesis hAudList == recovery hAudList ─────────────────

describe('genesis hAudList (AC-11)', () => {
  it('embeds the same hAudList the recovery path computes', async () => {
    await buildGenesisInputs({ mainAccount, passkey, chainConfig, anchor3of3 });

    // The masterKey AccountKeyBuilder must have been given the recovery hAudList.
    const masterKeyCall = mockGetEncodedKey.mock.calls
      .map((c) => c[0])
      .find((keys) => keys?.[0]?.keyData?.hAudList !== undefined);
    expect(masterKeyCall).toBeDefined();
    expect(masterKeyCall[0].keyData.hAudList).toBe(HAUD_LIST);

    // Recovery path computes hAudList the same way; both must agree byte-for-byte.
    const recovery = await generateAudHash(CIRCUIT_CONFIGS['3-of-3'], [CANONICAL_AUD, CANONICAL_AUD, CANONICAL_AUD]);
    expect(masterKeyCall[0].keyData.hAudList).toBe(recovery.hAudList);
  });

  it('computes hAudList from the 3-of-3 circuit config and the canonical aud only', async () => {
    await buildGenesisInputs({ mainAccount, passkey, chainConfig, anchor3of3 });

    // The 3-of-3 prover builds aud_list with one entry per credential (k=3 after
    // padToThree); single-Google → [canonicalAud × 3], NOT a single-element list.
    expect(mockGenerateAudHash).toHaveBeenCalledWith(
      CIRCUIT_CONFIGS['3-of-3'],
      [CANONICAL_AUD, CANONICAL_AUD, CANONICAL_AUD],
    );
  });
});
