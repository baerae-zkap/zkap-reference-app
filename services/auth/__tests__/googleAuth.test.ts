import {
  GoogleSignin,
  statusCodes,
  isErrorWithCode,
} from '@react-native-google-signin/google-signin';
import {
  configureGoogleSignIn,
  googleSignIn,
  googleSignOut,
  isGoogleSignedIn,
} from '../googleAuth';

// Mock Google Sign In
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
    getCurrentUser: jest.fn(),
  },
  statusCodes: {
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
  isErrorWithCode: jest.fn(),
}));

// Mock Constants
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        googleWebClientId: 'test-web-client-id',
        googleIosClientId: 'test-ios-client-id',
      },
    },
  },
}));

const mockedGoogleSignin = GoogleSignin as jest.Mocked<typeof GoogleSignin>;
const mockedIsErrorWithCode = isErrorWithCode as jest.MockedFunction<typeof isErrorWithCode>;

describe('googleAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('configureGoogleSignIn', () => {
    it('should configure Google Sign In with client IDs', () => {
      configureGoogleSignIn();

      expect(mockedGoogleSignin.configure).toHaveBeenCalledWith({
        webClientId: 'test-web-client-id',
        iosClientId: 'test-ios-client-id',
        offlineAccess: false,
      });
    });

    it('should only configure once', () => {
      // First call should configure
      configureGoogleSignIn();
      const firstCallCount = mockedGoogleSignin.configure.mock.calls.length;

      // Subsequent calls should not configure again
      configureGoogleSignIn();
      configureGoogleSignIn();

      // Should still be the same call count
      expect(mockedGoogleSignin.configure).toHaveBeenCalledTimes(firstCallCount);
    });
  });

  describe('googleSignIn', () => {
    it('should sign in successfully', async () => {
      const mockSignInResponse = {
        type: 'success' as const,
        data: {
          idToken: 'test-id-token',
          user: {
            name: 'Test User',
            email: 'test@example.com',
          },
        },
      };

      mockedGoogleSignin.hasPlayServices.mockResolvedValue(true);
      mockedGoogleSignin.signIn.mockResolvedValue(mockSignInResponse as any);

      const result = await googleSignIn();

      expect(mockedGoogleSignin.hasPlayServices).toHaveBeenCalledWith({
        showPlayServicesUpdateDialog: true,
      });
      expect(mockedGoogleSignin.signIn).toHaveBeenCalled();
      expect(result).toEqual({
        idToken: 'test-id-token',
        userName: 'Test User',
        email: 'test@example.com',
      });
    });

    it('should use email as userName when name is not available', async () => {
      const mockSignInResponse = {
        type: 'success' as const,
        data: {
          idToken: 'test-id-token',
          user: {
            name: null,
            email: 'test@example.com',
          },
        },
      };

      mockedGoogleSignin.hasPlayServices.mockResolvedValue(true);
      mockedGoogleSignin.signIn.mockResolvedValue(mockSignInResponse as any);

      const result = await googleSignIn();

      expect(result.userName).toBe('test@example.com');
    });

    it('should use "Unknown" as userName when both name and email are not available', async () => {
      const mockSignInResponse = {
        type: 'success' as const,
        data: {
          idToken: 'test-id-token',
          user: {
            name: null,
            email: null,
          },
        },
      };

      mockedGoogleSignin.hasPlayServices.mockResolvedValue(true);
      mockedGoogleSignin.signIn.mockResolvedValue(mockSignInResponse as any);

      const result = await googleSignIn();

      expect(result.userName).toBe('Unknown');
    });

    it('should throw error when sign in is cancelled', async () => {
      const mockSignInResponse = {
        type: 'cancelled' as const,
      };

      mockedGoogleSignin.hasPlayServices.mockResolvedValue(true);
      mockedGoogleSignin.signIn.mockResolvedValue(mockSignInResponse as any);

      await expect(googleSignIn()).rejects.toThrow('Sign in cancelled');
    });

    it('should throw error when no ID token is returned', async () => {
      const mockSignInResponse = {
        type: 'success' as const,
        data: {
          idToken: null,
          user: {
            name: 'Test User',
            email: 'test@example.com',
          },
        },
      };

      mockedGoogleSignin.hasPlayServices.mockResolvedValue(true);
      mockedGoogleSignin.signIn.mockResolvedValue(mockSignInResponse as any);

      await expect(googleSignIn()).rejects.toThrow('No ID token returned from Google');
    });

    it('should force account selection when option is provided', async () => {
      const mockSignInResponse = {
        type: 'success' as const,
        data: {
          idToken: 'test-id-token',
          user: {
            name: 'Test User',
            email: 'test@example.com',
          },
        },
      };

      mockedGoogleSignin.hasPlayServices.mockResolvedValue(true);
      mockedGoogleSignin.signOut.mockResolvedValue(undefined as any);
      mockedGoogleSignin.signIn.mockResolvedValue(mockSignInResponse as any);

      await googleSignIn({ forceAccountSelection: true });

      expect(mockedGoogleSignin.signOut).toHaveBeenCalled();
      expect(mockedGoogleSignin.signIn).toHaveBeenCalled();
    });

    it('should handle IN_PROGRESS error', async () => {
      const error = { code: statusCodes.IN_PROGRESS };

      mockedGoogleSignin.hasPlayServices.mockResolvedValue(true);
      mockedGoogleSignin.signIn.mockRejectedValue(error);
      mockedIsErrorWithCode.mockReturnValue(true);

      await expect(googleSignIn()).rejects.toThrow('Sign in already in progress');
    });

    it('should handle PLAY_SERVICES_NOT_AVAILABLE error', async () => {
      const error = { code: statusCodes.PLAY_SERVICES_NOT_AVAILABLE };

      mockedGoogleSignin.hasPlayServices.mockResolvedValue(true);
      mockedGoogleSignin.signIn.mockRejectedValue(error);
      mockedIsErrorWithCode.mockReturnValue(true);

      await expect(googleSignIn()).rejects.toThrow('Play services not available');
    });

    it('should handle other errors with code', async () => {
      const error = { code: 'UNKNOWN_ERROR', message: 'Unknown error' };

      mockedGoogleSignin.hasPlayServices.mockResolvedValue(true);
      mockedGoogleSignin.signIn.mockRejectedValue(error);
      mockedIsErrorWithCode.mockReturnValue(true);

      await expect(googleSignIn()).rejects.toEqual(error);
    });

    it('should handle errors without code', async () => {
      const error = new Error('Generic error');

      mockedGoogleSignin.hasPlayServices.mockResolvedValue(true);
      mockedGoogleSignin.signIn.mockRejectedValue(error);
      mockedIsErrorWithCode.mockReturnValue(false);

      await expect(googleSignIn()).rejects.toThrow('Generic error');
    });

    it('should throw error for unexpected response type', async () => {
      const mockSignInResponse = {
        type: 'unknown' as any,
      };

      mockedGoogleSignin.hasPlayServices.mockResolvedValue(true);
      mockedGoogleSignin.signIn.mockResolvedValue(mockSignInResponse as any);

      await expect(googleSignIn()).rejects.toThrow('Unexpected sign in response');
    });
  });

  describe('googleSignOut', () => {
    it('should sign out successfully', async () => {
      mockedGoogleSignin.signOut.mockResolvedValue(undefined as any);

      await googleSignOut();

      expect(mockedGoogleSignin.signOut).toHaveBeenCalled();
    });

    it('should handle sign out errors gracefully', async () => {
      const error = new Error('Sign out failed');
      mockedGoogleSignin.signOut.mockRejectedValue(error);

      // Should not throw
      await expect(googleSignOut()).resolves.toBeUndefined();
    });
  });

  describe('isGoogleSignedIn', () => {
    it('should return true when user is signed in', async () => {
      mockedGoogleSignin.getCurrentUser.mockResolvedValue({
        user: {
          id: 'user-123',
          name: 'Test User',
          email: 'test@example.com',
        },
      } as never);

      const result = await isGoogleSignedIn();

      expect(result).toBe(true);
      expect(mockedGoogleSignin.getCurrentUser).toHaveBeenCalled();
    });

    it('should return false when user is not signed in', async () => {
      mockedGoogleSignin.getCurrentUser.mockResolvedValue(null as never);

      const result = await isGoogleSignedIn();

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockedGoogleSignin.getCurrentUser.mockRejectedValue(new Error('Error') as never);

      const result = await isGoogleSignedIn();

      expect(result).toBe(false);
    });
  });
});
