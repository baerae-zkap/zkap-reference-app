module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/', '/.expo/', '/setup.ts$', '/setup.js$'],
  collectCoverageFrom: [
    'components/**/*.{ts,tsx}',
    'design-system/components/**/*.{ts,tsx}',
    'stores/**/*.{ts,tsx}',
    'services/**/*.{ts,tsx}',
    'libs/**/*.{ts,tsx}',
    'app/**/*.{ts,tsx}',
    '!**/*.stories.{ts,tsx}',
    '!**/*.d.ts',
    '!**/*.css.ts',
    '!**/index.{ts,tsx}',
  ],
  coverageThreshold: {
    global: {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@babel/runtime/(.*)$': '<rootDir>/node_modules/@babel/runtime/$1',
    '^expo-file-system/next$': '<rootDir>/__mocks__/expo-file-system-next.js',
    '^expo-file-system/legacy$': '<rootDir>/__mocks__/expo-file-system-legacy.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@react-navigation/.*|react-native-svg|@gorhom/bottom-sheet|react-native-reanimated|react-native-gesture-handler|zustand|react-native-passkey|react-native-worklets|@baerae/.*)',
  ],
  testEnvironment: 'jsdom',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '^.+\\.svg$': '<rootDir>/jest-svg-transformer.js',
  },
};
