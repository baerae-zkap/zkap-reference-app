import { Stack } from 'expo-router';

export default function RecoveryLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="setup/index" />
    </Stack>
  );
}
