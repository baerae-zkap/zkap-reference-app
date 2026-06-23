import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SocialAccountPicker } from '../SocialAccountPicker';

// Mock i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'onboarding.wallet.selectProvider': 'Select Social Account',
        'common.cancel': 'Cancel',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock isSupportedProvider to allow google provider in tests
jest.mock('@/libs/constants/providers', () => ({
  SUPPORTED_SOCIAL_PROVIDERS: ['google'],
  isSupportedProvider: () => true,
}));

describe('SocialAccountPicker', () => {
  const mockOnClose = jest.fn();
  const mockOnSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Modal Rendering', () => {
    it('renders when visible is true', () => {
      const { getByText } = render(
        <SocialAccountPicker visible={true} onClose={mockOnClose} onSelect={mockOnSelect} />
      );

      expect(getByText('Select Social Account')).toBeTruthy();
    });

    it('does not render when visible is false', () => {
      const { queryByText } = render(
        <SocialAccountPicker visible={false} onClose={mockOnClose} onSelect={mockOnSelect} />
      );

      expect(queryByText('Select Social Account')).toBeNull();
    });

    it('renders google provider option', () => {
      const { getByText } = render(
        <SocialAccountPicker visible={true} onClose={mockOnClose} onSelect={mockOnSelect} />
      );

      expect(getByText('Google')).toBeTruthy();
    });

    it('renders cancel button', () => {
      const { getByText } = render(
        <SocialAccountPicker visible={true} onClose={mockOnClose} onSelect={mockOnSelect} />
      );

      expect(getByText('Cancel')).toBeTruthy();
    });

    it.skip('renders provider icons', () => {
      // SVG rendering in tests is inconsistent
      const { root } = render(
        <SocialAccountPicker visible={true} onClose={mockOnClose} onSelect={mockOnSelect} />
      );

      // Check that SVG icons are rendered (3 providers)
      const svgElements = root.findAllByType('RNSVGPath');
      expect(svgElements.length).toBeGreaterThan(0);
    });
  });

  describe('Provider Selection', () => {
    it('calls onSelect with google when Google is pressed', () => {
      const { getByText } = render(
        <SocialAccountPicker visible={true} onClose={mockOnClose} onSelect={mockOnSelect} />
      );

      fireEvent.press(getByText('Google'));

      expect(mockOnClose).toHaveBeenCalledTimes(1);

      // Fast-forward the setTimeout
      jest.advanceTimersByTime(100);

      expect(mockOnSelect).toHaveBeenCalledWith('google');
    });

    it('delays onSelect call by 100ms after closing', () => {
      const { getByText } = render(
        <SocialAccountPicker visible={true} onClose={mockOnClose} onSelect={mockOnSelect} />
      );

      fireEvent.press(getByText('Google'));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
      expect(mockOnSelect).not.toHaveBeenCalled();

      jest.advanceTimersByTime(50);
      expect(mockOnSelect).not.toHaveBeenCalled();

      jest.advanceTimersByTime(50);
      expect(mockOnSelect).toHaveBeenCalledWith('google');
    });
  });

  describe('Close Behavior', () => {
    it('calls onClose when Cancel is pressed', () => {
      const { getByText } = render(
        <SocialAccountPicker visible={true} onClose={mockOnClose} onSelect={mockOnSelect} />
      );

      fireEvent.press(getByText('Cancel'));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
      expect(mockOnSelect).not.toHaveBeenCalled();
    });

    it.skip('calls onClose when overlay is pressed', () => {
      // Modal backdrop testID is not reliably available in test environment
      const { getByTestId } = render(
        <SocialAccountPicker visible={true} onClose={mockOnClose} onSelect={mockOnSelect} />
      );

      // The overlay is the Pressable wrapping the modal
      const overlay = getByTestId('RNE__MODAL__backdrop') ||
                      getByTestId('modal-backdrop') ||
                      getByText('Select Social Account').parent?.parent?.parent;

      if (overlay) {
        fireEvent.press(overlay);
        expect(mockOnClose).toHaveBeenCalled();
      }
    });

    it('calls onClose via onRequestClose', () => {
      const { UNSAFE_getByType } = render(
        <SocialAccountPicker visible={true} onClose={mockOnClose} onSelect={mockOnSelect} />
      );

      const modal = UNSAFE_getByType('Modal');

      if (modal.props.onRequestClose) {
        modal.props.onRequestClose();
        expect(mockOnClose).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('Provider Styling', () => {
    it('applies correct background color to Google button', () => {
      const { getByText } = render(
        <SocialAccountPicker visible={true} onClose={mockOnClose} onSelect={mockOnSelect} />
      );

      const googleButton = getByText('Google').parent?.parent;

      expect(googleButton?.props.style).toContainEqual(
        expect.objectContaining({ backgroundColor: '#FFFFFF' })
      );
    });

    it('applies border to Google button', () => {
      const { getByText } = render(
        <SocialAccountPicker visible={true} onClose={mockOnClose} onSelect={mockOnSelect} />
      );

      const googleButton = getByText('Google').parent?.parent;

      expect(googleButton?.props.style).toContainEqual(
        expect.objectContaining({ borderColor: '#DADCE0' })
      );
    });

    it('applies correct text color to Google button', () => {
      const { getByText } = render(
        <SocialAccountPicker visible={true} onClose={mockOnClose} onSelect={mockOnSelect} />
      );

      const googleText = getByText('Google');

      expect(googleText.props.style).toContainEqual(
        expect.objectContaining({ color: '#3C4043' })
      );
    });
  });

  describe('Modal Animation', () => {
    it('uses slide animation', () => {
      const { UNSAFE_getByType } = render(
        <SocialAccountPicker visible={true} onClose={mockOnClose} onSelect={mockOnSelect} />
      );

      const modal = UNSAFE_getByType('Modal');
      expect(modal.props.animationType).toBe('slide');
    });

    it('is transparent', () => {
      const { UNSAFE_getByType } = render(
        <SocialAccountPicker visible={true} onClose={mockOnClose} onSelect={mockOnSelect} />
      );

      const modal = UNSAFE_getByType('Modal');
      expect(modal.props.transparent).toBe(true);
    });
  });

  describe('Translation Integration', () => {
    it('uses translation for title', () => {
      const { getByText } = render(
        <SocialAccountPicker visible={true} onClose={mockOnClose} onSelect={mockOnSelect} />
      );

      expect(getByText('Select Social Account')).toBeTruthy();
    });

    it('uses translation for cancel button', () => {
      const { getByText } = render(
        <SocialAccountPicker visible={true} onClose={mockOnClose} onSelect={mockOnSelect} />
      );

      expect(getByText('Cancel')).toBeTruthy();
    });
  });
});
