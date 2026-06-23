const mockGetCachedProvingKeyPath = jest.fn();
const mockIsProvingKeyDownloading = jest.fn();

jest.mock('@/services/zkNative/provingKeyManager', () => ({
  getCachedProvingKeyPath: (...args: any[]) => mockGetCachedProvingKeyPath(...args),
  isProvingKeyDownloading: (...args: any[]) => mockIsProvingKeyDownloading(...args),
}));

import { confirmProvingBundleReady } from '../provingBundlePreflight';

describe('confirmProvingBundleReady', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCachedProvingKeyPath.mockResolvedValue(null);
    mockIsProvingKeyDownloading.mockReturnValue(false);
  });

  it('skips prompts when the proving bundle is cached', async () => {
    const requestDownloadConsent = jest.fn();
    mockGetCachedProvingKeyPath.mockResolvedValue('file:///cached/manifest-dir');

    await expect(confirmProvingBundleReady('3-of-3', requestDownloadConsent)).resolves.toBe(true);

    expect(requestDownloadConsent).not.toHaveBeenCalled();
  });

  it('skips prompts while the proving bundle is already downloading', async () => {
    const requestDownloadConsent = jest.fn();
    mockIsProvingKeyDownloading.mockReturnValue(true);

    await expect(confirmProvingBundleReady('3-of-3', requestDownloadConsent)).resolves.toBe(true);

    expect(requestDownloadConsent).not.toHaveBeenCalled();
  });

  it('asks the caller for consent when the bundle is missing', async () => {
    const requestDownloadConsent = jest.fn(() => Promise.resolve(true));

    await expect(confirmProvingBundleReady('3-of-3', requestDownloadConsent)).resolves.toBe(true);

    expect(requestDownloadConsent).toHaveBeenCalledWith({
      circuit: '3-of-3',
      sizeMb: 700,
    });
  });

  it('returns false when the bundle is missing and no consent UI is provided', async () => {
    await expect(confirmProvingBundleReady('3-of-3')).resolves.toBe(false);
  });
});
