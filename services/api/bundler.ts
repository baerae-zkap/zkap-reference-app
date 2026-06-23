import { ethers } from 'ethers';
import { BundlerClient, Erc4337BundlerProvider } from '@baerae/zkap-aa';
import { getChainConfig } from '../chains/chainConfigService';

// PackedUserOperation format (ERC-4337 v0.7)
export interface PackedUserOperation {
  sender: string;
  nonce: string;
  initCode: string;
  callData: string;
  accountGasLimits: string; // bytes32: verificationGasLimit (16 bytes) + callGasLimit (16 bytes)
  preVerificationGas: string;
  gasFees: string; // bytes32: maxPriorityFeePerGas (16 bytes) + maxFeePerGas (16 bytes)
  paymasterAndData: string;
  signature: string;
}

// Unpacked UserOperation format (what SDK returns)
export interface UnpackedUserOperation {
  sender: string;
  nonce: string;
  initCode?: string;
  callData: string;
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  paymaster?: string;
  paymasterVerificationGasLimit?: string;
  paymasterPostOpGasLimit?: string;
  paymasterData?: string;
  signature: string;
}

export interface SubmitUserOpResult {
  userOpHash: string;
}

export interface BundlerTxStatusResponse {
  status: 'PENDING' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED';
  bundleHash?: string;
  errorReason?: string;
}

