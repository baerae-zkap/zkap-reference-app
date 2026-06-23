> 🌐 English: [SETUP.en.md](./SETUP.en.md)

# 설정 가이드 — 본인 자격 증명으로 실행하기

이 레퍼런스 앱은 baerae가 이미 Base Sepolia에 배포한 컨트랙트(`zkapFactory`, 3-of-3
verifier, Poseidon Merkle directory), 회로, 공개 proving 아티팩트를 **그대로 재사용**한다.
따라서 컨트랙트나 회로를 직접 재배포할 필요가 없다.

직접 준비할 것은 **두 가지뿐**이다.

1. **Google OAuth 등록** — 본인 Google Cloud 프로젝트에 OAuth 클라이언트를 생성
2. **Passkey 등록** — 본인 도메인을 RP로 등록(assetlinks.json / AASA 호스팅)

웹 OAuth 클라이언트 id는 ZK 증명의 공개 입력인 audience(`aud`)로 쓰여 지갑 주소를 파생한다.
그래서 본인 자격 증명으로 설정하면 baerae와는 다른, **당신만의 지갑 주소**가 만들어진다.

### 그대로 재사용 vs 직접 준비

| 그대로 재사용 (baerae, Base Sepolia 84532) | 직접 준비 |
|---|---|
| `zkapFactory` / 3-of-3 verifier / Poseidon Merkle directory | ① Google OAuth 클라이언트 (web + Android + iOS) |
| 회로 + proving 아티팩트 (공개 GCS) | ② Passkey RP 도메인 + assetlinks.json / AASA |
| Pimlico bundler / RPC 기본값 | — |

## 사전 요구사항

- Node.js 20.19.4+, npm 10+
- Android: Android Studio + SDK API 36, JDK 17, **실기기**(passkey 검증)
- iOS: Xcode 16.1+, CocoaPods, **실기기**, **유료 Apple Developer 멤버십**(passkey AASA
  등록에 필요)

## 사전 준비물 — Android 서명 키 (두 등록이 공유)

별도 단계가 아니라 위 두 등록이 모두 참조하는 지문 입력이다.

- **기본값**: repo 루트에 `./debug.keystore`가 없으면 `app.config.js`의
  `plugins/expo-signed`가 Expo 기본 debug 키로 fallback한다. 본인 키를 쓰려면 repo 루트에
  `debug.keystore`를 두면 매 prebuild마다 `android/app/`로 주입된다. (실제 keystore는 절대
  커밋하지 말 것 — `*.keystore`는 gitignore됨)
- 필요한 지문 두 개를 keytool로 추출한다.

  ```bash
  keytool -list -v -keystore debug.keystore -alias androiddebugkey -storepass android | grep -E 'SHA1|SHA-256'
  ```

  - **SHA-1** → Google Android OAuth 클라이언트 등록에 사용
  - **SHA-256** → passkey assetlinks.json과 `EXPO_PUBLIC_ORIGIN_ANDROID`의 apk-key-hash에 사용
- apk-key-hash 형식: `android:apk-key-hash:<base64url(SHA-256 raw bytes)>`

> baerae 내부용 `npm run keystore`(1Password)는 외부 개발자에겐 필요 없다 — 본인 keystore를
> 쓰면 된다.

## 1단계 — Google OAuth 등록

Google Cloud Console > APIs & Services > Credentials 에서 OAuth 클라이언트 3개를 만든다.

1. **Web application 클라이언트**
   - 이 클라이언트 id가 **ZK audience(`aud`)** 이며, 지갑 주소와 anchor를 파생하는 핵심 값이다.
   - `.env`의 `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`에 넣는다.
   - ⚠️ **불변**: 한 번 지갑을 만들면 `aud`를 바꿀 수 없다 — 바꾸면 다른 지갑이 되고 기존
     지갑을 복구할 수 없게 된다.
2. **Android 클라이언트**
   - 패키지명(`com.example.zkapref` → 본인 것)과 위에서 얻은 서명 인증서 **SHA-1**을 등록한다.
   - 이 클라이언트가 없거나 지문이 맞지 않으면 Google 로그인이 `DEVELOPER_ERROR`로 실패한다.
3. **iOS 클라이언트**
   - 본인 bundle id를 등록 → 발급되는 reversed-domain URL scheme을 `app.config.js`의
     `iosUrlScheme`에 넣는다.
   - 클라이언트 id는 `.env`의 `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`에 넣는다.

## 2단계 — Passkey 등록 (본인 RP 도메인)

