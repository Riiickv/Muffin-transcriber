import { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from './ThemeProvider';

/**
 * A coach mark: a short accent-coloured bubble with a downward arrow that points
 * at an element below it, in Ricky's voice. Presentational only - the caller
 * positions it (containerStyle) and owns when it shows and when it's "done".
 */
export function CoachMark({
  text,
  visible,
  onDismiss,
  containerStyle,
  /** Horizontal offset of the down-arrow from the bubble's right edge. */
  arrowRight = 22,
}: {
  text: string;
  visible: boolean;
  onDismiss: () => void;
  containerStyle?: StyleProp<ViewStyle>;
  arrowRight?: number;
}) {
  const { theme } = useTheme();
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withTiming(visible ? 1 : 0, { duration: 240, easing: Easing.out(Easing.back(1.6)) });
  }, [visible]);

  const aStyle = useAnimatedStyle(() => ({
    opacity: v.value,
    transform: [{ scale: 0.85 + v.value * 0.15 }, { translateY: (1 - v.value) * 8 }],
  }));

  return (
    <Animated.View pointerEvents={visible ? 'auto' : 'none'} style={[styles.container, containerStyle, aStyle]}>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={text}
        style={[styles.bubble, { backgroundColor: theme.tint }]}
      >
        <Text style={[styles.text, { color: theme.tintForeground }]}>{text}</Text>
      </Pressable>
      <View style={[styles.arrow, { right: arrowRight, borderTopColor: theme.tint }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    maxWidth: 260,
    alignItems: 'flex-end',
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  // A downward triangle joined to the bottom of the bubble.
  arrow: {
    position: 'absolute',
    bottom: -8,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
