import { Animated, StyleSheet } from 'react-native';
import { useEffect, useRef } from 'react';
import { AnimatedPressable } from './AnimatedPressable';
import { MOTION } from '@/constants/tokens';
import { haptics } from '@/utils/haptics';

interface ExpressiveSwitchProps {
  value: boolean;
  onValueChange: (v: boolean) => void;
  activeColor: string;
  thumbActiveColor: string;
}

export default function ExpressiveSwitch({
  value,
  onValueChange,
  activeColor,
  thumbActiveColor,
}: ExpressiveSwitchProps) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    // useNativeDriver stays false — we animate backgroundColor & width, which
    // aren't supported on the native thread.
    Animated.spring(anim, { toValue: value ? 1 : 0, useNativeDriver: false, ...MOTION.springStandard }).start();
  }, [value, anim]);

  const trackBg = activeColor && typeof activeColor === 'string'
    ? anim.interpolate({ inputRange: [0, 1], outputRange: ['transparent', activeColor] })
    : value ? activeColor : 'transparent';
    
  const trackBorder = anim.interpolate({ inputRange: [0, 1], outputRange: ['#444444', 'transparent'] });
  const thumbSize = anim.interpolate({ inputRange: [0, 1], outputRange: [16, 24] });
  const thumbTranslate = anim.interpolate({ inputRange: [0, 1], outputRange: [6, 22] });
  
  const thumbColor = thumbActiveColor && typeof thumbActiveColor === 'string'
    ? anim.interpolate({ inputRange: [0, 1], outputRange: ['#888888', thumbActiveColor] })
    : value ? thumbActiveColor : '#888888';

  const toggleSwitch = () => {
    // Direction-aware: Android has distinct Toggle_On / Toggle_Off primitives,
    // so flipping a switch feels like the OS's own switches.
    haptics.toggle(!value);
    onValueChange(!value);
  };

  return (
    <AnimatedPressable onPress={toggleSwitch}>
      <Animated.View style={[styles.track, { backgroundColor: trackBg, borderColor: trackBorder }]}>
        <Animated.View
          style={{
            width: thumbSize,
            height: thumbSize,
            borderRadius: 12,
            backgroundColor: thumbColor,
            transform: [{ translateX: thumbTranslate }],
          }}
        />
      </Animated.View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 52,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    justifyContent: 'center',
  },
});
