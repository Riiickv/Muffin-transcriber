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
  // display wide, titles a little less, controls slightly wide, prose neutral.
  // React Native has no width axis and no font-variation-settings, so each
  // width is its own file, instanced from the same variable font at the same
  // numbers the CSS uses: 112%, 106%, 104%, 100%.
  const flattenedStyle = StyleSheet.flatten(style) || {};
  const fw = flattenedStyle.fontWeight;
  const size = typeof flattenedStyle.fontSize === 'number' ? flattenedStyle.fontSize : 14;
  const isBold = fw === 'bold' || fw === '700' || fw === '800' || fw === '900';

  // Size decides between the two bold cuts, and that is the whole point.
  //
  // Keying on weight alone made the hierarchy flat: a screen title and a card
  // label are both bold, so both got the widest cut and nothing was
  // distinguished from anything. The desktop separates them - display 112%,
  // titles 106% - and here the only signal available without touching every
  // screen is how big the text is. 20 sits between the 24 of a screen title
  // and the 18 of a section heading, which is exactly where the line belongs.
  let fontFamily = 'GoogleSansFlex-Body';
  if (isBold) {
    fontFamily = size >= 20 ? 'GoogleSansFlex-Bold' : 'GoogleSansFlex-Title';
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
