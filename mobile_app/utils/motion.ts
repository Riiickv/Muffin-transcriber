import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { MOTION } from '@/constants/tokens';

// "Remove animations" (Android) or "Reduce motion" (iOS). Reanimated already
// skips its springs when this is on; this is the same answer for everything
// built on React Native's own Animated.
let calm = false;
try {
  AccessibilityInfo.isReduceMotionEnabled?.()
    .then((on) => {
      calm = !!on;
    })
    .catch(() => {});
  AccessibilityInfo.addEventListener?.('reduceMotionChanged', (on) => {
    calm = !!on;
  });
} catch {
  // No such setting on this platform.
}

/** Reaches the end without going past it (damping ratio about 1). */
const CALM = { stiffness: 300, damping: 35, mass: 1 } as const;

export type SpringName = 'glide' | 'drop' | 'wobble' | 'releaseWide' | 'releaseTall';

/** One of the bottom bar's springs, or a flat one when the system asks for less motion. */
export function spring(name: SpringName): { stiffness: number; damping: number; mass: number } {
  return calm ? CALM : MOTION[name];
}

/**
 * The way a dialog or a menu arrives: from a little small, a hair past full
 * size, then settled. Opacity and scale only, so it runs on the native driver.
 * Plays every time `visible` turns true.
 */
export function usePopIn(visible: boolean, from = 0.88) {
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    enter.setValue(0);
    Animated.spring(enter, { toValue: 1, useNativeDriver: true, ...spring('drop') }).start();
  }, [visible, enter]);
  return {
    // Clamped: the spring goes past 1 and opacity must not.
    opacity: enter.interpolate({ inputRange: [0, 0.6], outputRange: [0, 1], extrapolate: 'clamp' }),
    transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [from, 1] }) }],
  };
}
