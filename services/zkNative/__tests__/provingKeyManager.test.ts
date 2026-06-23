jest.mock('@baerae/zkap-zkp', () => ({
  downloadRelease: jest.fn(),
}));

jest.mock('@/libs/network/networkCheck', () => ({
  checkNetworkForDownload: jest.fn(),
}));

import * as FileSystem from 'expo-file-system/legacy';
import { downloadRelease } from '@baerae/zkap-zkp';
import { checkNetworkForDownload } from '@/libs/network/networkCheck';
import {
  clearProvingBundles,
  createDownloadProgressMapper,
  ensureProvingBundle,
  ensureWitnessGen,
  clearWitnessGen,
  getCachedProvingBundlePath,
} from '../provingKeyManager';

const MB = 1024 * 1024;
const mockDownloadRelease = downloadRelease as jest.MockedFunction<typeof downloadRelease>;
const mockCheckNetworkForDownload = checkNetworkForDownload as jest.MockedFunction<typeof checkNetworkForDownload>;
const mockGetInfoAsync = FileSystem.getInfoAsync as jest.Mock;
const mockReadDirectoryAsync = FileSystem.readDirectoryAsync as jest.Mock;
const mockDownloadAsync = FileSystem.downloadAsync as jest.Mock;
const mockMakeDirectoryAsync = FileSystem.makeDirectoryAsync as jest.Mock;
const mockDeleteAsync = FileSystem.deleteAsync as jest.Mock;

beforeEach(() => {
  clearProvingBundles();
  jest.clearAllMocks();
  mockCheckNetworkForDownload.mockResolvedValue(true);
  mockGetInfoAsync.mockResolvedValue({ exists: true, isDirectory: false });
  mockReadDirectoryAsync.mockResolvedValue([]);
  mockDownloadRelease.mockResolvedValue({
    stagedDir: '/mock/cache/zkap-release-test-1-of-1',
    manifestJson: '{}',
    shape: '1-of-1',
    releaseSha: 'test',
  });
});

describe('createDownloadProgressMapper', () => {
  it('maps per-artifact byte progress to estimated bundle progress', () => {
    const mapProgress = createDownloadProgressMapper(700 * MB);

    const progress = mapProgress({
      phase: 'artifact',
      artifact: 'pk.bin',
      loadedBytes: 350 * MB,
      totalBytes: 700 * MB,
      completedArtifacts: 2,
      totalArtifacts: 8,
    });

    expect(progress).toEqual({
      totalBytesWritten: 350 * MB,
      totalBytesExpectedToWrite: 700 * MB,
      percent: 50,
    });
  });

  it('does not treat a completed small artifact as the full bundle', () => {
    const mapProgress = createDownloadProgressMapper(700 * MB);

    const progress = mapProgress({
      phase: 'artifact',
      artifact: 'circuit.ar1cs',
      loadedBytes: 35 * MB,
      totalBytes: 35 * MB,
      completedArtifacts: 1,
      totalArtifacts: 8,
    });

    expect(progress.totalBytesExpectedToWrite).toBe(700 * MB);
    expect(progress.percent).toBe(5);
  });

  it('reports completion after staging or done phases', () => {
    const mapProgress = createDownloadProgressMapper(700 * MB);

    expect(
      mapProgress({
        phase: 'done',
        completedArtifacts: 8,
        totalArtifacts: 8,
      }),
    ).toEqual({
      totalBytesWritten: 700 * MB,
      totalBytesExpectedToWrite: 700 * MB,
      percent: 100,
    });
  });
});

describe('ensureWitnessGen', () => {
  beforeEach(() => {
    clearWitnessGen();
    jest.clearAllMocks();
    mockMakeDirectoryAsync.mockResolvedValue(undefined);
    mockDeleteAsync.mockResolvedValue(undefined);
    mockDownloadAsync.mockResolvedValue({});
  });

  it('returns cached, file://-stripped plain paths without downloading when both files exist', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true, isDirectory: false });

    const paths = await ensureWitnessGen();

    expect(paths.witnessGenPath).toMatch(/^\/mock\/cache\/zkap-witness-gen-.*\/witness_gen\.wasm$/);
    expect(paths.witnessGenSidecarPath).toMatch(/^\/mock\/cache\/zkap-witness-gen-.*\/witness_gen\.json$/);
    expect(paths.witnessGenPath).not.toMatch(/^file:\/\//);
    expect(mockDownloadAsync).not.toHaveBeenCalled();
  });

  it('downloads the sidecar first then the wasm when not cached', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: false });

    const paths = await ensureWitnessGen();

    expect(mockDownloadAsync).toHaveBeenCalledTimes(2);
    expect(mockDownloadAsync.mock.calls[0][0]).toMatch(/\/witness_gen\.json$/);
    expect(mockDownloadAsync.mock.calls[1][0]).toMatch(/\/witness_gen\.wasm$/);
    expect(paths.witnessGenPath).toMatch(/\/witness_gen\.wasm$/);
    expect(paths.witnessGenSidecarPath).toMatch(/\/witness_gen\.json$/);
  });

  it('memoizes across calls so the assets download only once', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: false });

    await ensureWitnessGen();
    await ensureWitnessGen();

    expect(mockDownloadAsync).toHaveBeenCalledTimes(2); // not 4
  });

  it('does not cache a failed download (retries on the next call)', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: false });
    mockDownloadAsync.mockRejectedValueOnce(new Error('network down')).mockResolvedValue({});

    await expect(ensureWitnessGen()).rejects.toThrow('network down');

    const paths = await ensureWitnessGen();
    expect(paths.witnessGenPath).toMatch(/\/witness_gen\.wasm$/);
  });
});

describe('ensureProvingBundle cache registry', () => {
  it('reuses the remembered staged directory without starting another SDK download', async () => {
    await expect(ensureProvingBundle('3-of-3')).resolves.toBe(
      '/mock/cache/zkap-release-test-1-of-1',
    );
    await expect(ensureProvingBundle('3-of-3')).resolves.toBe(
      '/mock/cache/zkap-release-test-1-of-1',
    );

    expect(mockDownloadRelease).toHaveBeenCalledTimes(1);
    expect(mockCheckNetworkForDownload).toHaveBeenCalledTimes(1);
  });

  it('discovers a previously staged SDK cache directory', async () => {
    mockReadDirectoryAsync.mockResolvedValue(['zkap-release-existing-3-of-3']);

    await expect(getCachedProvingBundlePath('3-of-3')).resolves.toBe(
      '/mock/cache/zkap-release-existing-3-of-3',
    );

    expect(mockDownloadRelease).not.toHaveBeenCalled();
    expect(mockCheckNetworkForDownload).not.toHaveBeenCalled();
  });
});
