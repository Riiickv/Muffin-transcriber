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
  
  // Google Sans Flex, in the three cuts the app ships.
  //
  // The desktop expresses its type hierarchy along the font's width axis:
  // titles wide, controls slightly wide, prose neutral. React Native has no
  // width axis and no font-variation-settings, so the width is baked into each
  // file and picked here by the only thing this component knows about a piece
  // of text - how bold it is. Bold means a title or a heading, so it gets the
  // widest cut; regular is body text and stays neutral. The numbers match the
  // desktop's exactly (100%, 104%, 112%).
  const flattenedStyle = StyleSheet.flatten(style) || {};
  let fontFamily = 'GoogleSansFlex-Body';
  const fw = flattenedStyle.fontWeight;
  if (fw === 'bold' || fw === '700' || fw === '800' || fw === '900') {
    fontFamily = 'GoogleSansFlex-Bold';
  } else if (fw === '500' || fw === '600') {
    fontFamily = 'GoogleSansFlex-Medium';
  }

  // Cap how far the system font-size setting can inflate the UI. Uncapped, a
  // phone on a large accessibility scale wraps labels, truncates buttons and
  // pushes fixed layouts off-screen (ZTE Blade A76 report). 1.2 still honours
  // larger-font users without letting the chrome explode; a caller can pass its
  // own maxFontSizeMultiplier to override (otherProps spreads after this).
  return (
    <DefaultText maxFontSizeMultiplier={1.2} style={[{ color: theme.text, fontFamily }, style]} {...otherProps} />
  );
}

export function View(props: ViewProps) {
  const { style, lightColor, darkColor, ...otherProps } = props;
  const { theme } = useTheme();

  return <DefaultView style={[{ backgroundColor: theme.background }, style]} {...otherProps} />;
}
