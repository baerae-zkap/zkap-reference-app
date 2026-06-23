import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ProviderIcon, getProviderName } from '@/components/SocialAccountList/SocialAccountList';
import { FlowStepHeader } from '@/components/flow/FlowStepHeader';
import type { RecoveryAccount } from '@/libs/recovery/recoveryAccountStore';
import { colors } from '@/design-system/styles/colors';

export interface RecoveryUpdateReviewProps {
  /** Recovery accounts currently on-chain — these are the ones that authenticate. */
  currentAccounts: RecoveryAccount[];
  /** Recovery accounts after applying the pending add/remove edits. */
  newAccounts: RecoveryAccount[];
  onConfirm: () => void;
  onBack: () => void;
  onCancel: () => void;
}

function DiffRow({ account, index }: { account: RecoveryAccount; index: number }) {
  const { t } = useTranslation();
  return (
    <View style={styles.diffRow}>
      <Text style={styles.slot}>{t('recovery.review.slot', { index: index + 1 })}</Text>
      <View style={styles.providerIc}>
        <ProviderIcon provider={account.provider} />
      </View>
      <View style={styles.diffRowText}>
        <Text style={styles.providerName}>{getProviderName(account.provider)}</Text>
        <Text style={styles.handle} numberOfLines={1}>
          {account.identifier}
        </Text>
      </View>
    </View>
  );
}

/**
 * Review screen for the ④ recovery-account update flow.
 *
 * Shows a before → after diff of the recovery slots, an authentication warning,
 * and a primary CTA that starts verification with the *current* accounts.
 */
export function RecoveryUpdateReview({
  currentAccounts,
  newAccounts,
  onConfirm,
  onBack,
  onCancel,
}: RecoveryUpdateReviewProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <FlowStepHeader
        stepTitle={t('recovery.review.title')}
        onClose={onCancel}
        hideProgress
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>{t('recovery.review.kicker')}</Text>

        <View style={styles.diffCard}>
          <View style={styles.diffHalf}>
            <Text style={styles.diffLabel}>{t('recovery.review.before')}</Text>
            {currentAccounts.map((account, index) => (
              <DiffRow key={`b-${account.provider}-${account.sub}`} account={account} index={index} />
            ))}
          </View>

          <View style={styles.diffArrowRow}>
            <Text style={styles.diffArrow}>↓</Text>
          </View>

          <View style={styles.diffHalf}>
            <Text style={styles.diffLabel}>{t('recovery.review.after')}</Text>
            {newAccounts.map((account, index) => (
              <DiffRow key={`a-${account.provider}-${account.sub}`} account={account} index={index} />
            ))}
          </View>
        </View>

        <View style={styles.warnCard}>
          <Text style={styles.warnText}>{t('recovery.review.warn')}</Text>
        </View>
      </ScrollView>

      <View style={styles.cta}>
        <Pressable testID="recovery-review-start" style={styles.primaryButton} onPress={onConfirm}>
          <Text style={styles.primaryText}>
            {t('recovery.review.start', { count: currentAccounts.length })}
          </Text>
        </Pressable>
        <Pressable testID="recovery-review-back" style={styles.ghostButton} onPress={onBack}>
          <Text style={styles.ghostText}>{t('recovery.review.back')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  kicker: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.brand.default,
    textAlign: 'center',
    marginBottom: 20,
  },
  diffCard: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 16,
    padding: 16,
    backgroundColor: colors.background.secondary,
  },
  diffHalf: {
    gap: 8,
  },
  diffLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  diffArrowRow: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  diffArrow: {
    fontSize: 18,
    color: colors.text.tertiary,
  },
  diffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.background.primary,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  slot: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
    minWidth: 36,
  },
  providerIc: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.surface,
  },
  diffRowText: {
    flex: 1,
  },
  providerName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  handle: {
    fontSize: 12,
    color: colors.text.tertiary,
  },
  warnCard: {
    marginTop: 12,
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#FEF3C7',
  },
  warnText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#B45309',
  },
  cta: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
  },
  primaryButton: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.brand.default,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  ghostButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  ghostText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.secondary,
  },
});
