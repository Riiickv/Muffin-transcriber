import { useFonts } from 'expo-font';
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
} from '@expo-google-fonts/nunito';
import { View } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { DownloadBanner } from '@/components/DownloadIndicator';
import { RecordingProvider } from '@/components/RecordingProvider';
import { RecordOptionsSheet } from '@/components/RecordOptionsSheet';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { ThemeProvider as CustomThemeProvider, useTheme } from '@/components/ThemeProvider';
import { DialogProvider } from '@/components/Dialog';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useShareIntent } from 'expo-share-intent';
import { useSettings } from '@/utils/settingsStore';
import { setAppLanguage } from '@/utils/i18n';
import { useRouter } from 'expo-router';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    // Google's Material Symbols Rounded - Material 3 Expressive icon set.
    MaterialSymbolsRounded: require('../assets/fonts/MaterialSymbolsRounded.ttf'),
  });

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
  const { settings } = useSettings();

  // t() is a plain function reading a module-level language, not a hook, so
  // changing the language re-renders nothing on its own. Apply it BEFORE this
  // render's children read any string, then key the tree on it: React throws
  // the old tree away and rebuilds it, so every t() in the app re-runs. A
  // remount is heavy-handed, but language changes about once in an app's life
  // and the alternative is half the screens keeping their old text.
  setAppLanguage(settings.appLanguage);

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
        router.push({ pathname: '/' as any, params: { uri: encodeURIComponent(fileUri) } });
      }
      resetShareIntent();
    }
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  return (
    <ThemeProvider value={customNavigationTheme} key={settings.appLanguage}>
      {/* Status bar icons must invert with the app theme, not the OS theme. */}
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      {/* flex container so the absolutely-positioned download banner can overlay
          the whole navigator from any screen. */}
      <View style={{ flex: 1 }}>
        {/* Recording is owned here, above the tabs, so the mic button records
            from anywhere and the transcription survives navigating to History. */}
        <RecordingProvider>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            {/* Title is set dynamically inside history/[id].tsx via <Stack.Screen /> */}
            <Stack.Screen name="history/[id]" />
          </Stack>
          <DownloadBanner />
          <RecordOptionsSheet />
        </RecordingProvider>
      </View>
    </ThemeProvider>
  );
}
