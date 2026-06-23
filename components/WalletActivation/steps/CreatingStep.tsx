import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Path, Circle } from 'react-native-svg';
import { useWalletActivation, WalletActivationError } from '../WalletActivationContext';
import { useWalletStore, Wallet, WalletStatus } from '@/stores/walletStore';
import { getChainById } from '@/libs/chains/supportedChains';
import {
  deriveWalletAddress,
  checkWalletDeployed,
  verifyAndMarkDeployed,
  deployWallet,
  WalletCreationError,
  WalletErrorCode,
  WalletCreationProgress,
} from '@/services/wallet/walletCreationService';

type Phase =
  | 'deriving'
  | 'checking'
  | 'building_initcode'
  | 'estimating_gas'
  | 'checking_balance'
  | 'signing'
  | 'submitting'
  | 'confirming';

function isKnownPhase(step: WalletCreationProgress['type'] | string): step is Phase {
  return (
    step === 'building_initcode' ||
    step === 'estimating_gas' ||
    step === 'checking_balance' ||
    step === 'signing' ||
    step === 'submitting' ||
    step === 'confirming'
  );
}

function AlertCircleIcon() {
  return (
    <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke="#DC2626" strokeWidth={2} />
      <Path d="M12 8V12M12 16H12.01" stroke="#DC2626" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function CreatingStep() {
  const { t } = useTranslation();
  const {
    selectedChainId,
    nextStep,
    setCreatedWallet,
    setError,
    error,
    close,
    reset,
  } = useWalletActivation();
  const { addWallet, updateWallet, setIsCreating, getWalletByChainId } = useWalletStore();
  const [isRetrying, setIsRetrying] = useState(false);
  const [phase, setPhase] = useState<Phase>('deriving');

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async () => {
    if (!selectedChainId) return;

    setIsCreating(true);
    setError(null);

    try {
      // 1) Short-circuit if a wallet record already exists (avoid re-deriving DERIVED/DEPLOYED).
      const existing = getWalletByChainId(selectedChainId);
      let address: string;

      if (existing && existing.status !== WalletStatus.NOT_CREATED) {
        address = existing.address;
        if (__DEV__) {
          console.log('[Activation] short-circuit existing=', existing.status, 'addr=', address);
        }
      } else {
        setPhase('deriving');
        if (__DEV__) console.log('[Activation] derive start chainId=', selectedChainId);
        address = await deriveWalletAddress({ chainId: selectedChainId });
        const wallet: Wallet = {
          address,
          chainId: selectedChainId,
          status: WalletStatus.DERIVED,
          createdAt: new Date().toISOString(),
          derivedAt: new Date().toISOString(),
        };
        if (existing) {
          updateWallet(existing.address, selectedChainId, wallet);
        } else {
          addWallet(wallet);
        }
      }

      // 2) On-chain pre-check — skip deploy if already deployed.
      setPhase('checking');
      const deployed = await checkWalletDeployed(address, selectedChainId);
      if (__DEV__) console.log('[Activation] onchain deployed=', deployed, 'addr=', address);

      if (deployed) {
        await verifyAndMarkDeployed(address, selectedChainId, { alreadyVerified: true });
        setCreatedWallet({
          address,
          chainId: selectedChainId,
          status: WalletStatus.DEPLOYED,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
          derivedAt: existing?.derivedAt ?? new Date().toISOString(),
          deployedAt: new Date().toISOString(),
        });
        nextStep(); // → COMPLETE
        return;
      }

      // 3) Native deploy — passkey (WebAuthn) signature, empty callData deployment.
      const result = await deployWallet({
        chainId: selectedChainId,
        onProgress: (step) => {
          if (isKnownPhase(step.type)) {
            setPhase(step.type);
          }
        },
      });

      setCreatedWallet({
        address: result.address,
        chainId: selectedChainId,
        status: WalletStatus.DEPLOYED,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        derivedAt: existing?.derivedAt ?? new Date().toISOString(),
        deployedAt: new Date().toISOString(),
      });
      nextStep(); // → COMPLETE
    } catch (err: unknown) {
      console.error('Wallet creation failed:', err);
      handleError(err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleError = (err: unknown) => {
    if (err instanceof WalletCreationError) {
      const errorCodeMap: Record<WalletErrorCode, string> = {
        [WalletErrorCode.CHAIN_CONFIG_FAILED]: t('walletActivation.errors.chainConfigFailed'),
        [WalletErrorCode.ANCHOR_COMPUTATION_FAILED]: t('walletActivation.errors.anchorFailed'),
        [WalletErrorCode.DERIVATION_FAILED]: t('walletActivation.errors.derivationFailed'),
        [WalletErrorCode.INSUFFICIENT_BALANCE]: t('walletActivation.errors.insufficientBalance'),
        [WalletErrorCode.DEPLOYMENT_FAILED]: t('walletActivation.errors.deploymentFailed'),
        [WalletErrorCode.VERIFICATION_FAILED]: t('walletActivation.errors.verificationFailed'),
        [WalletErrorCode.PASSKEY_ERROR]: t('walletActivation.errors.passkeyError'),
        [WalletErrorCode.NO_RECOVERY_ACCOUNTS]: t('walletActivation.errors.noRecoveryAccounts'),
        [WalletErrorCode.NETWORK_ERROR]: t('walletActivation.errors.networkError'),
      };

      setError({
        code: err.code as unknown as WalletActivationError['code'],
        message: errorCodeMap[err.code as WalletErrorCode] || err.message,
        recoverable: err.recoverable,
        action: err.recoverable ? 'retry' : 'back',
      });
    } else {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isNetworkError = errorMessage.includes('network') || errorMessage.includes('fetch');

      setError({
        code: isNetworkError ? 'NETWORK_ERROR' : 'SDK_ERROR',
        message: isNetworkError
          ? t('walletActivation.errors.networkError')
          : t('walletActivation.errors.creationFailed'),
        recoverable: true,
        action: 'retry',
      });
    }
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    await run();
    setIsRetrying(false);
  };

  const handleBack = () => {
    close();
    reset();
  };

  const chain = selectedChainId ? getChainById(selectedChainId) : null;

  // Error UI
  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <AlertCircleIcon />
          </View>

          <View style={styles.textContainer}>
            <Text style={styles.title}>{t('walletActivation.errors.creationFailed')}</Text>
            <Text style={styles.description}>{error.message}</Text>
          </View>
        </View>

        <View style={styles.buttons}>
          <Pressable
            style={[styles.primaryButton, isRetrying && styles.buttonDisabled]}
            onPress={error.action === 'retry' ? handleRetry : handleBack}
            disabled={isRetrying}
          >
            {isRetrying ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {error.action === 'retry' ? t('common.retry') : t('common.back')}
              </Text>
            )}
          </Pressable>
          {error.action === 'retry' && (
            <Pressable style={styles.secondaryButton} onPress={close} disabled={isRetrying}>
              <Text style={styles.secondaryButtonText}>{t('common.cancel')}</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  // Creating UI
  const phaseMessages: Record<Phase, string> = {
    deriving: t('walletActivation.creating.deriving'),
    checking: t('walletActivation.creating.checking'),
    building_initcode: t('walletActivation.creating.buildingInitCode'),
    estimating_gas: t('walletActivation.creating.estimatingGas'),
    checking_balance: t('walletActivation.creating.checkingBalance'),
    signing: t('walletActivation.creating.signing'),
    submitting: t('walletActivation.creating.submitting'),
    confirming: t('walletActivation.creating.confirming'),
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color="#3B82F6" />

        <View style={styles.textContainer}>
          <Text style={styles.title}>{t('walletActivation.creating.title')}</Text>
          <Text style={styles.description}>{phaseMessages[phase]}</Text>
          {chain && <Text style={styles.chainName}>{chain.displayName}</Text>}
        </View>

        <Text style={styles.pleaseWait}>{t('walletActivation.creating.pleaseWait')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  content: { alignItems: 'center', paddingVertical: 40, gap: 24 },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
  },
  textContainer: { alignItems: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '600', color: '#0F172A', textAlign: 'center' },
  description: { fontSize: 16, color: '#64748B', textAlign: 'center', paddingHorizontal: 24 },
  chainName: { fontSize: 14, color: '#64748B', textAlign: 'center' },
  pleaseWait: { fontSize: 14, color: '#94A3B8', textAlign: 'center' },
  buttons: { paddingTop: 24, gap: 4 },
  primaryButton: { backgroundColor: '#3B82F6', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  secondaryButton: { backgroundColor: '#F1F5F9', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  secondaryButtonText: { fontSize: 16, fontWeight: '600', color: '#64748B' },
});
