import { NativeModule, requireNativeModule } from 'expo';

declare class GoogleSignModule extends NativeModule {
  signin(client: string, nonce: string): Promise<string>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<GoogleSignModule>('GoogleSign');
