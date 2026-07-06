import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme as useDeviceColorScheme, PlatformColor, Platform, LayoutAnimation, UIManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type ThemeMode = 'system' | 'light' | 'dark' | 'amoled';
export type AccentColor = 'system' | 'muffin' | 'green' | 'purple' | 'red';

export interface Theme {
  isDark: boolean;
  isAmoled: boolean;
  text: string;
  textMuted: string;
  textSubtle: string;
  background: string;
  surface: string;
  surfaceStrong: string;
  divider: string;
  tint: any;
  tintString: string;
  tintSurface: any;
  tintFill: any;
  tintStrong: any;
  danger: string;
  dangerSurface: string;
  tabIconDefault: string;
  tabIconSelected: any;
}

interface ThemeContextType {
  themeMode: ThemeMode;
  accentColor: AccentColor;
  setThemeMode: (mode: ThemeMode) => void;
  setAccentColor: (color: AccentColor) => void;
  theme: Theme;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const ACCENT_COLORS: Record<Exclude<AccentColor, 'system'>, string> = {
  muffin: '#FF9EBB',
  green: '#65D28A',
  purple: '#A975C2',
  red: '#ED6F62',
};

const DANGER_LIGHT = '#ED6F62';

const withAlpha = (color: string, alpha: number): string => {
  if (typeof color !== 'string' || !color.startsWith('#') || color.length < 7) return color;
  const clamped = Math.max(0, Math.min(1, alpha));
  const hex = Math.round(clamped * 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${color.slice(1, 7)}${hex}`;
};

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const deviceScheme = useDeviceColorScheme() || 'light';

  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [accentColor, setAccentColorState] = useState<AccentColor>('system');

  useEffect(() => {
    AsyncStorage.getItem('themeMode').then((val) => {
      if (val) setThemeModeState(val as ThemeMode);
    });
    AsyncStorage.getItem('accentColor').then((val) => {
      if (val) setAccentColorState(val as AccentColor);
    });
  }, []);

  const setThemeMode = (mode: ThemeMode) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setThemeModeState(mode);
    AsyncStorage.setItem('themeMode', mode);
  };

  const setAccentColor = (color: AccentColor) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAccentColorState(color);
    AsyncStorage.setItem('accentColor', color);
  };

  const activeMode = themeMode === 'system' ? deviceScheme : themeMode;
  const isDark = activeMode === 'dark' || activeMode === 'amoled';
  const isAmoled = activeMode === 'amoled';

  const background = isAmoled ? '#000000' : isDark ? '#121212' : '#FFFFFF';
  const text = isDark ? '#FFFFFF' : '#000000';

  let theme: Theme;

  if (accentColor === 'system' && Platform.OS === 'android') {
    theme = {
      isDark,
      isAmoled,
      text,
      textMuted: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
      textSubtle: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
      background,
      surface: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
      surfaceStrong: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)',
      divider: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
      tint: PlatformColor('@android:color/system_accent1_500'),
      tintString: isDark ? '#FF9EBB' : '#FF9EBB', // Muffin brand color fallback for React Navigation
      tintSurface: PlatformColor(isDark ? '@android:color/system_accent1_900' : '@android:color/system_accent1_100'),
      tintFill: PlatformColor(isDark ? '@android:color/system_accent1_800' : '@android:color/system_accent1_200'),
      tintStrong: PlatformColor(isDark ? '@android:color/system_accent1_700' : '@android:color/system_accent1_300'),
      danger: DANGER_LIGHT,
      dangerSurface: isDark ? 'rgba(237,111,98,0.20)' : 'rgba(237,111,98,0.12)',
      tabIconDefault: isDark ? '#444444' : '#CCCCCC',
      tabIconSelected: PlatformColor('@android:color/system_accent1_500'),
    };
  } else {
    const fallbackColor = accentColor === 'system' ? 'muffin' : accentColor;
    const tint = ACCENT_COLORS[fallbackColor as keyof typeof ACCENT_COLORS] ?? ACCENT_COLORS.muffin;
    theme = {
      isDark,
      isAmoled,
      text,
      textMuted: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
      textSubtle: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
      background,
      surface: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
      surfaceStrong: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)',
      divider: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
      tint,
      tintString: tint,
      tintSurface: withAlpha(tint, 0.10),
      tintFill: withAlpha(tint, 0.15),
      tintStrong: withAlpha(tint, 0.30),
      danger: DANGER_LIGHT,
      dangerSurface: isDark ? 'rgba(237,111,98,0.20)' : 'rgba(237,111,98,0.12)',
      tabIconDefault: isDark ? '#444444' : '#CCCCCC',
      tabIconSelected: tint,
    };
  }

  return (
    <ThemeContext.Provider value={{ themeMode, accentColor, setThemeMode, setAccentColor, theme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};
