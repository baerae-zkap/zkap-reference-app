> 🌐 한국어: [LOGGING.ko.md](./LOGGING.ko.md)

# Android Logging Guide

This document defines the **verified standard procedure** for inspecting Android logs from the ZKAP Reference app.

> **Do not use Metro tasks/*.output files** — Metro exits when the background task ends, cutting off the log stream.

---

## Standard Procedure (Verified)

### Set Variables

```bash
ADB=~/Library/Android/sdk/platform-tools/adb
SERIAL=$($ADB devices | grep -v 'List' | grep '\bdevice\b' | awk '{print $1}' | head -1)
PKG=com.example.zkapref
echo "Using device: $SERIAL"
```

### Step 1: Check and Start Metro Server

```bash
# Check if Metro is running
curl -s --max-time 2 http://localhost:8081/status
# "packager-status:running" means OK

# If not running, start in the background
nohup bash -c 'set -a && . .env && set +a && npx expo start --port 8081 2>&1' >> /tmp/metro-zkap.log &
sleep 10 && curl -s --max-time 3 http://localhost:8081/status

# Check Metro logs
tail -20 /tmp/metro-zkap.log
```

### Step 2: Configure ADB Reverse

To allow the device to reach Mac's Metro at localhost:8081:

```bash
$ADB -s $SERIAL reverse tcp:8081 tcp:8081
```

### Step 3: Clear Buffer + Restart App

```bash
$ADB -s $SERIAL logcat -c
$ADB -s $SERIAL shell am force-stop $PKG
sleep 2
$ADB -s $SERIAL shell am start -n $PKG/.MainActivity \
  -d "zkapref://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
```

### Step 4: Collect Logs (after 25-second wait)

```bash
sleep 25
$ADB -s $SERIAL logcat -d "ReactNativeJS:V" "*:S" | tail -50

# Filter by keyword
$ADB -s $SERIAL logcat -d "ReactNativeJS:V" "*:S" | grep -i "KEYWORD"
```

---

## Build (First Install or After Native Changes)

```bash
npm run android
# After BUILD SUCCESSFUL, Metro starts automatically and the app is installed
```

> **Important**: Do not use `npx expo start` standalone. Always build with `npm run android`.

---

## Live Log Streaming

```bash
$ADB -s $SERIAL logcat "ReactNativeJS:V" "*:S" | grep -i "KEYWORD"
# Press Ctrl+C to stop
```

---

## Troubleshooting

### No Logs at All

```bash
curl -s http://localhost:8081/status          # Verify Metro is running
$ADB devices                                   # Verify device is connected
$ADB -s $SERIAL shell pidof $PKG              # Verify app is running
$ADB -s $SERIAL reverse --list                # Verify reverse is configured
```

### "more than one device/emulator" Error

```bash
$ADB devices                        # List serials
SERIAL=<your-device-serial>         # Specify physical device serial directly
```

### Metro Port Conflict

```bash
pkill -f "node.*expo\|node.*metro" 2>/dev/null && sleep 2
nohup bash -c 'set -a && . .env && set +a && npx expo start --port 8081 2>&1' >> /tmp/metro-zkap.log &
```

### App is Using an Old Bundle

For Metro to serve the new bundle:
1. Metro is running (`curl http://localhost:8081/status`)
2. `adb reverse tcp:8081 tcp:8081` is configured
3. The app is launched with the Metro URL deep link (use the Step 3 command)

---

## Log Levels

| Logcat Tag | Meaning |
|------------|---------|
| `I ReactNativeJS` | `console.log` |
| `W ReactNativeJS` | `console.warn` |
| `E ReactNativeJS` | `console.error` / exception |

---

## Quick Reference

| Item | Value |
|------|-------|
| Package name | `com.example.zkapref` |
| Metro port | `8081` |
| Metro log file | `/tmp/metro-zkap.log` |
| ADB path | `~/Library/Android/sdk/platform-tools/adb` |
