import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type ActionSheetTone = 'info' | 'success' | 'warning' | 'danger';

export interface ActionSheetState {
  title: string;
  message?: string;
  tone?: ActionSheetTone;
  primaryText: string;
  secondaryText?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
}

export interface ActionSheetProps {
  /** Current sheet content, or `null` to hide. */
  sheet: ActionSheetState | null;
  /** Called when the sheet should close (backdrop tap, action tap). */
  onDismiss: () => void;
}

/**
 * Reusable bottom-sheet confirmation dialog.
 *
 * Generalized from the inline `RecoverySetupDialog` in
 * `app/recovery/setup/index.tsx` so the recovery (④) and passkey-reset (⑤)
 * flows can share one tone-aware sheet instead of an inline copy or the OS
 * `Alert.alert`. Styles/tones are preserved verbatim from the original.
 *
 * Tapping a button dismisses the sheet, then runs that button's handler — the
 * same order the original used so callers can safely navigate in `onPrimary`.
 */
export function ActionSheet({ sheet, onDismiss }: ActionSheetProps) {
  const insets = useSafeAreaInsets();
  if (!sheet) return null;

  const tone: ActionSheetTone = sheet.tone ?? 'info';
  const iconLabel = tone === 'success' ? 'OK' : tone === 'info' ? 'i' : '!';

  const handlePrimary = () => {
    const action = sheet.onPrimary;
    onDismiss();
    action?.();
  };
  const handleSecondary = () => {
    const action = sheet.onSecondary;
    onDismiss();
    action?.();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + 24, 32) }]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.handle} />
          <View style={[styles.icon, styles[`icon_${tone}`]]}>
            <Text style={[styles.iconText, styles[`iconText_${tone}`]]}>{iconLabel}</Text>
          </View>
          <Text style={styles.title}>{sheet.title}</Text>
          {!!sheet.message && <Text style={styles.message}>{sheet.message}</Text>}
          <View style={styles.actions}>
            <Pressable
              testID="action-sheet-primary"
              style={[styles.primaryButton, tone === 'danger' && styles.dangerButton]}
              onPress={handlePrimary}
            >
              <Text style={styles.primaryText}>{sheet.primaryText}</Text>
            </Pressable>
            {sheet.secondaryText && (
              <Pressable
                testID="action-sheet-secondary"
                style={styles.secondaryButton}
                onPress={handleSecondary}
              >
                <Text style={styles.secondaryText}>{sheet.secondaryText}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

/**
 * Imperative helper around <ActionSheet />.
 *
 * Returns `{ sheet, show, dismiss }` plus a ready-to-mount `<ActionSheet />`
 * element so a screen can do `const { show, sheetElement } = useActionSheet()`
 * and call `show({ ... })` from any handler.
 */
export function useActionSheet() {
  const [sheet, setSheet] = useState<ActionSheetState | null>(null);
  const show = useCallback((next: ActionSheetState) => setSheet(next), []);
  const dismiss = useCallback(() => setSheet(null), []);

  const sheetElement = <ActionSheet sheet={sheet} onDismiss={dismiss} />;

  return { sheet, show, dismiss, sheetElement };
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 32,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  handle: {
    width: 42,
    height: 5,
    alignSelf: 'center',
    marginBottom: 24,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
  },
  icon: {
    width: 64,
    height: 64,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    borderRadius: 32,
  },
  icon_info: { backgroundColor: '#EFF6FF' },
  icon_success: { backgroundColor: '#DCFCE7' },
  icon_warning: { backgroundColor: '#FEF3C7' },
  icon_danger: { backgroundColor: '#FEE2E2' },
  iconText: {
    fontSize: 18,
    fontWeight: '800',
  },
  iconText_info: { color: '#2563EB' },
  iconText_success: { color: '#15803D' },
  iconText_warning: { color: '#B45309' },
  iconText_danger: { color: '#DC2626' },
  title: {
    color: '#0F172A',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
    textAlign: 'center',
  },
  message: {
    marginTop: 10,
    color: '#64748B',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  actions: {
    marginTop: 22,
    gap: 10,
  },
  primaryButton: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#3B82F6',
  },
  dangerButton: {
    backgroundColor: '#DC2626',
  },
  secondaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryText: {
    color: '#475569',
    fontSize: 16,
    fontWeight: '700',
  },
});
