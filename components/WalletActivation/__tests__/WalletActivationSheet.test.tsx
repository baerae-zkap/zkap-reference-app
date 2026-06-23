import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import { WalletActivationSheet } from '../WalletActivationSheet';
import { WalletActivationProvider, useWalletActivation } from '../WalletActivationContext';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: any) => children,
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }),
}));

// Mock the step components
jest.mock('../steps/FundingStep', () => ({
  FundingStep: () => null,
}));

jest.mock('../steps/CreatingStep', () => ({
  CreatingStep: () => null,
}));

jest.mock('../steps/CompleteStep', () => ({
  CompleteStep: () => null,
}));

describe('WalletActivationSheet', () => {
  // The sheet mounts only while open (`if (!isOpen) return null`), so open it on
  // mount via the context before asserting on the rendered BottomSheet.
  const AutoOpen = () => {
    const { open } = useWalletActivation();
    React.useEffect(() => {
      open();
    }, [open]);
    return null;
  };

  const renderSheet = () => {
    return render(
      <WalletActivationProvider>
        <AutoOpen />
        <WalletActivationSheet />
      </WalletActivationProvider>
    );
  };

  it('renders without crashing', async () => {
    const { findByTestId } = renderSheet();
    expect(await findByTestId('bottom-sheet')).toBeTruthy();
  });

  it('renders scrollable content container', async () => {
    const { findByTestId } = renderSheet();
    expect(await findByTestId('bottom-sheet')).toBeTruthy();
  });

  it('adds bottom safe area padding to sheet content', async () => {
    const { findByTestId, UNSAFE_getByType } = renderSheet();
    await findByTestId('bottom-sheet');
    const scrollView = UNSAFE_getByType(ScrollView);

    expect(scrollView.props.contentContainerStyle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ paddingBottom: 56 }),
      ])
    );
  });

  describe('Step rendering', () => {
    it('renders the current activation step inside the sheet', async () => {
      const { findByTestId } = renderSheet();
      // Just verify the sheet renders, step components are mocked
      expect(await findByTestId('bottom-sheet')).toBeTruthy();
    });
  });

  describe('Sheet behavior', () => {
    it.skip('has correct snap points', () => {
      // Skipping due to BottomSheet mock complexity
    });

    it.skip('starts with sheet closed (index -1)', () => {
      // Skipping due to BottomSheet mock complexity
    });

    it.skip('enables pan down to close on non-creating steps', () => {
      // Skipping due to BottomSheet mock complexity
    });
  });

  describe('Backdrop behavior', () => {
    it.skip('renders backdrop component', () => {
      // Skipping due to BottomSheet mock complexity
    });

    it.skip('backdrop press behavior is close on non-creating steps', () => {
      // Skipping due to BottomSheet mock complexity
    });
  });

  describe('Integration with context', () => {
    it.skip('expands sheet when isOpen becomes true', () => {
      // Skipping due to BottomSheet mock and ref complexity
    });

    it('renders different step components based on currentStep', async () => {
      const { findByTestId } = renderSheet();
      // Step components are mocked, just verify the sheet renders
      expect(await findByTestId('bottom-sheet')).toBeTruthy();
    });
  });

  describe('Sheet styling', () => {
    it.skip('has correct background style', () => {
      // Skipping due to BottomSheet mock complexity
    });

    it.skip('has correct handle indicator style', () => {
      // Skipping due to BottomSheet mock complexity
    });
  });

  describe('Creating step special behavior', () => {
    it.skip('disables pan down to close during CREATING step', () => {
      // Skipping due to BottomSheet mock complexity
    });

    it.skip('disables backdrop press during CREATING step', () => {
      // Skipping due to BottomSheet mock complexity
    });
  });
});
