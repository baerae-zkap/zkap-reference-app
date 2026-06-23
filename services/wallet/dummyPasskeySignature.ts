import { ethers } from 'ethers';

/**
 * Build a Passkey-shaped dummy signature so SDK.autoFillUserOp() can estimate
 * preVerificationGas with realistic calldata size.
 *
 * Why this matters:
 *   ERC-4337 bundlers compute preVerificationGas from the serialized userOp's
 *   calldata length (it pays for the L1/sequencer to ingest the bytes). If we
 *   leave `signature = '0x'` while estimating, the SDK reports a PVG that
 *   covers a much smaller userOp than what we actually submit, and the
 *   bundler rejects with `preVerificationGas is not enough, required: X,
 *   got: Y` (the gap is roughly the size of authenticatorData + clientDataJSON
 *   + r/s).
 *
 * Produces the same fixed-size placeholder the real WebAuthn path would, so
 * preVerificationGas is estimated against matching calldata size (matching PVG).
 *
 * NOTE on random bytes:
 *   This signature is never verified — it exists only to pad the calldata
 *   during gas estimation. We do NOT need cryptographic randomness, so we
 *   use a fixed hex pattern instead of `ethers.randomBytes(...)`. ethers v6
 *   throws `UNSUPPORTED_OPERATION` ("platform does not support secure random
 *   numbers") in React Native because Hermes lacks the crypto fallback ethers
 *   reaches for, and pulling in `react-native-get-random-values` just to fill
 *   bytes that go straight into a discarded gas estimate is wasteful.
 */
const DUMMY_BYTES_200_HEX = '0x' + 'ab'.repeat(200);

export function createDummyPasskeySignature(): { keyIndexList: number[]; keySignatureList: string[] } {
  const dummySig = ethers.AbiCoder.defaultAbiCoder().encode(
    ['bytes', 'bytes', 'uint256', 'uint256'],
    [
      DUMMY_BYTES_200_HEX, // authenticatorData (padding)
      DUMMY_BYTES_200_HEX, // clientDataJSON (padding)
      ethers.MaxUint256, // r
      ethers.MaxUint256, // s
    ],
  );

  return {
    keyIndexList: [0],
    keySignatureList: [dummySig],
  };
}
