import * as SecureStore from 'expo-secure-store';
import {
  savePasskey,
  getStoredPasskey,
  clearPasskey,
  hasStoredPasskey,
  StoredPasskey,
} from '../passkeyStore';

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const mockSetItemAsync = SecureStore.setItemAsync as jest.MockedFunction<
  typeof SecureStore.setItemAsync
>;
const mockGetItemAsync = SecureStore.getItemAsync as jest.MockedFunction<
  typeof SecureStore.getItemAsync
>;
const mockDeleteItemAsync = SecureStore.deleteItemAsync as jest.MockedFunction<
  typeof SecureStore.deleteItemAsync
>;

describe('passkeyStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('savePasskey', () => {
    it('should save passkey credentials to SecureStore', async () => {
      mockSetItemAsync.mockResolvedValue(undefined);

      const passkey: StoredPasskey = {
        credentialId: 'credential-123',
        publicKey: {
          x: '0x1234567890abcdef',
          y: '0xfedcba0987654321',
        },
      };

      await savePasskey(passkey);

      expect(mockSetItemAsync).toHaveBeenCalledTimes(3);
      expect(mockSetItemAsync).toHaveBeenCalledWith('passkey_credential_id', 'credential-123');
      expect(mockSetItemAsync).toHaveBeenCalledWith('passkey_public_key_x', '0x1234567890abcdef');
      expect(mockSetItemAsync).toHaveBeenCalledWith('passkey_public_key_y', '0xfedcba0987654321');
    });

    it('should throw error when SecureStore fails', async () => {
      mockSetItemAsync.mockRejectedValue(new Error('SecureStore error'));

      const passkey: StoredPasskey = {
        credentialId: 'credential-123',
        publicKey: {
          x: '0x123',
          y: '0x456',
        },
      };

      await expect(savePasskey(passkey)).rejects.toThrow('Failed to save the passkey.');
    });

    it('should handle passkey with empty strings', async () => {
      mockSetItemAsync.mockResolvedValue(undefined);

      const passkey: StoredPasskey = {
        credentialId: '',
        publicKey: {
          x: '',
          y: '',
        },
      };

      await savePasskey(passkey);

      expect(mockSetItemAsync).toHaveBeenCalledWith('passkey_credential_id', '');
      expect(mockSetItemAsync).toHaveBeenCalledWith('passkey_public_key_x', '');
      expect(mockSetItemAsync).toHaveBeenCalledWith('passkey_public_key_y', '');
    });
  });

  describe('getStoredPasskey', () => {
    it('should retrieve stored passkey from SecureStore', async () => {
      mockGetItemAsync.mockImplementation(async (key) => {
        if (key === 'passkey_credential_id') return 'credential-123';
        if (key === 'passkey_public_key_x') return '0x1234567890abcdef';
        if (key === 'passkey_public_key_y') return '0xfedcba0987654321';
        return null;
      });

      const passkey = await getStoredPasskey();

      expect(passkey).toEqual({
        credentialId: 'credential-123',
        publicKey: {
          x: '0x1234567890abcdef',
          y: '0xfedcba0987654321',
        },
      });
    });

    it('should return null when credentialId is missing', async () => {
      mockGetItemAsync.mockImplementation(async (key) => {
        if (key === 'passkey_credential_id') return null;
        if (key === 'passkey_public_key_x') return '0x123';
        if (key === 'passkey_public_key_y') return '0x456';
        return null;
      });

      const passkey = await getStoredPasskey();

      expect(passkey).toBeNull();
    });

    it('should return null when public key x is missing', async () => {
      mockGetItemAsync.mockImplementation(async (key) => {
        if (key === 'passkey_credential_id') return 'credential-123';
        if (key === 'passkey_public_key_x') return null;
        if (key === 'passkey_public_key_y') return '0x456';
        return null;
      });

      const passkey = await getStoredPasskey();

      expect(passkey).toBeNull();
    });

    it('should return null when public key y is missing', async () => {
      mockGetItemAsync.mockImplementation(async (key) => {
        if (key === 'passkey_credential_id') return 'credential-123';
        if (key === 'passkey_public_key_x') return '0x123';
        if (key === 'passkey_public_key_y') return null;
        return null;
      });

      const passkey = await getStoredPasskey();

      expect(passkey).toBeNull();
    });

    it('should return null when all fields are missing', async () => {
      mockGetItemAsync.mockResolvedValue(null);

      const passkey = await getStoredPasskey();

      expect(passkey).toBeNull();
    });

    it('should return null when SecureStore throws error', async () => {
      mockGetItemAsync.mockRejectedValue(new Error('SecureStore error'));

      const passkey = await getStoredPasskey();

      expect(passkey).toBeNull();
    });

    it('should log error when SecureStore fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockGetItemAsync.mockRejectedValue(new Error('SecureStore error'));

      await getStoredPasskey();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to read passkey from SecureStore:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('clearPasskey', () => {
    it('should delete all passkey data from SecureStore', async () => {
      mockDeleteItemAsync.mockResolvedValue(undefined);

      await clearPasskey();

      expect(mockDeleteItemAsync).toHaveBeenCalledTimes(5);
      expect(mockDeleteItemAsync).toHaveBeenCalledWith('passkey_credential_id');
      expect(mockDeleteItemAsync).toHaveBeenCalledWith('passkey_public_key_x');
      expect(mockDeleteItemAsync).toHaveBeenCalledWith('passkey_public_key_y');
      expect(mockDeleteItemAsync).toHaveBeenCalledWith('passkey_attestation_object');
      expect(mockDeleteItemAsync).toHaveBeenCalledWith('passkey_credential_pubkey_cose');
    });

    it('should not throw error when SecureStore fails', async () => {
      mockDeleteItemAsync.mockRejectedValue(new Error('SecureStore error'));

      await expect(clearPasskey()).resolves.not.toThrow();
    });

    it('should log error when SecureStore fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockDeleteItemAsync.mockRejectedValue(new Error('SecureStore error'));

      await clearPasskey();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to clear passkey from SecureStore:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('hasStoredPasskey', () => {
    it('should return true when credentialId exists', async () => {
      mockGetItemAsync.mockResolvedValue('credential-123');

      const result = await hasStoredPasskey();

      expect(result).toBe(true);
      expect(mockGetItemAsync).toHaveBeenCalledWith('passkey_credential_id');
    });

    it('should return false when credentialId is null', async () => {
      mockGetItemAsync.mockResolvedValue(null);

      const result = await hasStoredPasskey();

      expect(result).toBe(false);
    });

    it('should return false when credentialId is empty string', async () => {
      mockGetItemAsync.mockResolvedValue('');

      const result = await hasStoredPasskey();

      expect(result).toBe(false);
    });

    it('should return false when SecureStore throws error', async () => {
      mockGetItemAsync.mockRejectedValue(new Error('SecureStore error'));

      const result = await hasStoredPasskey();

      expect(result).toBe(false);
    });

    it('should only check credentialId, not other fields', async () => {
      mockGetItemAsync.mockResolvedValue('credential-123');

      await hasStoredPasskey();

      expect(mockGetItemAsync).toHaveBeenCalledTimes(1);
      expect(mockGetItemAsync).toHaveBeenCalledWith('passkey_credential_id');
    });
  });

  describe('integration tests', () => {
    it('should save and retrieve the same passkey', async () => {
      const passkey: StoredPasskey = {
        credentialId: 'credential-123',
        publicKey: {
          x: '0x1234567890abcdef',
          y: '0xfedcba0987654321',
        },
      };

      mockSetItemAsync.mockResolvedValue(undefined);
      mockGetItemAsync.mockImplementation(async (key) => {
        if (key === 'passkey_credential_id') return passkey.credentialId;
        if (key === 'passkey_public_key_x') return passkey.publicKey.x;
        if (key === 'passkey_public_key_y') return passkey.publicKey.y;
        return null;
      });

      await savePasskey(passkey);
      const retrieved = await getStoredPasskey();

      expect(retrieved).toEqual(passkey);
    });

    it('should clear passkey after saving', async () => {
      mockSetItemAsync.mockResolvedValue(undefined);
      mockDeleteItemAsync.mockResolvedValue(undefined);
      mockGetItemAsync.mockResolvedValue(null);

      const passkey: StoredPasskey = {
        credentialId: 'credential-123',
        publicKey: {
          x: '0x123',
          y: '0x456',
        },
      };

      await savePasskey(passkey);
      await clearPasskey();
      const retrieved = await getStoredPasskey();

      expect(retrieved).toBeNull();
    });

    it('should correctly report passkey existence', async () => {
      mockGetItemAsync.mockResolvedValue(null);
      const hasBeforeSave = await hasStoredPasskey();
      expect(hasBeforeSave).toBe(false);

      mockSetItemAsync.mockResolvedValue(undefined);
      mockGetItemAsync.mockResolvedValue('credential-123');

      const passkey: StoredPasskey = {
        credentialId: 'credential-123',
        publicKey: {
          x: '0x123',
          y: '0x456',
        },
      };

      await savePasskey(passkey);
      const hasAfterSave = await hasStoredPasskey();
      expect(hasAfterSave).toBe(true);
    });
  });
});
