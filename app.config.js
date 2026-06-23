module.exports = {
  expo: {
    name: "ZKAP Reference",
    slug: "zkap-reference-app",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    scheme: "zkapref",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.example.zkapref",
      // iOS passkey Associated Domain = your RP domain (must host /.well-known/
      // apple-app-site-association). BYO: set EXPO_PUBLIC_RP_ID to your own domain;
      // the placeholder is only a build-time fallback so config stays valid.
      associatedDomains: [
        `webcredentials:${process.env.EXPO_PUBLIC_RP_ID || "your-rp-domain.example.com"}`
      ],
      infoPlist: {
        NSAppTransportSecurity: {
          // ATS stays enabled: TLS is enforced for all public endpoints (OAuth,
          // bundler, RPC, GCS). Only local/dev networking (Metro packager + local
          // RPC on localhost / LAN / *.local) is exempted — NOT arbitrary http.
          NSAllowsLocalNetworking: true
        }
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      edgeToEdgeEnabled: true,
      package: "com.example.zkapref"
    },
    plugins: [
      "expo-router",
      "expo-localization",
      "expo-secure-store",
      "expo-web-browser",
      "@kesha-antonov/react-native-background-downloader",
      [
        "@react-native-google-signin/google-signin",
        {
          // Reversed-domain URL scheme for the Google iOS Client ID (update after issuing from console).
          iosUrlScheme: "com.googleusercontent.apps.YOUR_GOOGLE_IOS_CLIENT_ID"
        }
      ],
      [
        "expo-build-properties",
        {
          ios: {
            // GoogleSignIn → AppCheckCore (Swift) requires GoogleUtilities and RecaptchaInterop
            // to expose module maps from their static libraries so they can be imported.
            // Without this, `pod install` fails with "...do not define modules".
            // Injected via Podfile.properties.json (apple.extraPods).
            extraPods: [
              { name: "GoogleUtilities", modular_headers: true },
              { name: "RecaptchaInterop", modular_headers: true },
            ],
          },
        },
      ],
      [
        "./plugins/expo-signed/expo-signed",
        {
          // App signing key = debug.keystore (standard Android debug key: alias androiddebugkey,
          // password "android"). Its fingerprint is registered with the GCP Android OAuth client,
          // passkey assetlinks, and .env apk-key-hash, so Google Sign-In + passkeys pass.
          //
          // The keystore lives at the repo root because Expo regenerates android/ on every prebuild,
          // which would overwrite android/app/debug.keystore. This plugin re-injects the key into
          // android/app/ on each prebuild. The keystore is gitignored (*.keystore) — never committed.
          //
          // BYO: if no ./debug.keystore is present, the plugin falls back to Expo's default debug key.
          // Register that key's SHA-1 (Google) + SHA-256 (assetlinks + apk-key-hash) with your project.
          keystorePath: ".",
          store_file: { key: "MYAPP_UPLOAD_STORE_FILE", value: "debug.keystore" },
          key_alias: { key: "MYAPP_UPLOAD_KEY_ALIAS", value: "androiddebugkey" },
          store_password: { key: "MYAPP_UPLOAD_STORE_PASSWORD", value: "android" },
          key_password: { key: "MYAPP_UPLOAD_KEY_PASSWORD", value: "android" },
        }
      ]
    ]
  }
};
