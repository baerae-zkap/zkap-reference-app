import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import { useWalletActivation } from '../WalletActivationContext';
import { getChainById } from '@/libs/chains/supportedChains';

function CheckCircleIcon() {
  return (
    <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke="#22C55E" strokeWidth={2} />
      <Path
        d="M9 12L11 14L15 10"
        stroke="#22C55E"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CopyIcon({ color = '#64748B' }: { color?: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 9H11C9.89543 9 9 9.89543 9 11V20C9 21.1046 9.89543 22 11 22H20C21.1046 22 22 21.1046 22 20V11C22 9.89543 21.1046 9 20 9Z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5 15H4C3.46957 15 2.96086 14.7893 2.58579 14.4142C2.21071 14.0391 2 13.5304 2 13V4C2 3.46957 2.21071 2.96086 2.58579 2.58579C2.96086 2.21071 3.46957 2 4 2H13C13.5304 2 14.0391 2.21071 14.4142 2.58579C14.7893 2.96086 15 3.46957 15 4V5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CheckIcon({ color = '#22C55E' }: { color?: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 6L9 17L4 12"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function GlobeIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke="#64748B" strokeWidth={2} />
      <Path
        d="M2 12H22M12 2C14.5 4.5 16 8 16 12C16 16 14.5 19.5 12 22C9.5 19.5 8 16 8 12C8 8 9.5 4.5 12 2Z"
        stroke="#64748B"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function CompleteStep() {
  const { t } = useTranslation();
  const router = useRouter();
  const { createdWallet, close, reset } = useWalletActivation();
  const [copied, setCopied] = React.useState(false);

  const chain = createdWallet?.chainId ? getChainById(createdWallet.chainId) : null;

  const handleCopy = async () => {
    if (createdWallet?.address) {
      await Clipboard.setStringAsync(createdWallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleGetStarted = () => {
    close();
    reset();
    router.replace('/home');
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <CheckCircleIcon />
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.title}>{t('walletActivation.complete.title')}</Text>
          <Text style={styles.description}>
            {t('walletActivation.complete.description', {
              chain: chain?.displayName ?? '',
            })}
          </Text>
        </View>

        {createdWallet && (
          <TouchableOpacity onPress={handleCopy} activeOpacity={0.7}>
            <View style={styles.addressCard}>
              <Text style={styles.addressText}>{truncateAddress(createdWallet.address)}</Text>
              <View style={styles.copyButton}>
                {copied ? (
                  <CheckIcon color="#22C55E" />
                ) : (
                  <CopyIcon color="#64748B" />
                )}
                <Text style={[styles.copyText, copied && styles.copyTextSuccess]}>
                  {copied ? t('common.copied') : t('common.copy')}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}

        {chain && (
          <View style={styles.chainBadge}>
            <GlobeIcon />
            <Text style={styles.chainBadgeText}>{chain.displayName}</Text>
          </View>
        )}
      </View>

      <View style={styles.buttons}>
        <Pressable style={styles.primaryButton} onPress={handleGetStarted}>
          <Text style={styles.primaryButtonText}>{t('walletActivation.complete.button')}</Text>
        </Pressable>
      </View>
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
    paddingBottom: 16,
    gap: 24,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
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
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
  },
  addressCard: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
    minWidth: 200,
    backgroundColor: '#FFFFFF',
  },
  addressText: {
    fontSize: 16,
    fontFamily: 'monospace',
    color: '#0F172A',
    textAlign: 'center',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  copyText: {
    fontSize: 14,
    color: '#64748B',
  },
  copyTextSuccess: {
    color: '#22C55E',
  },
  chainBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
  },
  chainBadgeText: {
    fontSize: 14,
    color: '#64748B',
  },
  buttons: {
    paddingTop: 24,
  },
  primaryButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
