import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { Text } from './Themed';
import { useTheme } from './ThemeProvider';
import { Icon } from './Icon';
import { MOTION, SPACING } from '@/constants/tokens';
import { haptics } from '@/utils/haptics';

interface CollapsibleProps {
  label: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  children: React.ReactNode;
}

/**
 * A labelled section that folds away, matching the desktop app's custom-prompt
 * collapsible.
 *
 * The prompt is optional detail. Left permanently open it takes a third of the
 * card on every screen for a field most notes never use, and on a short phone
 * it pushes the transcript off the bottom.
 *
 * Controlled rather than self-managing, because the transcribe screen opens it
 * for you when Summarize goes on: that is the moment you might want to say how,
 * and the library has no such moment so you open it yourself.
 *
 * The body used to be `{open && children}`, which could not animate in either
 * direction and took the chevron down with it. Opening mounted the field at
 * full height in a single frame, so only the fade was gradual and the section
 * still snapped. Closing was worse: the children unmounted on the same render
 * the flag flipped, so the exit never played at all - and because that fade
 * shared an Animated.parallel with the chevron, tearing its target out mid-run
 * left the chevron stopped at whatever angle it had reached.
 *
 * So the body stays mounted and its HEIGHT is what animates. The height is
 * measured rather than assumed, because the field inside grows as you type -
 * and once the section is fully open the animated height comes off entirely,
 * so growing is unconstrained and the resting layout is exactly what it would
 * be with no animation code here at all. Putting it back before a close is
 * invisible: the value restored IS the height it already has.
 */
export function Collapsible({ label, open, onToggle, children }: CollapsibleProps) {
  const { theme } = useTheme();
  const turn = useRef(new Animated.Value(open ? 1 : 0)).current;
  const reveal = useRef(new Animated.Value(open ? 1 : 0)).current;

  // The body's natural height, re-measured whenever it changes, so a prompt
  // grown to three lines closes from three lines and not from wherever it
  // started.
  const [contentHeight, setContentHeight] = useState(0);
  // True only while fully open and at rest, which is when the height comes off.
  const [settled, setSettled] = useState(open);

  useEffect(() => {
    // Put the animated height back before moving, in both directions.
    setSettled(false);
    const run = Animated.parallel([
      // Two values with two drivers, deliberately. Height is a layout property
      // and cannot run on the native driver, and one value cannot be driven
      // both ways.
      Animated.timing(turn, { toValue: open ? 1 : 0, useNativeDriver: true, ...MOTION.timingQuick }),
      Animated.timing(reveal, { toValue: open ? 1 : 0, useNativeDriver: false, ...MOTION.timingQuick }),
    ]);
    run.start(({ finished }) => {
      if (finished && open) setSettled(true);
    });
    return () => run.stop();
  }, [open, turn, reveal]);

  // chevron-right is the only chevron in the icon set, so it points down by
  // being turned, and turns again to point up when open.
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '270deg'] });
  const height = reveal.interpolate({ inputRange: [0, 1], outputRange: [0, contentHeight] });

  return (
    <View>
      <Pressable
        onPress={() => { haptics.tap(); onToggle(!open); }}
        style={styles.head}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={label}
        hitSlop={8}
      >
        <Text style={styles.label}>{label}</Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Icon name="chevron-right" size={20} color={theme.textMuted} />
        </Animated.View>
      </Pressable>

      {/* Always mounted, so the height is known before the first open and the
          close has something to animate. Kept away from touch and from screen
          readers while shut: a field nobody can see should not be reachable by
          swiping to it either. */}
      <Animated.View
        style={[styles.body, settled ? null : { height, opacity: reveal }]}
        pointerEvents={open ? 'auto' : 'none'}
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      >
        {/* The gap above the field is padding in here rather than margin out
            there so that it is part of the measured height, and closes with
            everything else instead of leaving a stripe behind. */}
        <View style={styles.inner} onLayout={(e) => setContentHeight(e.nativeEvent.layout.height)}>
          {children}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    opacity: 0.8,
  },
  body: {
    overflow: 'hidden',
  },
  inner: {
    paddingTop: SPACING.sm,
  },
});
