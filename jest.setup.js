import '@testing-library/jest-native/extend-expect';
import { TextEncoder, TextDecoder } from 'util';

// Passkey RP id default for tests — libs/wallet/webAuthnUtils requireRpId() is
// fail-closed (throws if unset). Individual tests may override this env var.
process.env.EXPO_PUBLIC_RP_ID = process.env.EXPO_PUBLIC_RP_ID || 'example.com';

// Polyfill TextEncoder/TextDecoder for Node.js environment
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Polyfill atob/btoa for base64 operations
global.atob = (str) => Buffer.from(str, 'base64').toString('binary');
global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');

// Polyfill streams (Expo winter requires these)
if (typeof global.TextEncoderStream === 'undefined') {
  global.TextEncoderStream = class TextEncoderStream {};
}
if (typeof global.TextDecoderStream === 'undefined') {
  global.TextDecoderStream = class TextDecoderStream {};
}
if (typeof global.ReadableStream === 'undefined') {
  global.ReadableStream = class ReadableStream {};
}
if (typeof global.WritableStream === 'undefined') {
  global.WritableStream = class WritableStream {};
}
if (typeof global.TransformStream === 'undefined') {
  global.TransformStream = class TransformStream {};
}
if (typeof global.CompressionStream === 'undefined') {
  global.CompressionStream = class CompressionStream {};
}
if (typeof global.DecompressionStream === 'undefined') {
  global.DecompressionStream = class DecompressionStream {};
}

// Polyfill structuredClone for Node < 17
if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}

// Mock Expo ImportMetaRegistry
global.__ExpoImportMetaRegistry = new Map();

// Mock expo winter runtime completely to avoid import.meta issues
jest.mock('expo/src/winter/runtime.native', () => ({}), { virtual: true });
jest.mock('expo/src/winter/installGlobal', () => ({}), { virtual: true });

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock @react-native-async-storage/async-storage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  Link: 'Link',
  Stack: { Screen: 'Stack.Screen' },
  Tabs: { Screen: 'Tabs.Screen' },
  Redirect: 'Redirect',
}));

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, Text, ScrollView, FlatList, Image } = require('react-native');

  const Animated = {
    View,
    Text,
    ScrollView,
    FlatList,
    Image,
    createAnimatedComponent: (Component) => Component,
  };

  return {
    default: Animated,
    __esModule: true,
    ...Animated,
    useSharedValue: jest.fn((value) => ({ value })),
    useAnimatedStyle: jest.fn((cb) => cb()),
    useAnimatedProps: jest.fn((cb) => cb()),
    useDerivedValue: jest.fn((cb) => ({ value: cb() })),
    useAnimatedScrollHandler: jest.fn(() => ({})),
    useAnimatedRef: jest.fn(() => ({ current: null })),
    withTiming: jest.fn((value) => value),
    withSpring: jest.fn((value) => value),
    withDecay: jest.fn((value) => value),
    withDelay: jest.fn((_, value) => value),
    withRepeat: jest.fn((value) => value),
    withSequence: jest.fn((...values) => values[0]),
    cancelAnimation: jest.fn(),
    runOnJS: jest.fn((fn) => fn),
    runOnUI: jest.fn((fn) => fn),
    interpolateColor: jest.fn((value, input, output) => output[0]),
    Easing: {
      linear: jest.fn(),
      ease: jest.fn(),
      quad: jest.fn(),
      cubic: jest.fn(),
      poly: jest.fn(),
      sin: jest.fn(),
      circle: jest.fn(),
      exp: jest.fn(),
      elastic: jest.fn(),
      back: jest.fn(),
      bounce: jest.fn(),
      bezier: jest.fn(),
      in: jest.fn((easing) => easing),
      out: jest.fn((easing) => easing),
      inOut: jest.fn((easing) => easing),
    },
  };
});

// Mock react-native-gesture-handler
jest.mock('react-native-gesture-handler', () => {
  const View = require('react-native/Libraries/Components/View/View');
  return {
    Swipeable: View,
    DrawerLayout: View,
    State: {},
    ScrollView: View,
    Slider: View,
    Switch: View,
    TextInput: View,
    ToolbarAndroid: View,
    ViewPagerAndroid: View,
    DrawerLayoutAndroid: View,
    WebView: View,
    NativeViewGestureHandler: View,
    TapGestureHandler: View,
    FlingGestureHandler: View,
    ForceTouchGestureHandler: View,
    LongPressGestureHandler: View,
    PanGestureHandler: View,
    PinchGestureHandler: View,
    RotationGestureHandler: View,
    RawButton: View,
    BaseButton: View,
    RectButton: View,
    BorderlessButton: View,
    FlatList: View,
    gestureHandlerRootHOC: jest.fn((c) => c),
    Directions: {},
    GestureHandlerRootView: View,
  };
});

