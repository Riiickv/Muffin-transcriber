import React from 'react';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ICON_PATHS } from './iconPaths';

// The icons are Phosphor's, drawn as vector paths (see iconPaths.ts for the
// set and its licence). They replaced the Material Symbols icon font: Phosphor's
// bold weight has round caps and round corners on every stroke, and a path
// needs no font to load, so an icon can never show up as an empty box.
//
// The names are still the Material ones the screens were written with, so no
// call site had to change.

export type IconName = keyof typeof ICON_PATHS;

interface IconProps {
  name: IconName;
  size?: number;
  color?: ColorValue;
  /** The solid version, where the icon has one. Otherwise the outline. */
  filled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const Icon = ({ name, size = 24, color = '#888888', filled = false, style }: IconProps) => {
  const paths: readonly string[] = ICON_PATHS[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256" style={style}>
      <Path d={(filled && paths[1]) || paths[0]} fill={color} />
    </Svg>
  );
};
