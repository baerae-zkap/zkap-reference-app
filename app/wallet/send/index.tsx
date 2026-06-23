import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import * as Clipboard from 'expo-clipboard';
import { ethers } from 'ethers';

import { useWalletStore } from '@/stores/walletStore';
import { getStoredPasskey } from '@/libs/passkey/passkeyStore';
import {
  transactionService,
  WalletNotDeployedError,
  PasskeyMismatchError,
  InsufficientBalanceError,
} from '@/services/wallet/transactionService';
import { colors } from '@/design-system/styles/colors';
import { useActionSheet } from '@/components/ui/ActionSheet';

const RPC_URL = process.env.EXPO_PUBLIC_RPC_URL ?? 'https://sepolia.base.org';
const CHAIN_ID = Number(process.env.EXPO_PUBLIC_CHAIN_ID ?? 84532);

function pickActiveWallet(state: any): { address: string; chainId: number } | null {
  if (state?.wallet) return state.wallet;
  if (Array.isArray(state?.wallets) && state.wallets.length > 0) return state.wallets[0];
  return null;
}

interface SendSuccessReceipt {
  txHash?: string;
}

export default function SendScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const wallet = useWalletStore((s) => pickActiveWallet(s));
  const { show: showSheet, sheetElement } = useActionSheet();

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [successReceipt, setSuccessReceipt] = useState<SendSuccessReceipt | null>(null);

  useEffect(() => {
    if (!wallet?.address) return;
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    provider.getBalance(wallet.address).then(setBalance).catch(() => setBalance(null));
  }, [wallet?.address]);

  const onPaste = async () => {
    const v = await Clipboard.getStringAsync();
    if (v) setRecipient(v.trim());
  };

  const onMax = () => {
    if (balance == null) return;
    setAmount(ethers.formatEther(balance));
  };

  // Inline field validation: address/amount errors are shown as helper text below
  // the input fields and disable the send button. The action sheet is reserved for
  // actual action/transaction errors.
  const recipientTrimmed = recipient.trim();
  const recipientValid = ethers.isAddress(recipientTrimmed);
  const recipientError =
    recipientTrimmed.length > 0 && !recipientValid ? t('wallet.send.invalidAddress') : null;

  const amountTrimmed = amount.trim();
  let amountWei: bigint | null = null;
  let amountError: string | null = null;
  if (amountTrimmed.length > 0) {
    try {
      const parsed = ethers.parseEther(amountTrimmed);
      if (parsed <= 0n) amountError = t('wallet.send.amountTooSmall');
      else amountWei = parsed;
    } catch {
      amountError = t('wallet.send.invalidAmount');
    }
  }

  // Block amounts exceeding the balance inline before sending (amounts that become
  // insufficient after adding gas are caught by InsufficientBalanceError at send time).
  // Do not overwrite an existing format error.
  const exceedsBalance =
    amountWei !== null && balance !== null && amountWei > balance;
  if (exceedsBalance && !amountError) {
    amountError = t('wallet.send.exceedsBalance');
  }

  const canSend =
    !!wallet?.address && recipientValid && amountWei !== null && !exceedsBalance && !busy;

  const handleSend = async () => {
    if (!wallet?.address) {
      showSheet({
        tone: 'danger',
        title: t('common.error'),
        message: t('wallet.send.noActiveWallet'),
        primaryText: t('common.confirm'),
      });
      return;
    }
    const wei = amountWei;
    if (!recipientValid || wei === null) return; // guarded by inline validation and disabled button

    setBusy(true);
    try {
      const passkey = await getStoredPasskey();
      if (!passkey) {
        showSheet({
          tone: 'warning',
          title: t('wallet.send.passkeyNotFoundTitle'),
          message: t('wallet.send.passkeyNotFoundMessage'),
          primaryText: t('wallet.send.resetPasskeyButton'),
          secondaryText: t('common.close'),
          onPrimary: () => router.replace('/sign-up/passkey/reset'),
        });
        return;
      }

      const result = await transactionService.sendETH(
        {
          chainId: wallet.chainId ?? CHAIN_ID,
          sender: wallet.address,
          credentialId: passkey.credentialId,
        },
        recipientTrimmed,
        wei,
      );

      setSuccessReceipt({
        txHash: result.txHash || undefined,
      });
    } catch (err: any) {
      if (err instanceof PasskeyMismatchError) {
        // Treat the same as passkeyNotFound: direct the user to passkey reset.
        showSheet({
          tone: 'warning',
          title: t('wallet.send.passkeyMismatchTitle'),
          message: t('wallet.send.passkeyMismatchMessage'),
          primaryText: t('wallet.send.resetPasskeyButton'),
          secondaryText: t('common.close'),
          onPrimary: () => router.replace('/sign-up/passkey/reset'),
        });
      } else if (err instanceof InsufficientBalanceError) {
        showSheet({
          tone: 'warning',
          title: t('wallet.send.insufficientBalanceTitle'),
          message: t('wallet.send.insufficientBalanceMessage'),
          primaryText: t('common.confirm'),
        });
      } else if (err instanceof WalletNotDeployedError) {
        showSheet({
          tone: 'warning',
          title: t('common.error'),
          message: t('wallet.send.walletNotDeployed'),
          primaryText: t('common.confirm'),
        });
      } else {
        // Do not expose raw revert/hex dumps to the user — show a friendly message and log the original.
        const code = (err as { code?: string })?.code;
        const message =
          code === 'GAS_ESTIMATION_FAILED'
            ? t('wallet.send.gasEstimationFailedMessage')
            : t('wallet.send.failedMessage');
        console.error('[Send] failed:', err);
        showSheet({
          tone: 'danger',
          title: t('wallet.send.failed'),
          message,
          primaryText: t('common.confirm'),
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>{t('wallet.send.screenTitle')}</Text>
          <Text style={styles.balance}>
            {t('wallet.send.balanceLine', {
              value:
                balance == null
                  ? '—'
                  : `${Number(ethers.formatEther(balance)).toFixed(4)} ETH`,
            })}
          </Text>

          <Text style={styles.label}>{t('wallet.send.recipient')}</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, recipientError && styles.inputError]}
              value={recipient}
              onChangeText={setRecipient}
              placeholder="0x..."
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable style={styles.smallBtn} onPress={onPaste}>
              <Text style={styles.smallBtnText}>{t('common.paste')}</Text>
            </Pressable>
          </View>
          {recipientError ? <Text style={styles.fieldError}>{recipientError}</Text> : null}

          <Text style={styles.label}>{t('wallet.send.amountEth')}</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, amountError && styles.inputError]}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.0"
              keyboardType="decimal-pad"
            />
            <Pressable style={styles.smallBtn} onPress={onMax}>
              <Text style={styles.smallBtnText}>Max</Text>
            </Pressable>
          </View>
          {amountError ? <Text style={styles.fieldError}>{amountError}</Text> : null}

          <Pressable
            style={[styles.send, !canSend && styles.sendDisabled]}
            onPress={handleSend}
            disabled={!canSend}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>{t('wallet.send.submit')}</Text>}
          </Pressable>

          <Pressable style={styles.cancel} onPress={() => router.back()} disabled={busy}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={successReceipt !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSuccessReceipt(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.successCard}>
            <View style={styles.successIcon}>
              <Text style={styles.successIconText}>✓</Text>
            </View>
            <Text style={styles.successTitle}>{t('wallet.send.success')}</Text>
            <Text style={styles.successDescription}>
              {t('wallet.send.successMessage')}
            </Text>

            <View style={styles.hashGroup}>
              <Text style={styles.hashLabel}>{t('wallet.send.txHash')}</Text>
              <Text
                selectable
                style={[styles.hashValue, !successReceipt?.txHash && styles.hashMissing]}
              >
                {successReceipt?.txHash ?? t('wallet.send.txHashPending')}
              </Text>
              {successReceipt?.txHash && (
                <Pressable
                  style={styles.copyButton}
                  onPress={() => Clipboard.setStringAsync(successReceipt.txHash as string)}
                >
                  <Text style={styles.copyButtonText}>{t('common.copy')}</Text>
                </Pressable>
              )}
            </View>

            <Pressable style={styles.doneButton} onPress={() => router.replace('/home')}>
              <Text style={styles.doneButtonText}>{t('wallet.send.backToHome')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {sheetElement}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: '700' },
  balance: { fontSize: 14, color: '#64748B' },
  label: { fontSize: 13, color: '#64748B', marginTop: 8 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: 14,
  },
  inputError: {
    borderColor: '#DC2626',
  },
  fieldError: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: -8,
  },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
  },
  smallBtnText: { color: '#1E40AF', fontWeight: '500', fontSize: 13 },
  send: {
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: colors.brand?.default ?? '#3B82F6',
    alignItems: 'center',
  },
  sendDisabled: { opacity: 0.6 },
  sendText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancel: { paddingVertical: 12, alignItems: 'center' },
  cancelText: { color: '#a00', fontSize: 14 },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
  },
  successCard: {
    gap: 14,
    padding: 22,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DCFCE7',
  },
  successIconText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#15803D',
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text.primary,
  },
  successDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.secondary,
  },
  hashGroup: {
    gap: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 8,
    backgroundColor: colors.background.secondary,
  },
  hashLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  hashValue: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    color: colors.text.primary,
  },
  hashMissing: {
    color: colors.text.secondary,
  },
  copyButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.brand.surface,
  },
  copyButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  doneButton: {
    marginTop: 4,
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.brand.default,
  },
  doneButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
