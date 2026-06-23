> 🌐 English: [README.en.md](./README.en.md)

# ZKAP Reference App

ZK 영지식 증명 기반 OAuth + Passkey ERC-4337 스마트 계정 지갑의 **레퍼런스 React Native 앱**.

핵심 5 시나리오만 구현하며 **모든 ZK proof 는 호스트(on-device)에서 생성**한다.

## 핵심 5 시나리오

1. **지갑 생성** — Google sign-in + Passkey 등록 + 복구 계정 설정 + Pimlico bundler 로 deploy UserOp 제출
2. **ETH 전송** — Passkey 로 UserOp 서명 + Pimlico 제출 (proof 불필요)
3. **복구 계정 업데이트** — 3-of-3 native master key signing → 새 anchor on-chain 등록
4. **Passkey 재등록** — 로컬에 복구 계정이 남아있는 상태에서 새 passkey 생성 → master key signing 으로 새 txKey 등록
5. **휴대폰 변경 복구 시뮬레이션** — 로컬 passkey/복구 계정 저장소가 비어있는 상태를 단일 기기에서 근사 → 복구 계정 재입력 → 새 passkey 로 txKey 등록

`소셜 로그인`은 독립 핵심 시나리오가 아니라 지갑 생성·복구 진입에 공통으로 쓰이는 인증 단계다.

## 구조 개요

- 단일 체인 고정: **Base Sepolia (chainId 84532)**
- WebView 없음 — 모든 흐름 호스트 native
- 클라우드 proof / backup / 토큰 리스트 / 거래내역 화면 없음
- paymaster 미사용 — **사용자가 testnet ETH 로 가스 직접 부담**
- 단일 홈 화면 (`app/home/`) + 5 시나리오 진입점 버튼

## 통신 정책

- ❌ 호스트 backend 호출 없음
- ✅ **허용**: GCS 정적 JSON (`storage.googleapis.com/zkap-static-config/`), Pimlico bundler RPC (`public.pimlico.io`), 블록체인 RPC, OAuth provider JWKS

## 시작하기

### 필수 요구사항

- Node.js 20.19.4+, npm 10+ (Expo SDK 54 최소 요구)
- Android: Android Studio + SDK API 36, JDK 17, **실기기** (passkey 검증)
- iOS: Xcode 16.1+, CocoaPods, **실기기**

### 환경 변수 (`.env`)

```bash
# 단일 체인 — Base Sepolia
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

### 빌드 + 실행

```bash
npm install
npm run android   # 실기기에서 사용 권장 — passkey 검증
```

> **참고**: `npx expo start` 단독 사용 금지 — 네이티브 모듈이 포함되어 있음.

## 사용자 가스 부담 (중요)

본 레퍼런스는 paymaster 가 없다. **지갑 생성/전송/복구 트랜잭션은 모두 사용자 wallet 의 자체 ETH 로 가스를 부담**한다.

지갑 생성 흐름:
1. 소셜 로그인 → Passkey 등록 → 복구 계정 추가
2. **counterfactual address 가 화면에 표시됨** (홈 화면)
3. 그 주소에 testnet ETH 입금 — Base Sepolia faucet: `https://www.alchemy.com/faucets/base-sepolia`
4. "지갑 활성화" → 호스트가 deploy UserOp 제출

## Proving 번들 첫 다운로드

호스트 native ZK proof 를 위해 GCS 에서 **manifest 기반 CRS 릴리스 번들**(`manifest.json` 을 담은 staged 디렉토리)을 받아 stage 한다 — standalone `.bin` proving key 가 아니라 SDK 가 `prove()` 에 `manifestDir` 로 넘기는 CRS 전용 번들이다. `witness_gen.wasm` 은 이 번들에 포함되지 않고 **별도 채널에서 sidecar 와 함께 독립적으로** 다운로드되며, SDK 가 staged CRS 와의 호환성을 검증한 뒤 proving 한다(fail-closed). 본 레퍼런스는 **`3-of-3` shape 하나만** 사용하며 CRS 번들은 약 700MB 다. **첫 실행 시 Wi-Fi 권장**.