function extractTransactionHash(receipt: unknown): string | null {
  if (!receipt || typeof receipt !== 'object') return null;

  const record = receipt as Record<string, unknown>;
  const direct =
    typeof record.txHash === 'string'
      ? record.txHash
      : typeof record.transactionHash === 'string'
        ? record.transactionHash
        : null;
  if (direct) return direct;

  const nested = record.receipt;
  if (nested && typeof nested === 'object') {
    const nestedRecord = nested as Record<string, unknown>;
    if (typeof nestedRecord.txHash === 'string') return nestedRecord.txHash;
    if (typeof nestedRecord.transactionHash === 'string') return nestedRecord.transactionHash;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Pimlico bundler — host now talks directly to Pimlico, no host backend involved.
// ---------------------------------------------------------------------------

const PIMLICO_PUBLIC_URL = 'https://public.pimlico.io/v2';

export function getPimlicoBundlerUrl(chainId: number): string {
  return `${PIMLICO_PUBLIC_URL}/${chainId}/rpc`;
}

const pimlicoClients = new Map<number, BundlerClient>();

function getPimlicoClient(chainId: number): BundlerClient {
  const url = getPimlicoBundlerUrl(chainId);
  let client = pimlicoClients.get(chainId);
  if (!client) {
    const provider = new Erc4337BundlerProvider({ rpcUrl: url, usePimlicoFormat: true });
    client = new BundlerClient(provider);
    pimlicoClients.set(chainId, client);
  }
  return client;
}

// ---------------------------------------------------------------------------
// Pimlico-native gas price (ZKAP validators are incompatible with Pimlico's
// eth_estimateUserOperationGas — caller must apply a PVG safety multiplier).
// ---------------------------------------------------------------------------

export interface PimlicoGasPrice {
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}

interface PimlicoGasPriceResponse {
  slow: PimlicoGasPrice;
  standard: PimlicoGasPrice;
  fast: PimlicoGasPrice;
}

function normalizeHex(hex: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const padded = clean.length % 2 === 0 ? clean : '0' + clean;
  return '0x' + padded;
}

export async function getPimlicoGasPrice(chainId: number): Promise<PimlicoGasPrice | null> {
  const url = getPimlicoBundlerUrl(chainId);
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'pimlico_getUserOperationGasPrice',
        params: [],
      }),
    });
    const json = (await res.json()) as { result?: PimlicoGasPriceResponse; error?: { message: string } };
    if (json.error) {
      console.warn('[Pimlico] Gas price fetch failed:', json.error.message);
      return null;
    }
    const result = json.result;
    if (!result) return null;
    return {
      maxFeePerGas: normalizeHex(result.fast.maxFeePerGas),
      maxPriorityFeePerGas: normalizeHex(result.fast.maxPriorityFeePerGas),
    };
  } catch (err) {
    console.warn('[Pimlico] Gas price fetch error:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// UserOp packing (ERC-4337 v0.7)
// ---------------------------------------------------------------------------

export function packUserOperation(unpacked: UnpackedUserOperation): PackedUserOperation {
  const padTo16Bytes = (hex: string): string => {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    return cleanHex.padStart(32, '0');
  };

  const verificationGasLimit = padTo16Bytes(unpacked.verificationGasLimit);
  const callGasLimit = padTo16Bytes(unpacked.callGasLimit);
  const accountGasLimits = '0x' + verificationGasLimit + callGasLimit;

  const maxPriorityFeePerGas = padTo16Bytes(unpacked.maxPriorityFeePerGas);
  const maxFeePerGas = padTo16Bytes(unpacked.maxFeePerGas);
  const gasFees = '0x' + maxPriorityFeePerGas + maxFeePerGas;

  let paymasterAndData = '0x';
  const paymaster = unpacked.paymaster || '0x0000000000000000000000000000000000000000';

  if (paymaster !== '0x0000000000000000000000000000000000000000' && paymaster !== '0x') {
    const paymasterAddress = paymaster.slice(2).padStart(40, '0');
    const paymasterVerificationGasLimit = padTo16Bytes(unpacked.paymasterVerificationGasLimit || '0x0');
    const paymasterPostOpGasLimit = padTo16Bytes(unpacked.paymasterPostOpGasLimit || '0x0');
    const paymasterData = (unpacked.paymasterData || '0x').slice(2);
    paymasterAndData = '0x' + paymasterAddress + paymasterVerificationGasLimit + paymasterPostOpGasLimit + paymasterData;
  }

  return {
    sender: unpacked.sender,
    nonce: unpacked.nonce,
    initCode: unpacked.initCode || '0x',
    callData: unpacked.callData,
    accountGasLimits,
    preVerificationGas: unpacked.preVerificationGas,
    gasFees,
    paymasterAndData,
    signature: unpacked.signature,
  };
}

// ---------------------------------------------------------------------------
// Public bundler API — same surface as before, now Pimlico-direct.
// ---------------------------------------------------------------------------

export const bundlerApi = {
  async submitUserOpDirect(
    chainId: number,
    userOp: PackedUserOperation
  ): Promise<SubmitUserOpResult> {
    const client = getPimlicoClient(chainId);
    const chainConfig = await getChainConfig(chainId);
    const userOpHash = await client.submitUserOp(userOp, chainConfig.contracts.entryPoint);
    return { userOpHash };
  },

  async submitUnpackedUserOp(
    chainId: number,
    unpackedUserOp: UnpackedUserOperation
  ): Promise<SubmitUserOpResult> {
    const packed = packUserOperation(unpackedUserOp);
    return this.submitUserOpDirect(chainId, packed);
  },

  async getUserOpStatus(
    userOpHash: string,
    chainId: number
  ): Promise<BundlerTxStatusResponse> {
    const client = getPimlicoClient(chainId);
    try {
      const status = await client.getStatus(userOpHash);
      if (status === 'included') {
        // Need a real txHash for callers — use waitForReceipt with a tight timeout
        // since we just confirmed inclusion.
        try {
          const receipt = await client.waitForReceipt(userOpHash, { timeout: 2000, pollInterval: 250 });
          return { status: 'CONFIRMED', bundleHash: extractTransactionHash(receipt) ?? undefined };
        } catch {
          return { status: 'CONFIRMED' };
        }
      }
      if (status === 'failed') return { status: 'FAILED' };
      return { status: 'PENDING' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: 'FAILED', errorReason: message };
    }
  },

  async waitForConfirmation(
    userOpHash: string,
    chainId: number,
    timeoutMs: number = 60000,
    pollIntervalMs: number = 4000,
  ): Promise<string> {
    const client = getPimlicoClient(chainId);
    try {
      const receipt = await client.waitForReceipt(userOpHash, {
        timeout: timeoutMs,
        pollInterval: pollIntervalMs,
      });
      return extractTransactionHash(receipt) ?? '';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const decoded = decodeFailedOp(message);
      throw new Error(`UserOp failed: ${decoded ?? message}`);
    }
  },
};

// Decode common ERC-4337 revert reasons (FailedOp / FailedOpWithRevert)
function decodeFailedOp(reason: string): string | null {
  // FailedOpWithRevert(uint256, string, bytes) = 0x65c8fd4d
  const revertMatch = reason.match(/0x65c8fd4d([0-9a-fA-F]+)/);
  if (revertMatch) {
    try {
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        ['uint256', 'string', 'bytes'],
        '0x' + revertMatch[1],
      );
      return decoded[1] as string;
    } catch { /* ignore */ }
  }
  // FailedOp(uint256, string) = 0x220266b6
  const failedOpMatch = reason.match(/0x220266b6([0-9a-fA-F]+)/);
  if (failedOpMatch) {
    try {
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        ['uint256', 'string'],
        '0x' + failedOpMatch[1],
      );
      return decoded[1] as string;
    } catch { /* ignore */ }
  }
  return null;
}
