import { Text as DefaultText, TextInput as DefaultTextInput, View as DefaultView, StyleSheet } from 'react-native';

import { useTheme } from './ThemeProvider';

import Colors from '@/constants/Colors';

type ThemeProps = {
  lightColor?: string;
  darkColor?: string;
};

export type TextProps = ThemeProps & DefaultText['props'];
export type ViewProps = ThemeProps & DefaultView['props'];
export type TextInputProps = ThemeProps & DefaultTextInput['props'];

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

/**
 * Which cut a piece of text gets, from its own weight and size.
 *
 * Shared by Text and TextInput. A TextInput does NOT inherit anything from
 * Text - it is a different native view - so every field in the app was drawn in
 * the platform font until this existed: the chat composer, the search box, the
 * prompt boxes, the memory box, the transcript editor.
 */
function familyFor(flat: { fontWeight?: any; fontSize?: any }): string {
  const fw = flat.fontWeight;
  const size = typeof flat.fontSize === 'number' ? flat.fontSize : 14;
  const isBold = fw === 'bold' || fw === '700' || fw === '800' || fw === '900';

  // Size decides between the two bold cuts, and that is the whole point.
  //
  // Keying on weight alone made the hierarchy flat: a screen title and a card
  // label are both bold, so both got the widest cut and nothing was
  // distinguished from anything. The desktop separates them - display 112%,
  // titles 106% - and here the only signal available without touching every
  // screen is how big the text is. 20 sits between the 24 of a screen title
  // and the 18 of a section heading, which is exactly where the line belongs.
  if (isBold) return size >= 20 ? 'GoogleSansFlex-Bold' : 'GoogleSansFlex-Title';
  if (fw === '500' || fw === '600') return 'GoogleSansFlex-Medium';
  return 'GoogleSansFlex-Body';
}

/**
 * A TextInput in the app's font. Import this instead of react-native's
 * anywhere the user can see the text they are typing.
 */
/**
 * The style a themed control actually renders with.
 *
 * fontWeight is REMOVED, and that is the whole trick. On Android, a fontFamily
 * and a fontWeight together make the system look for a registered bold variant
 * of that family; these cuts are separate one-weight files with no variants, so
 * the lookup fails and the text silently falls back to Roboto. The screens all
 * say fontWeight: 'bold', which is why every one of them stayed on the system
 * font while the navigation title - the one place the font was set WITHOUT a
 * weight beside it - rendered correctly.
 *
 * The weight is already in the file: Body is 400, Medium 600, Title and Bold
 * are 700. Nothing is lost by dropping the property, and the caller's own
 * fontWeight is still what CHOOSES the cut before it goes.
 */
function themedTextStyle(flat: Record<string, any>, fallbackColor: string) {
  const { fontWeight, ...rest } = flat;
  return {
    color: fallbackColor,
    ...rest,
    fontFamily: familyFor(flat),
  };
}

export function TextInput(props: TextInputProps) {
  const { style, ...otherProps } = props;
  const { theme } = useTheme();
  const flattenedStyle = StyleSheet.flatten(style) || {};

  return (
    <DefaultTextInput
      maxFontSizeMultiplier={1.2}
      placeholderTextColor={theme.textMuted}
      style={themedTextStyle(flattenedStyle, theme.text)}
      {...otherProps}
    />
  );
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

  // Size decides between the two bold cuts, and that is the whole point.
  //
  // Keying on weight alone made the hierarchy flat: a screen title and a card
  // label are both bold, so both got the widest cut and nothing was
  // distinguished from anything. The desktop separates them - display 112%,
  // titles 106% - and here the only signal available without touching every
  // screen is how big the text is. 20 sits between the 24 of a screen title
  // and the 18 of a section heading, which is exactly where the line belongs.
  // Cap how far the system font-size setting can inflate the UI. Uncapped, a
  // phone on a large accessibility scale wraps labels, truncates buttons and
  // pushes fixed layouts off-screen (ZTE Blade A76 report). 1.2 still honours
  // larger-font users without letting the chrome explode; a caller can pass its
  // own maxFontSizeMultiplier to override (otherProps spreads after this).
  return (
    <DefaultText
      maxFontSizeMultiplier={1.2}
      style={themedTextStyle(flattenedStyle, theme.text)}
      {...otherProps}
    />
  );
}

export function View(props: ViewProps) {
  const { style, lightColor, darkColor, ...otherProps } = props;
  const { theme } = useTheme();

  return <DefaultView style={[{ backgroundColor: theme.background }, style]} {...otherProps} />;
}
