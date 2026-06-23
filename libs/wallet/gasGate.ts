import { ethers } from 'ethers';

/**
 * Native-token (Base Sepolia ETH) buffer required to submit a UserOp.
 * This reference app has no paymaster, so recovery-update (④) and passkey-reset
 * (⑤) both spend the user's own gas. We gate entry to those flows on this buffer.
 */
export const GAS_BUFFER_ETH = 0.0001;

// ethers v6 `formatEther` always produces a plain decimal string with a dot and
// at least one fractional digit (e.g. '0.0', '1.0'). We accept exactly that
// shape and fail-closed on anything else.
const NUMERIC_BALANCE_RE = /^\d+(\.\d+)?$/;

/**
 * Returns `true` when `balance` is known to be below the gas-buffer threshold.
 *
 * Semantics:
 *  - `null` → loading or fetch error → `false` (do NOT gate; let the action
 *    proceed so a transient balance fetch failure never blocks the user).
 *  - Non-numeric / malformed string → `true` (FAIL CLOSED — protect the user).
 *  - Numeric string → strict `parseEther` compare against the threshold.
 */
export function isInsufficientForGas(
  balance: string | null,
  thresholdEth: number = GAS_BUFFER_ETH,
): boolean {
  if (balance == null) return false;
  if (!NUMERIC_BALANCE_RE.test(balance)) return true;
  try {
    const have = ethers.parseEther(balance);
    const need = ethers.parseEther(thresholdEth.toString());
    return have < need;
  } catch {
    return true;
  }
}
