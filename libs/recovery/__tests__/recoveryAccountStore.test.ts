import * as SecureStore from 'expo-secure-store';
import {
  RecoveryAccount,
  saveDefaultRecoveryAccount,
  addRecoveryAccount,
  removeRecoveryAccount,
  getRecoveryAccounts,
  clearRecoveryAccounts,
  hasRecoveryAccounts,
} from '../recoveryAccountStore';

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

describe('recoveryAccountStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockAccount = {
    provider: 'google' as const,
    iss: 'https://accounts.google.com',
    sub: 'google-user-123',
    aud: 'google-client-id',
    identifier: 'user@gmail.com',
  };

  describe('saveDefaultRecoveryAccount', () => {
    it('should save as first account when none exist', async () => {
      mockGetItemAsync.mockResolvedValue(null);
      mockSetItemAsync.mockResolvedValue(undefined);

      await saveDefaultRecoveryAccount(mockAccount);

      expect(mockSetItemAsync).toHaveBeenCalledWith('recovery_accounts_count', '1');
      expect(mockSetItemAsync).toHaveBeenCalledWith(
        'recovery_account_0',
        JSON.stringify({ ...mockAccount, isDefault: true })
      );
    });

    it('should overwrite existing default account', async () => {
      mockGetItemAsync.mockImplementation(async (key) => {
        if (key === 'recovery_accounts_count') return '2';
        if (key === 'recovery_account_0')
          return JSON.stringify({ ...mockAccount, isDefault: true });
        if (key === 'recovery_account_1')
          return JSON.stringify({ ...mockAccount, isDefault: false, sub: 'other-user' });
        return null;
      });
      mockSetItemAsync.mockResolvedValue(undefined);

      const newAccount = { ...mockAccount, sub: 'new-user-456' };
      await saveDefaultRecoveryAccount(newAccount);

      expect(mockSetItemAsync).toHaveBeenCalledWith(
        'recovery_account_0',
        JSON.stringify({ ...newAccount, isDefault: true })
      );
      // Should not update count
      expect(mockSetItemAsync).not.toHaveBeenCalledWith('recovery_accounts_count', expect.any(String));
    });

    it('should throw error when SecureStore fails', async () => {
      mockGetItemAsync.mockResolvedValue(null);
      mockSetItemAsync.mockRejectedValue(new Error('SecureStore error'));

      await expect(saveDefaultRecoveryAccount(mockAccount)).rejects.toThrow(
        'Failed to save the default recovery account.'
      );
    });
  });

  describe('addRecoveryAccount', () => {
    it('should add second account successfully', async () => {
      mockGetItemAsync.mockImplementation(async (key) => {
        if (key === 'recovery_accounts_count') return '1';
        if (key === 'recovery_account_0')
          return JSON.stringify({ ...mockAccount, isDefault: true });
        return null;
      });
      mockSetItemAsync.mockResolvedValue(undefined);

      const secondAccount = { ...mockAccount, sub: 'second-user', identifier: 'second@gmail.com' };
      const result = await addRecoveryAccount(secondAccount);

      expect(result.success).toBe(true);
      expect(mockSetItemAsync).toHaveBeenCalledWith('recovery_accounts_count', '2');
      expect(mockSetItemAsync).toHaveBeenCalledWith(
        'recovery_account_1',
        JSON.stringify({ ...secondAccount, isDefault: false })
      );
    });

    it('should reject when no default account exists', async () => {
      mockGetItemAsync.mockResolvedValue(null);

      const result = await addRecoveryAccount(mockAccount);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No default account');
    });

    it('should reject when trying to add 4th account', async () => {
      mockGetItemAsync.mockImplementation(async (key) => {
        if (key === 'recovery_accounts_count') return '3';
        if (key === 'recovery_account_0')
          return JSON.stringify({ ...mockAccount, isDefault: true, sub: 'user1' });
        if (key === 'recovery_account_1')
          return JSON.stringify({ ...mockAccount, isDefault: false, sub: 'user2' });
        if (key === 'recovery_account_2')
          return JSON.stringify({ ...mockAccount, isDefault: false, sub: 'user3' });
        return null;
      });

      const result = await addRecoveryAccount({ ...mockAccount, sub: 'user4' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Maximum 3 accounts allowed');
    });

    it('should reject duplicate account (same provider and sub)', async () => {
      mockGetItemAsync.mockImplementation(async (key) => {
        if (key === 'recovery_accounts_count') return '1';
        if (key === 'recovery_account_0')
          return JSON.stringify({ ...mockAccount, isDefault: true });
        return null;
      });

      const result = await addRecoveryAccount(mockAccount);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Account already registered');
    });

    it('should allow same provider with different sub', async () => {
      mockGetItemAsync.mockImplementation(async (key) => {
        if (key === 'recovery_accounts_count') return '1';
        if (key === 'recovery_account_0')
          return JSON.stringify({ ...mockAccount, isDefault: true, sub: 'user1' });
        return null;
      });
      mockSetItemAsync.mockResolvedValue(undefined);

      const result = await addRecoveryAccount({ ...mockAccount, sub: 'user2' });

      expect(result.success).toBe(true);
    });

    it('should return error when SecureStore fails', async () => {
      mockGetItemAsync.mockImplementation(async (key) => {
        if (key === 'recovery_accounts_count') return '1';
        if (key === 'recovery_account_0')
          return JSON.stringify({ ...mockAccount, isDefault: true });
        return null;
      });
      mockSetItemAsync.mockRejectedValue(new Error('SecureStore error'));

      const result = await addRecoveryAccount({ ...mockAccount, sub: 'new-user' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to save account');
    });
  });

  describe('removeRecoveryAccount', () => {
    it('should not remove default account (index 0)', async () => {
      const result = await removeRecoveryAccount(0);

      expect(result).toBe(false);
      expect(mockDeleteItemAsync).not.toHaveBeenCalled();
    });

    it('should remove account at index 1', async () => {
      mockGetItemAsync.mockImplementation(async (key) => {
        if (key === 'recovery_accounts_count') return '3';
        if (key === 'recovery_account_0')
          return JSON.stringify({ ...mockAccount, isDefault: true, sub: 'user0' });
        if (key === 'recovery_account_1')
          return JSON.stringify({ ...mockAccount, isDefault: false, sub: 'user1' });
        if (key === 'recovery_account_2')
          return JSON.stringify({ ...mockAccount, isDefault: false, sub: 'user2' });
        return null;
      });
      mockSetItemAsync.mockResolvedValue(undefined);
      mockDeleteItemAsync.mockResolvedValue(undefined);

      const result = await removeRecoveryAccount(1);

      expect(result).toBe(true);
      expect(mockSetItemAsync).toHaveBeenCalledWith('recovery_accounts_count', '2');
      // Should re-index: account 2 becomes account 1
      expect(mockSetItemAsync).toHaveBeenCalledWith(
        'recovery_account_1',
        JSON.stringify({ ...mockAccount, isDefault: false, sub: 'user2' })
      );
    });

    it('should return false for invalid index', async () => {
      mockGetItemAsync.mockImplementation(async (key) => {
        if (key === 'recovery_accounts_count') return '2';
        if (key === 'recovery_account_0')
          return JSON.stringify({ ...mockAccount, isDefault: true });
        if (key === 'recovery_account_1')
          return JSON.stringify({ ...mockAccount, isDefault: false, sub: 'user1' });
        return null;
      });

      const result = await removeRecoveryAccount(5);

      expect(result).toBe(false);
    });

    it('should return false when no accounts exist', async () => {
      mockGetItemAsync.mockResolvedValue(null);

      const result = await removeRecoveryAccount(1);

      expect(result).toBe(false);
    });

    it('should return false when SecureStore fails', async () => {
      mockGetItemAsync.mockRejectedValue(new Error('SecureStore error'));

      const result = await removeRecoveryAccount(1);

      expect(result).toBe(false);
    });
  });

  describe('getRecoveryAccounts', () => {
    it('should return all accounts', async () => {
      mockGetItemAsync.mockImplementation(async (key) => {
        if (key === 'recovery_accounts_count') return '2';
        if (key === 'recovery_account_0')
          return JSON.stringify({ ...mockAccount, isDefault: true, sub: 'user0' });
        if (key === 'recovery_account_1')
          return JSON.stringify({ ...mockAccount, isDefault: false, sub: 'user1' });
        return null;
      });

      const accounts = await getRecoveryAccounts();

      expect(accounts).toHaveLength(2);
      expect(accounts![0].isDefault).toBe(true);
      expect(accounts![1].isDefault).toBe(false);
    });

    it('should return null when no accounts exist', async () => {
      mockGetItemAsync.mockResolvedValue(null);

      const accounts = await getRecoveryAccounts();

      expect(accounts).toBeNull();
    });

    it('should return null when count is 0', async () => {
      mockGetItemAsync.mockImplementation(async (key) => {
        if (key === 'recovery_accounts_count') return '0';
        return null;
      });

      const accounts = await getRecoveryAccounts();

      expect(accounts).toBeNull();
    });

    it('should skip missing accounts and return available ones', async () => {
      mockGetItemAsync.mockImplementation(async (key) => {
        if (key === 'recovery_accounts_count') return '3';
        if (key === 'recovery_account_0')
          return JSON.stringify({ ...mockAccount, isDefault: true });
        if (key === 'recovery_account_1') return null; // Missing
        if (key === 'recovery_account_2')
          return JSON.stringify({ ...mockAccount, isDefault: false, sub: 'user2' });
        return null;
      });

      const accounts = await getRecoveryAccounts();

      expect(accounts).toHaveLength(2); // Only 0 and 2
    });

    it('should return null when SecureStore fails', async () => {
      mockGetItemAsync.mockRejectedValue(new Error('SecureStore error'));

      const accounts = await getRecoveryAccounts();

      expect(accounts).toBeNull();
    });
  });

  describe('clearRecoveryAccounts', () => {
    it('should delete all accounts and count', async () => {
      mockGetItemAsync.mockResolvedValue('3');
      mockDeleteItemAsync.mockResolvedValue(undefined);

      await clearRecoveryAccounts();

      expect(mockDeleteItemAsync).toHaveBeenCalledWith('recovery_account_0');
      expect(mockDeleteItemAsync).toHaveBeenCalledWith('recovery_account_1');
      expect(mockDeleteItemAsync).toHaveBeenCalledWith('recovery_account_2');
      expect(mockDeleteItemAsync).toHaveBeenCalledWith('recovery_accounts_count');
    });

    it('should not throw when no accounts exist', async () => {
      mockGetItemAsync.mockResolvedValue(null);

      await expect(clearRecoveryAccounts()).resolves.not.toThrow();
    });

    it('should not throw when SecureStore fails', async () => {
      mockGetItemAsync.mockResolvedValue('2');
      mockDeleteItemAsync.mockRejectedValue(new Error('SecureStore error'));

      await expect(clearRecoveryAccounts()).resolves.not.toThrow();
    });
  });

  describe('hasRecoveryAccounts', () => {
    it('should return true when accounts exist', async () => {
      mockGetItemAsync.mockResolvedValue('2');

      const result = await hasRecoveryAccounts();

      expect(result).toBe(true);
    });

    it('should return false when count is 0', async () => {
      mockGetItemAsync.mockResolvedValue('0');

      const result = await hasRecoveryAccounts();

      expect(result).toBe(false);
    });

    it('should return false when count is null', async () => {
      mockGetItemAsync.mockResolvedValue(null);

      const result = await hasRecoveryAccounts();

      expect(result).toBe(false);
    });

    it('should return false when SecureStore fails', async () => {
      mockGetItemAsync.mockRejectedValue(new Error('SecureStore error'));

      const result = await hasRecoveryAccounts();

      expect(result).toBe(false);
    });

    it('should return true for count string "1"', async () => {
      mockGetItemAsync.mockResolvedValue('1');

      const result = await hasRecoveryAccounts();

      expect(result).toBe(true);
    });
  });

  describe('integration tests', () => {
    it('should handle complete workflow: save default, add, remove, clear', async () => {
      // Save default
      mockGetItemAsync.mockResolvedValue(null);
      mockSetItemAsync.mockResolvedValue(undefined);
      await saveDefaultRecoveryAccount(mockAccount);

      // Add second account
      mockGetItemAsync.mockImplementation(async (key) => {
        if (key === 'recovery_accounts_count') return '1';
        if (key === 'recovery_account_0')
          return JSON.stringify({ ...mockAccount, isDefault: true });
        return null;
      });
      const secondAccount = { ...mockAccount, sub: 'user2', identifier: 'second@gmail.com' };
      await addRecoveryAccount(secondAccount);

      // Get all accounts
      mockGetItemAsync.mockImplementation(async (key) => {
        if (key === 'recovery_accounts_count') return '2';
        if (key === 'recovery_account_0')
          return JSON.stringify({ ...mockAccount, isDefault: true });
        if (key === 'recovery_account_1')
          return JSON.stringify({ ...secondAccount, isDefault: false });
        return null;
      });
      const accounts = await getRecoveryAccounts();
      expect(accounts).toHaveLength(2);

      // Remove second account
      mockDeleteItemAsync.mockResolvedValue(undefined);
      await removeRecoveryAccount(1);

      // Clear all
      mockGetItemAsync.mockResolvedValue('1');
      await clearRecoveryAccounts();
    });

    it('should enforce maximum 3 accounts limit', async () => {
      // Add 3 accounts
      mockGetItemAsync.mockImplementation(async (key) => {
        if (key === 'recovery_accounts_count') return '3';
        if (key === 'recovery_account_0')
          return JSON.stringify({ ...mockAccount, isDefault: true, sub: 'user1' });
        if (key === 'recovery_account_1')
          return JSON.stringify({ ...mockAccount, isDefault: false, sub: 'user2' });
        if (key === 'recovery_account_2')
          return JSON.stringify({ ...mockAccount, isDefault: false, sub: 'user3' });
        return null;
      });

      // Try to add 4th
      const result = await addRecoveryAccount({ ...mockAccount, sub: 'user4' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Maximum 3 accounts allowed');
    });

    it('should prevent adding duplicate accounts', async () => {
      mockGetItemAsync.mockImplementation(async (key) => {
        if (key === 'recovery_accounts_count') return '1';
        if (key === 'recovery_account_0')
          return JSON.stringify({ ...mockAccount, isDefault: true });
        return null;
      });

      const duplicateAccount = { ...mockAccount };
      const result = await addRecoveryAccount(duplicateAccount);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Account already registered');
    });
  });
});
