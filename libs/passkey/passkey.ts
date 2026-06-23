import { base64URLencode, base64URLtoArrayBuffer } from '@/libs/base64/base64';
import { requireRpId } from '@/libs/wallet/webAuthnUtils';
import * as Crypto from 'expo-crypto';
import { BytesLike, ethers } from 'ethers';
import CBOR from 'cbor-js';

// CBOR decoded structure types
type AttestationObject = {
  authData: ArrayBuffer;
  fmt: string;
  attStmt: Record<string, unknown>;
};

type CoseKey = {
  [-2]: ArrayBuffer;
  [-3]: ArrayBuffer;
  [key: number]: unknown;
};

// Types for passkey operations
type PasskeyCreateRequest = {
  challenge: string;
  rp: { id?: string; name?: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: { type: string; alg: number }[];
  timeout?: number;
  excludeCredentials?: { type: string; id: string }[];
  authenticatorSelection?: {
    requireResidentKey?: boolean;
    residentKey?: string;
    userVerification?: string;
  };
  attestation?: string;
};

type PasskeyCreateResult = {
  id: string;
  rawId: string;
  response: {
    clientDataJSON: string;
    attestationObject: string;
  };
  type: string;
};

type PasskeyGetRequest = {
  challenge: string;
  allowCredentials?: { type: string; id: string }[];
  timeout?: number;
  rpId?: string;
};

type PasskeyGetResult = {
  id: string;
  rawId: string;
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
  };
  type: string;
};

let PasskeyModule: {
  create: (request: PasskeyCreateRequest) => Promise<PasskeyCreateResult>;
  get: (request: PasskeyGetRequest) => Promise<PasskeyGetResult>;
} | null = null;

try {
  PasskeyModule = require('react-native-passkey').Passkey;
} catch (e) {
  console.warn('react-native-passkey not available:', e);
}

function genPasskeyRegistrationOptions({
  challenge,
  nickname,
}: {
  challenge: string;
  nickname: string;
}): PasskeyCreateRequest {
  return {
    challenge,
    rp: {
      id: requireRpId(),
      name: process.env.EXPO_PUBLIC_RP_NAME,
    },
    user: {
      id: base64URLencode(nickname),
      name: nickname,
      displayName: '',
    },
    pubKeyCredParams: [
      {
        type: 'public-key',
        alg: -7, // ES256 (-7) MUST specify P-256 (1)
      },
    ],
    timeout: 60000,
    excludeCredentials: [],
    authenticatorSelection: {
      requireResidentKey: true,
      residentKey: 'required',
      userVerification: 'preferred',
    },
    attestation: 'none',
  };
}

function genGetPasskeyOptions({
  challenge,
  credentialId,
}: {
  challenge: string;
  credentialId: string;
}): PasskeyGetRequest {
  return {
    challenge,
    allowCredentials: [
      {
        type: 'public-key',
        id: credentialId,
      },
    ],
    timeout: 60000,
    rpId: requireRpId(),
  };
}

/**
 * Parse authenticator data to extract the credential public key CBOR bytes.
 *
 * authData structure:
 * - rpIdHash: 32 bytes
 * - flags: 1 byte
 * - signCount: 4 bytes
 * - attestedCredentialData (if flags & 0x40):
 *   - aaguid: 16 bytes
 *   - credentialIdLength: 2 bytes (big endian)
 *   - credentialId: credentialIdLength bytes
 *   - credentialPublicKey: remaining bytes (COSE format)
 */
function extractCredentialPublicKeyBytes(authData: Uint8Array): Uint8Array {
  let offset = 32 + 1 + 4 + 16; // rpIdHash + flags + signCount + aaguid
  const credentialIdLength = (authData[offset] << 8) | authData[offset + 1];
  offset += 2 + credentialIdLength;
  return authData.slice(offset);
}

/**
 * Extract public key (x, y) from attestationObject
 *
 * attestationObject structure:
 * - CBOR map with authData field
 * - authData contains credentialPublicKey in COSE format
 * - COSE Key has x (-2) and y (-3) coordinates
 */
function extractPublicKeyFromAttestation(attestationObjectBase64: string): {
  x: Uint8Array;
  y: Uint8Array;
} {
  const attestationBuffer = base64URLtoArrayBuffer(attestationObjectBase64);
  const attestationObject = CBOR.decode(attestationBuffer) as AttestationObject;
  const authData = new Uint8Array(attestationObject.authData);

  const credentialPublicKeyBytes = extractCredentialPublicKeyBytes(authData);

  // COSE Key structure for EC2 (P-256):
  // 1 (kty): 2 (EC2)
  // 3 (alg): -7 (ES256)
  // -1 (crv): 1 (P-256)
  // -2 (x): 32 bytes
  // -3 (y): 32 bytes
  const coseKey = CBOR.decode(credentialPublicKeyBytes.buffer as ArrayBuffer) as CoseKey;

  const x = new Uint8Array(coseKey[-2]);
  const y = new Uint8Array(coseKey[-3]);

  return { x, y };
}

