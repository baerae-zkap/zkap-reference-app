import type { ExpoConfig } from 'expo/config';
import {
  ConfigPlugin,
  AndroidConfig,
  IOSConfig,
  createRunOncePlugin,
  withPlugins,
} from 'expo/config-plugins';

const withFirebaseSignin: ConfigPlugin = (config: ExpoConfig) => {
  return withPlugins(config, [
    // Android
    AndroidConfig.GoogleServices.withClassPath,
    AndroidConfig.GoogleServices.withApplyPlugin,
    AndroidConfig.GoogleServices.withGoogleServicesFile,

    // iOS
    IOSConfig.Google.withGoogle,
    IOSConfig.Google.withGoogleServicesFile,
  ]);
};

export default createRunOncePlugin(withFirebaseSignin, 'withFirebaseSignin');
