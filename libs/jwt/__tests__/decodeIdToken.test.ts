import { decodeIdToken, DecodedIdToken } from '../decodeIdToken';

// Mock jwt-decode
jest.mock('jwt-decode', () => ({
  jwtDecode: jest.fn(),
}));

import { jwtDecode } from 'jwt-decode';
const mockJwtDecode = jwtDecode as jest.MockedFunction<typeof jwtDecode>;

describe('decodeIdToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('basic decoding', () => {
    it('should decode a valid JWT with all claims', () => {
      const mockClaims = {
        iss: 'https://accounts.google.com',
        sub: '1234567890',
        aud: 'my-client-id',
        exp: 1234567890,
        iat: 1234567880,
        email: 'user@example.com',
        name: 'John Doe',
      };

      mockJwtDecode.mockReturnValue(mockClaims);

      const result = decodeIdToken('mock.jwt.token');

      expect(result).toEqual({
        iss: 'https://accounts.google.com',
        sub: '1234567890',
        aud: 'my-client-id',
        identifier: 'John Doe', // name takes priority
      });
    });

    it('should handle audience as array', () => {
      const mockClaims = {
        iss: 'https://accounts.google.com',
        sub: '1234567890',
        aud: ['client-1', 'client-2', 'client-3'],
        exp: 1234567890,
        iat: 1234567880,
        email: 'user@example.com',
      };

      mockJwtDecode.mockReturnValue(mockClaims);

      const result = decodeIdToken('mock.jwt.token');

      expect(result.aud).toBe('client-1'); // First element
    });

    it('should handle audience as string', () => {
      const mockClaims = {
        iss: 'https://accounts.google.com',
        sub: '1234567890',
        aud: 'single-client-id',
        exp: 1234567890,
        iat: 1234567880,
      };

      mockJwtDecode.mockReturnValue(mockClaims);

      const result = decodeIdToken('mock.jwt.token');

      expect(result.aud).toBe('single-client-id');
    });
  });

  describe('identifier extraction', () => {
    it('should use name as identifier when available', () => {
      const mockClaims = {
        iss: 'https://accounts.google.com',
        sub: '1234567890',
        aud: 'my-client-id',
        exp: 1234567890,
        iat: 1234567880,
        name: 'John Doe',
        email: 'user@example.com',
        nickname: 'johnny',
        preferred_username: 'john_doe',
      };

      mockJwtDecode.mockReturnValue(mockClaims);

      const result = decodeIdToken('mock.jwt.token');

      expect(result.identifier).toBe('John Doe');
    });

    it('should use email as identifier when name is missing', () => {
      const mockClaims = {
        iss: 'https://accounts.google.com',
        sub: '1234567890',
        aud: 'my-client-id',
        exp: 1234567890,
        iat: 1234567880,
        email: 'user@example.com',
        nickname: 'johnny',
        preferred_username: 'john_doe',
      };

      mockJwtDecode.mockReturnValue(mockClaims);

      const result = decodeIdToken('mock.jwt.token');

      expect(result.identifier).toBe('user@example.com');
    });

    it('should use nickname when name and email are missing', () => {
      const mockClaims = {
        iss: 'https://accounts.google.com',
        sub: '1234567890',
        aud: 'my-client-id',
        exp: 1234567890,
        iat: 1234567880,
        nickname: 'johnny',
        preferred_username: 'john_doe',
      };

      mockJwtDecode.mockReturnValue(mockClaims);

      const result = decodeIdToken('mock.jwt.token');

      expect(result.identifier).toBe('johnny');
    });

    it('should use preferred_username when name, email, and nickname are missing (Kakao)', () => {
      const mockClaims = {
        iss: 'https://kauth.kakao.com',
        sub: '1234567890',
        aud: 'kakao-client-id',
        exp: 1234567890,
        iat: 1234567880,
        preferred_username: 'kakao_user',
      };

      mockJwtDecode.mockReturnValue(mockClaims);

      const result = decodeIdToken('mock.jwt.token');

      expect(result.identifier).toBe('kakao_user');
    });

    it('should use "Account" as fallback when no identifier fields are present', () => {
      const mockClaims = {
        iss: 'https://accounts.google.com',
        sub: '1234567890',
        aud: 'my-client-id',
        exp: 1234567890,
        iat: 1234567880,
      };

      mockJwtDecode.mockReturnValue(mockClaims);

      const result = decodeIdToken('mock.jwt.token');

      expect(result.identifier).toBe('Account');
    });
  });

  describe('provider-specific cases', () => {
    it('should handle Google ID token', () => {
      const mockClaims = {
        iss: 'https://accounts.google.com',
        sub: 'google-user-id',
        aud: 'google-client-id',
        exp: 1234567890,
        iat: 1234567880,
        email: 'user@gmail.com',
        name: 'Google User',
      };

      mockJwtDecode.mockReturnValue(mockClaims);

      const result = decodeIdToken('google.jwt.token');

      expect(result).toEqual({
        iss: 'https://accounts.google.com',
        sub: 'google-user-id',
        aud: 'google-client-id',
        identifier: 'Google User',
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty strings in identifier fields', () => {
      const mockClaims = {
        iss: 'https://accounts.google.com',
        sub: '1234567890',
        aud: 'my-client-id',
        exp: 1234567890,
        iat: 1234567880,
        name: '',
        email: '',
        nickname: '',
        preferred_username: '',
      };

      mockJwtDecode.mockReturnValue(mockClaims);

      const result = decodeIdToken('mock.jwt.token');

      expect(result.identifier).toBe('Account'); // All empty, so fallback
    });

    it('should handle whitespace-only identifier fields', () => {
      const mockClaims = {
        iss: 'https://accounts.google.com',
        sub: '1234567890',
        aud: 'my-client-id',
        exp: 1234567890,
        iat: 1234567880,
        name: '   ',
        email: '  ',
      };

      mockJwtDecode.mockReturnValue(mockClaims);

      const result = decodeIdToken('mock.jwt.token');

      expect(result.identifier).toBe('   '); // Whitespace is truthy
    });

    it('should throw if jwtDecode throws', () => {
      mockJwtDecode.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      expect(() => decodeIdToken('invalid.token')).toThrow('Invalid token');
    });
  });

  describe('required claims', () => {
    it('should include all required claims in result', () => {
      const mockClaims = {
        iss: 'https://accounts.google.com',
        sub: '1234567890',
        aud: 'my-client-id',
        exp: 1234567890,
        iat: 1234567880,
        email: 'user@example.com',
      };

      mockJwtDecode.mockReturnValue(mockClaims);

      const result = decodeIdToken('mock.jwt.token');

      expect(result).toHaveProperty('iss');
      expect(result).toHaveProperty('sub');
      expect(result).toHaveProperty('aud');
      expect(result).toHaveProperty('identifier');
      expect(Object.keys(result)).toHaveLength(4);
    });

    it('should not include optional claims in result', () => {
      const mockClaims = {
        iss: 'https://accounts.google.com',
        sub: '1234567890',
        aud: 'my-client-id',
        exp: 1234567890,
        iat: 1234567880,
        email: 'user@example.com',
        name: 'John Doe',
        nickname: 'johnny',
        preferred_username: 'john_doe',
      };

      mockJwtDecode.mockReturnValue(mockClaims);

      const result = decodeIdToken('mock.jwt.token');

      expect(result).not.toHaveProperty('exp');
      expect(result).not.toHaveProperty('iat');
      expect(result).not.toHaveProperty('email');
      expect(result).not.toHaveProperty('name');
      expect(result).not.toHaveProperty('nickname');
      expect(result).not.toHaveProperty('preferred_username');
    });
  });
});
