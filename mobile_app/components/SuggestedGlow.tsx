import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from './ThemeProvider';
import { RADIUS } from '@/constants/tokens';

/**
 * A soft pulse around the suggested model.
 *
 * Reanimated, so it runs on the UI thread - this breathes while the phone is
 * busy downloading hundreds of megabytes, and an animation driven from JS would
 * stutter exactly then, which is the one moment it's on screen.
 *
 * It animates OPACITY over a border painted in a fixed colour, rather than
 * interpolating the colour itself: with the 'system' accent on Android
 * theme.tint is a PlatformColor object, and no animator can interpolate one
 * ("platform colors are not supported" - the same thing that broke the tab bar).
 *
 * 0.25 -> 0.9 over 1.4s, not a hard blink: it should read as "start here", not
 * as a notification demanding a tap.
 */
export function SuggestedGlow({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const pulse = useSharedValue(0.25);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.9, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      -1, // forever
      true // and back again, so there's no jump at the loop point
    );
  }, [pulse]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View>
      {/* Behind the row and slightly larger, so the glow reads as light coming
          off it rather than as a second border drawn on top. pointerEvents none
          - it must never eat the tap that downloads the model. */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            margin: -3,
            borderRadius: RADIUS.md + 3,
            borderWidth: 2,
            borderColor: theme.tint,
          },
          glowStyle,
        ]}
      />
      {children}
    </View>
  );
}