// Mock @gorhom/bottom-sheet
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View, Modal, FlatList, ScrollView, TextInput } = require('react-native');

  const BottomSheetComponent = React.forwardRef(({ children }, ref) => {
    React.useImperativeHandle(ref, () => ({
      present: jest.fn(),
      dismiss: jest.fn(),
      snapToIndex: jest.fn(),
      snapToPosition: jest.fn(),
      expand: jest.fn(),
      collapse: jest.fn(),
      close: jest.fn(),
      forceClose: jest.fn(),
    }));
    return React.createElement(View, { ref, testID: 'bottom-sheet' }, children);
  });

  const BottomSheetModalComponent = React.forwardRef(({ children }, ref) => {
    React.useImperativeHandle(ref, () => ({
      present: jest.fn(),
      dismiss: jest.fn(),
      snapToIndex: jest.fn(),
      snapToPosition: jest.fn(),
      expand: jest.fn(),
      collapse: jest.fn(),
      close: jest.fn(),
      forceClose: jest.fn(),
    }));
    return React.createElement(View, { ref, testID: 'bottom-sheet-modal' }, children);
  });

  return {
    __esModule: true,
    default: BottomSheetComponent,
    BottomSheetModal: BottomSheetModalComponent,
    BottomSheetModalProvider: ({ children }) => children,
    BottomSheetBackdrop: ({ children, ...props }) => React.createElement(View, props, children),
    BottomSheetView: View,
    BottomSheetScrollView: ScrollView,
    BottomSheetFlatList: FlatList,
    BottomSheetFlashList: FlatList,
    BottomSheetSectionList: FlatList,
    BottomSheetVirtualizedList: FlatList,
    BottomSheetTextInput: TextInput,
    BottomSheetFooter: View,
    useBottomSheet: () => ({ close: jest.fn(), expand: jest.fn() }),
    useBottomSheetModal: () => ({ dismiss: jest.fn(), present: jest.fn() }),
    SNAP_POINT_TYPE: {
      RELATIVE: 'relative',
      ABSOLUTE: 'absolute',
    },
  };
});

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: 'ko', changeLanguage: jest.fn() },
  }),
  Trans: ({ children }) => children,
  initReactI18next: { type: '3rdParty', init: jest.fn() },
}));

// Mock expo-constants
jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      googleWebClientId: 'mock-google-client-id',
      googleIosClientId: 'mock-google-ios-client-id',
    },
  },
}));

// Mock expo-crypto
jest.mock('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-1234',
  getRandomBytes: (size) => new Uint8Array(size).fill(0),
  digestStringAsync: jest.fn(() => Promise.resolve('mock-hash')),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

// Mock react-native-passkey
jest.mock('react-native-passkey', () => ({
  Passkey: {
    isSupported: jest.fn(() => Promise.resolve(true)),
    create: jest.fn(() => Promise.resolve({
      id: 'mock-credential-id',
      rawId: 'mock-raw-id',
      response: {
        clientDataJSON: 'mock-client-data',
        attestationObject: 'mock-attestation',
      },
    })),
    get: jest.fn(() => Promise.resolve({
      id: 'mock-credential-id',
      rawId: 'mock-raw-id',
      response: {
        clientDataJSON: 'mock-client-data',
        authenticatorData: 'mock-auth-data',
        signature: 'mock-signature',
      },
    })),
  },
}));

// Mock react-native-quick-crypto (requires NitroModules native)
jest.mock('react-native-quick-crypto', () => ({
  pbkdf2: jest.fn(),
  createCipheriv: jest.fn(() => ({
    update: jest.fn(() => Buffer.from('encrypted')),
    final: jest.fn(() => Buffer.from('')),
    getAuthTag: jest.fn(() => Buffer.from('tag')),
  })),
  createDecipheriv: jest.fn(() => ({
    setAuthTag: jest.fn(),
    update: jest.fn(() => Buffer.from('decrypted')),
    final: jest.fn(() => Buffer.from('')),
  })),
  randomBytes: jest.fn((size) => Buffer.alloc(size)),
}));

// Mock local native modules (Expo modules requiring JSI)
jest.mock('@/modules/google-sign', () => ({
  signin: jest.fn(() => Promise.resolve('mock-id-token')),
}));
// Mock @react-native-google-signin/google-signin
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() => Promise.resolve({
      idToken: 'mock-id-token',
      user: { id: '123', email: 'test@example.com', name: 'Test User' },
    })),
    signOut: jest.fn(() => Promise.resolve()),
    isSignedIn: jest.fn(() => Promise.resolve(false)),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
}));

// Mock react-native-svg
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const mockComponent = (name) => (props) => React.createElement(View, { ...props, testID: name });
  const SvgMock = mockComponent('Svg');
  return {
    __esModule: true,
    Svg: SvgMock,
    Circle: mockComponent('Circle'),
    Ellipse: mockComponent('Ellipse'),
    G: mockComponent('G'),
    Text: mockComponent('SvgText'),
    TSpan: mockComponent('TSpan'),
    TextPath: mockComponent('TextPath'),
    Path: mockComponent('Path'),
    Polygon: mockComponent('Polygon'),
    Polyline: mockComponent('Polyline'),
    Line: mockComponent('Line'),
    Rect: mockComponent('Rect'),
    Use: mockComponent('Use'),
    Image: mockComponent('Image'),
    Symbol: mockComponent('Symbol'),
    Defs: mockComponent('Defs'),
    LinearGradient: mockComponent('LinearGradient'),
    RadialGradient: mockComponent('RadialGradient'),
    Stop: mockComponent('Stop'),
    ClipPath: mockComponent('ClipPath'),
    Pattern: mockComponent('Pattern'),
    Mask: mockComponent('Mask'),
    default: SvgMock,
  };
});

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: require('react-native').View,
}));

// Global fetch mock
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({}),
    ok: true,
    status: 200,
  })
);

