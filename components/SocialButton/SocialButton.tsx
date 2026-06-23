import { TouchableOpacity, View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { ComponentProps, PropsWithChildren } from 'react';

type SocialButtonProps = {
  icon?: React.ReactNode;
  color?: string;
  backgroundColor: string;
  borderWidth?: number;
  borderColor?: string;
  isLoading?: boolean;
} & ComponentProps<typeof TouchableOpacity>;

export function SocialButton({
  icon,
  children,
  color = '#000',
  backgroundColor,
  borderWidth,
  borderColor,
  isLoading,
  testID = 'social-button',
  ...props
}: PropsWithChildren<SocialButtonProps>) {
  return (
    <TouchableOpacity
      testID={testID}
      disabled={isLoading}
      style={[
        styles.container,
        { backgroundColor: isLoading ? '#E5E7EB' : backgroundColor },
        borderWidth ? { borderWidth } : null,
        borderColor ? { borderColor } : null,
      ]}
      activeOpacity={0.8}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator testID="activity-indicator" size="small" color="#666" />
      ) : (
        <View style={styles.content}>
          {icon && <View style={styles.iconContainer}>{icon}</View>}
          <Text style={[styles.text, { color }]}>{children}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginRight: 12,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
});
