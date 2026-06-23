import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/design-system/styles/colors';

export type AppSheetDialogTone = 'info' | 'success' | 'warning' | 'danger';

interface AppSheetDialogProps {
  visible: boolean;
  tone?: AppSheetDialogTone;
  title: string;
  message?: string;
  primaryText: string;
  secondaryText?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
  onDismiss?: () => void;
  testIDPrefix?: string;
}

function getToneMeta(tone: AppSheetDialogTone) {
  switch (tone) {
    case 'success':
      return {
        iconLabel: 'OK',
        iconStyle: styles.iconSuccess,
        iconTextStyle: styles.iconTextSuccess,
        primaryStyle: styles.primaryButton,
      };
    case 'danger':
      return {
        iconLabel: '!',
        iconStyle: styles.iconDanger,
        iconTextStyle: styles.iconTextDanger,
        primaryStyle: styles.dangerButton,
      };
    case 'warning':
      return {
        iconLabel: '!',
        iconStyle: styles.iconWarning,
        iconTextStyle: styles.iconTextWarning,
        primaryStyle: styles.primaryButton,
      };
    case 'info':
    default:
      return {
        iconLabel: 'i',
        iconStyle: styles.iconInfo,
        iconTextStyle: styles.iconTextInfo,
        primaryStyle: styles.primaryButton,
      };
  }
}

export function AppSheetDialog({
  visible,
  tone = 'info',
  title,
  message,
  primaryText,
  secondaryText,
  onPrimary,
  onSecondary,
  onDismiss,
  testIDPrefix = 'app-sheet-dialog',
}: AppSheetDialogProps) {
  const insets = useSafeAreaInsets();
  const toneMeta = getToneMeta(tone);

  const dismiss = () => {
    onDismiss?.();
  };

  const handlePrimary = () => {
    dismiss();
    onPrimary();
  };

  const handleSecondary = () => {
    dismiss();
    onSecondary?.();
  };

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={dismiss}
    >
      <Pressable style={styles.backdrop} onPress={dismiss}>
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom + 24, 32) },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.handle} />
          <View style={[styles.icon, toneMeta.iconStyle]}>
            <Text style={[styles.iconText, toneMeta.iconTextStyle]}>
              {toneMeta.iconLabel}
            </Text>
          </View>

          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.message}>{message}</Text>}

          <View style={styles.actions}>
            <Pressable
              testID={`${testIDPrefix}-primary`}
              style={[styles.actionButton, toneMeta.primaryStyle]}
              onPress={handlePrimary}
            >
              <Text style={styles.primaryText}>{primaryText}</Text>
            </Pressable>
            {!!secondaryText && (
              <Pressable
                testID={`${testIDPrefix}-secondary`}
                style={[styles.actionButton, styles.secondaryButton]}
                onPress={handleSecondary}
              >
                <Text style={styles.secondaryText}>{secondaryText}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
  },
  sheet: {
    gap: 14,
    paddingHorizontal: 24,
    paddingTop: 18,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.background.primary,
  },
  handle: {
    alignSelf: 'center',
    width: 52,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#CBD5E1',
  },
  icon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  iconInfo: {
    backgroundColor: colors.brand.surface,
  },
  iconSuccess: {
    backgroundColor: '#DCFCE7',
  },
  iconWarning: {
    backgroundColor: '#FEF3C7',
  },
  iconDanger: {
    backgroundColor: colors.error.surface,
  },
  iconText: {
    fontSize: 20,
    fontWeight: '800',
  },
  iconTextInfo: {
    color: colors.brand.default,
  },
  iconTextSuccess: {
    color: '#15803D',
  },
  iconTextWarning: {
    color: '#B45309',
  },
  iconTextDanger: {
    color: colors.error.default,
  },
  title: {
    fontSize: 22,
    lineHeight: 29,
    fontWeight: '800',
    color: colors.text.primary,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  actions: {
    gap: 10,
    marginTop: 8,
  },
  actionButton: {
    minHeight: 54,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButton: {
    backgroundColor: colors.brand.default,
  },
  dangerButton: {
    backgroundColor: colors.error.default,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.background.secondary,
  },
  secondaryText: {
    color: colors.text.primary,
    fontSize: 15,
    fontWeight: '700',
  },
});
