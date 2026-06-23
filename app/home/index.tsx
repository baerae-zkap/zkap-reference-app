import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ethers } from 'ethers';
import { useTranslation } from 'react-i18next';

import { useAuthStore } from '@/stores/authStore';
import { useWalletStore, WalletStatus } from '@/stores/walletStore';
import { clearPasskey } from '@/libs/passkey/passkeyStore';
import { useWalletActivation, WalletActivationStep } from '@/components/WalletActivation';
import { AppSheetDialog } from '@/components/AppSheetDialog';
import { useActionSheet } from '@/components/ui/ActionSheet';

const FAUCET_URL = 'https://www.alchemy.com/faucets/base-sepolia';
const RPC_URL = process.env.EXPO_PUBLIC_RPC_URL ?? 'https://sepolia.base.org';
const CHAIN_ID = Number(process.env.EXPO_PUBLIC_CHAIN_ID ?? 84532);
const CHAIN_LABEL = 'Base Sepolia';

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function getActiveWallet() {
  const state = useWalletStore.getState();
  // Prefer the single-wallet schema; fall back to the first entry of the multi-wallet schema.
  const single = (state as any).wallet;
  if (single) return single;
  const list = (state as any).wallets;
  if (Array.isArray(list) && list.length > 0) return list[0];
  return null;
}

