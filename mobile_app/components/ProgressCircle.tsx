import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from './ThemeProvider';

/**
 * A small circular progress indicator that FILLS bottom-to-top with the accent
 * colour, the percentage in the middle. Deliberately not an SVG arc: the app
 * doesn't bundle react-native-svg, and a filling circle reads more clearly than
 * a thin arc at header size anyway. The fill height is the only animated value,
 * so it's cheap and can't glitch.
 */
export function ProgressCircle({
  progress,
  size = 28,
  showLabel = true,
}: {
  progress: number; // 0..1
  size?: number;
  showLabel?: boolean;
}) {
  const { theme } = useTheme();
  const clamped = Math.max(0, Math.min(1, progress || 0));
  const fill = useSharedValue(clamped);

  useEffect(() => {
    fill.value = withTiming(clamped, { duration: 300 });
  }, [clamped]);

  const fillStyle = useAnimatedStyle(() => ({ height: fill.value * size }));

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: theme.tint,
        backgroundColor: theme.surface,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Animated.View
        style={[
          { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: theme.tint, opacity: 0.28 },
          fillStyle,
        ]}
      />
      {showLabel && (
        <Text style={[styles.label, { fontSize: Math.round(size * 0.34), color: theme.text }]}>
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
