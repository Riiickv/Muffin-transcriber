import React, { useEffect, useRef } from 'react';
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
 * The body is mounted only while open and fades in. React Native has no
 * equivalent of animating to an automatic height without measuring the content
 * first, and a measured height would fight the multiline input growing as you
 * type. The chevron carries the motion instead.
 */
export function Collapsible({ label, open, onToggle, children }: CollapsibleProps) {
  const { theme } = useTheme();
  const turn = useRef(new Animated.Value(open ? 1 : 0)).current;
  const fade = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(turn, { toValue: open ? 1 : 0, useNativeDriver: true, ...MOTION.timingQuick }),
      Animated.timing(fade, { toValue: open ? 1 : 0, useNativeDriver: true, ...MOTION.timingQuick }),
    ]).start();
  }, [open, turn, fade]);

  // chevron-right is the only chevron in the icon set, so it points down by
  // being turned, and turns again to point up when open.
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '270deg'] });

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

      {open && (
        <Animated.View style={{ opacity: fade, marginTop: SPACING.sm }}>
          {children}
        </Animated.View>
      )}
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
});
