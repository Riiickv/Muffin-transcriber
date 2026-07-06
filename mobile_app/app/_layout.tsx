import { useFonts } from 'expo-font';
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
} from '@expo-google-fonts/nunito';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { ThemeProvider as CustomThemeProvider, useTheme } from '@/components/ThemeProvider';
import { DialogProvider } from '@/components/Dialog';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useShareIntent } from 'expo-share-intent';
import { useRouter } from 'expo-router';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    // Google's Material Symbols Rounded — Material 3 Expressive icon set.
    MaterialSymbolsRounded: require('../assets/fonts/MaterialSymbolsRounded.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <KeyboardProvider>
      <CustomThemeProvider>
        <DialogProvider>
          <RootLayoutNav />
        </DialogProvider>
      </CustomThemeProvider>
    </KeyboardProvider>
  );
}

function RootLayoutNav() {
  const { theme } = useTheme();

  const customNavigationTheme = {
    ...(theme.isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(theme.isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: theme.background,
      card: theme.background,
      text: theme.text,
      border: theme.tabIconDefault,
      primary: theme.tintString,
    }
  };

  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();

  useEffect(() => {
    if (hasShareIntent && shareIntent?.files && shareIntent.files.length > 0) {
      const fileUri = shareIntent.files[0].path;
      if (fileUri) {
        // Encode URI safely for router
        router.push({ pathname: '/' as any, params: { uri: encodeURIComponent(fileUri) } });
      }
      resetShareIntent();
    }
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  return (
    <ThemeProvider value={customNavigationTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* Title is set dynamically inside history/[id].tsx via <Stack.Screen /> */}
        <Stack.Screen name="history/[id]" />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
