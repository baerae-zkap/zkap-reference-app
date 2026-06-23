// Mock react-native-svg
jest.mock('react-native-svg', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ children, ...props }: any) => React.createElement('Svg', props, children),
    Svg: ({ children, ...props }: any) => React.createElement('Svg', props, children),
    Path: (props: any) => React.createElement('RNSVGPath', props),
    G: ({ children, ...props }: any) => React.createElement('G', props, children),
    Circle: (props: any) => React.createElement('Circle', props),
    Rect: (props: any) => React.createElement('Rect', props),
  };
});
