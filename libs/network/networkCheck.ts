import NetInfo from '@react-native-community/netinfo';
import { Alert } from 'react-native';
import i18next from 'i18next';

export type NetworkStatus = 'wifi' | 'cellular' | 'offline';

export async function getNetworkStatus(): Promise<NetworkStatus> {
  const state = await NetInfo.fetch();
  if (!state.isConnected) return 'offline';
  if (state.type === 'cellular') return 'cellular';
  return 'wifi';
}

/**
 * Check network conditions before a large download.
 * - offline → throws Error('NETWORK_OFFLINE')
 * - cellular → shows a confirmation Alert; returns the user's choice
 * - wifi → returns true
 */
export async function checkNetworkForDownload(): Promise<boolean> {
  const status = await getNetworkStatus();

  if (status === 'offline') {
    throw new Error('NETWORK_OFFLINE');
  }

  if (status === 'cellular') {
    return new Promise((resolve) => {
      Alert.alert(
        i18next.t('network.cellularWarningTitle'),
        i18next.t('network.cellularWarningMessage'),
        [
          { text: i18next.t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
          { text: i18next.t('network.continueDownload'), onPress: () => resolve(true) },
        ],
      );
    });
  }

  return true;
}
