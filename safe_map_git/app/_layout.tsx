import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { AppThemeProvider, useTheme } from './ThemeContext';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { isDarkMode } = useTheme();

  return (
    <>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: isDarkMode ? '#000000' : '#ffffff' }
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="report" options={{ headerShown: false }} />
        <Stack.Screen name="nearby" options={{ headerShown: false }} />
        <Stack.Screen name="incident/[id]" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    'GoogleSans-Regular': require('../assets/fonts/GoogleSans-Regular.ttf'),
    'GoogleSans-Medium': require('../assets/fonts/GoogleSans-Medium.ttf'),
    'GoogleSans-Bold': require('../assets/fonts/GoogleSans-Bold.ttf'),
  });

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) {
    return null;
  }

  return (
    <AppThemeProvider>
      <RootLayoutNav />
    </AppThemeProvider>
  );
}
