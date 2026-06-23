import { fireEvent, render } from '@testing-library/react-native';
import {
  ProvingBundleDownloadConsentModal,
} from '@/components/ProvingBundleDownloadConsent';

jest.mock('@/services/zkNative/provingBundlePreflight', () => ({
  confirmProvingBundleReady: jest.fn(),
}));

describe('ProvingBundleDownloadConsentModal', () => {
  it('renders download details and allows cellular confirmation', () => {
    const onConfirm = jest.fn();

    const { getByText, getByTestId } = render(
      <ProvingBundleDownloadConsentModal
        visible
        circuit="3-of-3"
        sizeMb={700}
        networkStatus="cellular"
        isCheckingNetwork={false}
        onCancel={jest.fn()}
        onConfirm={onConfirm}
        onRefreshNetwork={jest.fn()}
      />,
    );

    expect(getByText('proofMode.prepareDownloadTitle')).toBeTruthy();
    expect(getByText('proofMode.prepareDownloadWithMobileData')).toBeTruthy();
    expect(getByText('proofMode.prepareNetworkCellular')).toBeTruthy();

    fireEvent.press(getByTestId('proving-bundle-download-consent'));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disables the primary action and refreshes network when offline', () => {
    const onConfirm = jest.fn();
    const onRefreshNetwork = jest.fn();

    const { getByText, getByTestId } = render(
      <ProvingBundleDownloadConsentModal
        visible
        circuit="3-of-3"
        sizeMb={700}
        networkStatus="offline"
        isCheckingNetwork={false}
        onCancel={jest.fn()}
        onConfirm={onConfirm}
        onRefreshNetwork={onRefreshNetwork}
      />,
    );

    expect(getByText('proofMode.prepareOfflineNotice')).toBeTruthy();

    fireEvent.press(getByTestId('proving-bundle-download-consent'));
    fireEvent.press(getByTestId('proving-bundle-download-secondary'));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onRefreshNetwork).toHaveBeenCalledTimes(1);
  });
});
