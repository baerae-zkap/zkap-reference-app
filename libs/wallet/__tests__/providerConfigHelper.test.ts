/**
 * providerConfigHelper — the reference app is a BYO integration: it builds
 * `ZkapProviderConfig.custom()` from the developer's own Google client in `.env`.
 * There is no built-in preset and no fallback; an unconfigured client fails closed.
 */

// Native zkp module (not available in Jest/Node) — generateAudHash returns the
// per-aud Poseidon hashes + combined list hash.
jest.mock('@baerae/zkap-zkp', () => ({
  generateAudHash: jest.fn(),
}));

jest.mock('@/services/zkNative/circuitConfigs', () => ({
  CIRCUIT_CONFIGS: { '3-of-3': {} },
}));

jest.mock('@baerae/zkap-aa', () => ({
  ZkapProviderConfig: { custom: jest.fn() },
}));

describe('providerConfigHelper (BYO custom from .env)', () => {
  const CLIENT_ID = 'my-app-123.apps.googleusercontent.com';
  const savedWeb = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const savedIosWeb = process.env.EXPO_PUBLIC_GOOGLE_IOS_WEB_CLIENT_ID;

  const restore = (key: string, val: string | undefined) => {
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  };

  beforeEach(() => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
    delete process.env.EXPO_PUBLIC_GOOGLE_IOS_WEB_CLIENT_ID;
  });

  afterEach(() => {
    restore('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', savedWeb);
    restore('EXPO_PUBLIC_GOOGLE_IOS_WEB_CLIENT_ID', savedIosWeb);
  });

  function wireMocks(audHash = '0xCAFE', listHash = '0xBEEF') {
    const zkp = require('@baerae/zkap-zkp');
    (zkp.generateAudHash as jest.Mock).mockResolvedValue({
      audHashes: [audHash],
      hAudList: listHash,
    });
    const aa = require('@baerae/zkap-aa');
    (aa.ZkapProviderConfig.custom as jest.Mock).mockImplementation((opts: any) => ({
      getProviderEntry: (p: string) => opts.providers[p],
      getHAud: (p: string) => opts.providers[p].hAud,
      getHAudLists: () => opts.hAudLists,
    }));
    return { zkp, aa };
  }

  it('builds custom() from the .env Google client with a natively-computed hAud', async () => {
    const { zkp, aa } = wireMocks();
    const helper = require('@/libs/wallet/providerConfigHelper');
    await helper.initProviderConfig();

    expect(zkp.generateAudHash).toHaveBeenCalledWith(expect.anything(), [CLIENT_ID]);
    expect(aa.ZkapProviderConfig.custom).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: expect.objectContaining({
          GOOGLE: { clientId: CLIENT_ID, hAud: '0xCAFE' },
        }),
      }),
    );
    expect(helper.getCanonicalClientId('google')).toBe(CLIENT_ID);
    expect(helper.getHAud('google')).toBe('0xCAFE');
  });

  it('prefers IOS_WEB_CLIENT_ID over WEB_CLIENT_ID when set', async () => {
    const CANONICAL = 'canonical-456.apps.googleusercontent.com';
    process.env.EXPO_PUBLIC_GOOGLE_IOS_WEB_CLIENT_ID = CANONICAL;
    const { zkp } = wireMocks();
    const helper = require('@/libs/wallet/providerConfigHelper');
    await helper.initProviderConfig();

    expect(zkp.generateAudHash).toHaveBeenCalledWith(expect.anything(), [CANONICAL]);
    expect(helper.getCanonicalClientId('google')).toBe(CANONICAL);
  });

  it('throws (fail-closed) when no Google client id is configured', async () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    delete process.env.EXPO_PUBLIC_GOOGLE_IOS_WEB_CLIENT_ID;
    wireMocks();
    const helper = require('@/libs/wallet/providerConfigHelper');
    await expect(helper.initProviderConfig()).rejects.toThrow(/OAuth not configured/);
  });

  it('throws if the config is read before init', () => {
    wireMocks();
    const helper = require('@/libs/wallet/providerConfigHelper');
    expect(() => helper.getCanonicalClientId('google')).toThrow(/not initialized/);
  });

  it('throws for unsupported provider', async () => {
    wireMocks();
    const helper = require('@/libs/wallet/providerConfigHelper');
    await helper.initProviderConfig();
    expect(() => helper.getCanonicalClientId('twitter')).toThrow('Unsupported provider: twitter');
  });
});
