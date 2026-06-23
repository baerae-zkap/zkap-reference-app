// https://github.com/akayakagunduz/expo-signed
const { withGradleProperties } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const app_path = './android/app';

const modifyGradleProperties = (config, props) => {
  return withGradleProperties(config, (config) => {
    Object.values(props).forEach((prop) => {
      if (typeof prop === 'object' && prop.key && prop.value) {
        const { key, value } = prop;
        const exists = config.modResults.find(
          (item) => item.type === 'property' && item.key === key,
        );

        if (!exists) {
          config.modResults.push({ type: 'property', key, value });
        }
      }
    });

    return config;
  });
};

const modifyBuildGradle = (
  config,
  { key_alias, key_password, keystorePath, store_file, store_password },
) => {
  const filePath = path.resolve(app_path, 'build.gradle');

  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const release = /signingConfigs\s*\{(?:[^{}]*\{[^}]*\}|[^}])*release\s*\{[^}]*\}[^}]*\}/;
    const isKeystoreExist = fs.existsSync(`${keystorePath}/${store_file.value}`);

    const releaseKeystore = `storeFile file(${store_file.key})
          storePassword ${store_password.key}
          keyAlias ${key_alias.key}
          keyPassword ${key_password.key}`;

    const debugKeystore = `storeFile file('debug.keystore')
          storePassword 'android'
          keyAlias 'androiddebugkey'
          keyPassword 'android'`;

    let updatedContent = content.replace(
      /(release\s*{[^}]*signingConfig\s+signingConfigs\.)debug/,
      '$1release',
    );

    if (!release.test(updatedContent)) {
      updatedContent = updatedContent.replace(
        /(signingConfigs\s*{[^}]*debug\s*{[^}]*})/,
        `signingConfigs {
        debug {
          ${isKeystoreExist ? releaseKeystore : debugKeystore}
        }
        release {
          ${isKeystoreExist ? releaseKeystore : debugKeystore}
        }`,
      );
    }

    if (updatedContent !== content) {
      fs.writeFileSync(filePath, updatedContent, 'utf8');
    }
  }

  return config;
};

const copyKeystoreFile = (
  config,
  { keystorePath, store_file },
) => {
  const source = path.resolve(keystorePath, store_file.value);
  const destination = path.resolve(app_path, store_file.value);

  if (fs.existsSync(source) && fs.existsSync(path.dirname(destination))) {
    fs.copyFileSync(source, destination);
  }

  return config;
};

function withSigned(config, props) {
  const requiredProps = [
    'store_file',
    'key_alias',
    'store_password',
    'key_password',
    'keystorePath',
  ];

  requiredProps.forEach((prop) => {
    if (!props[prop]) {
      throw new Error(`Missing required property: ${prop}`);
    }
  });

  return copyKeystoreFile(modifyBuildGradle(modifyGradleProperties(config, props), props), props);
}

module.exports = withSigned;
