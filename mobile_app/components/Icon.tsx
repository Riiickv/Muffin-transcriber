import React from 'react';
import { Platform, StyleProp, StyleSheet, Text, TextStyle } from 'react-native';

// Codepoints from Google Material Symbols. Add more as the UI needs them —
// full list at https://fonts.google.com/icons.
// (Names are our own short aliases so the API reads like Ionicons.)
const CODEPOINTS = {
  home: '',
  mic: '',
  history: '',
  settings: '',
  stop: '',
  play: '',
  pause: '',
  copy: '',
  'delete': '',
  edit: '',
  'chevron-right': '',
  close: '',
  warning: '',
  waveform: '',
  wand: '',
  library: '',
  download: '',
  share: '',
  check: String.fromCharCode(0xe5ca),
  // 0xe0b7 is the real 'chat' bubble — 0xe0b2 is 'call_made', an arrow.
  chat: String.fromCharCode(0xe0b7),
  forum: String.fromCharCode(0xe0bf),
  menu: String.fromCharCode(0xe5d2),
  'arrow-upward': String.fromCharCode(0xe5d8),
  'more-horiz': String.fromCharCode(0xe5d3),
  add: String.fromCharCode(0xe145),
  'arrow-forward': String.fromCharCode(0xe5c8),
  favorite: String.fromCharCode(0xe87d),
  compress: String.fromCharCode(0xe94d),
  'check-circle': String.fromCharCode(0xe86c),
} as const;

export type IconName = keyof typeof CODEPOINTS;

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  /**
   * Material Symbols is a variable font — `filled` toggles the FILL axis
   * between outlined (default, 0) and filled (1). Works on iOS + modern
   * Android; gracefully degrades to outlined if the OS ignores the axis.
   */
  filled?: boolean;
  style?: StyleProp<TextStyle>;
}

export const Icon = ({ name, size = 24, color, filled = false, style }: IconProps) => {
  return (
    <Text
      selectable={false}
      allowFontScaling={false}
      style={[
        styles.base,
        {
          fontSize: size,
          lineHeight: size,
          color,
          // TS TextStyle doesn't include fontVariationSettings by default.
          ...(Platform.OS !== 'web'
            ? ({ fontVariationSettings: filled ? "'FILL' 1" : "'FILL' 0" } as TextStyle)
            : null),
        },
        style,
      ]}
    >
      {CODEPOINTS[name]}
    </Text>
  );
};

const styles = StyleSheet.create({
  base: {
    fontFamily: 'MaterialSymbolsRounded',
    // On Android, glyphs sit inside their em-square with padding; remove it.
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  } as TextStyle,
});
