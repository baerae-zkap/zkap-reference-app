// Reexport the native module. On web, it will be resolved to GoogleSignModule.web.ts
// and on native platforms to GoogleSignModule.ts
import GoogleSignModule from './src/GoogleSignModule';

export async function signin(clientId: string, nonce: string): Promise<string> {
  return await GoogleSignModule.signin(clientId, nonce);
}
