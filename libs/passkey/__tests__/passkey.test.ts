import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import {
  createChallenge,
  getHexPublicKey,
  getPublicKeyBytes,
  createPasskey,
  verifyWithPasskey,
  getPasskeyStatus,
  PublicKeyCoordinates,
  PasskeyCredential,
} from '../passkey';

// Mock dependencies
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
}));

jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn(),
}));

jest.mock('react-native-passkey', () => ({
  Passkey: {
    create: jest.fn(),
    get: jest.fn(),
  },
}));

jest.mock('@/libs/base64/base64', () => ({
  base64URLencode: jest.fn((str) => `encoded_${str}`),
  base64URLtoArrayBuffer: jest.fn((str) => {
    // Simple mock that returns a buffer
    const arr = new Uint8Array([1, 2, 3, 4]);
    return arr.buffer;
  }),
}));

jest.mock('cbor-js', () => ({
  decode: jest.fn(),
}));

import { Passkey } from 'react-native-passkey';
import { base64URLencode } from '@/libs/base64/base64';
import CBOR from 'cbor-js';

const mockPasskey = Passkey as jest.Mocked<typeof Passkey>;
const mockBase64URLencode = base64URLencode as jest.MockedFunction<typeof base64URLencode>;
const mockCBORDecode = CBOR.decode as jest.MockedFunction<typeof CBOR.decode>;
const mockGetRandomBytes = Crypto.getRandomBytes as jest.MockedFunction<
  typeof Crypto.getRandomBytes
>;

