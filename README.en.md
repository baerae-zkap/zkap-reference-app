> 🌐 한국어: [README.md](./README.md)

# ZKAP Reference App

A **reference React Native app** for a ZK zero-knowledge proof OAuth + Passkey ERC-4337 smart account wallet.

Implements exactly five core scenarios; **all ZK proofs are generated on-device (host native)**.

## Five Core Scenarios

1. **Wallet creation** — Google sign-in + Passkey registration + recovery account setup + deploy UserOp submitted via Pimlico bundler
2. **ETH transfer** — UserOp signed with Passkey + submitted via Pimlico (no proof required)
3. **Recovery account update** — 3-of-3 native master key signing → new anchor registered on-chain
4. **Passkey re-registration** — with recovery accounts still present locally, create a new passkey → register new txKey on-chain via master key signing
5. **Phone-change recovery simulation** — approximate the state of having no local credentials on a single device (passkey + recovery accounts wiped from SecureStore, wallet address mapping preserved) → re-enter recovery accounts → register new txKey with new passkey

`Social login` is not an independent core scenario; it is the shared authentication step for wallet creation and recovery entry.

## Architecture Overview

- Single fixed chain: **Base Sepolia (chainId 84532)**
- No WebView — all flows are host native
- No cloud proof / backup / token list / transaction history screens
- No paymaster — **users pay gas directly from their own testnet ETH**
- Single home screen (`app/home/`) + five scenario entry buttons

## Communication Policy

- ❌ Zero host backend calls
- ✅ **Allowed**: GCS static JSON (`storage.googleapis.com/zkap-static-config/`), Pimlico bundler RPC (`public.pimlico.io`), blockchain RPC, OAuth provider JWKS

## Getting Started

### Prerequisites

- Node.js 20.19.4+, npm 10+ (Expo SDK 54 minimum)
- Android: Android Studio + SDK API 36, JDK 17, **physical device** (passkey verification)
- iOS: Xcode 16.1+, CocoaPods, **physical device**

### Environment Variables (`.env`)

```bash
# Single chain — Base Sepolia
EXPO_PUBLIC_CHAIN_ID=84532
EXPO_PUBLIC_RPC_URL=https://sepolia.base.org

# OAuth - Google
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...

# Passkey
EXPO_PUBLIC_RP_ID=zkap.app
EXPO_PUBLIC_RP_NAME=ZKAP Reference
EXPO_PUBLIC_ORIGIN_ANDROID=android:apk-key-hash:...
```

### Build + Run

```bash
npm install
npm run android   # Physical device recommended — passkey verification
```

> **Note**: Do not use `npx expo start` standalone — the app contains native modules.

## User Gas (Important)

This reference app has no paymaster. **All wallet creation / transfer / recovery transactions are paid with the user's own ETH.**

Wallet creation flow:
1. Social login → Passkey registration → add recovery accounts
2. **Counterfactual address is shown on screen** (home screen)
3. Fund that address with testnet ETH — Base Sepolia faucet: `https://www.alchemy.com/faucets/base-sepolia`
4. "Activate wallet" → host submits deploy UserOp

## Proving Bundle First Download

For host native ZK proof generation, the app downloads and stages a **manifest-backed CRS release bundle** from GCS (a staged directory with `manifest.json`) — not a standalone `.bin` proving key, but a CRS-only bundle the SDK passes to `prove()` as `manifestDir`. The `witness_gen.wasm` is **not** in this bundle; it's downloaded independently from its own channel (with a sidecar), and the SDK verifies it against the staged CRS before proving (fail-closed). This reference uses **only the `3-of-3` shape**; the CRS bundle is ~700 MB. **Wi-Fi recommended on first run.**

## Scenario ⑤ Phone-Change Recovery Simulation

This scenario is **not a full end-to-end real phone-change recovery test.** It is a demo flow that approximates having no local credential references on a new device — by wiping only the passkey + recovery accounts from SecureStore on a single device while preserving the wallet address mapping. Verifying OS credential manager state, app installation state, device binding, and backup/restore policies requires a separate test on actual hardware.

1. Start with a wallet created and ETH transfers working
2. Tap **"Reset Passkey + Recovery"** on the home screen (debug build only) → wipe passkey + recovery accounts from SecureStore (wallet address preserved)
3. Sign in with the same primary account → automatically enters the reset screen
4. Re-authenticate at least one recovery account via OAuth in the re-entry UI (`s1,s1,s1` / `s1,s2,s1` / `s1,s2,s3` padding)
5. Create a new passkey → register new txKey on-chain via `applyTxKeyUpdate()`
6. Send ETH with the new passkey → verify it works

## Directory Structure (Summary)