## 시나리오 ⑤ 휴대폰 변경 복구 시뮬레이션

이 시나리오는 **완전한 실제 휴대폰 변경 복구 테스트가 아니다.** 단일 device 에서 SecureStore 의 passkey + 복구 계정만 지우고 wallet 주소 매핑은 보존해, 새 기기에서 로컬 자격증명 참조가 없는 상황을 근사하는 demo flow 다. OS 자격증명 관리자, 앱 설치 상태, device binding, 백업/복원 정책까지 포함한 end-to-end 실기기 변경 검증은 별도 테스트가 필요하다.

1. 지갑 생성 + ETH 전송 가능 상태에서 시작
2. 홈 화면 (debug build only) 의 **"Reset Passkey + Recovery"** 버튼 → SecureStore 의 passkey + 복구 계정 wipe (wallet 주소 보존)
3. 동일 primary 계정으로 sign-in → reset 화면 자동 진입
4. 재입력 UI 에서 복구 계정 1개 이상 OAuth 재인증 (`s1,s1,s1` / `s1,s2,s1` / `s1,s2,s3` 패딩)
5. 새 passkey 생성 → `applyTxKeyUpdate()` 로 새 txKey on-chain 등록
6. 새 passkey 로 ETH 전송 → 정상 동작 확인

## 디렉토리 구조 (요약)

```
app/
  home/                      # 단일 홈
  sign-in/                   # 공통 Google 인증 진입점
  sign-up/
    create/                  # 지갑 생성 (시나리오 ①)
    passkey/
      reset/
        index.tsx            # Passkey 재등록 / 휴대폰 변경 복구 진입 + ⑤ in-overlay 계정 피커 구동 (시나리오 ④/⑤)
  recovery/{index,setup}/    # 복구 계정 상태/업데이트 (시나리오 ③)
  wallet/send/               # ETH 전송 (시나리오 ②)
components/
  AuthProvider/              # route guard
  WalletActivation/          # 지갑 deploy 시트 (CreatingStep 호스트 native)
  MasterKeySigning/          # ZK proof 진행 오버레이
  SocialButton/, SocialAccountList/
  AppSheetDialog.tsx, ErrorBoundary/, ProvingBundleDownloadConsent.tsx, icons/
services/
  api/{bundler,zkp,gcsClient}.ts
  auth/googleAuth.ts         # Google sign-in (UI 활성 provider)
  chains/chainConfigService.ts
  zkNative/                  # PK manager, JWKS
  wallet/
    walletCreationService.ts # deployWallet (시나리오 ①)
    masterKeySigningService.ts
    recoveryService.ts       # applyRecoveryUpdate (시나리오 ③)
    txKeyRecoveryService.ts  # applyTxKeyUpdate (시나리오 ④/⑤)
    transactionService.ts    # sendETH (시나리오 ②)
stores/
  authStore.ts, walletStore.ts
  recoveryOwnerStore.ts      # 시나리오 ⑤ owner 핸드오프 (sign-in→reset, transient)
libs/
  passkey/, recovery/, chains/, wallet/, jwt/, errors/, zkap/passkeyReconnect.ts
  modules/google-sign/       # Google OAuth native wrapper
  modules/socialSignIn.ts    # provider-agnostic sign-in helper (Google-only)
design-system/
  components/Box/SafeAreaView.tsx      # 화면 SafeArea wrapper
  components/Image/assets/              # PNG 자산
  styles/colors.ts                      # 컬러 팔레트
```

## Security Model & Reduced-Distribution Warning

본 레퍼런스는 Google 단일 provider 로 3개 복구 계정을 구성한다. 이 구성에서는 **Google provider 가 침해될 경우 3개 복구 계정이 동시에 침해**되어 3-of-3 분산성이 실질적으로 무력화된다.

**ZK 회로 `hAudLists` invariant**: 회로의 `hAudLists` 는 GOOGLE/KAKAO/APPLE 3-tuple 의 Poseidon hash 로 고정된 회로 입력 invariant 이다. 본 레퍼런스에서 Apple/Kakao 를 UI 수준에서 제거했지만, ZK 회로 verifier 의 입력 shape (3-slot) 은 변경되지 않는다. 이는 reduced-distribution 을 의도한 것이 아니라 배포된 회로와의 호환성 및 재컴파일 비용을 피하기 위한 선택이다.

