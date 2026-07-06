import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { useTheme } from './ThemeProvider';
import { RADIUS, SPACING } from '@/constants/tokens';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  onPress?: () => void;
}

// Standard bordered container. Pass `onPress` to make the whole card pressable
// (with the same press-scale as buttons).
export const Card = ({ children, style, padded = true, onPress }: CardProps) => {
  const { theme } = useTheme();
  const baseStyle: ViewStyle = {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: theme.divider,
    padding: padded ? SPACING.lg : 0,
    backgroundColor: 'transparent',
  };

  if (onPress) {
    return <AnimatedPressable onPress={onPress} style={[baseStyle, style]}>{children}</AnimatedPressable>;
  }
  return <View style={[baseStyle, style]}>{children}</View>;
};
