/**
 * Proving bundle manager.
 *
 * The SDK does not prove from a standalone pk file. It downloads/stages a
 * manifest-backed zkap-circuit release bundle and passes the staged directory
 * to prove() as manifestDir.
 */

import {
  downloadRelease,
  type DownloadReleaseProgress,
  type ReleaseShape,
} from '@baerae/zkap-zkp';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { checkNetworkForDownload } from '@/libs/network/networkCheck';

export interface DownloadProgress {
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
  percent: number;
}

type CircuitType = '3-of-3';

interface ProvingBundleConfig {
  baseUrl: string;
  shape: ReleaseShape;
  expectedReleaseSha?: string;
}

// Circuit release artifacts are versioned independently of the SDK.
// The currently hosted bundle is v0.1.1-rc.1 (release/v0.1.1-rc.1/<shape>-* + witness_gen.wasm).
const DEFAULT_RELEASE_BASE_URL =
  'https://storage.googleapis.com/zkap-static-config/release/v0.1.1-rc.1';

const RELEASE_BASE_URL =
  process.env.EXPO_PUBLIC_ZKAP_RELEASE_BASE_URL ?? DEFAULT_RELEASE_BASE_URL;

const ESTIMATED_PROVING_BUNDLE_BYTES = 700 * 1024 * 1024;

const BUNDLE_CONFIGS: Record<CircuitType, ProvingBundleConfig> = {
  '3-of-3': {
    baseUrl: RELEASE_BASE_URL,
    shape: '3-of-3',
    expectedReleaseSha:
      process.env.EXPO_PUBLIC_ZKAP_RELEASE_SHA_3_OF_3 || undefined,
  },
};

interface PendingDownload {
  promise: Promise<string>;
  subscribers: Set<(progress: DownloadProgress) => void>;
}

const pendingDownloads = new Map<CircuitType, PendingDownload>();
const cachedBundlePaths = new Map<CircuitType, string>();

function cacheStorageKey(circuit: CircuitType): string {
  const config = BUNDLE_CONFIGS[circuit];
  const releaseId = config.expectedReleaseSha ?? config.baseUrl;
  return `zkap:proving-bundle:${config.shape}:${releaseId}`;
}

function manifestUri(stagedDir: string): string {
  const base = stagedDir.startsWith('file://') ? stagedDir : `file://${stagedDir}`;
  return `${base.replace(/\/+$/, '')}/manifest.json`;
}

function joinUri(root: string, name: string): string {
  return `${root.replace(/\/+$/, '')}/${name}`;
}

async function isUsableStagedDir(stagedDir: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(manifestUri(stagedDir));
    return info.exists && !info.isDirectory;
  } catch {
    return false;
  }
}

async function findSdkCachedBundle(circuit: CircuitType): Promise<string | null> {
  const config = BUNDLE_CONFIGS[circuit];
  const expectedDirName = config.expectedReleaseSha
    ? `zkap-release-${config.expectedReleaseSha}-${config.shape}`
    : null;
  const shapeSuffix = `-${config.shape}`;
  const roots = [FileSystem.cacheDirectory, FileSystem.documentDirectory].filter(Boolean);

  for (const root of roots) {
    try {
      const entries = await FileSystem.readDirectoryAsync(root as string);
      const candidates = entries
        .filter((entry) =>
          expectedDirName
            ? entry === expectedDirName
            : entry.startsWith('zkap-release-') && entry.endsWith(shapeSuffix),
        )
        .sort()
        .reverse();

      for (const entry of candidates) {
        const stagedDir = joinUri(root as string, entry);
        if (await isUsableStagedDir(stagedDir)) {
          return stagedDir;
        }
      }
    } catch {
      // Some Expo filesystem roots may be unavailable on a given platform.
    }
  }

  return null;
}

