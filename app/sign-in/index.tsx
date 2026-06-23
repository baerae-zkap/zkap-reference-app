import { View, Text, StyleSheet, Pressable, Image, Dimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from '@/design-system/components/Box/SafeAreaView';
import { GoogleSignInButton } from '@/components/SocialButton/GoogleSignInButton';
import { useActionSheet } from '@/components/ui/ActionSheet';
import { useSignIn } from '@/hooks/useSignIn';
import { googleSignOut } from '@/services/auth/googleAuth';
import { colors } from '@/design-system/styles/colors';

const backblur = require('@/design-system/components/Image/assets/backblur.png');
const heroImage = require('@/design-system/components/Image/assets/hero-image.png');
const welcomeLogo = require('@/design-system/components/Image/assets/welcome-logo.png');

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function SignIn() {
  const { t } = useTranslation();
  const { show: showSheet, sheetElement } = useActionSheet();
  const { handleSignIn, handleRecoverWallet, loadingProvider } = useSignIn({ showSheet });

  return (
    <View style={styles.container}>
      {/* Background Image */}
      <Image
        source={backblur}
        style={styles.backgroundImage}
        resizeMode="cover"
      />

      {/* Content */}
      <SafeAreaView style={[styles.content, { paddingTop: 24 }]}>
        {/* Top Section with Logo */}
        <View style={styles.topSection}>
          <Image
            source={welcomeLogo}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* Center Section with Hero Image */}
        <View style={styles.centerSection}>
          <Image
            source={heroImage}
            style={styles.heroImage}
            resizeMode="contain"
          />
        </View>

        {/* Welcome Text */}
        <View style={styles.welcomeSection}>
          <Text style={styles.title}>{t('auth.welcome')}</Text>
          <Text style={styles.subtitle}>{t('auth.welcomeSubtitle')}</Text>
        </View>

        {/* Bottom Section with Buttons */}
        <View style={[styles.bottomSection, { paddingBottom: 24 }]}>
          <View style={styles.buttonsContainer}>
            <GoogleSignInButton
              isLoading={loadingProvider === 'google'}
              onSuccess={(data) => handleSignIn('google', data)}
              onError={(error) => {
                const msg = error instanceof Error ? error.message : String(error);
                // Clear the Google session on any error (including cancellation) to prevent stale sessions.
                googleSignOut().catch(() => {});
                if (!msg.includes('cancelled') && !msg.includes('canceled')) {
                  console.error('Google sign in error:', error);
                  showSheet({
                    tone: 'danger',
                    title: t('auth.signInFailedTitle'),
                    message: t('auth.signInFailedMessage', { error: msg }),
                    primaryText: t('common.confirm'),
                  });
                }
              }}
            >
              {t('auth.continueWithGoogle')}
            </GoogleSignInButton>
          </View>

          {/* Recovery Link */}
          <View style={styles.recoverySection}>
            <Pressable
              onPress={handleRecoverWallet}
              disabled={loadingProvider !== null}
              hitSlop={8}
            >
              <Text
                style={[
                  styles.recoveryLink,
                  loadingProvider !== null && styles.recoveryLinkDisabled,
                ]}
              >
                {t('auth.recoverWallet')}
              </Text>
            </Pressable>
          </View>

        </View>
      </SafeAreaView>
      {sheetElement}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
  },
  topSection: {
    alignItems: 'center',
    paddingTop: 28,
  },
  logo: {
    width: 108,
    height: 27,
  },
  centerSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  heroImage: {
    width: SCREEN_WIDTH - 48,
    height: 192,
    maxWidth: 342,
  },
  welcomeSection: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.text.secondary,
    textAlign: 'center',
  },
  bottomSection: {
    paddingHorizontal: 24,
  },
  buttonsContainer: {
    gap: 12,
  },
  recoverySection: {
    alignItems: 'center',
    marginTop: 24,
  },
  recoveryLink: {
    fontSize: 14,
    color: colors.text.secondary,
    textDecorationLine: 'underline',
  },
  recoveryLinkDisabled: {
    opacity: 0.5,
  },
});
