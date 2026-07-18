import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { useTheme } from './ThemeProvider';
import { MOTION, RADIUS, SPACING } from '@/constants/tokens';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  onPress?: () => void;
  /**
   * Position in a vertical stack. Set it and the card fades + rises in on
   * mount, staggered by `index * 60ms`, so a screen assembles itself instead
   * of snapping in. Leave it off inside dialogs/modals - those have their own
   * entrance and would double up.
   */
  index?: number;
}

const STAGGER_MS = 60;

// Standard surface. Filled, not outlined: a transparent card with a hairline
// border reads as a floating outline with no material - the page background
// shows straight through it. `theme.surface` gives it a floor to sit on.
export const Card = ({ children, style, padded = true, onPress, index }: CardProps) => {
  const { theme } = useTheme();
  const anim = useRef(new Animated.Value(index === undefined ? 1 : 0)).current;

  useEffect(() => {
    if (index === undefined) return;
    const timer = setTimeout(() => {
      Animated.timing(anim, {
        toValue: 1,
        duration: MOTION.timingBase.duration,
        // The native driver only cares which properties are ANIMATED, not what
        // else the style carries - and this animates opacity and translateY,
        // both of which it handles. It used to be false "because the style may
        // carry layout props", which isn't how the restriction works; the cost
        // was that every card entrance ran on the JS thread, stuttering exactly
        // when the app is busy transcribing.
        //
        // It also removes a landmine: with onPress, this transform lands in the
        // same array as AnimatedPressable's native-driven press scale, and RN
        // throws when one array mixes JS- and native-driven values.
        useNativeDriver: true,
      }).start();
    }, index * STAGGER_MS);
    return () => clearTimeout(timer);
  }, [anim, index]);

  const baseStyle: ViewStyle = {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    // Softer than `divider` - the fill does the separating now, so the stroke
    // only needs to catch the edge.
    borderColor: theme.isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
    backgroundColor: theme.surface,
    padding: padded ? SPACING.lg : 0,
  };

  // Entrance applied to the card's own view rather than a wrapper, so callers'
  // layout props (flex, margins) keep working exactly as before.
  const entrance =
    index === undefined
      ? null
      : {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        };

  if (onPress) {
    return (
      <AnimatedPressable onPress={onPress} style={[baseStyle, style, entrance as StyleProp<ViewStyle>]}>
        {children}
      </AnimatedPressable>
    );
  }
  return <Animated.View style={[baseStyle, style, entrance]}>{children}</Animated.View>;
};