/**
 * Extract COSE-encoded public key from attestationObject
 * Returns the raw COSE key bytes as hex string for SDK WebAuthn key registration
 */
function extractCosePublicKey(attestationObjectBase64: string): string {
  const attestationBuffer = base64URLtoArrayBuffer(attestationObjectBase64);
  const attestationObject = CBOR.decode(attestationBuffer) as AttestationObject;
  const authData = new Uint8Array(attestationObject.authData);

  const credentialPublicKeyBytes = extractCredentialPublicKeyBytes(authData);
  return ethers.hexlify(credentialPublicKeyBytes);
}

export type PublicKeyCoordinates = {
  x: string; // hex string (32 bytes)
  y: string; // hex string (32 bytes)
};

export type CreatePasskeyResult = {
  credentialId: string;
  publicKey: PublicKeyCoordinates;
  publicKeyHex: string; // concatenated hex (x || y, 64 bytes)
  /** Raw attestationObject (base64url) — required for SDK wallet creation. */
  attestationObject: string;
  /** COSE-encoded public key (hex) — required for SDK WebAuthn key registration. */
  credentialPubkeyCose: string;
};

export function createChallenge(): string {
  return base64URLencode(Crypto.getRandomBytes(32).toString());
}

export function getHexPublicKey(data: BytesLike): string {
  return ethers.hexlify(data);
}

export function getPublicKeyBytes(publicKey: string): Uint8Array {
  const bytes = ethers.getBytes(publicKey);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Uint8Array(buffer);
}

/**
 * Create a passkey on the device and extract the public key.
 * Returns credentialId and publicKey (x, y) for on-chain registration.
 */
export async function createPasskey({
  nickname,
  challenge,
}: {
  nickname: string;
  challenge?: string;
}): Promise<CreatePasskeyResult> {
  if (!PasskeyModule) {
    throw new Error('Passkey module not available');
  }

  const encodedChallenge = challenge || createChallenge();

  const registrationOptions = genPasskeyRegistrationOptions({
    challenge: encodedChallenge,
    nickname,
  });

  const result = await PasskeyModule.create(registrationOptions);

  // Extract public key from attestationObject
  const { x, y } = extractPublicKeyFromAttestation(result.response.attestationObject);

  // Extract COSE public key for SDK WebAuthn key registration
  const credentialPubkeyCose = extractCosePublicKey(result.response.attestationObject);

  // Concatenate x and y for AA SDK compatibility (same as reference project)
  const publicKeyBytes = new Uint8Array(64);
  publicKeyBytes.set(x, 0);
  publicKeyBytes.set(y, 32);

  return {
    credentialId: result.id,
    publicKey: {
      x: ethers.hexlify(x),
      y: ethers.hexlify(y),
    },
    publicKeyHex: ethers.hexlify(publicKeyBytes), // 0x + 128 hex chars
    attestationObject: result.response.attestationObject,
    credentialPubkeyCose,
  };
}

export type VerifyPasskeyResult = {
  credentialId: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
};

/**
 * Verify with an existing passkey.
 */
export async function verifyWithPasskey({
  challenge,
  credentialId,
}: {
  challenge: string;
  credentialId: string;
}): Promise<VerifyPasskeyResult> {
  if (!PasskeyModule) {
    throw new Error('Passkey module not available');
  }

  const encodedChallenge = challenge || createChallenge();
  const request = genGetPasskeyOptions({ challenge: encodedChallenge, credentialId });
  const result = await PasskeyModule.get(request);

  if (result.type !== 'public-key') {
    throw new Error('Invalid passkey response type');
  }

  return {
    credentialId: result.id,
    clientDataJSON: result.response.clientDataJSON,
    authenticatorData: result.response.authenticatorData,
    signature: result.response.signature,
  };
}

export type PasskeyStatus = 'registered' | 'notRegistered' | 'needReset';

export type PasskeyCredential = {
  credentialId: string;
  publicKey: PublicKeyCoordinates;
};

/**
 * Check if passkey is available and working.
 */
export async function getPasskeyStatus(passkey?: PasskeyCredential): Promise<PasskeyStatus> {
  if (!passkey) {
    return 'notRegistered';
  }

  try {
    const challenge = createChallenge();
    await verifyWithPasskey({
      challenge,
      credentialId: passkey.credentialId,
    });
    return 'registered';
  } catch {
    return 'needReset';
  }
}