1. **RP 도메인(RP_ID) 선택**
   - `.env`의 `EXPO_PUBLIC_RP_ID`에 본인 도메인(예: `wallet.example.com`)을 넣는다.
   - ⚠️ **불변**: RP_ID는 지갑 생성 시 rpIdHash로 신원에 박히는 ZK 공개 입력이다 — 나중에
     바꾸면 기존 passkey 인증이 무효가 된다.
2. **Android — Digital Asset Links**
   - `docs/assetlinks.example.json`을 템플릿으로 `package_name`(본인 패키지명)과
     `sha256_cert_fingerprints`(서명 인증서 **SHA-256**, colon-hex)를 채운다.
   - `https://<RP_ID>/.well-known/assetlinks.json`에 호스팅한다.
   - `.env`의 `EXPO_PUBLIC_ORIGIN_ANDROID=android:apk-key-hash:<...>`를 설정한다.
3. **iOS — Apple App Site Association**
   - `https://<RP_ID>/.well-known/apple-app-site-association`에 `webcredentials`
     항목(`<TeamID>.<bundleId>`)을 호스팅한다.
   - `app.config.js`의 `associatedDomains`는 이미 `webcredentials:${EXPO_PUBLIC_RP_ID}`로
     배선돼 있다.
   - Apple은 passkey / Associated Domains에 유료 Developer 멤버십이 필요하다.

## 3단계 — app.config.js 식별자 맞추기

두 등록과 빌드 산출물이 일치하도록 다음을 본인 값으로 바꾼다.

- `ios.bundleIdentifier` / `android.package` (`com.example.zkapref` → 본인 것)
- `scheme`
- Google `iosUrlScheme` (1단계 iOS 클라이언트의 reversed URL scheme)
- `associatedDomains`는 `EXPO_PUBLIC_RP_ID`를 자동으로 따라가므로 보통 수정 불필요

## 4단계 — .env 채우기

`.env.example`를 `.env`로 복사하고 위 단계에서 얻은 값을 채운다. 각 변수 설명은
`.env.example`의 인라인 주석을 참고한다. (proving 번들 / witness-gen URL은 기본값이 배선돼
있어 보통 생략해도 된다.)

## 5단계 — 빌드 & 실행

```bash
npm install
npm run android   # 또는: npm run ios  (= expo run:ios --device)
```

- passkey 검증 때문에 **실기기**가 필요하다. `npx expo start` 단독 사용은 금지(네이티브 모듈
  포함).
- 식별자를 바꿨다면 `npm run prebuild:clean`으로 네이티브 프로젝트를 다시 생성한다.

## 6단계 — 검증

1. 앱에서 Google 로그인 → passkey 등록 → 복구 계정 추가
2. 홈 화면에 표시되는 **counterfactual 주소**가 본인 `aud`에서 파생된 새 주소인지 확인
3. 그 주소에 Base Sepolia 테스트 ETH를 충전(faucet)한 뒤 "지갑 활성화"로 배포

> 첫 실행 시 proving 번들(~700MB)이 자동으로 다운로드된다.

## 트러블슈팅

| 증상 | 원인 / 조치 |
|---|---|
| Google 로그인 `DEVELOPER_ERROR` | Android OAuth 클라이언트 누락 또는 SHA-1 불일치 (1단계) |
| Anchor mismatch | 로그인에 쓰인 web client ≠ `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`(`aud`) (1단계) |
| `InvalidAudienceList` / `0x629fa140` / AA23 | `aud` 해시 리스트 구성 오류 — credential당 1개 항목이어야 함. 앱이 자동 계산하므로 보통 client id 미설정/오설정이 근본 원인 |
| passkey 등록/인증 실패 | assetlinks.json / AASA 미호스팅, 지문 불일치, 또는 RP_ID 도메인 불일치 (2단계) |

## Google 외 provider 추가

다른 OAuth provider를 추가하려면 README의 "Adding a new OAuth provider" 체크리스트를
참고한다. (회로 측 실제 등록은 verifier 재컴파일이 필요하며, 해당 가이드는 UI/auth 흐름 추가만
다룬다.)

## 보안 주의

- 이 문서의 모든 값은 **플레이스홀더**다. 실제 keystore, 인증서 지문, 클라이언트 id, 시크릿을
  저장소에 커밋하지 말 것.
- `aud`(web client id)와 RP_ID는 **불변 신원 입력**이다 — 운영 전에 신중히 확정할 것.