```
app/
  home/                      # Single home screen
  sign-in/                   # Shared Google authentication entry point
  sign-up/
    create/                  # Wallet creation (scenario ①)
    passkey/
      reset/
        index.tsx            # Passkey re-registration / phone-change recovery entry + ⑤ in-overlay account picker (scenarios ④/⑤)
  recovery/{index,setup}/    # Recovery account status/update (scenario ③)
  wallet/send/               # ETH transfer (scenario ②)
components/
  AuthProvider/              # Route guard
  WalletActivation/          # Wallet deploy sheet (CreatingStep host native)
  MasterKeySigning/          # ZK proof progress overlay
  SocialButton/, SocialAccountList/
  AppSheetDialog.tsx, ErrorBoundary/, ProvingBundleDownloadConsent.tsx, icons/
services/
  api/{bundler,zkp,gcsClient}.ts
  auth/googleAuth.ts         # Google sign-in (active UI provider)
  chains/chainConfigService.ts
  zkNative/                  # PK manager, JWKS
  wallet/
    walletCreationService.ts # deployWallet (scenario ①)
    masterKeySigningService.ts
    recoveryService.ts       # applyRecoveryUpdate (scenario ③)
    txKeyRecoveryService.ts  # applyTxKeyUpdate (scenarios ④/⑤)
    transactionService.ts    # sendETH (scenario ②)
stores/
  authStore.ts, walletStore.ts
  recoveryOwnerStore.ts      # Scenario ⑤ owner handoff (sign-in→reset, transient)
libs/
  passkey/, recovery/, chains/, wallet/, jwt/, errors/, zkap/passkeyReconnect.ts
  modules/google-sign/       # Google OAuth native wrapper
  modules/socialSignIn.ts    # Provider-agnostic sign-in helper (Google-only)
design-system/
  components/Box/SafeAreaView.tsx      # Screen SafeArea wrapper
  components/Image/assets/              # PNG assets
  styles/colors.ts                      # Color palette
```

## Security Model & Reduced-Distribution Warning

This reference app configures three recovery accounts using Google as the sole provider. In this setup, **if the Google provider is compromised, all three recovery accounts are compromised simultaneously**, effectively negating the 3-of-3 distribution guarantee.

**ZK circuit `hAudLists` invariant**: The circuit's `hAudLists` is a fixed circuit input invariant computed as the Poseidon hash of a GOOGLE/KAKAO/APPLE 3-tuple. While Apple/Kakao have been removed at the UI level in this reference app, the ZK circuit verifier's input shape (3 slots) is unchanged. This is not an intentional reduced-distribution design — it is a pragmatic choice to maintain compatibility with the deployed circuit and avoid recompilation costs.

**The google×3 behavior of this reference depends on the current ZK circuit spec and will require re-verification if the circuit is updated.**

- **Production fork recommendation**: For real deployments, restore multi-provider support (Google + Apple + GitHub, etc.) to achieve true 3-of-3 distribution.
- **Migration note**: Users who deployed wallets with 1-of-1 recovery (e.g. Apple/Kakao recovery accounts registered) may encounter recovery flow failures when applying this reference — **fresh install recommended**.

### Known Limitation — Single Device / Multiple Accounts (single-tenant local state)

Deployed wallet addresses are stored **per owner (iss/sub)**, so switching accounts on the same device and switching back will **return to the original wallet address on the home screen** (another account cannot access that wallet).

However, **passkey, recovery accounts, and session (walletStore) are single-tenant** and are cleared on account switch. This means that after switching to another account and switching back, the home screen, address, and balance are visible but **the passkey for signing transactions may not be present on the device** → in this case, use **scenario ④ (Passkey re-registration)** or **scenario ⑤ (Phone-change recovery simulation)** to update the txKey for that wallet with a new passkey (the original passkey remains in the OS credential manager but the app's local reference is cleared on switch).

This is intended behavior within the single-wallet / single-device model of this reference app. Supporting multi-account-same-device as a first-class scenario would require isolating passkey/recovery/salt/walletStore per owner (active-owner switch instead of wipe on account change).

## Adding a New OAuth Provider (e.g. GitHub, Facebook)

Checklist of files to change when adding a new provider:

1. **`libs/constants/providers.ts`** — add the new provider to the `SUPPORTED_SOCIAL_PROVIDERS` array
2. **`stores/authStore.ts`** — extend the `SocialProvider` union type
3. **`services/auth/<newProvider>Auth.ts`** — create a new OAuth sign-in service file
4. **`services/zkNative/jwksService.ts`** — add the new provider's JWKS URL
5. **`libs/wallet/providerConfigHelper.ts`** — add the new provider mapping to `PROVIDER_MAP`
6. **`libs/jwt/decodeIdToken.ts`** — add the `iss` claim mapping
7. **`app/sign-in/index.tsx`** — add the new provider button to the sign-in screen
8. **`components/SocialAccountPicker` / `SocialAccountList`** — add the new provider button to the recovery account selection UI (shared by the setup screen `app/recovery/setup/` and the scenario ⑤ `MasterKeySigningOverlay` in-overlay picker)

> **Circuit invariant warning**: The circuit's `hAudLists` is fixed as the GOOGLE/KAKAO/APPLE 3-tuple Poseidon hash (circuit input invariant). Actually registering a new provider on the ZK circuit side requires recompiling the circuit verifier. This guide covers UI/auth flow additions only.

## Documentation

- Setup guide (run with your own credentials): `docs/SETUP.md` ([English](./docs/SETUP.en.md))
- Android logging: `docs/LOGGING.md` ([English](./docs/LOGGING.en.md))

## License

Licensed under either of:

- MIT license ([LICENSE-MIT](LICENSE-MIT) or http://opensource.org/licenses/MIT)
- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE) or http://www.apache.org/licenses/LICENSE-2.0)
