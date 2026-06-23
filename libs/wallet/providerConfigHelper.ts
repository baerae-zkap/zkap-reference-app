/**
 * Centralized OAuth provider config for the reference app.
 *
 * This app is a "bring your own OAuth" (BYO) integration: it ALWAYS builds
 * `ZkapProviderConfig.custom()` from the developer's own Google client in `.env`.
 * There is no built-in product preset and no fallback — if the client id is not
 * configured, `initProviderConfig()` throws (fail-closed), so the app never silently
 * derives wallets from some other party's audience.
 *
 * The OAuth client id is the `aud` baked into the CREATE2 salt/anchor, so it MUST
 * equal the web client used to sign in (`services/auth/googleAuth.ts`). The per-aud
 * Poseidon hash (`hAud`) is computed natively via `generateAudHash().audHashes[0]`,
 * so the developer only supplies a client id — no precomputed hashes.
 *
 * `initProviderConfig()` is async; call (and await) it before any wallet creation,
 * sign-in, or recovery flow. Consumers must not read the config before it resolves.
 */
import {
  ZkapProviderConfig,
  type SocialProvider as SdkProvider,
  type ZkapProviderConfigOptions,
} from '@baerae/zkap-aa';
import { CIRCUIT_CONFIGS } from '@/services/zkNative/circuitConfigs';

const PROVIDER_MAP: Record<string, SdkProvider> = {
  google: 'GOOGLE',
  apple: 'APPLE',
  kakao: 'KAKAO',
};

/**
 * The OAuth web client id = the ZK audience. Resolved the same way as
 * `googleAuth.ts` (IOS_WEB_CLIENT_ID, else WEB_CLIENT_ID) so the idToken `aud`
 * matches the address/anchor aud. Returns undefined when nothing is configured.
 */
function resolveGoogleClientId(): string | undefined {
  return (
    process.env.EXPO_PUBLIC_GOOGLE_IOS_WEB_CLIENT_ID ??
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  );
}

let providerConfig: ZkapProviderConfig | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;

async function buildConfig(): Promise<ZkapProviderConfig> {
  const googleClientId = resolveGoogleClientId();
  if (!googleClientId) {
    throw new Error(
      'OAuth not configured: set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (your Google web ' +
        'client id — this is the ZK audience) in .env.',
    );
  }

  // Inline require (not `import()`) so it works under both Metro and Jest's CJS runtime,
  // and is only loaded when actually building the config.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { generateAudHash } = require('@baerae/zkap-zkp') as typeof import('@baerae/zkap-zkp');

  const config = CIRCUIT_CONFIGS['3-of-3'];
  // Per-aud Poseidon hash (one slot) — circuit-correct quoting is handled natively.
  const { audHashes } = await generateAudHash(config, [googleClientId]);
  const hAud = audHashes[0];
  // 3-slot list hash (3-of-3). Not consumed on proof paths (the on-chain hAudList is
  // recomputed natively from the canonical aud at registration), computed for consistency.
  const { hAudList } = await generateAudHash(config, [
    googleClientId,
    googleClientId,
    googleClientId,
  ]);

  const options: ZkapProviderConfigOptions = {
    providers: {
      GOOGLE: { clientId: googleClientId, hAud },
      // Reference app is Google-only; KAKAO/APPLE are intentionally unconfigured.
      KAKAO: { clientId: '', hAud: '' },
      APPLE: { clientId: '', hAud: '' },
    },
    hAudLists: hAudList,
    hAudLists1: hAud, // 1-of-1 variant; unused on the 3-of-3-only proof paths.
  };
  return ZkapProviderConfig.custom(options);
}

export async function initProviderConfig(): Promise<void> {
  if (initialized) return;
  if (!initPromise) {
    // Reset on failure so a transient error (e.g. the fire-and-forget startup call
    // before the native module is ready) doesn't cache a rejected promise.
    initPromise = (async () => {
      providerConfig = await buildConfig();
      initialized = true;
    })().catch((e) => {
      initPromise = null;
      initialized = false;
      throw e;
    });
  }
  return initPromise;
}

export function isProviderConfigReady(): boolean {
  return initialized;
}

function requireConfig(): ZkapProviderConfig {
  if (!providerConfig) {
    throw new Error(
      'Provider config not initialized — await initProviderConfig() before reading it.',
    );
  }
  return providerConfig;
}

export function toSdkProvider(provider: string): SdkProvider {
  const mapped = PROVIDER_MAP[provider.toLowerCase()];
  if (!mapped) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  return mapped;
}

export function getCanonicalClientId(provider: string): string {
  return requireConfig().getProviderEntry(toSdkProvider(provider)).clientId;
}

export function getHAud(provider: string): string {
  return requireConfig().getHAud(toSdkProvider(provider));
}

export function getHAudLists(): string {
  return requireConfig().getHAudLists();
}
