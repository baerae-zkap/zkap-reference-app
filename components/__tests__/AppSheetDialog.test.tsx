import { fireEvent, render } from '@testing-library/react-native';
import { AppSheetDialog } from '@/components/AppSheetDialog';

describe('AppSheetDialog', () => {
  it('renders a bottom sheet dialog and invokes the primary action', () => {
    const onDismiss = jest.fn();
    const onPrimary = jest.fn();

    const { getByText, getByTestId } = render(
      <AppSheetDialog
        visible
        tone="warning"
        title="Missing passkey"
        message="Register again before sending ETH."
        primaryText="Register"
        secondaryText="Close"
        onPrimary={onPrimary}
        onDismiss={onDismiss}
        testIDPrefix="sample-dialog"
      />,
    );

    expect(getByText('Missing passkey')).toBeTruthy();
    expect(getByText('Register again before sending ETH.')).toBeTruthy();

    fireEvent.press(getByTestId('sample-dialog-primary'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it('invokes the secondary action after dismissing', () => {
    const onDismiss = jest.fn();
    const onSecondary = jest.fn();

    const { getByTestId } = render(
      <AppSheetDialog
        visible
        title="Debug reset"
        primaryText="Reset"
        secondaryText="Cancel"
        onPrimary={jest.fn()}
        onSecondary={onSecondary}
        onDismiss={onDismiss}
        testIDPrefix="debug-dialog"
      />,
    );

    fireEvent.press(getByTestId('debug-dialog-secondary'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });
});
