import { render, fireEvent } from '@testing-library/react-native';
import { SocialButton } from '../SocialButton';
import { View, Text } from 'react-native';

describe('SocialButton', () => {
  const getButton = (container: ReturnType<typeof render>) => {
    return container.getByTestId('social-button');
  };

  const getStyles = (element: any) => {
    const style = element.props.style;
    return Array.isArray(style) ? style : [style];
  };

  describe('Rendering', () => {
    it('renders with children text', () => {
      const { getByText } = render(
        <SocialButton backgroundColor="#FFFFFF">Sign In</SocialButton>
      );
      expect(getByText('Sign In')).toBeTruthy();
    });

    it('renders with custom icon', () => {
      const { getByTestId } = render(
        <SocialButton
          backgroundColor="#FFFFFF"
          icon={
            <View testID="custom-icon">
              <Text>Icon</Text>
            </View>
          }
        >
          Sign In
        </SocialButton>
      );
      expect(getByTestId('custom-icon')).toBeTruthy();
    });

    it('renders without icon', () => {
      const { queryByTestId, getByText } = render(
        <SocialButton backgroundColor="#FFFFFF">Sign In</SocialButton>
      );
      expect(queryByTestId('custom-icon')).toBeNull();
      expect(getByText('Sign In')).toBeTruthy();
    });
  });

  describe('Styling', () => {
    it('applies custom backgroundColor', () => {
      const container = render(
        <SocialButton backgroundColor="#FF0000">Sign In</SocialButton>
      );
      const button = getButton(container);
      expect(getStyles(button)).toContainEqual(
        expect.objectContaining({ backgroundColor: '#FF0000' })
      );
    });

    it('applies custom text color', () => {
      const { getByText } = render(
        <SocialButton backgroundColor="#FFFFFF" color="#FF0000">
          Sign In
        </SocialButton>
      );
      const text = getByText('Sign In');
      expect(text.props.style).toContainEqual(
        expect.objectContaining({ color: '#FF0000' })
      );
    });

    it('applies default text color when not provided', () => {
      const { getByText } = render(
        <SocialButton backgroundColor="#FFFFFF">Sign In</SocialButton>
      );
      const text = getByText('Sign In');
      expect(text.props.style).toContainEqual(
        expect.objectContaining({ color: '#000' })
      );
    });

    it('applies border when borderWidth and borderColor provided', () => {
      const container = render(
        <SocialButton
          backgroundColor="#FFFFFF"
          borderWidth={1}
          borderColor="#DADCE0"
        >
          Sign In
        </SocialButton>
      );
      const button = getButton(container);
      expect(getStyles(button)).toContainEqual(
        expect.objectContaining({ borderWidth: 1 })
      );
      expect(getStyles(button)).toContainEqual(
        expect.objectContaining({ borderColor: '#DADCE0' })
      );
    });

    it('does not apply border when borderWidth not provided', () => {
      const container = render(
        <SocialButton backgroundColor="#FFFFFF">Sign In</SocialButton>
      );
      const button = getButton(container);
      const styles = getStyles(button).flat();
      const hasBorderWidth = styles.some(
        (style: any) => style && 'borderWidth' in style
      );
      expect(hasBorderWidth).toBe(false);
    });
  });

  describe('Loading State', () => {
    it('shows ActivityIndicator when isLoading is true', () => {
      const { getByTestId, queryByText } = render(
        <SocialButton backgroundColor="#FFFFFF" isLoading>
          Sign In
        </SocialButton>
      );
      expect(getByTestId('activity-indicator')).toBeTruthy();
      expect(queryByText('Sign In')).toBeNull();
    });

    it('hides content when loading', () => {
      const { queryByText, queryByTestId } = render(
        <SocialButton
          backgroundColor="#FFFFFF"
          isLoading
          icon={<View testID="icon" />}
        >
          Sign In
        </SocialButton>
      );
      expect(queryByText('Sign In')).toBeNull();
      expect(queryByTestId('icon')).toBeNull();
    });

    it('changes background color when loading', () => {
      const container = render(
        <SocialButton backgroundColor="#FF0000" isLoading>
          Sign In
        </SocialButton>
      );
      const button = getButton(container);
      expect(getStyles(button)).toContainEqual(
        expect.objectContaining({ backgroundColor: '#E5E7EB' })
      );
    });

    it('disables button when loading', () => {
      const onPress = jest.fn();
      const container = render(
        <SocialButton backgroundColor="#FFFFFF" isLoading onPress={onPress}>
          Sign In
        </SocialButton>
      );
      const button = getButton(container);
      fireEvent.press(button);
      expect(onPress).not.toHaveBeenCalled();
    });
  });

  describe('Disabled State', () => {
    it('is disabled when isLoading is true', () => {
      const onPress = jest.fn();
      const container = render(
        <SocialButton backgroundColor="#FFFFFF" isLoading onPress={onPress}>
          Sign In
        </SocialButton>
      );
      const button = getButton(container);
      fireEvent.press(button);
      expect(onPress).not.toHaveBeenCalled();
    });

    it('is not disabled when isLoading is false', () => {
      const onPress = jest.fn();
      const container = render(
        <SocialButton backgroundColor="#FFFFFF" isLoading={false} onPress={onPress}>
          Sign In
        </SocialButton>
      );
      const button = getButton(container);
      fireEvent.press(button);
      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('Interaction', () => {
    it('calls onPress when pressed', () => {
      const onPress = jest.fn();
      const container = render(
        <SocialButton backgroundColor="#FFFFFF" onPress={onPress}>
          Sign In
        </SocialButton>
      );
      const button = getButton(container);
      fireEvent.press(button);
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('does not call onPress when loading', () => {
      const onPress = jest.fn();
      const container = render(
        <SocialButton backgroundColor="#FFFFFF" isLoading onPress={onPress}>
          Sign In
        </SocialButton>
      );
      const button = getButton(container);
      fireEvent.press(button);
      expect(onPress).not.toHaveBeenCalled();
    });

    it('passes through TouchableOpacity props', () => {
      const onPress = jest.fn();
      const container = render(
        <SocialButton
          backgroundColor="#FFFFFF"
          onPress={onPress}
          testID="social-button"
          accessibilityLabel="Sign in button"
        >
          Sign In
        </SocialButton>
      );
      const button = getButton(container);
      expect(button.props.testID).toBe('social-button');
      expect(button.props.accessibilityLabel).toBe('Sign in button');
    });
  });
});
