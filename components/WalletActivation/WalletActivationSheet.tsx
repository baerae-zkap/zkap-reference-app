import React, { useCallback } from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWalletActivation, WalletActivationStep } from './WalletActivationContext';
import { FundingStep } from './steps/FundingStep';
import { CreatingStep } from './steps/CreatingStep';
import { CompleteStep } from './steps/CompleteStep';

const WINDOW_HEIGHT = Dimensions.get('window').height;
const CONTENT_BOTTOM_PADDING = 32;

export function WalletActivationSheet() {
  const { isOpen, currentStep, close, reset } = useWalletActivation();
  const insets = useSafeAreaInsets();

  // index -1 = the sheet was dismissed (pan-down / backdrop / back). Sync the
  // context state so a later re-open flips isOpen false→true and remounts.
  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        close();
        reset();
      }
    },
    [close, reset]
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
        pressBehavior={currentStep === WalletActivationStep.CREATING ? 'none' : 'close'}
      />
    ),
    [currentStep]
  );

  const renderStep = () => {
    switch (currentStep) {
      case WalletActivationStep.FUNDING:
        return <FundingStep />;
      case WalletActivationStep.CREATING:
        return <CreatingStep />;
      case WalletActivationStep.COMPLETE:
        return <CompleteStep />;
      default:
        return null;
    }
  };

  const enablePanDownToClose = currentStep !== WalletActivationStep.CREATING;

  // Mount the sheet ONLY while open. Each open remounts a fresh BottomSheet that
  // animates in from `index={0}`, which sidesteps the @gorhom imperative
  // expand()-after-close bug where the sheet stayed closed when re-opened from
  // Home after a prior dismissal.
  if (!isOpen) return null;

  return (
    <BottomSheet
      index={0}
      enableDynamicSizing
      maxDynamicContentSize={WINDOW_HEIGHT * 0.85}
      bottomInset={insets.bottom}
      onChange={handleSheetChanges}
      enablePanDownToClose={enablePanDownToClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <BottomSheetScrollView
        contentContainerStyle={[
          styles.contentContainer,
          { paddingBottom: CONTENT_BOTTOM_PADDING + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {renderStep()}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  background: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#F8FAFC',
  },
  handleIndicator: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingBottom: CONTENT_BOTTOM_PADDING,
  },
});