export default function Home() {
  const router = useRouter();
  const { t } = useTranslation();
  const { show: showSheet, sheetElement } = useActionSheet();
  const { logout, updateUser } = useAuthStore();
  const { open: openActivation } = useWalletActivation();
  const autoOpenedWalletKeyRef = useRef<string | null>(null);
  const wallet = useWalletStore((s) => {
    const single = (s as any).wallet;
    if (single) return single;
    const list = (s as any).wallets;
    if (Array.isArray(list) && list.length > 0) return list[0];
    return null;
  });

  const [balanceWei, setBalanceWei] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [isResetPasskeyDialogVisible, setResetPasskeyDialogVisible] = useState(false);

  const refreshBalance = useCallback(async () => {
    if (!wallet?.address) {
      setBalanceWei(null);
      return;
    }
    setLoading(true);
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const value = await provider.getBalance(wallet.address);
      setBalanceWei(value);
    } catch (err) {
      console.warn('[home] eth_getBalance failed:', err);
      setBalanceWei(null);
    } finally {
      setLoading(false);
    }
  }, [wallet?.address]);

  useEffect(() => {
    refreshBalance();
  }, [refreshBalance]);

  useEffect(() => {
    if (!wallet?.address || wallet.status === WalletStatus.DEPLOYED) return;

    const chainId = wallet.chainId ?? CHAIN_ID;
    const walletKey = `${chainId}:${wallet.address}`;
    if (autoOpenedWalletKeyRef.current === walletKey) return;

    autoOpenedWalletKeyRef.current = walletKey;
    openActivation(WalletActivationStep.FUNDING, chainId);
  }, [openActivation, wallet?.address, wallet?.chainId, wallet?.status]);

  const onCopy = async () => {
    if (!wallet?.address) return;
    await Clipboard.setStringAsync(wallet.address);
    showSheet({
      tone: 'success',
      title: t('common.copied'),
      message: wallet.address,
      primaryText: t('common.confirm'),
    });
  };

  const onSend = () => router.push('/wallet/send');
  const onRecoveryUpdate = () => router.push('/recovery');
  const onPasskeyReset = () => router.push('/sign-up/passkey/reset');

  const onLogout = () => {
    showSheet({
      tone: 'danger',
      title: t('home.logoutTitle'),
      message: t('home.logoutConfirm'),
      primaryText: t('home.logout'),
      secondaryText: t('common.cancel'),
      onPrimary: async () => {
        await logout();
        router.replace('/sign-in');
      },
    });
  };

  // Debug only: wipe passkey only → triggers scenario ④ (wallet and recovery accounts preserved).
  const onResetPasskey = () => {
    setResetPasskeyDialogVisible(true);
  };

  // Scenario ④ operates in-session — no logout/re-login required (unlike ⑤).
  // Only the passkey is cleared; the user stays on the home screen.
  // The hasPasskey flag is updated immediately; AuthProvider re-syncs it on next load.
  const onConfirmResetPasskey = async () => {
    await clearPasskey();
    updateUser({ hasPasskey: false });
  };

  // Debug only: wipe passkey + recovery accounts → simulates scenario ⑤ (new-device recovery).
  // The account↔address mapping in addressStore is intentionally preserved.
  //
  // Why preserve the mapping: the wallet address depends on the passkey (both are baked into
  // initCode), so the address cannot be re-derived without the original passkey. A real new
  // device would have neither the passkey nor this mapping, making a fully faithful simulation
  // impossible on a single device. Keeping the mapping lets the user re-authenticate with their
  // recovery accounts and update the on-chain txKey to a new passkey, approximating the
  // new-device recovery intent.
  //
  // This button is the only path that triggers the recovery flow, so do not remove it.
  const onResetPasskeyRecovery = () => {
    showSheet({
      tone: 'danger',
      title: t('home.debug.resetBothTitle'),
      message: t('home.debug.resetBothMessage'),
      primaryText: t('home.debug.resetButton'),
      secondaryText: t('common.cancel'),
      onPrimary: async () => {
        await clearPasskey();
        try {
          const { clearRecoveryAccounts, clearRecoveryAccountsForChain } = await import(
            '@/libs/recovery/recoveryAccountStore'
          );
          await clearRecoveryAccounts();
          await clearRecoveryAccountsForChain(CHAIN_ID);
        } catch (err) {
          console.warn('[home] clear recovery accounts failed:', err);
        }
        await logout();
        router.replace('/sign-in');
      },
    });
  };

  const balanceText =
    balanceWei == null ? '—' : `${Number(ethers.formatEther(balanceWei)).toFixed(4)} ETH`;
  const isEmpty = balanceWei != null && balanceWei === 0n;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshBalance} />}
      >
        <Text style={styles.brand}>ZKAP Reference</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('home.addressLabel', { chain: CHAIN_LABEL })}</Text>
          <Text style={styles.address} numberOfLines={1}>
            {wallet?.address ? shortAddress(wallet.address) : '—'}
          </Text>
          <Pressable onPress={onCopy} style={styles.copyBtn} disabled={!wallet?.address}>
            <Text style={styles.copyBtnText}>{t('home.copyAddress')}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('home.balanceLabel')}</Text>
          {loading ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.balance}>{balanceText}</Text>
          )}
          {isEmpty && (
            <Text style={styles.faucetHint}>
              {t('home.faucetHint', { url: FAUCET_URL })}
            </Text>
          )}
        </View>

        {wallet && wallet.status !== WalletStatus.DEPLOYED && (
          <Pressable
            style={styles.primary}
            onPress={() => openActivation(WalletActivationStep.FUNDING, CHAIN_ID)}
          >
            <Text style={styles.primaryText}>{t('home.deployWallet')}</Text>
          </Pressable>
        )}
        <Pressable style={styles.primary} onPress={onSend}>
          <Text style={styles.primaryText}>{t('home.sendEth')}</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={onRecoveryUpdate}>
          <Text style={styles.secondaryText}>{t('home.updateRecovery')}</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={onPasskeyReset}>
          <Text style={styles.secondaryText}>{t('home.resetPasskey')}</Text>
        </Pressable>
        <Pressable style={styles.tertiary} onPress={onLogout}>
          <Text style={styles.tertiaryText}>{t('home.logout')}</Text>
        </Pressable>

        {__DEV__ && (
          <View style={styles.debugBox}>
            <Text style={styles.debugLabel}>{t('home.debug.sectionLabel')}</Text>
            <Pressable style={styles.debugBtn} onPress={onResetPasskey}>
              <Text style={styles.debugBtnText}>{t('home.debug.resetPasskeyOnly')}</Text>
            </Pressable>
            <Pressable style={styles.debugBtn} onPress={onResetPasskeyRecovery}>
              <Text style={styles.debugBtnText}>{t('home.debug.resetBoth')}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {sheetElement}
      <AppSheetDialog
        visible={isResetPasskeyDialogVisible}
        tone="danger"
        title={t('home.debug.resetPasskeyTitle')}
        message={t('home.debug.resetPasskeyMessage')}
        primaryText={t('home.debug.resetButton')}
        secondaryText={t('common.cancel')}
        onPrimary={onConfirmResetPasskey}
        onSecondary={() => setResetPasskeyDialogVisible(false)}
        onDismiss={() => setResetPasskeyDialogVisible(false)}
        testIDPrefix="home-reset-passkey"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 20, gap: 16 },
  brand: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    gap: 8,
  },
  cardLabel: { fontSize: 12, color: '#888' },
  address: { fontSize: 18, fontFamily: 'Menlo', fontWeight: '600' },
  balance: { fontSize: 28, fontWeight: '700' },
  faucetHint: { fontSize: 12, color: '#a85700' },
  copyBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#eef',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  copyBtnText: { fontSize: 13, color: '#225' },
  primary: {
    paddingVertical: 16,
    backgroundColor: '#222',
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondary: {
    paddingVertical: 14,
    backgroundColor: '#f4f4f4',
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryText: { color: '#222', fontSize: 15, fontWeight: '500' },
  tertiary: { paddingVertical: 12, alignItems: 'center' },
  tertiaryText: { color: '#a00', fontSize: 14 },
  debugBox: {
    marginTop: 24,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fdd',
    borderRadius: 8,
    backgroundColor: '#fff5f5',
    gap: 8,
  },
  debugLabel: { fontSize: 12, color: '#a00', fontWeight: '600' },
  debugBtn: {
    paddingVertical: 10,
    backgroundColor: '#fee',
    borderRadius: 6,
    alignItems: 'center',
  },
  debugBtnText: { color: '#a00', fontSize: 13 },
});
