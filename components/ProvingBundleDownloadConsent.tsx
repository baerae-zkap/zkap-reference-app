import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import {
  confirmProvingBundleReady as confirmProvingBundleReadyService,
  type ProvingBundleCircuit,
  type ProvingBundleConsentRequest,
} from '@/services/zkNative/provingBundlePreflight';
import {
  getNetworkStatus,
  type NetworkStatus,
} from '@/libs/network/networkCheck';

interface ProvingBundleDownloadConsentModalProps {
  visible: boolean;
  circuit: ProvingBundleCircuit;
  sizeMb: number;
  networkStatus: NetworkStatus | null;
  isCheckingNetwork: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onRefreshNetwork: () => void;
}

function ProvingFileIcon() {
  return (
    <Svg width={44} height={44} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 3h7l4 4v14H7V3z"
        stroke="#2563EB"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path
        d="M14 3v5h4"
        stroke="#2563EB"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path
        d="M9 13h6M9 16h6"
        stroke="#2563EB"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function ProvingBundleDownloadConsentModal({
  visible,
  circuit,
  sizeMb,
  networkStatus,
  isCheckingNetwork,
  onCancel,
  onConfirm,
  onRefreshNetwork,
}: ProvingBundleDownloadConsentModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isOffline = networkStatus === 'offline';
  const isCellular = networkStatus === 'cellular';

  const networkLabel =
    networkStatus === 'wifi'
      ? t('proofMode.prepareNetworkWifi')
      : networkStatus === 'cellular'
        ? t('proofMode.prepareNetworkCellular')
        : networkStatus === 'offline'
          ? t('proofMode.prepareNetworkOffline')
          : t('proofMode.prepareNetworkUnknown');

  const noticeText = isOffline
    ? t('proofMode.prepareOfflineNotice')
    : isCellular
      ? t('proofMode.prepareMobileNotice')
      : t('proofMode.prepareWifiNotice');

  const primaryLabel = isCellular
    ? t('proofMode.prepareDownloadWithMobileData')
    : t('proofMode.prepareDownloadContinue');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom + 24, 32) },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.handle} />

          <View style={styles.headerIcon}>
            <ProvingFileIcon />
          </View>

          <Text style={styles.title}>
            {t('proofMode.prepareDownloadTitle', { circuit })}
          </Text>
          <Text style={styles.description}>
            {t('proofMode.prepareDownloadDescription', { circuit, size: sizeMb })}
          </Text>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('proofMode.prepareSizeLabel')}</Text>
              <Text style={styles.infoValue}>
                {t('proofMode.prepareSizeValue', { size: sizeMb })}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('proofMode.prepareNetworkLabel')}</Text>
              <Text
                style={[
                  styles.infoValue,
                  networkStatus === 'wifi' && styles.networkOk,
                  isCellular && styles.networkWarn,
                  isOffline && styles.networkError,
                ]}
              >
                {networkLabel}
              </Text>
            </View>
          </View>

          <Text style={[styles.notice, isOffline && styles.networkError]}>
            {noticeText}
          </Text>

          <View style={styles.actions}>
            <Pressable
              testID="proving-bundle-download-consent"
              style={[
                styles.primaryButton,
                (isCheckingNetwork || isOffline) && styles.buttonDisabled,
              ]}
              onPress={onConfirm}
              disabled={isCheckingNetwork || isOffline}
            >
              {isCheckingNetwork ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>{primaryLabel}</Text>
              )}
            </Pressable>
            <Pressable
              testID="proving-bundle-download-secondary"
              style={styles.secondaryButton}
              onPress={isOffline ? onRefreshNetwork : onCancel}
              disabled={isCheckingNetwork}
            >
              <Text style={styles.secondaryButtonText}>
                {isOffline ? t('proofMode.prepareRefreshNetwork') : t('common.cancel')}
              </Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

export function useProvingBundleDownloadConsent() {
  const [request, setRequest] = useState<ProvingBundleConsentRequest | null>(null);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(null);
  const [isCheckingNetwork, setIsCheckingNetwork] = useState(false);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const resolveRequest = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setRequest(null);
    setNetworkStatus(null);
    setIsCheckingNetwork(false);
  }, []);

  const refreshNetworkStatus = useCallback(async () => {
    setIsCheckingNetwork(true);
    try {
      setNetworkStatus(await getNetworkStatus());
    } catch {
      setNetworkStatus(null);
    } finally {
      setIsCheckingNetwork(false);
    }
  }, []);

  const requestDownloadConsent = useCallback((nextRequest: ProvingBundleConsentRequest) => {
    resolverRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setRequest(nextRequest);
      setNetworkStatus(null);
      void refreshNetworkStatus();
    });
  }, [refreshNetworkStatus]);

  const confirmProvingBundleReady = useCallback(
    (circuit: ProvingBundleCircuit) =>
      confirmProvingBundleReadyService(circuit, requestDownloadConsent),
    [requestDownloadConsent],
  );

  const handleConfirm = useCallback(async () => {
    setIsCheckingNetwork(true);
    try {
      const latestStatus = await getNetworkStatus();
      setNetworkStatus(latestStatus);
      if (latestStatus === 'offline') {
        return;
      }
      resolveRequest(true);
    } catch {
      setNetworkStatus(null);
    } finally {
      setIsCheckingNetwork(false);
    }
  }, [resolveRequest]);

  useEffect(() => {
    return () => {
      resolverRef.current?.(false);
      resolverRef.current = null;
    };
  }, []);

  return {
    confirmProvingBundleReady,
    consentModal: request ? (
      <ProvingBundleDownloadConsentModal
        visible
        circuit={request.circuit}
        sizeMb={request.sizeMb}
        networkStatus={networkStatus}
        isCheckingNetwork={isCheckingNetwork}
        onCancel={() => resolveRequest(false)}
        onConfirm={handleConfirm}
        onRefreshNetwork={refreshNetworkStatus}
      />
    ) : null,
  };
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 32,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  handle: {
    width: 42,
    height: 5,
    alignSelf: 'center',
    marginBottom: 24,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
  },
  headerIcon: {
    width: 84,
    height: 84,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderRadius: 42,
    backgroundColor: '#EFF6FF',
  },
  title: {
    color: '#0F172A',
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 30,
    textAlign: 'center',
  },
  description: {
    marginTop: 10,
    color: '#64748B',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  infoCard: {
    marginTop: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
  },
  infoRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  infoLabel: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  infoValue: {
    flexShrink: 1,
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
  },
  divider: {
    height: 1,
    marginVertical: 10,
    backgroundColor: '#E2E8F0',
  },
  networkOk: {
    color: '#15803D',
  },
  networkWarn: {
    color: '#B45309',
  },
  networkError: {
    color: '#DC2626',
  },
  notice: {
    marginTop: 14,
    color: '#64748B',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  actions: {
    marginTop: 22,
    gap: 10,
  },
  primaryButton: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#3B82F6',
  },
  secondaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButtonText: {
    color: '#475569',
    fontSize: 16,
    fontWeight: '700',
  },
});
