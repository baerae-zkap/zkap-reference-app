import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GoogleIcon } from '@/components/icons/SocialIcons';
import { SocialAccountPicker } from '@/components/SocialAccountPicker';
import type { SocialProvider } from '@/stores/authStore';
import type { RecoveryAccount } from '@/libs/recovery/recoveryAccountStore';

export function getProviderBgColor(provider: SocialProvider): string {
  switch (provider) {
    case 'google':
      return '#FFFFFF';
  }
}

export function getProviderName(provider: SocialProvider): string {
  switch (provider) {
    case 'google':
      return 'Google';
  }
}

export function ProviderIcon({ provider }: { provider: SocialProvider }) {
  switch (provider) {
    case 'google':
      return <GoogleIcon size={20} />;
  }
}

export interface SocialAccountListProps {
  accounts: RecoveryAccount[];
  onAddAccount: (provider: SocialProvider) => Promise<void>;
  onRemoveAccount: (index: number) => void;
  maxAccounts?: number;
  showAddButton?: boolean;
}

export function SocialAccountList({
  accounts,
  onAddAccount,
  onRemoveAccount,
  maxAccounts = 3,
  showAddButton = true,
}: SocialAccountListProps) {
  const { t } = useTranslation();
  const [showPicker, setShowPicker] = useState(false);
  const [isAddingAccount, setIsAddingAccount] = useState(false);

  const canAddMore = showAddButton && accounts.length < maxAccounts;

  const handleSelectProvider = async (provider: SocialProvider) => {
    setShowPicker(false);
    setIsAddingAccount(true);
    try {
      await onAddAccount(provider);
    } finally {
      setIsAddingAccount(false);
    }
  };

  return (
    <>
      {/* Account List */}
      <View style={styles.accountList}>
        {accounts.map((account, index) => (
          <View
            key={`${account.provider}-${account.sub}`}
            style={styles.accountCard}
          >
            <View style={styles.accountLeft}>
              <Text style={styles.accountIndex}>{index + 1}.</Text>
              <View
                style={[
                  styles.providerIconContainer,
                  { backgroundColor: getProviderBgColor(account.provider) },
                ]}
              >
                <ProviderIcon provider={account.provider} />
              </View>
              <View style={styles.accountInfo}>
                <Text style={styles.accountProvider}>
                  {getProviderName(account.provider)}
                </Text>
                <Text style={styles.accountIdentifier} numberOfLines={1}>
                  {account.identifier}
                </Text>
              </View>
            </View>
            {account.isDefault ? (
              <View style={styles.defaultBadge}>
                <Text style={styles.defaultText}>
                  {t('onboarding.wallet.defaultAccount')}
                </Text>
              </View>
            ) : (
              <Pressable
                onPress={() => onRemoveAccount(index)}
                hitSlop={8}
              >
                <Text style={styles.removeText}>
                  {t('onboarding.wallet.removeAccount')}
                </Text>
              </Pressable>
            )}
          </View>
        ))}
      </View>

      {/* Add Account Button */}
      {canAddMore && (
        <Pressable
          style={styles.addButton}
          onPress={() => setShowPicker(true)}
          disabled={isAddingAccount}
        >
          {isAddingAccount ? (
            <ActivityIndicator size="small" color="#3B82F6" />
          ) : (
            <>
              <Text style={styles.addButtonText}>
                {t('onboarding.wallet.addAccount')}
              </Text>
              <Text style={styles.addButtonSub}>
                {t('onboarding.wallet.addAccountSub', {
                  remaining: maxAccounts - accounts.length,
                })}
              </Text>
            </>
          )}
        </Pressable>
      )}

      {/* Info Note */}
      <View style={styles.infoNote}>
        <Text style={styles.infoText}>
          {t('onboarding.wallet.recoveryNote')}
        </Text>
      </View>

      {/* Provider Picker Modal */}
      <SocialAccountPicker
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={handleSelectProvider}
      />
    </>
  );
}

const styles = StyleSheet.create({
  accountList: {
    gap: 12,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
  },
  accountLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  accountIndex: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
    width: 24,
  },
  providerIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  accountInfo: {
    flex: 1,
    gap: 2,
  },
  accountProvider: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  accountIdentifier: {
    fontSize: 13,
    color: '#64748B',
  },
  defaultBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  defaultText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B82F6',
  },
  removeText: {
    fontSize: 14,
    color: '#EF4444',
    fontWeight: '500',
  },
  addButton: {
    marginTop: 16,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3B82F6',
  },
  addButtonSub: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
  },
  infoNote: {
    marginTop: 24,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
  },
  infoText: {
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
  },
});
