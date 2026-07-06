import React, { useCallback, useRef } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MOTION } from '@/constants/tokens';

// Cross-instance singleton so each newly-focused FadeInView can slide from the
// correct direction (forward = +30px, backward = -30px). Each tab mounts its
// own FadeInView, so we can't keep this in local state.
const tabNav = { lastFocusedIndex: 0 };

interface FadeInViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  index?: number;
}

export const FadeInView = ({ children, style, index = 0 }: FadeInViewProps) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      const forward = index >= tabNav.lastFocusedIndex;
      tabNav.lastFocusedIndex = index;

      fadeAnim.setValue(0);
      slideAnim.setValue(forward ? 30 : -30);

      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, useNativeDriver: true, ...MOTION.timingBase }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, ...MOTION.springSettle }),
      ]).start();
    }, [index, fadeAnim, slideAnim])
  );

  return (
    <Animated.View style={[{ flex: 1, opacity: fadeAnim, transform: [{ translateX: slideAnim }] }, style]}>
      {children}
    </Animated.View>
  );
};
