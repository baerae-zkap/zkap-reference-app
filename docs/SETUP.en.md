> 🌐 한국어: [SETUP.md](./SETUP.md)

# Setup Guide — Running with Your Own Credentials

This reference app reuses, as-is, the contracts baerae has already deployed to Base Sepolia
(`zkapFactory`, the 3-of-3 verifier, the Poseidon Merkle directory), the circuit, and the
public proving artifacts. You do **not** need to redeploy any contract or circuit.

The only things you provide yourself are **two**:

1. **Google OAuth registration** — create OAuth clients in your own Google Cloud project
2. **Passkey registration** — register your own domain as the RP (host assetlinks.json / AASA)

The web OAuth client id is used as the ZK proof's public-input audience (`aud`), from which
the wallet address is derived. So configuring your own credentials produces **your own
wallet addresses**, distinct from baerae's.

### Reuse as-is vs. provide yourself

| Reuse as-is (baerae, Base Sepolia 84532) | You provide |
|---|---|
| `zkapFactory` / 3-of-3 verifier / Poseidon Merkle directory | ① Google OAuth clients (web + Android + iOS) |
| Circuit + proving artifacts (public GCS) | ② Passkey RP domain + assetlinks.json / AASA |
| Pimlico bundler / RPC defaults | — |

## Prerequisites

- Node.js 20.19.4+, npm 10+
- Android: Android Studio + SDK API 36, JDK 17, **physical device** (passkey verification)
- iOS: Xcode 16.1+, CocoaPods, **physical device**, **paid Apple Developer membership**
  (required to register the passkey AASA)

## Shared prerequisite — your Android signing key (used by both registrations)

Not a separate step — it's the fingerprint input both registrations consume.

- **Default**: if no `./debug.keystore` exists at the repo root, `app.config.js` →
  `plugins/expo-signed` falls back to Expo's default debug key. To use your own, place a
  `debug.keystore` at the repo root; it is injected into `android/app/` on every prebuild.
  (Never commit a real keystore — `*.keystore` is gitignored.)
- Extract the two fingerprints with keytool:

  ```bash
  keytool -list -v -keystore debug.keystore -alias androiddebugkey -storepass android | grep -E 'SHA1|SHA-256'
  ```

  - **SHA-1** → register with the Google Android OAuth client
  - **SHA-256** → used in the passkey assetlinks.json and the `EXPO_PUBLIC_ORIGIN_ANDROID`
    apk-key-hash
- apk-key-hash format: `android:apk-key-hash:<base64url(raw SHA-256 bytes)>`

> The baerae-internal `npm run keystore` (1Password) is not needed by external developers —
> bring your own keystore.

## Step 1 — Google OAuth registration

In Google Cloud Console > APIs & Services > Credentials, create three OAuth clients.

1. **Web application client**
   - This client id is the **ZK audience (`aud`)** — the value that derives the wallet
     address and anchor.
   - Put it in `.env` as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
   - ⚠️ **Immutable**: once a wallet exists you cannot change the `aud` — changing it yields
     a different wallet and makes the existing wallet unrecoverable.
2. **Android client**
   - Register your package name (`com.example.zkapref` → your own) and the signing-cert
     **SHA-1** from above.
   - If this client is missing or the fingerprint mismatches, Google Sign-In fails with
     `DEVELOPER_ERROR`.
3. **iOS client**
   - Register your bundle id → put the issued reversed-domain URL scheme into `iosUrlScheme`
     in `app.config.js`.
   - The client id goes in `.env` as `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.

## Step 2 — Passkey registration (your RP domain)

1. **Choose your RP domain (RP_ID)**
   - Put your domain (e.g. `wallet.example.com`) in `.env` as `EXPO_PUBLIC_RP_ID`.
   - ⚠️ **Immutable**: RP_ID is a ZK public input baked into the identity as rpIdHash at
     wallet creation — changing it later invalidates existing passkey authorization.
2. **Android — Digital Asset Links**
   - Using `docs/assetlinks.example.json` as a template, fill `package_name` (your package)
     and `sha256_cert_fingerprints` (your signing-cert **SHA-256**, colon-hex).
   - Host it at `https://<RP_ID>/.well-known/assetlinks.json`.
   - Set `.env` `EXPO_PUBLIC_ORIGIN_ANDROID=android:apk-key-hash:<...>`.
3. **iOS — Apple App Site Association**
   - Host a `webcredentials` entry (`<TeamID>.<bundleId>`) at
     `https://<RP_ID>/.well-known/apple-app-site-association`.
   - `associatedDomains` in `app.config.js` is already wired to
     `webcredentials:${EXPO_PUBLIC_RP_ID}`.
   - Apple requires a paid Developer membership for passkeys / Associated Domains.

## Step 3 — Align app.config.js identifiers

Change these to your own values so the registrations match the built binary:

- `ios.bundleIdentifier` / `android.package` (`com.example.zkapref` → your own)
- `scheme`
- Google `iosUrlScheme` (the reversed URL scheme from your Step 1 iOS client)
- `associatedDomains` follows `EXPO_PUBLIC_RP_ID` automatically — usually no change needed

## Step 4 — Fill in .env

Copy `.env.example` to `.env` and fill in the values produced above. See the inline comments
in `.env.example` for each variable. (proving-bundle / witness-gen URLs have working defaults
and can normally be omitted.)

## Step 5 — Build & run

```bash
npm install
npm run android   # or: npm run ios  (= expo run:ios --device)
```

- A **physical device** is required for passkey verification. Do not use `npx expo start`
  standalone (the app contains native modules).
- If you changed identifiers, regenerate the native projects with `npm run prebuild:clean`.

## Step 6 — Verify

1. In the app: Google sign-in → passkey registration → add recovery accounts
2. Confirm the **counterfactual address** shown on the home screen is a new address derived
   from your `aud`
3. Fund it with Base Sepolia test ETH (faucet), then "Activate wallet" to deploy

> On first run, the proving bundle (~700MB) downloads automatically.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Google sign-in `DEVELOPER_ERROR` | Missing Android OAuth client or SHA-1 mismatch (Step 1) |
| Anchor mismatch | The web client used to sign in ≠ `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (`aud`) (Step 1) |
| `InvalidAudienceList` / `0x629fa140` / AA23 | aud-hash-list construction error — must be one entry per credential. The app computes this automatically, so the usual root cause is an unset/wrong client id |
| Passkey registration/verification fails | assetlinks.json / AASA not hosted, fingerprint mismatch, or RP_ID domain mismatch (Step 2) |

## Adding a provider other than Google

To add another OAuth provider, see the "Adding a new OAuth provider" checklist in the README.
(Actually registering it on the circuit side requires recompiling the verifier — that guide
covers UI/auth flow additions only.)

## Security note

- Every value in this document is a **placeholder**. Never commit real keystores, certificate
  fingerprints, client ids, or secrets.
- The `aud` (web client id) and RP_ID are **immutable identity inputs** — settle them
  carefully before going to production.
