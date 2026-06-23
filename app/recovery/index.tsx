import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import Svg, { Path, Circle, G } from 'react-native-svg';
import { BackIcon } from '@/components/icons/NavigationIcons';
import { getRecoveryAccountsByChain, RecoveryAccount } from '@/libs/recovery/recoveryAccountStore';
import { useWalletStore } from '@/stores/walletStore';

// Icons
function ShieldCheckIcon() {
  return (
    <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z"
        stroke="#22C55E"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="#DCFCE7"
      />
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

function ShieldAlertIcon() {
  return (
    <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z"
        stroke="#F59E0B"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="#FEF3C7"
      />
      <Path
        d="M12 8V12"
        stroke="#F59E0B"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="12" cy="16" r="1" fill="#F59E0B" />
    </Svg>
  );
}

function GoogleIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </Svg>
  );
}

function CheckCircleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" fill="#22C55E" />
      <Path
        d="M9 12L11 14L15 10"
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ChevronRightIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 18L15 12L9 6"
        stroke="#94A3B8"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function RecoveryStatus() {
  const { t } = useTranslation();
  const router = useRouter();
  const { activeChainId } = useWalletStore();
  const [accounts, setAccounts] = useState<RecoveryAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const selectedChainId = activeChainId;

  useEffect(() => {
    loadAccounts(selectedChainId);
  }, []);

  const loadAccounts = async (chainId: number) => {
    setIsLoading(true);
    try {
      const recoveryAccounts = await getRecoveryAccountsByChain(chainId);
      if (recoveryAccounts) {
        const sorted = [...recoveryAccounts].sort((a, b) =>
          (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0)
        );
        setAccounts(sorted);
      } else {
        setAccounts([]);
      }
    } catch (error) {
      console.error('Failed to load recovery accounts:', error);
      setAccounts([]);
    } finally {
      setIsLoading(false);
    }
  };

  const isConfigured = accounts.length > 0;

  const handleBack = () => {
    router.back();
  };

  const handleUpdateRecovery = () => {
    router.push(`/recovery/setup?chainId=${selectedChainId}`);
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'google':
        return <GoogleIcon />;
      default:
        return null;
    }
  };

  const getProviderName = (provider: string) => {
    switch (provider) {
      case 'google':
        return 'Google';
      default:
        return provider;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backButton} hitSlop={8}>
          <BackIcon />
        </Pressable>
        <Text style={styles.headerTitle}>{t('recovery.status.title')}</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
        ) : (
          <>
            {/* Status Card */}
            <View style={[styles.statusCard, isConfigured ? styles.statusConfigured : styles.statusNotConfigured]}>
              <View style={styles.statusIcon}>
                {isConfigured ? <ShieldCheckIcon /> : <ShieldAlertIcon />}
              </View>
              <Text style={[styles.statusTitle, isConfigured ? styles.statusTitleConfigured : styles.statusTitleNotConfigured]}>
                {isConfigured ? t('recovery.status.configured') : t('recovery.status.notConfigured')}
              </Text>
              <Text style={styles.statusDescription}>
                {isConfigured
                  ? t('recovery.status.configuredDescription')
                  : t('recovery.status.notConfiguredDescription')}
              </Text>
            </View>

            {/* Recovery Accounts Section */}
            {isConfigured && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('recovery.status.accounts')}</Text>
                <View style={styles.accountsList}>
                  {accounts.map((account, index) => (
                    <View
                      key={`${account.provider}-${account.sub}`}
                      style={[
                        styles.accountItem,
                        index < accounts.length - 1 && styles.accountItemBorder,
                      ]}
                    >
                      <View style={styles.accountLeft}>
                        <View style={styles.providerIcon}>
                          {getProviderIcon(account.provider)}
                        </View>
                        <View style={styles.accountInfo}>
                          <Text style={styles.accountProvider}>
                            {getProviderName(account.provider)}
                          </Text>
                          <Text style={styles.accountEmail}>{account.identifier}</Text>
                        </View>
                      </View>
                      {account.isDefault && <CheckCircleIcon />}
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable style={styles.updateButton} onPress={handleUpdateRecovery}>
            <Text style={styles.updateButtonText}>
              {isConfigured ? t('settings.updateRecovery') : t('recovery.setup.title')}
            </Text>
            <ChevronRightIcon />
          </Pressable>

        </View>

        {/* Info Note */}
        <View style={styles.infoNote}>
          <Text style={styles.infoText}>
            {t('recovery.status.infoNote')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
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
  scrollContent: {
    padding: 24,
  },
  statusCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  statusConfigured: {
    backgroundColor: '#DCFCE7',
  },
  statusNotConfigured: {
    backgroundColor: '#FEF3C7',
  },
  statusIcon: {
    marginBottom: 16,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  statusTitleConfigured: {
    color: '#166534',
  },
  statusTitleNotConfigured: {
    color: '#92400E',
  },
  statusDescription: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  accountsList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
  },
  accountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  accountItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  accountLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  providerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  accountInfo: {
    flex: 1,
  },
  accountProvider: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 2,
  },
  accountEmail: {
    fontSize: 14,
    color: '#64748B',
  },
  actions: {
    gap: 12,
    marginBottom: 24,
  },
  updateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
  },
  updateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3B82F6',
  },
  infoNote: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
  },
  infoText: {
    fontSize: 13,
    color: '#1E40AF',
    lineHeight: 20,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
});
