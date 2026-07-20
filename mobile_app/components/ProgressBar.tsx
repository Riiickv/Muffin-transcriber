import React, { useEffect } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from './ThemeProvider';
import { MOTION } from '@/constants/tokens';

/**
 * A hairline of progress, sized to say "still working" without taking a line
 * of the screen the way "Transcribing... 15% - 4:59" did.
 *
 * Width is animated rather than set outright: whisper's progress arrives in
 * steps, and a bar that jumps in visible chunks reads as broken in a way a
 * sliding one doesn't.
 */
export function ProgressBar({
  /** 0-100. */
  percent,
  style,
}: {
  percent: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withTiming(Math.max(0, Math.min(100, percent)), MOTION.timingBase);
  }, [percent, width]);

  const fill = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return (
    <View style={[styles.track, { backgroundColor: theme.divider }, style]}>
      {/* PlatformColor is fine as a background even though it can't be
          interpolated, so the fill can use the real Material You accent. */}
      <Animated.View style={[styles.fill, { backgroundColor: theme.tint }, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 3,
    borderRadius: 999,
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
});
