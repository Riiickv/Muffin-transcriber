import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from './ThemeProvider';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * A real circular progress ring: a track plus an accent arc that fills clockwise
 * from the top, the percentage in the middle. The arc IS the progress bar.
 * react-native-svg handles PlatformColor, so the arc is the true app accent.
 */
export function ProgressCircle({
  progress,
  size = 28,
  strokeWidth,
  showLabel = true,
}: {
  progress: number; // 0..1
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
}) {
  const { theme } = useTheme();
  const sw = strokeWidth ?? Math.max(3, Math.round(size * 0.12));
  const clamped = Math.max(0, Math.min(1, progress || 0));
  const p = useSharedValue(clamped);

  useEffect(() => {
    p.value = withTiming(clamped, { duration: 300 });
  }, [clamped]);

  const r = (size - sw) / 2;
  const circumference = 2 * Math.PI * r;
  // strokeDashoffset shrinks from full circumference (empty) to 0 (full).
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - p.value),
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* rotate -90 so the arc starts at 12 o'clock, not 3 o'clock */}
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme.divider} strokeWidth={sw} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={theme.tint}
          strokeWidth={sw}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
        />
      </Svg>
      {showLabel && (
        <Text style={[styles.label, { fontSize: Math.round(size * 0.3), color: theme.text }]}>
          {Math.round(clamped * 100)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontWeight: '700',
    includeFontPadding: false,
    textAlign: 'center',
  },
});
