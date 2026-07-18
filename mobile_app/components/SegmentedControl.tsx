import { useState } from 'react';
import { LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

import { AnimatedPressable } from './AnimatedPressable';
import { Text } from './Themed';
import { useTheme } from './ThemeProvider';
import { RADIUS, SPACING } from '@/constants/tokens';
import { haptics } from '@/utils/haptics';

interface SegmentDefinition<T extends string> {
  key: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  segments: readonly SegmentDefinition<T>[];
  value: T;
  onChange: (t: T) => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Segmented control: a track with a pill that slides to the active segment.
 *
 * The pill slides via translateX over a measured width - not by animating
 * `left` as a percentage, which forces a layout pass per frame from JS and
 * stutters. translateX is a transform, so Reanimated runs it on the UI thread
 * and never touches layout.
 */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  style,
}: SegmentedControlProps<T>) {
  const { theme } = useTheme();
  const [trackW, setTrackW] = useState(0);

  const activeIndex = Math.max(0, segments.findIndex((s) => s.key === value));
  const segW = trackW > 0 ? trackW / segments.length : 0;

  const x = useDerivedValue(
    () => withTiming(activeIndex * segW, { duration: 240, easing: Easing.out(Easing.cubic) }),
    [activeIndex, segW]
  );
  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  const onLayout = (e: LayoutChangeEvent) => {
    // Inner width - the track's own padding excluded, so the pill aligns with
    // the segments instead of overhanging them.
    setTrackW(e.nativeEvent.layout.width - SPACING.xs * 2);
  };

  return (
    <View
      onLayout={onLayout}
      style={[styles.track, { backgroundColor: theme.surface, borderColor: theme.divider }, style]}
    >
      {segW > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            { width: segW, backgroundColor: theme.tintFill, borderColor: theme.tint },
            pillStyle,
          ]}
        />
      )}
      {segments.map((seg) => {
        const active = seg.key === value;
        return (
          <AnimatedPressable
            key={seg.key}
            onPress={() => {
              if (!active) haptics.select();
              onChange(seg.key);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            scaleTo={0.98}
            style={styles.segment}
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: 13,
                fontWeight: active ? 'bold' : '600',
                color: active ? theme.tint : theme.textMuted,
              }}
            >
              {seg.label}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: SPACING.xs,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    position: 'relative',
  },
  pill: {
    position: 'absolute',
    top: SPACING.xs,
    bottom: SPACING.xs,
    left: SPACING.xs,
    borderRadius: RADIUS.pill,
    // A 1px tint edge - tintFill alone is ~15% alpha, which reads as "slightly
    // different" rather than "this one is selected".
    borderWidth: 1,
  },
  segment: {
    flex: 1,
    paddingVertical: SPACING.sm - 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.pill,
  },
});
