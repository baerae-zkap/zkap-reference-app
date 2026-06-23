import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '@/design-system/styles/colors';

export interface FlowStepHeaderProps {
  /** Localized step name shown in the header chrome. */
  stepTitle: string;
  /** 0–100 progress. Clamped. Ignored when `hideProgress`. */
  percent?: number;
  /** Close (✕) handler. */
  onClose: () => void;
  /** Hide the progress bar + percent meta (review/intro screens). */
  hideProgress?: boolean;
}

/**
 * Shared top chrome for the masterKey / passkey flow screens.
 *
 * A close button + step title,
 * with an optional progress track underneath. Header only — the host screen
 * supplies its own SafeAreaView.
 */
export function FlowStepHeader({ stepTitle, percent, onClose, hideProgress }: FlowStepHeaderProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent ?? 0)));

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.stepTitle} numberOfLines={1}>
          {stepTitle}
        </Text>
        <Pressable
          testID="flow-step-header-close"
          accessibilityLabel="Close"
          onPress={onClose}
          style={styles.closeButton}
          hitSlop={8}
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      {!hideProgress && (
        <View style={styles.progress}>
          <View style={styles.track}>
            <View
              testID="flow-step-header-fill"
              style={[styles.fill, { width: `${clamped}%` }]}
            />
          </View>
          <Text style={styles.percent}>{clamped}%</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    backgroundColor: colors.background.primary,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  stepTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  closeText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: colors.border.default,
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.brand.default,
  },
  percent: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand.default,
    minWidth: 34,
    textAlign: 'right',
  },
});