describe('passkey utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as any).OS = 'ios';
  });

  describe('createChallenge', () => {
    it('should create a base64url encoded challenge', () => {
      const mockBytes = {
        toString: () => 'random-bytes-string',
      };
      mockGetRandomBytes.mockReturnValue(mockBytes as any);
      mockBase64URLencode.mockReturnValue('encoded_challenge');

      const challenge = createChallenge();

      expect(Crypto.getRandomBytes).toHaveBeenCalledWith(32);
      expect(base64URLencode).toHaveBeenCalledWith('random-bytes-string');
      expect(challenge).toBe('encoded_challenge');
    });

    it('should generate different challenges each time', () => {
      let callCount = 0;
      mockGetRandomBytes.mockImplementation(() => {
        callCount++;
        return { toString: () => `random-${callCount}` } as any;
      });
      mockBase64URLencode.mockImplementation((str) => `encoded_${str}`);

      const challenge1 = createChallenge();
      const challenge2 = createChallenge();

      expect(challenge1).toBe('encoded_random-1');
      expect(challenge2).toBe('encoded_random-2');
      expect(challenge1).not.toBe(challenge2);
    });
  });

  describe('getHexPublicKey', () => {
    it('should convert bytes to hex string', () => {
      const bytes = new Uint8Array([1, 2, 3, 4]);
      const hex = getHexPublicKey(bytes);

      expect(hex).toMatch(/^0x[0-9a-f]+$/);
      expect(hex).toBe('0x01020304');
    });

    it('should handle empty bytes', () => {
      const bytes = new Uint8Array([]);
      const hex = getHexPublicKey(bytes);

      expect(hex).toBe('0x');
    });
  });

  describe('getPublicKeyBytes', () => {
    it('should convert hex string to Uint8Array', () => {
      const hex = '0x01020304';
      const bytes = getPublicKeyBytes(hex);

      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes).toEqual(new Uint8Array([1, 2, 3, 4]));
    });

    it('should handle hex without 0x prefix', () => {
      // Note: ethers.getBytes requires 0x prefix, so this will throw
      const hex = '01020304';

      expect(() => getPublicKeyBytes(hex)).toThrow();
    });

    it('should handle empty hex string', () => {
      const hex = '0x';
      const bytes = getPublicKeyBytes(hex);

      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(0);
    });
  });

  describe('createPasskey', () => {
    beforeEach(() => {
      process.env.EXPO_PUBLIC_RP_ID = 'example.com';
      process.env.EXPO_PUBLIC_RP_NAME = 'Example App';
    });

    it('should create passkey with provided challenge', async () => {
      mockBase64URLencode.mockReturnValue('encoded_nickname');

      // Mock CBOR decode to return attestation data
      mockCBORDecode.mockReturnValueOnce({
        authData: new Uint8Array([
          // rpIdHash (32 bytes)
          ...Array(32).fill(0),
          // flags (1 byte)
          0x40,
          // signCount (4 bytes)
          0, 0, 0, 0,
          // aaguid (16 bytes)
          ...Array(16).fill(0),
          // credentialIdLength (2 bytes, big endian) = 32
          0, 32,
          // credentialId (32 bytes)
          ...Array(32).fill(1),
          // credentialPublicKey will be parsed next
        ]),
      });

      // Mock COSE key
      mockCBORDecode.mockReturnValueOnce({
        '-2': new Uint8Array(32).fill(2), // x coordinate
        '-3': new Uint8Array(32).fill(3), // y coordinate
      });

      // Third CBOR.decode call: extractCosePublicKey also decodes attestationObject
      mockCBORDecode.mockReturnValueOnce({
        authData: new Uint8Array([
          ...Array(32).fill(0),
          0x40,
          0, 0, 0, 0,
          ...Array(16).fill(0),
          0, 32,
          ...Array(32).fill(1),
        ]),
      });

      mockPasskey.create.mockResolvedValue({
        id: 'credential-id',
        rawId: 'raw-credential-id',
        response: {
          clientDataJSON: 'client-data',
          attestationObject: 'attestation-object',
        },
        type: 'public-key',
      });

      const result = await createPasskey({
        nickname: 'testuser',
        challenge: 'test-challenge',
      });

      expect(result).toHaveProperty('credentialId');
      expect(result).toHaveProperty('publicKey');
      expect(result).toHaveProperty('publicKeyHex');
      expect(result.credentialId).toBe('credential-id');
    });

    it('should create passkey without provided challenge', async () => {
      const mockBytes = { toString: () => 'random-bytes' };
      mockGetRandomBytes.mockReturnValue(mockBytes as any);
      mockBase64URLencode.mockImplementation((str) => `encoded_${str}`);

      mockCBORDecode.mockReturnValueOnce({
        authData: new Uint8Array([
          ...Array(32).fill(0),
          0x40,
          0, 0, 0, 0,
          ...Array(16).fill(0),
          0, 32,
          ...Array(32).fill(1),
        ]),
      });

      mockCBORDecode.mockReturnValueOnce({
        '-2': new Uint8Array(32).fill(2),
        '-3': new Uint8Array(32).fill(3),
      });

      // Third CBOR.decode call: extractCosePublicKey also decodes attestationObject
      mockCBORDecode.mockReturnValueOnce({
        authData: new Uint8Array([
          ...Array(32).fill(0),
          0x40,
          0, 0, 0, 0,
          ...Array(16).fill(0),
          0, 32,
          ...Array(32).fill(1),
        ]),
      });

      mockPasskey.create.mockResolvedValue({
        id: 'credential-id',
        rawId: 'raw-credential-id',
        response: {
          clientDataJSON: 'client-data',
          attestationObject: 'attestation-object',
        },
        type: 'public-key',
      });

      await createPasskey({ nickname: 'testuser' });

      expect(Crypto.getRandomBytes).toHaveBeenCalledWith(32);
    });
  });

  describe('verifyWithPasskey', () => {
    it('should verify with existing passkey', async () => {
      mockPasskey.get.mockResolvedValue({
        id: 'credential-id',
        rawId: 'raw-credential-id',
        response: {
          clientDataJSON: 'client-data',
          authenticatorData: 'authenticator-data',
          signature: 'signature',
        },
        type: 'public-key',
      });

      const result = await verifyWithPasskey({
        challenge: 'test-challenge',
        credentialId: 'credential-id',
      });

      expect(result).toEqual({
        credentialId: 'credential-id',
        clientDataJSON: 'client-data',
        authenticatorData: 'authenticator-data',
        signature: 'signature',
      });
    });

    it('should throw if response type is not public-key', async () => {
      mockPasskey.get.mockResolvedValue({
        id: 'credential-id',
        rawId: 'raw-credential-id',
        response: {
          clientDataJSON: 'client-data',
          authenticatorData: 'authenticator-data',
          signature: 'signature',
        },
        type: 'invalid-type',
      } as any);

      await expect(
        verifyWithPasskey({ challenge: 'challenge', credentialId: 'cred-id' })
      ).rejects.toThrow('Invalid passkey response type');
    });

    it('should use provided challenge', async () => {
      mockPasskey.get.mockResolvedValue({
        id: 'credential-id',
        rawId: 'raw-credential-id',
        response: {
          clientDataJSON: 'client-data',
          authenticatorData: 'authenticator-data',
          signature: 'signature',
        },
        type: 'public-key',
      });

      await verifyWithPasskey({
        challenge: 'custom-challenge',
        credentialId: 'credential-id',
      });

      expect(mockPasskey.get).toHaveBeenCalledWith(
        expect.objectContaining({
          challenge: 'custom-challenge',
        })
      );
    });
  });

  describe('getPasskeyStatus', () => {
    it('should return "notRegistered" on web platform', async () => {
      (Platform as any).OS = 'web';

      const status = await getPasskeyStatus();

      expect(status).toBe('notRegistered');
    });

    it('should return "notRegistered" when no passkey provided', async () => {
      const status = await getPasskeyStatus();

      expect(status).toBe('notRegistered');
    });

    it('should return "registered" when passkey verification succeeds', async () => {
      const mockBytes = { toString: () => 'random-bytes' };
      mockGetRandomBytes.mockReturnValue(mockBytes as any);
      mockBase64URLencode.mockReturnValue('encoded_challenge');

      mockPasskey.get.mockResolvedValue({
        id: 'credential-id',
        rawId: 'raw-credential-id',
        response: {
          clientDataJSON: 'client-data',
          authenticatorData: 'authenticator-data',
          signature: 'signature',
        },
        type: 'public-key',
      });

      const passkey: PasskeyCredential = {
        credentialId: 'credential-id',
        publicKey: {
          x: '0x123',
          y: '0x456',
        },
      };

      const status = await getPasskeyStatus(passkey);

      expect(status).toBe('registered');
    });

    it('should return "needReset" when passkey verification fails', async () => {
      const mockBytes = { toString: () => 'random-bytes' };
      mockGetRandomBytes.mockReturnValue(mockBytes as any);
      mockBase64URLencode.mockReturnValue('encoded_challenge');

      mockPasskey.get.mockRejectedValue(new Error('Verification failed'));

      const passkey: PasskeyCredential = {
        credentialId: 'credential-id',
        publicKey: {
          x: '0x123',
          y: '0x456',
        },
      };

      const status = await getPasskeyStatus(passkey);

      expect(status).toBe('needReset');
    });

    it('should create a new challenge for verification', async () => {
      const mockBytes = { toString: () => 'random-bytes' };
      mockGetRandomBytes.mockReturnValue(mockBytes as any);
      mockBase64URLencode.mockReturnValue('encoded_challenge');

      mockPasskey.get.mockResolvedValue({
        id: 'credential-id',
        rawId: 'raw-credential-id',
        response: {
          clientDataJSON: 'client-data',
          authenticatorData: 'authenticator-data',
          signature: 'signature',
        },
        type: 'public-key',
      });

      const passkey: PasskeyCredential = {
        credentialId: 'credential-id',
        publicKey: {
          x: '0x123',
          y: '0x456',
        },
      };

      await getPasskeyStatus(passkey);

      expect(Crypto.getRandomBytes).toHaveBeenCalledWith(32);
      expect(mockPasskey.get).toHaveBeenCalledWith(
        expect.objectContaining({
          challenge: 'encoded_challenge',
        })
      );
    });
  });
});
