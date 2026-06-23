/**
 * baerae-internal helper — fetch the reference-app signing keystore from 1Password.
 *
 * NOT required for external developers. The Android build falls back to Expo's default
 * debug keystore when `./debug.keystore` is absent (see `app.config.js` →
 * `plugins/expo-signed`). External devs bring their own keystore
 * and register ITS fingerprint with their own Google OAuth client + passkey assetlinks.
 *
 * This script only helps the baerae team retrieve the shared keystore
 * (alias `androiddebugkey`, SHA-1 `A2:3F:5D…`, SHA-256 `14:7F:C3:AF…`) whose
 * fingerprint is registered in the project's GCP Android OAuth client + passkey
 * assetlinks. It writes `./debug.keystore` at the repo root, which `app.config.js`
 * (keystorePath=".") copies into `android/app/` on every prebuild.
 *
 * Requires the 1Password CLI (`op`) installed and signed in.
 * Usage: `npm run keystore`
 */
import { execFileSync } from 'child_process';

const OUT_FILE = 'debug.keystore';
// 1Password item holding the registered reference-app signing keystore.
const OP_REF = 'op://CICD-Dev/zkap-reference-app.keystore.development/signing.keystore';

function make(): void {
  try {
    // execFileSync (no shell) — args passed directly, no interpolation/injection surface.
    execFileSync('op', ['read', OP_REF, '--out-file', OUT_FILE, '--force'], { encoding: 'utf-8' });
    console.info(
      `[1m[32m[SUCCESS][39m[22m ✅ ${OUT_FILE} written from 1Password.`,
    );
  } catch (error) {
    console.error(error);
    console.info(
      `[1m[31m[ERROR][39m[22m ❌ Failed to fetch ${OUT_FILE} from 1Password (${OP_REF}).\n` +
        `   Is the 'op' CLI installed and signed in, and does the item exist?\n` +
        `   External developers do NOT need this — provide your own keystore.`,
    );
    process.exit(1);
  }
}

make();
