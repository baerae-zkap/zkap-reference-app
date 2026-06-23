const mockMasterKeyList = jest.fn();
const mockGetAnchor = jest.fn();
const mockSetSignature = jest.fn();
const mockGenerateAudHash = jest.fn();
const mockAccountKeyBuilder = jest.fn();
const mockSignWithMasterKey = jest.fn();
const mockGetChainConfig = jest.fn();
const mockSubmitUnpackedUserOp = jest.fn();
const mockWaitForConfirmation = jest.fn();
const mockGetPimlicoGasPrice = jest.fn();

const mockBuilder = {
  setSender: jest.fn(),
  setUpdateMasterKeyCallData: jest.fn(),
  autoFillUserOp: jest.fn().mockResolvedValue(undefined),
  getUserOpHash: jest.fn().mockReturnValue('0xmockUserOpHash'),
  getUserOp: jest.fn().mockReturnValue({ sender: '0xSender', preVerificationGas: '0x100' }),
  setMaxFeePerGas: jest.fn(),
  setMaxPriorityFeePerGas: jest.fn(),
  setPreVerificationGas: jest.fn(),
  setSignature: mockSetSignature,
};

jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      JsonRpcProvider: jest.fn().mockImplementation(() => ({})),
      Contract: jest.fn().mockImplementation((_address: string, abi: string[]) => {
        if (abi[0]?.includes('masterKeyList')) {
          return { masterKeyList: mockMasterKeyList };
        }
        if (abi[0]?.includes('getAnchor')) {
          return { getAnchor: mockGetAnchor };
        }
        return {};
      }),
      ZeroAddress: actual.ethers.ZeroAddress,
      AbiCoder: actual.ethers.AbiCoder,
    },
  };
});

jest.mock('@baerae/zkap-aa', () => ({
  ZkapBuilder: jest.fn().mockImplementation(() => mockBuilder),
  AccountKeyBuilder: jest.fn().mockImplementation((threshold, keys) => {
    mockAccountKeyBuilder(threshold, keys);
    return { getEncodedKey: jest.fn().mockReturnValue('0xencodedMasterKey') };
  }),
  PrimitiveAccountKeyTypes: { keyZkOAuthRS256: 2 },
}));

jest.mock('@baerae/zkap-zkp', () => ({
  generateAudHash: (...args: any[]) => mockGenerateAudHash(...args),
}));

jest.mock('@/services/api/zkp', () => ({
  computeAnchor: jest.fn().mockResolvedValue(['111', '222']),
  buildSecretsFromRecoveryAccounts: jest.fn().mockReturnValue([{ aud: 'aud', iss: 'iss', sub: 'sub' }]),
}));

jest.mock('@/services/chains/chainConfigService', () => ({
  getChainConfig: (...args: any[]) => mockGetChainConfig(...args),
}));

jest.mock('@/libs/wallet/providerConfigHelper', () => ({
  initProviderConfig: jest.fn().mockResolvedValue(undefined),
  getCanonicalClientId: jest.fn().mockReturnValue('canonical-google-client-id'),
}));

jest.mock('@/libs/utils/retry', () => ({
  withRetry: jest.fn((fn: () => any) => fn()),
}));

jest.mock('../masterKeySigningService', () => ({
  signWithMasterKey: (...args: any[]) => mockSignWithMasterKey(...args),
}));

jest.mock('../zkProofUtils', () => ({
  toUnpackedUserOp: jest.fn().mockReturnValue({ unpacked: true }),
}));

jest.mock('@/services/api/bundler', () => ({
  getPimlicoGasPrice: (...args: any[]) => mockGetPimlicoGasPrice(...args),
  bundlerApi: {
    submitUnpackedUserOp: (...args: any[]) => mockSubmitUnpackedUserOp(...args),
    waitForConfirmation: (...args: any[]) => mockWaitForConfirmation(...args),
  },
}));

import { applyRecoveryUpdate, buildEncodedMasterKey } from '../recoveryService';
import type { RecoveryAccount } from '@/libs/recovery/recoveryAccountStore';

const VERIFIER_3OF3 = '0x8213F5d4176185b6f44CCbE9C1e58B512Dc0a50E';
const VERIFIER_1OF1 = '0x249E20ad72aEd5D663940d527155AeF1E8014FD1';

const mockChainConfig = {
  chainId: 84532,
  rpcUrl: 'https://sepolia.base.org',
  contracts: {
    entryPoint: '0xEntryPoint',
    zkOAuthVerifier1of1: VERIFIER_1OF1,
    zkOAuthVerifier3of3: VERIFIER_3OF3,
    merkleTreeDirectory: '0xMerkleTree',
  },
} as any;

const googleAccount: RecoveryAccount = {
  provider: 'google',
  iss: 'accounts.google.com',
  sub: 'google-sub-1',
  aud: 'canonical-google-client-id',
  identifier: 'jaewoong@baerae.com',
  isDefault: true,
};

