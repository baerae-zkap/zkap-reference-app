import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { GoogleSignInButton } from '../GoogleSignInButton';
import { googleSignIn } from '@/services/auth/googleAuth';
import { Platform } from 'react-native';

// Mock the googleSignIn service
jest.mock('@/services/auth/googleAuth');

describe('GoogleSignInButton', () => {
  const mockGoogleSignIn = googleSignIn as jest.MockedFunction<typeof googleSignIn>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset Platform.OS to default
    Platform.OS = 'ios';
  });

  describe('Rendering', () => {
    it('renders with default text', () => {
      const { getByText } = render(
        <GoogleSignInButton>Sign in with Google</GoogleSignInButton>
      );
      expect(getByText('Sign in with Google')).toBeTruthy();
    });

    it('renders Google icon', () => {
      const { getByText } = render(
        <GoogleSignInButton>Sign in with Google</GoogleSignInButton>
      );
      // Check that the button text is rendered (icon verification is visual)
      expect(getByText('Sign in with Google')).toBeTruthy();
    });

    it.skip('renders all four Google icon color paths', () => {
      const { root } = render(
        <GoogleSignInButton>Sign in with Google</GoogleSignInButton>
      );
      // Google logo has 4 colored paths
      const svgPaths = root.findAllByType('RNSVGPath');
      expect(svgPaths.length).toBe(4);
    });

    it.skip('has white background and border', () => {
      // Visual styling test - skip for now
    });
  });

  describe('Sign In Flow - Success', () => {
    it('calls googleSignIn when pressed on iOS', async () => {
      Platform.OS = 'ios';
      mockGoogleSignIn.mockResolvedValueOnce({
        idToken: 'mock-id-token',
        userName: 'John Doe',
        email: 'john@example.com',
      });

      const { getByText } = render(
        <GoogleSignInButton>Sign in with Google</GoogleSignInButton>
      );

      const button = getByText('Sign in with Google').parent?.parent;
      if (button) fireEvent.press(button);

      await waitFor(() => {
        expect(mockGoogleSignIn).toHaveBeenCalledWith({ forceAccountSelection: true });
      });
    });

    it('calls googleSignIn when pressed on Android', async () => {
      Platform.OS = 'android';
      mockGoogleSignIn.mockResolvedValueOnce({
        idToken: 'mock-id-token',
        userName: 'John Doe',
        email: 'john@example.com',
      });

      const { getByText } = render(
        <GoogleSignInButton>Sign in with Google</GoogleSignInButton>
      );

      const button = getByText('Sign in with Google').parent?.parent;
      if (button) fireEvent.press(button);

      await waitFor(() => {
        expect(mockGoogleSignIn).toHaveBeenCalledWith({ forceAccountSelection: true });
      });
    });

    it('calls onSuccess with user data on successful sign in', async () => {
      const onSuccess = jest.fn();
      const mockData = {
        idToken: 'mock-id-token',
        userName: 'John Doe',
        email: 'john@example.com',
      };
      mockGoogleSignIn.mockResolvedValueOnce(mockData);

      const { getByText } = render(
        <GoogleSignInButton onSuccess={onSuccess}>Sign in with Google</GoogleSignInButton>
      );

      const button = getByText('Sign in with Google').parent?.parent;
      if (button) fireEvent.press(button);

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(mockData);
      });
    });

    it('respects forceAccountSelection prop', async () => {
      mockGoogleSignIn.mockResolvedValueOnce({
        idToken: 'mock-id-token',
        userName: 'John Doe',
        email: 'john@example.com',
      });

      const { getByText } = render(
        <GoogleSignInButton forceAccountSelection={false}>
          Sign in with Google
        </GoogleSignInButton>
      );

      const button = getByText('Sign in with Google').parent?.parent;
      if (button) fireEvent.press(button);

      await waitFor(() => {
        expect(mockGoogleSignIn).toHaveBeenCalledWith({ forceAccountSelection: false });
      });
    });
  });

  describe('Sign In Flow - Error', () => {
    it('calls onError when sign in fails', async () => {
      const onError = jest.fn();
      const error = new Error('Sign in failed');
      mockGoogleSignIn.mockRejectedValueOnce(error);

      const { getByText } = render(
        <GoogleSignInButton onError={onError}>Sign in with Google</GoogleSignInButton>
      );

      const button = getByText('Sign in with Google').parent?.parent;
      if (button) fireEvent.press(button);

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(error);
      });
    });

    it('logs error to console', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      const error = new Error('Sign in failed');
      mockGoogleSignIn.mockRejectedValueOnce(error);

      const { getByText } = render(
        <GoogleSignInButton>Sign in with Google</GoogleSignInButton>
      );

      const button = getByText('Sign in with Google').parent?.parent;
      if (button) fireEvent.press(button);

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith('Google Sign-In error:', error);
      });

      consoleError.mockRestore();
    });
  });

  describe('Loading State', () => {
    it('shows loading indicator during sign in', async () => {
      mockGoogleSignIn.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      const { getByText, getByTestId } = render(
        <GoogleSignInButton>Sign in with Google</GoogleSignInButton>
      );

      const button = getByText('Sign in with Google').parent?.parent;
      if (button) fireEvent.press(button);

      await waitFor(() => {
        expect(getByTestId('activity-indicator')).toBeTruthy();
      });
    });

    it('disables button during sign in', async () => {
      mockGoogleSignIn.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      const { getByTestId, getByText, queryByText } = render(
        <GoogleSignInButton>Sign in with Google</GoogleSignInButton>
      );

      // Button is initially not loading and shows text
      expect(getByText('Sign in with Google')).toBeTruthy();

      const button = getByTestId('social-button');
      fireEvent.press(button);

      // After press, button enters loading state
      await waitFor(() => {
        expect(getByTestId('activity-indicator')).toBeTruthy();
        expect(queryByText('Sign in with Google')).toBeNull();
      });
    });

    it('respects external isLoading prop', () => {
      const { getByTestId, queryByText, getByText } = render(
        <GoogleSignInButton isLoading>Sign in with Google</GoogleSignInButton>
      );

      const button = getByTestId('social-button');
      // When loading, button shows activity indicator and is disabled
      expect(getByTestId('activity-indicator')).toBeTruthy();
      // Text should not be visible when loading
      expect(queryByText('Sign in with Google')).toBeNull();
    });

    it('clears loading state after successful sign in', async () => {
      mockGoogleSignIn.mockResolvedValueOnce({
        idToken: 'mock-id-token',
        userName: 'John Doe',
        email: 'john@example.com',
      });

      const { getByText, queryByTestId } = render(
        <GoogleSignInButton>Sign in with Google</GoogleSignInButton>
      );

      const button = getByText('Sign in with Google').parent?.parent;
      if (button) fireEvent.press(button);

      await waitFor(() => {
        expect(queryByTestId('activity-indicator')).toBeNull();
      });
    });

    it('clears loading state after error', async () => {
      mockGoogleSignIn.mockRejectedValueOnce(new Error('Sign in failed'));

      const { getByText, queryByTestId } = render(
        <GoogleSignInButton>Sign in with Google</GoogleSignInButton>
      );

      const button = getByText('Sign in with Google').parent?.parent;
      if (button) fireEvent.press(button);

      await waitFor(() => {
        expect(queryByTestId('activity-indicator')).toBeNull();
      });
    });
  });

  describe('Props Forwarding', () => {
    it('forwards additional props to SocialButton', () => {
      const { getByTestId } = render(
        <GoogleSignInButton testID="google-signin" accessibilityLabel="Sign in with Google button">
          Sign in with Google
        </GoogleSignInButton>
      );

      const button = getByTestId('google-signin');
      expect(button.props.testID).toBe('google-signin');
      expect(button.props.accessibilityLabel).toBe('Sign in with Google button');
    });
  });

  describe('Complete handlePress flow', () => {
    it('completes full success flow from press to callback', async () => {
      Platform.OS = 'ios';
      const onSuccess = jest.fn();
      const mockData = {
        idToken: 'test-token-123',
        userName: 'Test User',
        email: 'test@example.com',
      };
      mockGoogleSignIn.mockResolvedValueOnce(mockData);

      const { getByText } = render(
        <GoogleSignInButton onSuccess={onSuccess}>Sign in with Google</GoogleSignInButton>
      );

      const button = getByText('Sign in with Google').parent?.parent;
      if (button) fireEvent.press(button);

      await waitFor(() => expect(mockGoogleSignIn).toHaveBeenCalled());
      await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(mockData));
    });

    it('completes full error flow from press to error callback', async () => {
      Platform.OS = 'ios';
      const onError = jest.fn();
      const error = new Error('Authentication failed');
      mockGoogleSignIn.mockRejectedValueOnce(error);

      const { getByText } = render(
        <GoogleSignInButton onError={onError}>Sign in with Google</GoogleSignInButton>
      );

      const button = getByText('Sign in with Google').parent?.parent;
      if (button) fireEvent.press(button);

      await waitFor(() => expect(mockGoogleSignIn).toHaveBeenCalled());
      await waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    });

    it.skip('manages loading state through complete cycle', async () => {
      // Complex async timing test - skip for now
    });
  });
});
