import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Linking,
  ScrollView,
} from 'react-native';
import { ethers } from 'ethers';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from '@/design-system/components/Box/SafeAreaView';
import { useRouter } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { FingerprintIcon } from '@/components/icons/FingerprintIcon';
import * as Passkey from '@/libs/passkey/passkey';
import { useAuthStore } from '@/stores/authStore';
import { useWalletStore } from '@/stores/walletStore';
import { savePasskey, clearPasskey } from '@/libs/passkey/passkeyStore';
import {
  getRecoveryAccountsByChain,
  saveRecoveryAccountsForChain,
  RecoveryAccount,
} from '@/libs/recovery/recoveryAccountStore';
import { applyTxKeyUpdate } from '@/services/wallet/txKeyRecoveryService';
import { pickIdTokenWithNonce, type CollectedToken } from '@/services/wallet/zkProofUtils';
import { useRecoveryOwnerStore } from '@/stores/recoveryOwnerStore';
import { colors } from '@/design-system/styles/colors';
import {
  MasterKeySigningOverlay,
} from '@/components/MasterKeySigning/MasterKeySigningOverlay';
import type {
  SigningAccountStatus,
  MasterKeySigningStep,
} from '@/services/wallet/masterKeySigningService';
import { useProvingBundleDownloadConsent } from '@/components/ProvingBundleDownloadConsent';
import { useActionSheet } from '@/components/ui/ActionSheet';
import { isInsufficientForGas } from '@/libs/wallet/gasGate';

const TX_KEY_UPDATE_CANCELLED_MESSAGE = 'TxKey update cancelled';

const CHAIN_ID = Number(process.env.EXPO_PUBLIC_CHAIN_ID ?? 84532);
const RPC_URL = process.env.EXPO_PUBLIC_RPC_URL ?? 'https://sepolia.base.org';
const FAUCET_URL = 'https://www.alchemy.com/faucets/base-sepolia';
// 3-of-3 master key circuit constraint: max 3 recovery accounts, no duplicates.
const MAX_RECOVERY_ACCOUNTS = 3;

function pickActiveWallet(state: any): { address: string; chainId: number } | null {
  if (state?.wallet) return state.wallet;
  if (Array.isArray(state?.wallets) && state.wallets.length > 0) return state.wallets[0];
  return null;
}

