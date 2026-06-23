import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { ethers } from 'ethers';
import { SafeAreaView } from '@/design-system/components/Box/SafeAreaView';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useRef, useCallback } from 'react';
import { BackIcon } from '@/components/icons/NavigationIcons';
import { SocialProvider } from '@/stores/authStore';
import { useWalletStore } from '@/stores/walletStore';
import {
  getRecoveryAccountsByChain,
  saveRecoveryAccountsForChain,
  type RecoveryAccount,
} from '@/libs/recovery/recoveryAccountStore';
import { decodeIdToken } from '@/libs/jwt/decodeIdToken';
import { googleSignIn } from '@/services/auth/googleAuth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { createChallenge } from '@/libs/passkey/passkey';
import { applyRecoveryUpdate, RecoveryServiceError } from '@/services/wallet/recoveryService';
import { isSupportedProvider } from '@/libs/constants/providers';
import { getCanonicalClientId, initProviderConfig } from '@/libs/wallet/providerConfigHelper';
import { SocialAccountList } from '@/components/SocialAccountList';
import { MasterKeySigningOverlay } from '@/components/MasterKeySigning';
import type { SigningAccountStatus, MasterKeySigningStep } from '@/services/wallet/masterKeySigningService';
import { useProvingBundleDownloadConsent } from '@/components/ProvingBundleDownloadConsent';
import { RecoveryUpdateReview } from '@/components/flow/RecoveryUpdateReview';
import { useActionSheet } from '@/components/ui/ActionSheet';
import { isInsufficientForGas } from '@/libs/wallet/gasGate';

const CHAIN_ID = Number(process.env.EXPO_PUBLIC_CHAIN_ID ?? 84532);
const RPC_URL = process.env.EXPO_PUBLIC_RPC_URL ?? 'https://sepolia.base.org';
const FAUCET_URL = 'https://www.alchemy.com/faucets/base-sepolia';
const RECOVERY_UPDATE_CANCELLED_MESSAGE = 'Recovery update cancelled';

type RecoveryStep = 'editor' | 'review';

function isCancellationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /cancelled|canceled|cancel/i.test(message);
}

function pickActiveWallet(state: any): { address: string; chainId: number } | null {
  if (state?.wallet) return state.wallet;
  if (Array.isArray(state?.wallets) && state.wallets.length > 0) return state.wallets[0];
  return null;
}

