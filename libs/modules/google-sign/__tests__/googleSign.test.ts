import { getGoogleIdToken, googleSignIn } from '../googleSign';

// Mock dependencies
jest.mock('@/libs/passkey/passkey', () => ({
  createChallenge: jest.fn(),
}));
jest.mock('@/modules/google-sign', () => ({
  signin: jest.fn(),
}));
jest.mock('@/libs/jwt/decodeIdToken', () => ({
  decodeIdToken: jest.fn(),
}));

import { createChallenge } from '@/libs/passkey/passkey';
import { signin as signinGoogle } from '@/modules/google-sign';
import { decodeIdToken } from '@/libs/jwt/decodeIdToken';

const mockCreateChallenge = createChallenge as jest.MockedFunction<typeof createChallenge>;
const mockSigninGoogle = signinGoogle as jest.MockedFunction<typeof signinGoogle>;
const mockDecodeIdToken = decodeIdToken as jest.MockedFunction<any>;

describe('googleSign', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getGoogleIdToken', () => {
    it('should use provided nonce when passed', async () => {
      const customNonce = 'custom-nonce-123';
      const mockIdToken = 'mock-id-token';

      mockSigninGoogle.mockResolvedValue(mockIdToken);

      const result = await getGoogleIdToken({ nonce: customNonce });

      expect(mockSigninGoogle).toHaveBeenCalledWith(expect.any(String), customNonce);
      expect(result).toBe(mockIdToken);
      expect(mockCreateChallenge).not.toHaveBeenCalled();
    });

    it('should generate nonce when not provided', async () => {
      const generatedNonce = 'generated-nonce-456';
      const mockIdToken = 'mock-id-token';

      mockCreateChallenge.mockReturnValue(generatedNonce);
      mockSigninGoogle.mockResolvedValue(mockIdToken);

      const result = await getGoogleIdToken();

      expect(mockCreateChallenge).toHaveBeenCalled();
      expect(mockSigninGoogle).toHaveBeenCalledWith(expect.any(String), generatedNonce);
      expect(result).toBe(mockIdToken);
    });

    it('should return id token from Google Sign-In', async () => {
      const mockIdToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...';
      const generatedNonce = 'nonce-789';

      mockCreateChallenge.mockReturnValue(generatedNonce);
      mockSigninGoogle.mockResolvedValue(mockIdToken);

      const result = await getGoogleIdToken();

      expect(result).toBe(mockIdToken);
    });
  });

  describe('googleSignIn', () => {
    it('should return idToken and userName on successful sign-in', async () => {
      const mockIdToken = 'mock-id-token';
      const mockUserName = 'John Doe';
      const generatedNonce = 'nonce-abc';

      mockCreateChallenge.mockReturnValue(generatedNonce);
      mockSigninGoogle.mockResolvedValue(mockIdToken);
      mockDecodeIdToken.mockReturnValue({ identifier: mockUserName });

      const result = await googleSignIn();

      expect(mockCreateChallenge).toHaveBeenCalled();
      expect(mockSigninGoogle).toHaveBeenCalledWith(expect.any(String), generatedNonce);
      expect(mockDecodeIdToken).toHaveBeenCalledWith(mockIdToken);
      expect(result).toEqual({
        idToken: mockIdToken,
        userName: mockUserName,
      });
    });

    it('should throw error when userName does not exist in decoded token', async () => {
      const mockIdToken = 'mock-id-token';
      const generatedNonce = 'nonce-def';

      mockCreateChallenge.mockReturnValue(generatedNonce);
      mockSigninGoogle.mockResolvedValue(mockIdToken);
      mockDecodeIdToken.mockReturnValue({ identifier: undefined });

      await expect(googleSignIn()).rejects.toThrow('userName not exist');
    });

    it('should throw error when userName is null', async () => {
      const mockIdToken = 'mock-id-token';
      const generatedNonce = 'nonce-ghi';

      mockCreateChallenge.mockReturnValue(generatedNonce);
      mockSigninGoogle.mockResolvedValue(mockIdToken);
      mockDecodeIdToken.mockReturnValue({ identifier: null });

      await expect(googleSignIn()).rejects.toThrow('userName not exist');
    });

    it('should throw error when userName is empty string', async () => {
      const mockIdToken = 'mock-id-token';
      const generatedNonce = 'nonce-jkl';

      mockCreateChallenge.mockReturnValue(generatedNonce);
      mockSigninGoogle.mockResolvedValue(mockIdToken);
      mockDecodeIdToken.mockReturnValue({ identifier: '' });

      await expect(googleSignIn()).rejects.toThrow('userName not exist');
    });
  });
});
