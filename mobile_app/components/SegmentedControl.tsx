import { useEffect, useRef, useState } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { AnimatedPressable } from './AnimatedPressable';
import { Text } from './Themed';
import { useTheme } from './ThemeProvider';
import { MOTION, RADIUS, SPACING } from '@/constants/tokens';
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

type Rect = { x: number; w: number };

/**
 * Segmented control: a track with a pill that slides to the active segment.
 *
 * Segments are sized by their LABELS, not split into equal thirds. Equal
 * widths are what cut "Improved" to "Improv..." and "Balanced" to "Balanc..."
 * beside a three-letter neighbour with room to spare. Each segment now reports
 * its own position and width, and the pill follows the measured rectangle.
 *
 * The pill moves by translateX and width on the UI thread (Reanimated), so the
 * slide stays smooth while whisper is busy on the JS side.
 *
 * GIVE IT A FULL-WIDTH SLOT (a child of a column). Never put it beside a label
 * in a row and let it size itself. On Android a row whose children grow takes
 * ALL the width it is offered, not the width of its labels (Yoga's
 * StretchFlexBasis errata, which React Native keeps on: CalculateLayout.cpp
 * and YogaLayoutableShadowNode.cpp). The label next to it is left with nothing
 * and wraps a letter per line. A browser shrink-wraps the same styles, so the
 * web preview shows a correct row: this shipped broken in the vc109 test build.
 */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  style,
}: SegmentedControlProps<T>) {
  const { theme } = useTheme();
  const [rects, setRects] = useState<Record<string, Rect>>({});
  const active = rects[value];

  const x = useSharedValue(0);
  const w = useSharedValue(0);
  /** 0 when the pill sets off, 1 when it has arrived. */
  const move = useSharedValue(1);
  // The first measurement places the pill; only later ones slide it. Without
  // this it would sweep in from the left edge every time a screen mounts.
  const placed = useRef(false);

  const ax = active?.x;
  const aw = active?.w;
  useEffect(() => {
    if (ax === undefined || aw === undefined) return;
    if (!placed.current) {
      placed.current = true;
      x.value = ax;
      w.value = aw;
      return;
    }
    // The bottom bar's pill: it arrives, goes a hair past and settles.
    x.value = withSpring(ax, MOTION.glide);
    w.value = withSpring(aw, MOTION.glide);
    move.value = 0;
    move.value = withSpring(1, MOTION.glide);
  }, [ax, aw, x, w, move]);

  // Pulled a little long and thin on the way, round again where it lands.
  const pillStyle = useAnimatedStyle(() => {
    const pull = Math.sin(Math.PI * Math.min(1, Math.max(0, move.value)));
    return {
      transform: [{ translateX: x.value }, { scaleX: 1 + 0.06 * pull }, { scaleY: 1 - 0.08 * pull }],
      width: w.value,
    };
  });

  return (
    <View style={[styles.track, { backgroundColor: theme.surfaceStrong }, style]}>
      {!!active && (
        <Animated.View
          pointerEvents="none"
          style={[styles.pill, { backgroundColor: theme.tintStrong }, pillStyle]}
        />
      )}
      {segments.map((seg) => {
        const isActive = seg.key === value;
        return (
          <AnimatedPressable
            key={seg.key}
            onLayout={(e) => {
              const { x: sx, width } = e.nativeEvent.layout;
              setRects((prev) =>
                prev[seg.key]?.x === sx && prev[seg.key]?.w === width
                  ? prev
                  : { ...prev, [seg.key]: { x: sx, w: width } }
              );
            }}
            onPress={() => {
              if (!isActive) haptics.select();
              onChange(seg.key);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            scaleTo={0.98}
            style={styles.segment}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              style={{
                fontSize: 14,
                fontWeight: isActive ? 'bold' : '600',
                color: isActive ? theme.tintText : theme.textMuted,
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
    position: 'relative',
  },
  pill: {
    position: 'absolute',
    top: SPACING.xs,
    bottom: SPACING.xs,
    left: 0,
    borderRadius: RADIUS.pill,
  },
  segment: {
    // Grows from its content width, so a long label takes the room a short one
    // does not need. Shrinks (and only then ellipsises) if the row truly
    // cannot fit.
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minHeight: 36,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.pill,
  },
});