export default function RecoverySetup() {
  const { t } = useTranslation();
  const router = useRouter();
  const { chainId: chainIdParam } = useLocalSearchParams<{ chainId?: string }>();
  const {
    confirmProvingBundleReady,
    consentModal: provingBundleConsentModal,
  } = useProvingBundleDownloadConsent();
  const { show: showSheet, sheetElement } = useActionSheet();

  const wallet = useWalletStore((s) => pickActiveWallet(s));
  const resolvedChainId = (() => {
    if (chainIdParam) {
      const parsed = parseInt(chainIdParam, 10);
      if (!isNaN(parsed)) return parsed;
    }
    return wallet?.chainId ?? CHAIN_ID;
  })();

  const [accounts, setAccounts] = useState<RecoveryAccount[]>([]);
  const [originalAccounts, setOriginalAccounts] = useState<RecoveryAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [step, setStep] = useState<RecoveryStep>('editor');
  const [isCheckingGas, setIsCheckingGas] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [signingAccountStatuses, setSigningAccountStatuses] = useState<SigningAccountStatus[]>([]);
  const [signingPhase, setSigningPhase] = useState<MasterKeySigningStep | null>(null);
  const [signingVerifiedCount, setSigningVerifiedCount] = useState(0);
  const confirmResolverRef = useRef<{
    resolve: () => void;
    reject: (error: Error) => void;
  } | null>(null);

  const handleConfirmLogin = useCallback(() => {
    confirmResolverRef.current?.resolve();
    confirmResolverRef.current = null;
  }, []);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    const stored = await getRecoveryAccountsByChain(resolvedChainId);
    if (stored) {
      setAccounts(stored);
      setOriginalAccounts(stored);
    } else {
      setAccounts([]);
      setOriginalAccounts([]);
    }
    setIsLoading(false);
  };

  const hasChanges = () => {
    if (accounts.length !== originalAccounts.length) return true;
    return accounts.some(
      (a, i) => a.provider !== originalAccounts[i].provider || a.sub !== originalAccounts[i].sub
    );
  };

  const handleBack = () => {
    if (hasChanges()) {
      showSheet({
        tone: 'warning',
        title: t('recovery.setup.discardChanges'),
        message: t('recovery.setup.discardMessage'),
        primaryText: t('recovery.setup.leaveWithoutSaving'),
        secondaryText: t('common.cancel'),
        onPrimary: () => router.back(),
      });
    } else {
      router.back();
    }
  };

  const handleAddAccount = async (provider: SocialProvider): Promise<void> => {
    if (!isSupportedProvider(provider)) {
      console.warn(`Provider ${provider} is not currently supported`);
      return;
    }

    try {
      let result: { idToken: string; userName: string; email?: string | null };

      switch (provider as SocialProvider) {
        case 'google':
          result = await googleSignIn({ nonce: createChallenge(), forceAccountSelection: true });
          GoogleSignin.signOut().catch(() => {});
          break;
      }

      const decoded = decodeIdToken(result.idToken);

      const isDuplicate = accounts.some(
        (a) => a.provider === provider && a.sub === decoded.sub
      );
      if (isDuplicate) {
        showSheet({
          tone: 'warning',
          title: t('onboarding.wallet.duplicateAccount'),
          primaryText: t('common.ok'),
        });
        return;
      }

      await initProviderConfig();
      const newAccount: RecoveryAccount = {
        provider,
        iss: decoded.iss,
        sub: decoded.sub,
        aud: getCanonicalClientId(provider),
        identifier: result.email || result.userName || decoded.identifier,
        isDefault: false,
      };
      setAccounts((prev) => [...prev, newAccount]);
    } catch (error) {
      console.error('Add account error:', error);
    }
  };

  const handleRemoveAccount = (index: number) => {
    if (index === 0) return;

    showSheet({
      tone: 'danger',
      title: t('onboarding.wallet.removeAccount'),
      message: t('onboarding.wallet.removeAccountConfirm'),
      primaryText: t('common.delete'),
      secondaryText: t('common.cancel'),
      onPrimary: () => {
        setAccounts((prev) => prev.filter((_, i) => i !== index));
      },
    });
  };

  const handleCancelApply = () => {
    abortController?.abort();
    confirmResolverRef.current?.reject(new Error(RECOVERY_UPDATE_CANCELLED_MESSAGE));
    confirmResolverRef.current = null;
  };

  /**
   * Fetch the active wallet's native balance as an ether string, or `null` on
   * any failure (so the gas gate fails open — see gasGate.isInsufficientForGas).
   */
  const fetchBalanceEth = async (): Promise<string | null> => {
    if (!wallet?.address) return null;
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const value = await provider.getBalance(wallet.address);
      return ethers.formatEther(value);
    } catch (error) {
      console.warn('[RecoverySetup] balance check failed:', error);
      return null;
    }
  };

  const showGasGate = () => {
    showSheet({
      tone: 'warning',
      title: t('recovery.gasGate.title'),
      message: t('recovery.gasGate.body'),
      primaryText: t('recovery.gasGate.faucet'),
      secondaryText: t('recovery.gasGate.deposit'),
      onPrimary: () => {
        Linking.openURL(FAUCET_URL).catch((error) =>
          console.warn('[RecoverySetup] open faucet failed:', error),
        );
      },
      onSecondary: () => {
        if (wallet?.address) {
          Clipboard.setStringAsync(wallet.address).catch(() => {});
        }
      },
    });
  };

  // Editor → Review transition: run the cheap guards + gas gate here, then show
  // the before/after diff. The actual signing runs from the Review's onConfirm.
  const handleApply = async () => {
    if (!hasChanges()) {
      showSheet({
        tone: 'info',
        title: t('recovery.setup.noChanges'),
        primaryText: t('common.ok'),
      });
      return;
    }
    if (!wallet?.address) {
      showSheet({
        tone: 'warning',
        title: t('errors.generic'),
        message: t('recovery.setup.walletNotFound'),
        primaryText: t('common.ok'),
      });
      return;
    }
    // Belt-and-suspenders: the update requires authenticating with the current
    // on-chain accounts, so there must be at least one. recovery/index only
    // routes here with >=1, but guard so runApply never calls applyRecoveryUpdate
    // with an empty currentAccounts (and the signing overlay, already suppressed
    // below 1, stays consistent).
    if (originalAccounts.length < 1) {
      showSheet({
        tone: 'warning',
        title: t('errors.generic'),
        message: t('recovery.setup.walletNotFound'),
        primaryText: t('common.ok'),
      });
      return;
    }

    setIsCheckingGas(true);
    const balance = await fetchBalanceEth();
    setIsCheckingGas(false);
    if (isInsufficientForGas(balance)) {
      showGasGate();
      return;
    }

    setStep('review');
  };

  // Review → signing: the existing applyRecoveryUpdate path, unchanged except
  // that it now runs from the Review confirm instead of directly from Apply.
  const runApply = async () => {
    if (!wallet?.address) return;

    const canProceedWithProof = await confirmProvingBundleReady('3-of-3');
    if (!canProceedWithProof) {
      return;
    }

    const controller = new AbortController();
    setAbortController(controller);
    setIsApplying(true);
    setSigningAccountStatuses(originalAccounts.map(() => 'pending'));
    setSigningPhase(null);
    setSigningVerifiedCount(0);

    try {
      await applyRecoveryUpdate({
        chainId: resolvedChainId,
        sender: wallet.address,
        currentAccounts: originalAccounts,
        newAccounts: accounts,
        abortSignal: controller.signal,
        onConfirmRequired: () =>
          new Promise<void>((resolve, reject) => {
            confirmResolverRef.current = { resolve, reject };
          }),
        skipProvingKeyNetworkCheck: true,
        onProgress: (step) => {
          switch (step.type) {
            case 'building_userop':
              setSigningPhase({ type: 'computing_nonce' });
              break;
            case 'downloading_keys':
              setSigningPhase({ type: 'downloading_keys', progress: step.progress });
              break;
            case 'collecting_tokens': {
              const mapped: SigningAccountStatus =
                step.status === 'success' ? 'verified' :
                step.status === 'waiting_user' ? 'waiting_user' :
                step.status === 'error' ? 'error' : 'pending';
              setSigningAccountStatuses((prev) =>
                prev.map((s, idx) => (idx === step.accountIndex ? mapped : s)),
              );
              setSigningPhase({
                type: 'account_signing',
                accountIndex: step.accountIndex,
                account: originalAccounts[step.accountIndex],
                status: mapped,
              });
              if (mapped === 'verified') setSigningVerifiedCount((n) => n + 1);
              break;
            }
            case 'collecting_merkle_data':
              setSigningPhase({ type: 'collecting_merkle_data' });
              break;
            case 'generating_proof':
              setSigningPhase({ type: 'generating_proof' });
              break;
            case 'signing':
            case 'submitting':
            case 'waiting_confirmation':
              setSigningPhase({ type: 'encoding_signature' });
              break;
            case 'completed':
              setSigningPhase({ type: 'completed' });
              break;
          }
        },
      });

      // Success: persist the updated accounts to SecureStore.
      await saveRecoveryAccountsForChain(resolvedChainId, accounts);
      setOriginalAccounts([...accounts]);
      setStep('editor');

      showSheet({
        tone: 'success',
        title: t('recovery.setup.applySuccess'),
        primaryText: t('common.ok'),
        onPrimary: () => router.back(),
      });
    } catch (error) {
      if (!isCancellationError(error)) {
        console.error('[RecoverySetup] applyRecoveryUpdate failed:', error);
        const message = error instanceof RecoveryServiceError
          ? error.message
          : t('recovery.setup.applyFailed');
        showSheet({
          tone: 'danger',
          title: t('errors.generic'),
          message,
          primaryText: t('common.ok'),
        });
      }
    } finally {
      setIsApplying(false);
      setAbortController(null);
      confirmResolverRef.current = null;
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </SafeAreaView>
    );
  }

  if (step === 'review') {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.container}>
          <RecoveryUpdateReview
            currentAccounts={originalAccounts}
            newAccounts={accounts}
            onConfirm={runApply}
            onBack={() => setStep('editor')}
            onCancel={() => setStep('editor')}
          />

          {isApplying && originalAccounts.length >= 1 && (
            <MasterKeySigningOverlay
              visible={isApplying}
              accounts={originalAccounts}
              accountStatuses={signingAccountStatuses}
              currentPhase={signingPhase}
              verifiedCount={signingVerifiedCount}
              onConfirmLogin={handleConfirmLogin}
              onCancel={handleCancelApply}
            />
          )}
          {provingBundleConsentModal}
          {sheetElement}
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={styles.backButton} hitSlop={8}>
            <BackIcon />
          </Pressable>
          <Text style={styles.headerTitle}>{t('recovery.setup.title')}</Text>
          <View style={styles.headerRight} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
        >
          <View style={styles.titleSection}>
            <Text style={styles.subtitle}>
              {t('recovery.setup.description')}
            </Text>
          </View>

          <SocialAccountList
            accounts={accounts}
            onAddAccount={handleAddAccount}
            onRemoveAccount={handleRemoveAccount}
          />
        </ScrollView>

        <View style={[styles.bottomSection, { paddingBottom: 24 }]}>
          <Pressable
            style={[styles.saveButton, isCheckingGas && styles.saveButtonDisabled]}
            onPress={handleApply}
            disabled={isCheckingGas}
          >
            {isCheckingGas ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>
                {t('recovery.setup.applyButton')}
              </Text>
            )}
          </Pressable>
        </View>

        {provingBundleConsentModal}
        {sheetElement}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0F172A',
  },
  headerRight: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  titleSection: {
    paddingTop: 16,
    paddingBottom: 24,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
    lineHeight: 24,
  },
  bottomSection: {
    paddingHorizontal: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  saveButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
