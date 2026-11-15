import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { useTheme } from './ThemeProvider';
import { RADIUS, SPACING } from '@/constants/tokens';
import { spring } from '@/utils/motion';
import { useResponsive } from '@/hooks/useResponsive';

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
  const { isShort } = useResponsive();
  const anim = useRef(new Animated.Value(index === undefined ? 1 : 0)).current;

  useEffect(() => {
    if (index === undefined) return;
    const timer = setTimeout(() => {
      Animated.spring(anim, {
        toValue: 1,
        ...spring('drop'),
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
    borderRadius: RADIUS.lg,
    // Fill only. A fill AND a stroke on every card drew each group twice, and
    // a screen of three cards read as six nested boxes. The stroke survives on
    // pure black alone, where a 6% fill is too close to the page to see.
    borderWidth: theme.isAmoled ? 1 : 0,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: theme.surface,
    // Compact preset on short windows: every card sheds 4dp per side, which
    // across a three-card screen buys back ~24dp of height for the transcript.
    padding: padded ? (isShort ? SPACING.md : SPACING.lg) : 0,
  };

  // Entrance applied to the card's own view rather than a wrapper, so callers'
  // layout props (flex, margins) keep working exactly as before.
  const entrance =
    index === undefined
      ? null
      : {
          // Clamped: the spring goes past 1 and opacity must not.
          opacity: anim.interpolate({ inputRange: [0, 0.6], outputRange: [0, 1], extrapolate: 'clamp' }),
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
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
