import { Animated, StyleProp, ViewStyle } from 'react-native';
import { useEffect, useRef } from 'react';
import { AnimatedPressable } from './AnimatedPressable';
import { Text } from './Themed';
import { useTheme } from './ThemeProvider';
import { MOTION, RADIUS, SPACING } from '@/constants/tokens';

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

// iOS-style segmented control: track with a soft-tinted slider that springs
// between segments when `value` changes.
export function SegmentedControl<T extends string>({ segments, value, onChange, style }: SegmentedControlProps<T>) {
  const { theme } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;

  const activeIndex = Math.max(0, segments.findIndex((s) => s.key === value));

  useEffect(() => {
    Animated.spring(anim, { toValue: activeIndex, useNativeDriver: false, ...MOTION.springSettle }).start();
  }, [activeIndex, anim]);

  const segmentWidthPct = 100 / segments.length;
  const sliderLeft = anim.interpolate({
    inputRange: segments.map((_, i) => i),
    outputRange: segments.map((_, i) => `${i * segmentWidthPct}%`),
  });

  return (
    <Animated.View
      style={[
        {
          flexDirection: 'row',
          padding: SPACING.xs,
          borderRadius: RADIUS.pill,
          position: 'relative',
          backgroundColor: theme.surface,
        },
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: SPACING.xs,
          bottom: SPACING.xs,
          left: sliderLeft,
          width: `${segmentWidthPct}%`,
          borderRadius: RADIUS.pill,
          backgroundColor: theme.tintFill,
        }}
      />
      {segments.map((seg) => {
        const active = seg.key === value;
        return (
          <AnimatedPressable
            key={seg.key}
            onPress={() => onChange(seg.key)}
            style={{
              flex: 1,
              paddingVertical: SPACING.sm,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: RADIUS.pill,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: 'bold', color: active ? theme.tint : theme.textMuted }}>
              {seg.label}
            </Text>
          </AnimatedPressable>
        );
      })}
    </Animated.View>
  );
}
