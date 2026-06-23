import { ComponentPropsWithRef } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type SafeAreaViewProps = {
  disableBottomSafeArea?: boolean;
};

export function SafeAreaView({
  style,
  disableBottomSafeArea,
  ...props
}: ComponentPropsWithRef<typeof View> & SafeAreaViewProps) {
  const { top, bottom, left, right } = useSafeAreaInsets();

  return (
    <View
      style={[
        {
          paddingTop: top,
          paddingBottom: disableBottomSafeArea ? 0 : bottom,
          paddingLeft: left,
          paddingRight: right,
        },
        style,
      ]}
      {...props}
    />
  );
}