const google2Account: RecoveryAccount = {
  ...googleAccount,
  sub: 'google-sub-2',
  identifier: 'leejw1496@gmail.com',
  isDefault: false,
};

describe('recoveryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetChainConfig.mockResolvedValue(mockChainConfig);
    mockGenerateAudHash.mockResolvedValue({ hAudList: '0xactualAudList' });
    mockMasterKeyList.mockResolvedValue({ logic: VERIFIER_3OF3, keyId: 0n });
    mockGetAnchor.mockResolvedValue([123n, 456n]);
    mockSignWithMasterKey.mockResolvedValue({ signature: '0xsignature' });
    mockSubmitUnpackedUserOp.mockResolvedValue({ userOpHash: '0xsubmitted' });
    mockWaitForConfirmation.mockResolvedValue('0xtxHash');
    mockGetPimlicoGasPrice.mockResolvedValue({
      maxFeePerGas: '0x64',
      maxPriorityFeePerGas: '0x01',
    });
  });

  it('builds the new 3-of-3 masterKey with the SDK-computed audience list hash', async () => {
    await buildEncodedMasterKey([googleAccount], 84532);

    // 3-of-3 prover uses one aud entry per credential (k=3 after padToThree);
    // a single Google account pads to [canonicalAud × 3], not a 1-element list.
    expect(mockGenerateAudHash).toHaveBeenCalledWith(
      expect.objectContaining({ n: 3, k: 3 }),
      ['canonical-google-client-id', 'canonical-google-client-id', 'canonical-google-client-id'],
    );
    expect(mockAccountKeyBuilder).toHaveBeenCalledWith(
      1,
      [
        expect.objectContaining({
          keyData: expect.objectContaining({
            hAudList: '0xactualAudList',
          }),
        }),
      ],
    );
  });

  it('signs recovery updates with the old on-chain anchor when masterKey is 3-of-3', async () => {
    await applyRecoveryUpdate({
      chainId: 84532,
      sender: '0xSender',
      currentAccounts: [googleAccount],
      newAccounts: [googleAccount, google2Account],
    });

    expect(mockSignWithMasterKey).toHaveBeenCalledWith(
      expect.objectContaining({
        anchor: ['123', '456'],
      }),
    );
  });

  it('passes proving key network check skip through to masterKey signing', async () => {
    await applyRecoveryUpdate({
      chainId: 84532,
      sender: '0xSender',
      currentAccounts: [googleAccount],
      newAccounts: [googleAccount, google2Account],
      skipProvingKeyNetworkCheck: true,
    });

    expect(mockSignWithMasterKey).toHaveBeenCalledWith(
      expect.objectContaining({
        skipProvingKeyNetworkCheck: true,
      }),
    );
  });

  it('applies Pimlico gas price and PVG boost before computing the signed userOpHash', async () => {
    await applyRecoveryUpdate({
      chainId: 84532,
      sender: '0xSender',
      currentAccounts: [googleAccount],
      newAccounts: [googleAccount, google2Account],
    });

    expect(mockGetPimlicoGasPrice).toHaveBeenCalledWith(84532);
    expect(mockBuilder.setMaxFeePerGas).toHaveBeenCalledWith('0x64');
    expect(mockBuilder.setMaxPriorityFeePerGas).toHaveBeenCalledWith('0x01');
    expect(mockBuilder.setPreVerificationGas).toHaveBeenCalledWith('0x400');

    const pvgBoostOrder = mockBuilder.setPreVerificationGas.mock.invocationCallOrder[0];
    const userOpHashOrder = mockBuilder.getUserOpHash.mock.invocationCallOrder[0];
    expect(pvgBoostOrder).toBeLessThan(userOpHashOrder);
  });

  it('rejects unknown on-chain masterKey verifier addresses', async () => {
    mockMasterKeyList.mockResolvedValue({
      logic: '0x1111111111111111111111111111111111111111',
      keyId: 0n,
    });

    await expect(applyRecoveryUpdate({
      chainId: 84532,
      sender: '0xSender',
      currentAccounts: [googleAccount],
      newAccounts: [googleAccount, google2Account],
    })).rejects.toThrow('Unsupported masterKey verifier');

    expect(mockSignWithMasterKey).not.toHaveBeenCalled();
  });

  it('rejects 1-of-1 on-chain masterKey verifier (clean break)', async () => {
    mockMasterKeyList.mockResolvedValue({ logic: VERIFIER_1OF1, keyId: 0n });

    await expect(applyRecoveryUpdate({
      chainId: 84532,
      sender: '0xSender',
      currentAccounts: [googleAccount],
      newAccounts: [googleAccount, google2Account],
    })).rejects.toThrow('Unsupported masterKey verifier');

    expect(mockSignWithMasterKey).not.toHaveBeenCalled();
  });
});
