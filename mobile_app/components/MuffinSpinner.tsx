import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

import { useTheme } from './ThemeProvider';

/**
 * The app icon, spinning. Shown on the longest wait in the app (transcription
 * runs for minutes on a phone CPU), so the screen you stare at most looks like
 * Muffin rather than a stock spinner.
 *
 * Replaces the old equalizer, which was two problems at once. It was TALL — the
 * bars plus the sparkle above them pushed the waiting card past its container
 * and shoved the support button off the bottom of the screen. And its bars
 * animated `height`, which RN cannot drive natively, so every frame ran on the
 * JS thread while whisper.rn was busy calling back into it. This spins with a
 * `rotate` transform on the native driver: no JS per frame, and the footprint
 * is one square box that never grows.
 *
 * The spin re-rolls speed and direction roughly every second so it never reads
 * as a mechanical loader — it just fidgets while you wait.
 */

// Bar heights as a fraction of `size` — the icon's silhouette: tall/mid/short/mid/tall.
const BARS = [0.86, 0.56, 0.34, 0.56, 0.86];

interface MuffinSpinnerProps {
  /** Height of the tallest bar, px. The box drawn is a little larger so the
   *  corners can't clip as it turns. */
  size?: number;
  /** Pause the motion (e.g. when the work finishes). */
  active?: boolean;
}

export function MuffinSpinner({ size = 40, active = true }: MuffinSpinnerProps) {
  const { theme } = useTheme();

  // Counts TURNS, not degrees, and accumulates rather than resetting — winding
  // it back to 0 between legs would snap the icon visibly.
  const turns = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let position = 0;

    const spin = () => {
      if (cancelled) return;
      const direction = Math.random() < 0.5 ? -1 : 1;
      const amount = 0.25 + Math.random() * 1.0; // a quarter turn to 1¼ turns
      const duration = 700 + Math.random() * 600; // ~1s, deliberately not exact
      position += direction * amount;
      Animated.timing(turns, {
        toValue: position,
        duration,
        easing: Easing.inOut(Easing.cubic), // ease both ends so each leg settles
        useNativeDriver: true,
      }).start(({ finished }) => {
        // Only chain when it ran to completion: a stopped animation (unmount)
        // would otherwise restart itself forever.
        if (finished) spin();
      });
    };

    spin();
    return () => {
      cancelled = true;
      turns.stopAnimation();
    };
  }, [active, turns]);

  // 1 unit = 1 full turn. The range is wide enough that a long wait never runs
  // off the end of it.
  const rotate = turns.interpolate({
    inputRange: [-1000, 1000],
    outputRange: ['-360000deg', '360000deg'],
  });

  const barW = Math.max(3, Math.round(size * 0.13));
  const gap = Math.round(barW * 0.55);
  const color = theme.isDark ? '#FFC2E3' : theme.tint;

  return (
    // Square, and bigger than the icon: a rotating box sweeps its diagonal, so
    // a tight wrapper would clip the bars at 45°.
    <View style={{ width: size * 1.5, height: size * 1.5, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ alignItems: 'center', transform: [{ rotate }] }}>
        <Sparkle size={size * 0.3} color={color} />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            height: size * 0.86,
            gap,
            marginTop: size * 0.06,
          }}
        >
          {BARS.map((h, i) => (
            <View
              key={i}
              style={{
                width: barW,
                height: size * h,
                borderRadius: barW / 2,
                backgroundColor: color,
              }}
            />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

// The icon's 4-point star, drawn with two overlapping rotated squares so we
// don't need an SVG dependency here.
const Sparkle = ({ size, color }: { size: number; color: string }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View
      style={{
        position: 'absolute',
        width: size * 0.72,
        height: size * 0.72,
        backgroundColor: color,
        borderRadius: size * 0.18,
        transform: [{ rotate: '45deg' }],
      }}
    />
    <View
      style={{
        position: 'absolute',
        width: size * 0.5,
        height: size * 0.5,
        backgroundColor: color,
        borderRadius: size * 0.1,
      }}
    />
  </View>
);
