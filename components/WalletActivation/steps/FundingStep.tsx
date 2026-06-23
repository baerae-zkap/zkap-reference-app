import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ethers } from 'ethers';
import { useTranslation } from 'react-i18next';
import Svg, { Path, Circle } from 'react-native-svg';

import { useWalletActivation } from '../WalletActivationContext';
import { getWalletBalance } from '@/services/wallet/walletCreationService';
import { useWalletStore } from '@/stores/walletStore';
import { useActionSheet } from '@/components/ui/ActionSheet';

const FAUCET_URL = 'https://www.alchemy.com/faucets/base-sepolia';
const CHAIN_ID = Number(process.env.EXPO_PUBLIC_CHAIN_ID ?? 84532);

function WalletIcon() {
  return (
    <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 7.5C4 6.12 5.12 5 6.5 5H18C19.1 5 20 5.9 20 7V18C20 19.1 19.1 20 18 20H6.5C5.12 20 4 18.88 4 17.5V7.5Z"
        stroke="#3B82F6"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path d="M16 12H20V16H16C14.9 16 14 15.1 14 14C14 12.9 14.9 12 16 12Z" fill="#DBEAFE" />
      <Circle cx={16.5} cy={14} r={0.8} fill="#3B82F6" />
      <Path d="M7 5V4C7 3.45 7.45 3 8 3H17C17.55 3 18 3.45 18 4V5" stroke="#3B82F6" strokeWidth={2} />
    </Svg>
  );
}

function shortAddress(address: string): string {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function pickWallet(state: any, chainId: number) {
  const single = state?.wallet;
  if (single && (!single.chainId || single.chainId === chainId)) return single;

  const list = state?.wallets;
  if (!Array.isArray(list)) return null;
  return list.find((wallet) => wallet.chainId === chainId) ?? list[0] ?? null;
}

export function FundingStep() {
  const { t } = useTranslation();
  const { show: showSheet, sheetElement } = useActionSheet();
  const { selectedChainId, nextStep, close } = useWalletActivation();
  const chainId = selectedChainId ?? CHAIN_ID;
  const wallet = useWalletStore((state) => pickWallet(state, chainId));
  const [balanceWei, setBalanceWei] = useState<bigint | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  const address = wallet?.address;
  const hasPrefund = balanceWei != null && balanceWei > 0n;

  const refreshBalance = useCallback(async () => {
    if (!address) {
      setBalanceWei(null);
      setCheckError(t('walletActivation.funding.missingAddress'));
      return;
    }

    setIsChecking(true);
    setCheckError(null);
    try {
      const nextBalance = await getWalletBalance(address, chainId);
      setBalanceWei(nextBalance);
    } catch (error) {
      console.warn('[FundingStep] balance check failed:', error);
      setCheckError(t('walletActivation.errors.networkError'));
      setBalanceWei(null);
    } finally {
      setIsChecking(false);
    }
  }, [address, chainId, t]);

  useEffect(() => {
    refreshBalance();
  }, [refreshBalance]);

  const handleCopy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    showSheet({
      tone: 'success',
      title: t('common.success'),
      message: address,
      primaryText: t('common.confirm'),
    });
  };

  const handleOpenFaucet = () => {
    Linking.openURL(FAUCET_URL).catch((error) => {
      console.warn('[FundingStep] open faucet failed:', error);
    });
  };

  const handleContinue = () => {
    if (!hasPrefund) return;
    nextStep();
  };

  const balanceText =
    balanceWei == null ? '-' : `${Number(ethers.formatEther(balanceWei)).toFixed(6)} ETH`;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <WalletIcon />
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.title}>{t('walletActivation.funding.title')}</Text>
          <Text style={styles.description}>{t('walletActivation.funding.description')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('walletActivation.funding.addressLabel')}</Text>
          <Text style={styles.address} numberOfLines={1}>
            {address ? shortAddress(address) : '-'}
          </Text>
          <Pressable style={styles.copyButton} onPress={handleCopy} disabled={!address}>
            <Text style={styles.copyButtonText}>{t('walletActivation.funding.copyAddress')}</Text>
          </Pressable>
        </View>

        <View style={styles.balanceRow}>
          <Text style={styles.balanceLabel}>{t('walletActivation.funding.balanceLabel')}</Text>
          {isChecking ? (
            <ActivityIndicator size="small" color="#3B82F6" />
          ) : (
            <Text style={styles.balance}>{balanceText}</Text>
          )}
        </View>

        {checkError ? (
          <Text style={styles.errorText}>{checkError}</Text>
        ) : (
          <Text style={[styles.hint, hasPrefund && styles.successHint]}>
            {hasPrefund
              ? t('walletActivation.funding.funded')
              : t('walletActivation.funding.zeroBalance')}
          </Text>
        )}
      </View>

      <View style={styles.buttons}>
        <Pressable style={styles.secondaryButton} onPress={handleOpenFaucet}>
          <Text style={styles.secondaryButtonText}>{t('walletActivation.funding.openFaucet')}</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={refreshBalance} disabled={isChecking}>
          <Text style={styles.secondaryButtonText}>{t('walletActivation.funding.refresh')}</Text>
        </Pressable>
        <Pressable
          testID="wallet-activation-funding-continue"
          style={[styles.primaryButton, (!hasPrefund || isChecking) && styles.primaryButtonDisabled]}
          onPress={handleContinue}
          disabled={!hasPrefund || isChecking}
        >
          <Text style={styles.primaryButtonText}>{t('walletActivation.funding.continue')}</Text>
        </Pressable>
        <Pressable style={styles.ghostButton} onPress={close} disabled={isChecking}>
          <Text style={styles.ghostButtonText}>{t('walletActivation.funding.later')}</Text>
        </Pressable>
      </View>
      {sheetElement}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  content: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 12,
    gap: 20,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
  },
  textContainer: {
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    color: '#64748B',
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  card: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  cardLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  address: {
    fontSize: 16,
    color: '#0F172A',
    fontWeight: '700',
    fontFamily: 'Menlo',
  },
  copyButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
  },
  copyButtonText: {
    fontSize: 13,
    color: '#1E40AF',
    fontWeight: '600',
  },
  balanceRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
  },
  balanceLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  balance: {
    fontSize: 16,
    color: '#0F172A',
    fontWeight: '700',
  },
  hint: {
    width: '100%',
    fontSize: 13,
    color: '#B45309',
    lineHeight: 19,
    textAlign: 'center',
  },
  successHint: {
    color: '#15803D',
  },
  errorText: {
    width: '100%',
    fontSize: 13,
    color: '#DC2626',
    lineHeight: 19,
    textAlign: 'center',
  },
  buttons: {
    paddingTop: 20,
    gap: 10,
  },
  primaryButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E40AF',
  },
  ghostButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  ghostButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
  },
});