async function rememberCachedBundle(circuit: CircuitType, stagedDir: string): Promise<void> {
  cachedBundlePaths.set(circuit, stagedDir);
  try {
    await AsyncStorage.setItem(cacheStorageKey(circuit), stagedDir);
  } catch {
    // Cache metadata is a UX optimization. The SDK cache remains authoritative.
  }
}

export async function getCachedProvingBundlePath(circuit: CircuitType): Promise<string | null> {
  const inMemory = cachedBundlePaths.get(circuit);
  if (inMemory && await isUsableStagedDir(inMemory)) {
    return inMemory;
  }
  if (inMemory) cachedBundlePaths.delete(circuit);

  try {
    const stored = await AsyncStorage.getItem(cacheStorageKey(circuit));
    if (stored && await isUsableStagedDir(stored)) {
      cachedBundlePaths.set(circuit, stored);
      return stored;
    }
    if (stored) await AsyncStorage.removeItem(cacheStorageKey(circuit));
  } catch {
    // Ignore stale or unavailable AsyncStorage cache metadata.
  }

  const discovered = await findSdkCachedBundle(circuit);
  if (discovered) {
    await rememberCachedBundle(circuit, discovered);
    return discovered;
  }

  return null;
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function createDownloadProgressMapper(
  estimatedBundleBytes = ESTIMATED_PROVING_BUNDLE_BYTES,
): (progress: DownloadReleaseProgress) => DownloadProgress {
  const artifactLoadedBytes = new Map<string, number>();
  const artifactTotalBytes = new Map<string, number>();

  return (progress: DownloadReleaseProgress): DownloadProgress => {
    if (progress.phase === 'stage' || progress.phase === 'done') {
      return {
        totalBytesWritten: estimatedBundleBytes,
        totalBytesExpectedToWrite: estimatedBundleBytes,
        percent: 100,
      };
    }

    if (progress.artifact) {
      if (typeof progress.totalBytes === 'number' && progress.totalBytes > 0) {
        artifactTotalBytes.set(progress.artifact, progress.totalBytes);
      }
      if (typeof progress.loadedBytes === 'number' && progress.loadedBytes >= 0) {
        const previousLoaded = artifactLoadedBytes.get(progress.artifact) ?? 0;
        artifactLoadedBytes.set(progress.artifact, Math.max(previousLoaded, progress.loadedBytes));
      }
    }

    const knownLoadedBytes = Array.from(artifactLoadedBytes.values()).reduce(
      (sum, value) => sum + value,
      0,
    );
    const knownTotalBytes = Array.from(artifactTotalBytes.values()).reduce(
      (sum, value) => sum + value,
      0,
    );
    const expectedBytes = Math.max(estimatedBundleBytes, knownTotalBytes);

    if (knownLoadedBytes > 0 && expectedBytes > 0) {
      const ratio = clampRatio(knownLoadedBytes / expectedBytes);
      return {
        totalBytesWritten: Math.round(expectedBytes * ratio),
        totalBytesExpectedToWrite: expectedBytes,
        percent: Math.round(ratio * 100),
      };
    }

    const completed = progress.completedArtifacts ?? 0;
    const total = progress.totalArtifacts ?? 0;
    const artifactRatio = total > 0 ? clampRatio(completed / total) : 0;
    return {
      totalBytesWritten: Math.round(expectedBytes * artifactRatio),
      totalBytesExpectedToWrite: expectedBytes,
      percent: Math.round(artifactRatio * 100),
    };
  };
}

export function isProvingBundleDownloading(circuit: CircuitType): boolean {
  return pendingDownloads.has(circuit);
}

export function subscribeProvingBundleProgress(
  circuit: CircuitType,
  onProgress: (progress: DownloadProgress) => void,
): (() => void) | null {
  const pending = pendingDownloads.get(circuit);
  if (!pending) return null;
  pending.subscribers.add(onProgress);
  return () => pending.subscribers.delete(onProgress);
}

/**
 * Ensure the circuit release bundle is staged locally.
 *
 * @returns local filesystem path to the staged manifestDir
 */
export async function ensureProvingBundle(
  circuit: CircuitType,
  onProgress?: (progress: DownloadProgress) => void,
  options?: { skipNetworkCheck?: boolean },
): Promise<string> {
  const existing = pendingDownloads.get(circuit);
  if (existing) {
    if (onProgress) existing.subscribers.add(onProgress);
    try {
      return await existing.promise;
    } finally {
      if (onProgress) existing.subscribers.delete(onProgress);
    }
  }

  const cachedPath = await getCachedProvingBundlePath(circuit);
  if (cachedPath) return cachedPath;

  if (!options?.skipNetworkCheck) {
    const canProceed = await checkNetworkForDownload();
    if (!canProceed) {
      throw new Error('Download cancelled by user');
    }
  }

  const subscribers = new Set<(progress: DownloadProgress) => void>();
  if (onProgress) subscribers.add(onProgress);

  const promise = doDownload(circuit, subscribers);
  pendingDownloads.set(circuit, { promise, subscribers });
  try {
    return await promise;
  } finally {
    pendingDownloads.delete(circuit);
  }
}

async function doDownload(
  circuit: CircuitType,
  subscribers: Set<(progress: DownloadProgress) => void>,
): Promise<string> {
  const config = BUNDLE_CONFIGS[circuit];
  const mapDownloadProgress = createDownloadProgressMapper();
  const release = await downloadRelease({
    ...config,
    onProgress: (progress) => {
      const mapped = mapDownloadProgress(progress);
      for (const cb of subscribers) cb(mapped);
    },
  });
  await rememberCachedBundle(circuit, release.stagedDir);
  return release.stagedDir;
}

export function isProvingBundleCached(circuit: CircuitType): boolean {
  if (pendingDownloads.has(circuit)) return false;
  return cachedBundlePaths.has(circuit);
}

export function cancelProvingBundleDownload(_circuit: CircuitType): void {
  // downloadRelease does not currently expose cancellation. Kept for API compatibility.
}

export function clearProvingBundles(): void {
  // Staged bundles are keyed by releaseSha inside the SDK cache directory.
  cachedBundlePaths.clear();
  for (const circuit of Object.keys(BUNDLE_CONFIGS) as CircuitType[]) {
    AsyncStorage.removeItem(cacheStorageKey(circuit)).catch(() => undefined);
  }
}

export function clearProvingBundle(_circuit: CircuitType): void {
  // Staged bundles are keyed by releaseSha inside the SDK cache directory.
  cachedBundlePaths.delete(_circuit);
  AsyncStorage.removeItem(cacheStorageKey(_circuit)).catch(() => undefined);
}

export function getProvingBundleInfo(
  circuit: CircuitType,
): { exists: boolean; size?: number } {
  return { exists: isProvingBundleCached(circuit) };
}

// ── Witness generator (independent distribution) ─────────────────────────────
//
// witness_gen.wasm no longer ships inside the signed CRS bundle. It is
// distributed in its OWN channel together with a witness_gen.json sidecar
// (sha256 + compatible_ar1cs_blake3). prove() receives them as separate
// witnessGenPath / witnessGenSidecarPath args; the SDK verifies the wasm
// against the sidecar and the staged CRS ar1cs_blake3 before proving
// (fail-closed). downloadRelease() above stages CRS-only artifacts.
// The witness generator is versioned independently of the CRS: the CRS stays
// at v0.1.1-rc.1 while the witness-gen tracks the circuit release (v0.1.1-rc.3).
// The sidecar's compatible_ar1cs_blake3 pins it to the rc.1 CRS ar1cs_blake3,
// so rc.1 CRS + rc.3 witness-gen is a verified-compatible pair (fail-closed).
const DEFAULT_WITNESS_GEN_BASE_URL =
  'https://storage.googleapis.com/zkap-static-config/release/v0.1.1-rc.3';

const WITNESS_GEN_BASE_URL = (
  process.env.EXPO_PUBLIC_ZKAP_WITNESS_GEN_BASE_URL ?? DEFAULT_WITNESS_GEN_BASE_URL
).replace(/\/+$/, '');

export interface WitnessGenPaths {
  /** Plain filesystem path (no file://) to witness_gen.wasm. */
  witnessGenPath: string;
  /** Plain filesystem path (no file://) to the witness_gen.json sidecar. */
  witnessGenSidecarPath: string;
}

// Native prove() expects plain filesystem paths (matching downloadRelease's
// stagedDir), not file:// URIs.
function uriToPath(uri: string): string {
  return uri.replace(/^file:\/\//, '');
}

function witnessGenDirUri(): string {
  const root = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!root) {
    throw new Error('No writable filesystem directory available for witness-gen.');
  }
  // Key the cache dir by the base URL so a source change re-fetches cleanly.
  const tag = WITNESS_GEN_BASE_URL.replace(/[^a-zA-Z0-9]/g, '_').slice(-56);
  return joinUri(root, `zkap-witness-gen-${tag}`);
}

let witnessGenPromise: Promise<WitnessGenPaths> | null = null;

/**
 * Ensure witness_gen.wasm + witness_gen.json are staged locally and return
 * their (plain, file://-stripped) filesystem paths for prove(). Cached after
 * the first fetch; a failed download is not cached so the next call retries.
 */
export async function ensureWitnessGen(): Promise<WitnessGenPaths> {
  if (witnessGenPromise) return witnessGenPromise;

  witnessGenPromise = (async () => {
    const dirUri = witnessGenDirUri();
    const wasmUri = joinUri(dirUri, 'witness_gen.wasm');
    const sidecarUri = joinUri(dirUri, 'witness_gen.json');

    const [wasmInfo, sidecarInfo] = await Promise.all([
      FileSystem.getInfoAsync(wasmUri),
      FileSystem.getInfoAsync(sidecarUri),
    ]);
    const cached =
      wasmInfo.exists && !wasmInfo.isDirectory &&
      sidecarInfo.exists && !sidecarInfo.isDirectory;

    if (!cached) {
      await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true }).catch(
        () => undefined,
      );
      // Download the sidecar first (tiny) then the wasm, so a wasm-only
      // partial can never masquerade as a complete cache entry.
      await FileSystem.downloadAsync(`${WITNESS_GEN_BASE_URL}/witness_gen.json`, sidecarUri);
      await FileSystem.downloadAsync(`${WITNESS_GEN_BASE_URL}/witness_gen.wasm`, wasmUri);
    }

    return {
      witnessGenPath: uriToPath(wasmUri),
      witnessGenSidecarPath: uriToPath(sidecarUri),
    };
  })();

  try {
    return await witnessGenPromise;
  } catch (error) {
    witnessGenPromise = null; // allow retry on next call
    throw error;
  }
}

export function clearWitnessGen(): void {
  witnessGenPromise = null;
  try {
    const dirUri = witnessGenDirUri();
    FileSystem.deleteAsync(dirUri, { idempotent: true }).catch(() => undefined);
  } catch {
    // No writable dir — nothing staged to clear.
  }
}

// Backwards-compatible aliases for existing UI/service naming.
export const ensureProvingKey = ensureProvingBundle;
export const isProvingKeyCached = isProvingBundleCached;
export const getCachedProvingKeyPath = getCachedProvingBundlePath;
export const isProvingKeyDownloading = isProvingBundleDownloading;
export const subscribeProvingKeyProgress = subscribeProvingBundleProgress;
export const cancelProvingKeyDownload = cancelProvingBundleDownload;
export const clearProvingKeys = clearProvingBundles;
export const clearProvingKey = clearProvingBundle;
export const getProvingKeyInfo = getProvingBundleInfo;