**본 reference 의 google×3 동작은 현재 ZK 회로 spec 에 의존하며, 회로 업데이트 시 재검증이 필요하다.**

- **Production fork 권고**: 실제 배포 시 multi-provider (Google + Apple + GitHub 등) 복원으로 true 3-of-3 분산성 확보 권장.
- **Migration note**: 기존 1-of-1 deploy 사용자(Apple/Kakao 복구 계정 등록자)는 본 레퍼런스 적용 시 복구 흐름 실패 가능 — **fresh install 권고**.

### Known limitation — 한 기기 / 여러 계정 (single-tenant local state)

배포 지갑 주소는 **owner(iss/sub)별 레코드**로 보존되므로, 같은 기기에서 계정을 바꿔 로그인해도 원래 계정으로 돌아오면 **기존 지갑 주소로 홈에 복귀**한다(다른 계정이 그 지갑에 들어가지 않는다).

단, **passkey·복구계정·세션(walletStore)은 단일-테넌트**라 계정 전환 시 비워진다. 따라서 다른 계정으로 로그인했다가 원래 계정으로 돌아오면 홈·주소·잔액은 보이지만 **거래 서명용 passkey 가 그 기기에 없을 수 있다** → 이때는 **시나리오 ④(Passkey 재등록)** 또는 복구 계정 재입력이 필요한 **시나리오 ⑤(휴대폰 변경 복구 시뮬레이션)** 로 해당 지갑의 txKey 를 새 passkey 로 갱신하면 다시 거래할 수 있다(원 passkey 는 OS 자격증명 관리자에 남아있으나 앱 로컬 참조는 전환 시 정리된다).

이는 레퍼런스 앱의 의도된 단일-지갑/단일-기기 모델 범위 내 동작이다. multi-account-same-device 를 1급 시나리오로 지원하려면 passkey/복구계정/salt/walletStore 를 owner 별로 분리(전환 시 wipe 대신 active-owner 스위치)하는 follow-up 이 필요하다.

## Adding a new OAuth provider (e.g. GitHub, Facebook)

새 provider 추가 시 변경이 필요한 지점 체크리스트:

1. **`libs/constants/providers.ts`** — `SUPPORTED_SOCIAL_PROVIDERS` 배열에 신규 provider 추가
2. **`stores/authStore.ts`** — `SocialProvider` union type 확장
3. **`services/auth/<newProvider>Auth.ts`** — 신규 OAuth sign-in service 파일 생성
4. **`services/zkNative/jwksService.ts`** — 신규 provider JWKS URL 추가
5. **`libs/wallet/providerConfigHelper.ts`** — `PROVIDER_MAP` 에 신규 provider 매핑 추가
6. **`libs/jwt/decodeIdToken.ts`** — `iss` 클레임 매핑 추가
7. **`app/sign-in/index.tsx`** — 로그인 화면에 신규 provider 버튼 추가
8. **`components/SocialAccountPicker` / `SocialAccountList`** — 복구 계정 선택 UI(설정 화면 `app/recovery/setup/` + 시나리오⑤ `MasterKeySigningOverlay` in-overlay 피커가 공유)에 신규 provider 버튼 추가

> **회로 invariant 경고**: 회로의 `hAudLists` 는 GOOGLE/KAKAO/APPLE 3-tuple Poseidon hash 로 고정 (회로 입력 invariant). 새 provider 를 ZK 회로 측에 실제로 등록하려면 회로 verifier 재컴파일이 필요. 본 가이드는 UI/auth 흐름 추가 한정.

## 문서

- 설정 가이드(본인 자격 증명으로 실행): `docs/SETUP.md` ([English](./docs/SETUP.en.md))
- Android 로그 확인: `docs/LOGGING.md`

## License

Licensed under either of:

- MIT license ([LICENSE-MIT](LICENSE-MIT) or http://opensource.org/licenses/MIT)
- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE) or http://www.apache.org/licenses/LICENSE-2.0)
