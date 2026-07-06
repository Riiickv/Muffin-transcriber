/**
 * Learn more about Light and Dark modes:
 * https://docs.expo.io/guides/color-schemes/
 */
import { Text as DefaultText, View as DefaultView, StyleSheet } from 'react-native';

import { useTheme } from './ThemeProvider';

import Colors from '@/constants/Colors';

type ThemeProps = {
  lightColor?: string;
  darkColor?: string;
};

export type TextProps = ThemeProps & DefaultText['props'];
export type ViewProps = ThemeProps & DefaultView['props'];

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  const { theme } = useTheme();
  const themeMode = theme.isDark ? 'dark' : 'light';
  const colorFromProps = props[themeMode];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    // Dynamic theme override
    if (colorName === 'background') return theme.background;
    if (colorName === 'text') return theme.text;
    if (colorName === 'tint') return theme.tint;
    if (colorName === 'tabIconDefault') return theme.tabIconDefault;
    if (colorName === 'tabIconSelected') return theme.tabIconSelected;
    
    return Colors[themeMode][colorName];
  }
}

export function Text(props: TextProps) {
  const { style, lightColor, darkColor, ...otherProps } = props;
  const { theme } = useTheme();
  
  const flattenedStyle = StyleSheet.flatten(style) || {};
  let fontFamily = 'Nunito_400Regular';
  const fw = flattenedStyle.fontWeight;
  if (fw === 'bold' || fw === '700' || fw === '800' || fw === '900') {
    fontFamily = 'Nunito_700Bold';
  } else if (fw === '500' || fw === '600') {
    fontFamily = 'Nunito_600SemiBold';
  }

  return <DefaultText style={[{ color: theme.text, fontFamily }, style]} {...otherProps} />;
}

export function View(props: ViewProps) {
  const { style, lightColor, darkColor, ...otherProps } = props;
  const { theme } = useTheme();

  return <DefaultView style={[{ backgroundColor: theme.background }, style]} {...otherProps} />;
}
