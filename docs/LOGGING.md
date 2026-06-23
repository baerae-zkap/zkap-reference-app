> 🌐 English: [LOGGING.en.md](./LOGGING.en.md)

# Android 로그 확인 가이드

이 문서는 ZKAP Reference 앱의 Android 로그를 확인하는 **검증된 표준 절차**를 정의합니다.

> **Metro tasks/*.output 파일은 사용하지 않는다** — background task 종료 시 Metro가 함께 종료되어 로그가 단절됨.

---

## 표준 절차 (검증됨)

### 변수 설정

```bash
ADB=~/Library/Android/sdk/platform-tools/adb
SERIAL=$($ADB devices | grep -v 'List' | grep '\bdevice\b' | awk '{print $1}' | head -1)
PKG=com.example.zkapref
echo "Using device: $SERIAL"
```

### Step 1: Metro 서버 확인 및 시작

```bash
# 실행 중인지 확인
curl -s --max-time 2 http://localhost:8081/status
# "packager-status:running" 이면 OK

# 실행 안 됨이면 백그라운드 시작
nohup bash -c 'set -a && . .env && set +a && npx expo start --port 8081 2>&1' >> /tmp/metro-zkap.log &
sleep 10 && curl -s --max-time 3 http://localhost:8081/status

# Metro 로그 확인
tail -20 /tmp/metro-zkap.log
```

### Step 2: ADB reverse 설정

기기에서 localhost:8081로 Mac의 Metro에 접근하려면:

```bash
$ADB -s $SERIAL reverse tcp:8081 tcp:8081
```

### Step 3: 버퍼 클리어 + 앱 재시작

```bash
$ADB -s $SERIAL logcat -c
$ADB -s $SERIAL shell am force-stop $PKG
sleep 2
$ADB -s $SERIAL shell am start -n $PKG/.MainActivity \
  -d "zkapref://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
```

### Step 4: 로그 수집 (25초 대기 후)

```bash
sleep 25
$ADB -s $SERIAL logcat -d "ReactNativeJS:V" "*:S" | tail -50

# 키워드 필터링
$ADB -s $SERIAL logcat -d "ReactNativeJS:V" "*:S" | grep -i "KEYWORD"
```

---

## 빌드 (최초 설치 or 네이티브 변경 시)

```bash
npm run android
# BUILD SUCCESSFUL 후 Metro 자동 시작 + 앱 설치
```

> **주의**: `npx expo start` 단독 사용 금지. 반드시 `npm run android`로 빌드.

---

## 실시간 로그 스트리밍

```bash
$ADB -s $SERIAL logcat "ReactNativeJS:V" "*:S" | grep -i "KEYWORD"
# Ctrl+C로 중단
```

---

## 트러블슈팅

### 로그가 전혀 안 나올 때

```bash
curl -s http://localhost:8081/status          # Metro 실행 확인
$ADB devices                                   # 기기 연결 확인
$ADB -s $SERIAL shell pidof $PKG              # 앱 실행 확인
$ADB -s $SERIAL reverse --list                # reverse 설정 확인
```

### "more than one device/emulator" 에러

```bash
$ADB devices             # serial 목록 확인
SERIAL=<your-device-serial>   # 실기기 serial 직접 지정
```

### Metro 포트 충돌

```bash
pkill -f "node.*expo\|node.*metro" 2>/dev/null && sleep 2
nohup bash -c 'set -a && . .env && set +a && npx expo start --port 8081 2>&1' >> /tmp/metro-zkap.log &
```

### 앱이 구 번들을 사용할 때

Metro가 새 번들을 제공하려면:
1. Metro 실행 중 (`curl http://localhost:8081/status`)
2. `adb reverse tcp:8081 tcp:8081` 설정됨
3. 앱 실행 시 Metro URL deep link 전달 (Step 3 명령어 사용)

---

## 로그 레벨

| Logcat 태그 | 의미 |
|-------------|------|
| `I ReactNativeJS` | `console.log` |
| `W ReactNativeJS` | `console.warn` |
| `E ReactNativeJS` | `console.error` / 예외 |

---

## 주요 정보

| 항목 | 값 |
|------|-----|
| 패키지명 | `com.example.zkapref` |
| Metro 포트 | `8081` |
| Metro 로그 파일 | `/tmp/metro-zkap.log` |
| ADB 경로 | `~/Library/Android/sdk/platform-tools/adb` |
