import React from 'react';
import { Text, Pressable } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ActionSheet, useActionSheet, type ActionSheetState } from '../ActionSheet';

describe('ActionSheet', () => {
  it('renders nothing when sheet is null', () => {
    const { queryByTestId } = render(<ActionSheet sheet={null} onDismiss={jest.fn()} />);
    expect(queryByTestId('action-sheet-primary')).toBeNull();
  });

  it('renders title, message and primary action', () => {
    const sheet: ActionSheetState = {
      title: 'Discard changes?',
      message: 'You have unsaved changes.',
      primaryText: 'Leave',
    };
    const { getByText, getByTestId } = render(
      <ActionSheet sheet={sheet} onDismiss={jest.fn()} />,
    );
    expect(getByText('Discard changes?')).toBeTruthy();
    expect(getByText('You have unsaved changes.')).toBeTruthy();
    expect(getByTestId('action-sheet-primary')).toBeTruthy();
  });

  it('does not render a secondary button when secondaryText is absent', () => {
    const { queryByTestId } = render(
      <ActionSheet sheet={{ title: 'T', primaryText: 'OK' }} onDismiss={jest.fn()} />,
    );
    expect(queryByTestId('action-sheet-secondary')).toBeNull();
  });

  it('dismisses then runs onPrimary (in that order)', () => {
    const calls: string[] = [];
    const onDismiss = jest.fn(() => calls.push('dismiss'));
    const onPrimary = jest.fn(() => calls.push('primary'));
    const { getByTestId } = render(
      <ActionSheet
        sheet={{ title: 'T', primaryText: 'OK', onPrimary }}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.press(getByTestId('action-sheet-primary'));
    expect(calls).toEqual(['dismiss', 'primary']);
  });

  it('dismisses then runs onSecondary', () => {
    const onDismiss = jest.fn();
    const onSecondary = jest.fn();
    const { getByTestId } = render(
      <ActionSheet
        sheet={{ title: 'T', primaryText: 'OK', secondaryText: 'Cancel', onSecondary }}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.press(getByTestId('action-sheet-secondary'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it('renders the danger tone icon label', () => {
    const { getByText } = render(
      <ActionSheet
        sheet={{ title: 'Delete', tone: 'danger', primaryText: 'Delete' }}
        onDismiss={jest.fn()}
      />,
    );
    expect(getByText('!')).toBeTruthy();
  });

  it('renders the success tone icon label', () => {
    const { getByText } = render(
      <ActionSheet
        sheet={{ title: 'Done', tone: 'success', primaryText: 'Continue' }}
        onDismiss={jest.fn()}
      />,
    );
    // "OK" here is the success-tone icon glyph (distinct from the button label)
    expect(getByText('OK')).toBeTruthy();
  });
});

// ── useActionSheet hook ────────────────────────────────────────────

function Harness() {
  const { show, dismiss, sheet, sheetElement } = useActionSheet();
  return (
    <>
      <Pressable testID="open" onPress={() => show({ title: 'Hello', primaryText: 'Go' })}>
        <Text>open</Text>
      </Pressable>
      <Pressable testID="close" onPress={dismiss}>
        <Text>close</Text>
      </Pressable>
      <Text testID="state">{sheet ? 'open' : 'closed'}</Text>
      {sheetElement}
    </>
  );
}

describe('useActionSheet', () => {
  it('shows and dismisses the sheet via the returned element', () => {
    const { getByTestId, getByText, queryByText } = render(<Harness />);
    expect(getByTestId('state').props.children).toBe('closed');

    act(() => {
      fireEvent.press(getByTestId('open'));
    });
    expect(getByText('Hello')).toBeTruthy();
    expect(getByTestId('state').props.children).toBe('open');

    act(() => {
      fireEvent.press(getByTestId('close'));
    });
    expect(queryByText('Hello')).toBeNull();
    expect(getByTestId('state').props.children).toBe('closed');
  });
});
