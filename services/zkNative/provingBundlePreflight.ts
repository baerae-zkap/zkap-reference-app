import {
  getCachedProvingKeyPath,
  isProvingKeyDownloading,
} from '@/services/zkNative/provingKeyManager';

export type ProvingBundleCircuit = '3-of-3';

export const ESTIMATED_PROVING_BUNDLE_MB = 700;

export interface ProvingBundleConsentRequest {
  circuit: ProvingBundleCircuit;
  sizeMb: number;
}

export async function confirmProvingBundleReady(
  circuit: ProvingBundleCircuit,
  requestDownloadConsent?: (request: ProvingBundleConsentRequest) => Promise<boolean>,
): Promise<boolean> {
  const cachedPath = await getCachedProvingKeyPath(circuit);
  if (cachedPath || isProvingKeyDownloading(circuit)) {
    return true;
  }

  return requestDownloadConsent
    ? requestDownloadConsent({ circuit, sizeMb: ESTIMATED_PROVING_BUNDLE_MB })
    : false;
}
