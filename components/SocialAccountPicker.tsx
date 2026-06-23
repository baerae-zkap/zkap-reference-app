import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { SocialProvider } from '@/stores/authStore';
import { isSupportedProvider } from '@/libs/constants/providers';

interface SocialAccountPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (provider: SocialProvider) => void;
}

function GoogleIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <Path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <Path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <Path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </Svg>
  );
}

export function SocialAccountPicker({
  visible,
  onClose,
  onSelect,
}: SocialAccountPickerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const providers: {
    key: SocialProvider;
    label: string;
    icon: React.ReactNode;
    bgColor: string;
    textColor: string;
  }[] = [
    {
      key: 'google',
      label: 'Google',
      icon: <GoogleIcon />,
      bgColor: '#FFFFFF',
      textColor: '#3C4043',
    },
  ];

  const handleSelect = (provider: SocialProvider) => {
    onClose();
    // Small delay to let the modal close animation finish before firing the callback.
    setTimeout(() => onSelect(provider), 100);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View
          style={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom + 24, 40) },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>
            {t('onboarding.wallet.selectProvider')}
          </Text>

          {providers.filter((p) => isSupportedProvider(p.key)).map((p) => (
            <Pressable
              key={p.key}
              style={[
                styles.providerButton,
                {
                  backgroundColor: p.bgColor,
                  borderColor: p.key === 'google' ? '#DADCE0' : p.bgColor,
                },
              ]}
              onPress={() => handleSelect(p.key)}
            >
              <View style={styles.providerIcon}>{p.icon}</View>
              <Text style={[styles.providerText, { color: p.textColor }]}>
                {p.label}
              </Text>
            </Pressable>
          ))}

          <Pressable style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 20,
  },
  providerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  providerIcon: {
    width: 24,
    height: 24,
  },
  providerText: {
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    marginTop: 8,
    padding: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    color: '#64748B',
  },
});
