import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { SafeAreaView } from '@/design-system/components/Box/SafeAreaView';
import { colors } from '@/design-system/styles/colors';
import { FingerprintIcon } from '@/components/icons/FingerprintIcon';
import { createPasskey, createChallenge } from '@/libs/passkey/passkey';
import { getStoredPasskey, savePasskey } from '@/libs/passkey/passkeyStore';
import {
  deriveWalletAddress,
  WalletCreationError,
} from '@/services/wallet/walletCreationService';
import { useWalletStore, WalletStatus, Wallet } from '@/stores/walletStore';
import { useAuthStore } from '@/stores/authStore';

const CHAIN_ID = Number(process.env.EXPO_PUBLIC_CHAIN_ID ?? 84532);

type Phase = 'intro' | 'passkey' | 'deriving';

/**
 * Wallet creation onboarding screen (scenario ① entry point).
 *
 * AuthProvider routes new users (no local passkey or wallet) here via
 * user.authFlow='walletCreation' (set in useSignIn).
 *
 * The passkey prompt is not triggered on mount — the user must tap the CTA first.
 * Flow after tap:
 *   1) Create passkey (if not already stored) — provides the txKey (WebAuthn) public key.
 *   2) deriveWalletAddress (calcAddr) — derives the counterfactual address from
 *      aud/iss (default recovery account) + passkey.
 *   3) Write a DERIVED record to walletStore.
 *   4) Navigate to /home — home auto-opens the activation sheet (FUNDING → CREATING)
 *      to handle funding and deployment.
 *
 * Step (1) must complete before (2) because the address depends on the passkey.
 */
export default function CreateWallet() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, updateUser, logout } = useAuthStore();
  const { addWallet, getWalletByChainId } = useWalletStore();
  const [phase, setPhase] = useState<Phase>('intro');
  const [error, setError] = useState<string | null>(null);
  const guardedRef = useRef(false);

  const busy = phase !== 'intro';

  // Re-entry guard: if a wallet already exists, navigate home without triggering the passkey prompt.
  useEffect(() => {
    if (guardedRef.current) return;
    guardedRef.current = true;
    const existing = getWalletByChainId(CHAIN_ID);
    if (existing && existing.status !== WalletStatus.NOT_CREATED) {
      updateUser({ authFlow: undefined });
      router.replace('/home');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async () => {
    setError(null);
    try {
      // 1) Create passkey (only if not already stored) — entry is CTA-gated so the biometric prompt is predictable.
      setPhase('passkey');
      const stored = await getStoredPasskey();
      if (!stored) {
        const nickname = user?.email ?? user?.nickname ?? 'User';
        const challenge = createChallenge();
        const { credentialId, publicKey, attestationObject, credentialPubkeyCose } =
          await createPasskey({ nickname, challenge });
        await savePasskey({ credentialId, publicKey, attestationObject, credentialPubkeyCose });
        updateUser({ hasPasskey: true });
      }

      // 2) Derive the counterfactual address from aud/iss (default recovery account) + passkey.
      setPhase('deriving');
      const address = await deriveWalletAddress({ chainId: CHAIN_ID });

      // 3) Write a DERIVED wallet record (the home activation sheet reads this address).
      const now = new Date().toISOString();
      const wallet: Wallet = {
        address,
        chainId: CHAIN_ID,
        status: WalletStatus.DERIVED,
        createdAt: now,
        derivedAt: now,
      };
      addWallet(wallet);

      // 4) Finish onboarding and navigate home (home auto-opens the FUNDING activation sheet).
      updateUser({ authFlow: undefined });
      router.replace('/home');
    } catch (err: unknown) {
      const anyErr = err as { error?: string; message?: string } | null;
      const raw = anyErr?.message ?? String(err);
      const cancelled =
        anyErr?.error === 'UserCancelled' || /cancel/i.test(raw);
      if (cancelled) {
        // Cancellation is not an error — return silently to intro so the user can retry.
        setPhase('intro');
        return;
      }
      if (err instanceof WalletCreationError) {
        setError(err.message);
      } else {
        setError(raw);
      }
      setPhase('intro');
    }
  };

  const onLogout = async () => {
    await logout();
    router.replace('/sign-in');
  };

  const phaseText =
    phase === 'deriving'
      ? t('onboarding.create.derivingAddress')
      : t('onboarding.create.creatingPasskey');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleSection}>
          <Text style={styles.title}>{t('onboarding.create.title')}</Text>
          <Text style={styles.subtitle}>{t('onboarding.create.subtitle')}</Text>
        </View>

        <View style={styles.iconSection}>
          <View style={styles.iconContainer}>
            <FingerprintIcon />
          </View>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>{t('onboarding.create.failedTitle')}</Text>
            <Text style={styles.errorMsg}>{error}</Text>
          </View>
        ) : (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>{t('onboarding.passkey.infoTitle')}</Text>
            <View style={styles.infoBullets}>
              <View style={styles.bulletRow}>
                <Text style={styles.bulletNumber}>1.</Text>
                <Text style={styles.bulletText}>{t('onboarding.passkey.infoBullet1')}</Text>
              </View>
              <View style={styles.bulletRow}>
                <Text style={styles.bulletNumber}>2.</Text>
                <Text style={styles.bulletText}>{t('onboarding.passkey.infoBullet2')}</Text>
              </View>
              <View style={styles.bulletRow}>
                <Text style={styles.bulletNumber}>3.</Text>
                <Text style={styles.bulletText}>{t('onboarding.create.infoBullet3')}</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomSection, { paddingBottom: Platform.OS === 'ios' ? 34 : 24 }]}>
        <Pressable
          style={[styles.createButton, busy && styles.createButtonLoading]}
          onPress={run}
          disabled={busy}
        >
          {busy ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.createButtonText}>{phaseText}</Text>
            </View>
          ) : (
            <Text style={styles.createButtonText}>
              {error ? t('onboarding.create.retry') : t('onboarding.create.createButton')}
            </Text>
          )}
        </Pressable>

        {error ? (
          <Pressable style={styles.ghost} onPress={onLogout} disabled={busy}>
            <Text style={styles.ghostText}>{t('onboarding.create.logout')}</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  titleSection: {
    paddingTop: 8,
    paddingBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
    lineHeight: 24,
  },
  iconSection: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 20,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 16,
  },
  infoBullets: {
    gap: 12,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 8,
  },
  bulletNumber: {
    fontSize: 14,
    color: '#64748B',
    width: 20,
  },
  bulletText: {
    fontSize: 14,
    color: '#64748B',
    flex: 1,
    lineHeight: 20,
  },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 20,
    gap: 8,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  errorMsg: {
    fontSize: 14,
    color: '#DC2626',
    lineHeight: 20,
  },
  bottomSection: {
    paddingHorizontal: 24,
    paddingTop: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  createButton: {
    backgroundColor: colors.brand.default,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  createButtonLoading: {
    opacity: 0.7,
  },
  createButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ghost: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  ghostText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '600',
  },
});