export default function ResetPasskey() {
  const { t } = useTranslation();
  const router = useRouter();
  const { authenticate, user } = useAuthStore();
  const {
    confirmProvingBundleReady,
    consentModal: provingBundleConsentModal,
  } = useProvingBundleDownloadConsent();
  const { show: showSheet, sheetElement } = useActionSheet();
  const [isRecovering, setIsRecovering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [displayAccounts, setDisplayAccounts] = useState<RecoveryAccount[]>([]);
  const [accountStatuses, setAccountStatuses] = useState<SigningAccountStatus[]>([]);
  const [currentPhase, setCurrentPhase] = useState<MasterKeySigningStep | null>(null);
  const [verifiedCount, setVerifiedCount] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const confirmResolveRef = useRef<{
    resolve: () => void;
    reject: (error: Error) => void;
  } | null>(null);

  // Recovery account picker state. Each slot is "verified" once it holds a token,
  // or "pending" if it was pre-filled from the recovery owner store but not yet authenticated.
  const [pickActive, setPickActive] = useState(false);
  const [pickBusyKind, setPickBusyKind] = useState<'add' | 'verify' | null>(null);
  const pickBusy = pickBusyKind !== null;
  const [pickSlots, setPickSlots] = useState<{ account: RecoveryAccount; verified: boolean }[]>([]);
  const pickedRef = useRef<{ account: RecoveryAccount; token?: CollectedToken }[]>([]);
  const pickNonceRef = useRef<string>('');
  const collectResolveRef = useRef<{
    resolve: (tokens: CollectedToken[]) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const syncPickSlots = () =>
    setPickSlots(pickedRef.current.map((s) => ({ account: s.account, verified: !!s.token })));

  const wallet = useWalletStore((s) => pickActiveWallet(s));

  useEffect(() => {
    const chainId = wallet?.chainId ?? CHAIN_ID;
    getRecoveryAccountsByChain(chainId).then((accounts) => {
      if (accounts && accounts.length > 0) setDisplayAccounts(accounts);
    });
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [wallet?.chainId]);

  // Clear the pre-filled owner on unmount to prevent leaking into the next entry.
  useEffect(() => () => useRecoveryOwnerStore.getState().clear(), []);

  const handleCancel = () => {
    // If the picker is waiting for token collection, reject the pending promise.
    if (collectResolveRef.current) {
      abortControllerRef.current?.abort();
      collectResolveRef.current.reject(new Error(TX_KEY_UPDATE_CANCELLED_MESSAGE));
      collectResolveRef.current = null;
      setPickActive(false);
      return;
    }
    abortControllerRef.current?.abort();
    confirmResolveRef.current?.reject(new Error(TX_KEY_UPDATE_CANCELLED_MESSAGE));
    confirmResolveRef.current = null;
  };

  const handleConfirmRequired = (_idx: number, _account: RecoveryAccount): Promise<void> => {
    return new Promise((resolve, reject) => {
      confirmResolveRef.current = { resolve, reject };
    });
  };

  // Called by signWithMasterKey with the zkNonce; opens the picker overlay and waits
  // until the user has selected 1–3 recovery accounts, then resolves with the collected tokens.
  const handleCollectTokens = (zkNonce: string): Promise<CollectedToken[]> => {
    pickNonceRef.current = zkNonce;
    // Pre-fill slot 0 with the owner account identified during wallet recovery (if present).
    const owner = useRecoveryOwnerStore.getState().owner;
    pickedRef.current = owner ? [{ account: owner }] : [];
    syncPickSlots();
    setPickBusyKind(null);
    setPickActive(true);
    return new Promise((resolve, reject) => {
      collectResolveRef.current = { resolve, reject };
    });
  };

  // Authenticate the pending pre-filled owner slot via zkNonce OAuth to mark it verified.
  const onPickVerifyPending = async () => {
    if (pickBusyKind) return;
    const idx = pickedRef.current.findIndex((s) => !s.token);
    if (idx < 0) return;
    setPickBusyKind('verify');
    try {
      const { token, account } = await pickIdTokenWithNonce('google', pickNonceRef.current, true);
      if (
        pickedRef.current.some(
          (s, i) =>
            i !== idx && s.token && s.account.provider === account.provider && s.account.sub === account.sub,
        )
      ) {
        showSheet({ tone: 'warning', title: t('common.error'), message: t('recoveryReentry.errors.duplicate'), primaryText: t('common.confirm') });
        return;
      }
      pickedRef.current = pickedRef.current.map((s, i) => (i === idx ? { account, token } : s));
      syncPickSlots();
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/cancel|UserCancelled/i.test(msg)) {
        console.error('[reset-passkey] owner verify failed:', err);
        showSheet({ tone: 'danger', title: t('common.error'), message: msg, primaryText: t('common.confirm') });
      }
    } finally {
      setPickBusyKind(null);
    }
  };

  const onPickAddAccount = async () => {
    if (pickBusyKind || pickedRef.current.length >= MAX_RECOVERY_ACCOUNTS) return;
    setPickBusyKind('add');
    try {
      const { token, account } = await pickIdTokenWithNonce('google', pickNonceRef.current, true);
      if (pickedRef.current.some((s) => s.account.provider === account.provider && s.account.sub === account.sub)) {
        showSheet({
          tone: 'warning',
          title: t('common.error'),
          message: t('recoveryReentry.errors.duplicate'),
          primaryText: t('common.confirm'),
        });
        return;
      }
      pickedRef.current = [...pickedRef.current, { account, token }];
      syncPickSlots();
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/cancel|UserCancelled/i.test(msg)) {
        console.error('[reset-passkey] account pick failed:', err);
        showSheet({ tone: 'danger', title: t('common.error'), message: msg, primaryText: t('common.confirm') });
      }
    } finally {
      setPickBusyKind(null);
    }
  };

  const onPickRemove = (index: number) => {
    if (pickBusyKind) return;
    pickedRef.current = pickedRef.current.filter((_, i) => i !== index);
    syncPickSlots();
  };

  const onPickDone = () => {
    const slots = pickedRef.current;
    // All slots must be verified (hold a token) before proceeding; block if any are still pending.
    if (slots.length === 0 || slots.some((s) => !s.token)) return;
    const tokens = slots.map((s) => s.token as CollectedToken);
    const accounts = slots.map((s, i) => ({ ...s.account, isDefault: i === 0 }));
    setPickActive(false);
    // Transition to the proof phase so the overlay shows the selected accounts as verified.
    setDisplayAccounts(accounts);
    setAccountStatuses(accounts.map(() => 'verified'));
    setVerifiedCount(accounts.length);
    setIsRecovering(true);
    collectResolveRef.current?.resolve(tokens);
    collectResolveRef.current = null;
  };

  // Fetch the wallet's native balance as an ETH string.
  // Returns null on failure so the gas gate fails open (does not block the user).
  const fetchBalanceEth = async (address: string): Promise<string | null> => {
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const wei = await provider.getBalance(address);
      return ethers.formatEther(wei);
    } catch (err) {
      console.warn('[reset-passkey] eth_getBalance failed:', err);
      return null;
    }
  };

  // Show an insufficient-gas warning sheet with options to copy the deposit address or open the faucet.
  const showGasGate = (address: string) => {
    showSheet({
      title: t('recovery.gasGate.title'),
      message: t('recovery.gasGate.body'),
      tone: 'warning',
      primaryText: t('recovery.gasGate.faucet'),
      secondaryText: t('recovery.gasGate.deposit'),
      onPrimary: () => {
        Linking.openURL(FAUCET_URL).catch(() => {});
      },
      onSecondary: () => {
        Clipboard.setStringAsync(address).catch(() => {});
      },
    });
  };

  const handleCreateAndRecoverPasskey = async () => {
    if (!wallet) {
      showSheet({
        title: t('common.error'),
        message: t('recovery.initiate.walletNotFoundMessage'),
        tone: 'danger',
        primaryText: t('common.confirm'),
      });
      return;
    }

    // Scenario ④: known recovery accounts from SecureStore.
    // Scenario ⑤: new device with no stored accounts — user picks via the picker overlay.
    const storedAccounts = await getRecoveryAccountsByChain(wallet.chainId);
    const hasAccounts = !!storedAccounts && storedAccounts.length > 0;

    // Gas gate: a null balance (fetch failure) fails open and does not block the user.
    const balance = await fetchBalanceEth(wallet.address);
    if (isInsufficientForGas(balance)) {
      showGasGate(wallet.address);
      return;
    }

    const canProceedWithProof = await confirmProvingBundleReady('3-of-3');
    if (!canProceedWithProof) {
      return;
    }

    setIsLoading(true);

    let passkeyCreated = false;
    let credentialId: string | undefined;

    try {
      // 1. Create a new passkey.
      const challenge = Passkey.createChallenge();
      const accountForName = hasAccounts
        ? (storedAccounts!.find((a) => a.isDefault) ?? storedAccounts![0])
        : undefined;
      const userName = accountForName?.identifier ?? user?.email ?? user?.nickname ?? 'User';
      const passkeyResult = await Passkey.createPasskey({ nickname: userName, challenge });
      credentialId = passkeyResult.credentialId;
      passkeyCreated = true;

      setCurrentPhase(null);
      setVerifiedCount(0);
      // Both ④ and ⑤ use a single unified overlay from the start, so auth and proof
      // phases stay visually consistent throughout.
      setIsRecovering(true);
      if (hasAccounts) {
        // ④: known accounts — show the signing overlay immediately.
        setAccountStatuses(storedAccounts!.map(() => 'pending'));
        setDisplayAccounts(storedAccounts!);
      } else {
        // ⑤: start with an empty list; the picker (Auth phase) will populate it.
        setAccountStatuses([]);
        setDisplayAccounts([]);
      }

      abortControllerRef.current = new AbortController();

      // 2. Build the in-memory passkey object (before persisting with savePasskey).
      const localPasskey = {
        credentialId: passkeyResult.credentialId,
        publicKey: passkeyResult.publicKey,
        credentialPubkeyCose: passkeyResult.credentialPubkeyCose,
        attestationObject: passkeyResult.attestationObject,
      };

      // 3. Update the on-chain txKey.
      await applyTxKeyUpdate({
        chainId: wallet.chainId,
        sender: wallet.address,
        localPasskey,
        ...(hasAccounts
          ? { currentAccounts: storedAccounts!, onConfirmRequired: handleConfirmRequired }
          : { collectTokens: handleCollectTokens }),
        abortSignal: abortControllerRef.current.signal,
        skipProvingKeyNetworkCheck: true,
        onProgress: (step) => {
          if (step.type === 'signing') {
            const inner = step.signingStep;
            if (inner.type === 'account_signing') {
              const mapped: SigningAccountStatus =
                inner.status === 'verified' ? 'verified' :
                inner.status === 'waiting_user' ? 'waiting_user' :
                inner.status === 'error' ? 'error' :
                inner.status === 'signing' ? 'signing' : 'pending';
              setAccountStatuses((prev) =>
                prev.map((s, idx) => (idx === inner.accountIndex ? mapped : s)),
              );
              setCurrentPhase({
                type: 'account_signing',
                accountIndex: inner.accountIndex,
                account: inner.account,
                status: mapped,
              });
              if (mapped === 'verified') setVerifiedCount((n) => n + 1);
            } else {
              setCurrentPhase(inner);
            }
          } else if (step.type === 'building_userop' || step.type === 'reading_anchor' || step.type === 'checking_balance') {
            setCurrentPhase({ type: 'computing_nonce' });
          } else if (step.type === 'submitting' || step.type === 'confirming') {
            setCurrentPhase({ type: 'encoding_signature' });
          } else if (step.type === 'completed') {
            setCurrentPhase({ type: 'completed' });
          }
        },
      });

      // 4. Persist the new passkey locally (only after on-chain success).
      await savePasskey(localPasskey);

      // 5. For scenario ⑤: persist the picker-selected recovery accounts to SecureStore
      //    so they are available for future ④ re-authentication.
      const finalAccounts = hasAccounts
        ? storedAccounts!
        : pickedRef.current.map((p, i) => ({ ...p.account, isDefault: i === 0 }));
      if (!hasAccounts && finalAccounts.length > 0) {
        await saveRecoveryAccountsForChain(wallet.chainId, finalAccounts).catch((err) => {
          console.warn('[reset-passkey] failed to persist recovery accounts:', err);
        });
      }

      // 6. Update auth state.
      const defaultAccount = finalAccounts.find((a) => a.isDefault) ?? finalAccounts[0];
      if (defaultAccount) {
        authenticate({
          email: defaultAccount.identifier,
          provider: defaultAccount.provider,
          hasPasskey: true,
          hasRecovery: true,
          nickname: useAuthStore.getState().user?.nickname,
        });
      }

      // 7. Show success and navigate home.
      showSheet({
        title: t('onboarding.passkey.resetTitle'),
        tone: 'success',
        primaryText: t('common.confirm'),
        onPrimary: () => router.replace('/home'),
      });
    } catch (error: any) {
      const errorStr = error instanceof Error ? error.message : JSON.stringify(error);
      const isUserCancelled =
        error?.error === 'UserCancelled' ||
        errorStr.includes('UserCancelled') ||
        errorStr.includes('canceled') ||
        errorStr.includes('cancelled') ||
        errorStr.includes('TxKey update cancelled');

      if (!isUserCancelled) {
        console.error('Passkey reset failed:', error);
        if (passkeyCreated && credentialId) {
          await clearPasskey().catch(() => {});
        }
        // User cancellation is silently ignored; only surface non-cancellation errors.
        showSheet({
          title: t('common.error'),
          message: t('recovery.initiate.resetPasskeyFailed'),
          tone: 'danger',
          primaryText: t('common.confirm'),
        });
      }
    } finally {
      setIsLoading(false);
      setIsRecovering(false);
      setCurrentPhase(null);
      confirmResolveRef.current = null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.titleSection}>
              <Text style={styles.title}>{t('onboarding.passkey.resetTitle')}</Text>
              <Text style={styles.subtitle}>{t('onboarding.passkey.resetSubtitle')}</Text>
            </View>

            <View style={styles.iconSection}>
              <View style={styles.iconContainer}>
                <FingerprintIcon />
              </View>
            </View>

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
                  <Text style={styles.bulletText}>{t('onboarding.passkey.infoBullet3')}</Text>
                </View>
              </View>
            </View>
          </ScrollView>

          <View style={[styles.bottomSection, { paddingBottom: Platform.OS === 'ios' ? 34 : 24 }]}>
            <Pressable
              style={[styles.createButton, isLoading && styles.createButtonLoading]}
              onPress={handleCreateAndRecoverPasskey}
              disabled={isLoading}
            >
              <Text style={styles.createButtonText}>
                {isLoading ? t('common.loading') : t('onboarding.passkey.createButton')}
              </Text>
            </Pressable>
          </View>
        </>

      {/* Recovery overlay shared by scenarios ④ and ⑤. For ⑤, account selection
          is handled inside this overlay via the picker's Auth phase. */}
      <MasterKeySigningOverlay
        visible={isRecovering}
        accounts={displayAccounts}
        accountStatuses={accountStatuses}
        currentPhase={currentPhase}
        verifiedCount={verifiedCount}
        onConfirmLogin={() => {
          confirmResolveRef.current?.resolve();
          confirmResolveRef.current = null;
        }}
        onCancel={handleCancel}
        pick={{
          active: pickActive,
          busy: pickBusy,
          busyKind: pickBusyKind,
          max: MAX_RECOVERY_ACCOUNTS,
          accounts: pickSlots,
          onAddAccount: onPickAddAccount,
          onVerifyPending: onPickVerifyPending,
          onRemove: onPickRemove,
          onDone: onPickDone,
        }}
      />
      {provingBundleConsentModal}
      {sheetElement}
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
});
