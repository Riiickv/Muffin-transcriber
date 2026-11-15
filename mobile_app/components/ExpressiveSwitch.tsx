import { Animated, StyleSheet } from 'react-native';
import { useEffect, useRef } from 'react';
import { AnimatedPressable } from './AnimatedPressable';
import { spring } from '@/utils/motion';
import { haptics } from '@/utils/haptics';

// Off is a filled grey track with a white thumb, the same in both themes. It
// used to be an empty outline with a grey dot, which read as disabled.
const OFF_TRACK = 'rgba(128,128,128,0.36)';
const OFF_THUMB = '#FFFFFF';

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
    // useNativeDriver stays false - we animate backgroundColor & width, which
    // aren't supported on the native thread.
    Animated.spring(anim, { toValue: value ? 1 : 0, useNativeDriver: false, ...spring('drop') }).start();
  }, [value, anim]);

  const trackBg = activeColor && typeof activeColor === 'string'
    ? anim.interpolate({ inputRange: [0, 1], outputRange: [OFF_TRACK, activeColor], extrapolate: 'clamp' })
    : value ? activeColor : OFF_TRACK;
    
  // The spring goes a little past each end, and the thumb with it. Its width
  // runs ahead of its height on the way, so it crosses as a short pill and
  // lands as a circle. The middle stop keeps it centred while it is wide.
  const thumbHeight = anim.interpolate({ inputRange: [0, 1], outputRange: [16, 24], extrapolate: 'clamp' });
  const thumbWidth = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [16, 28, 24] });
  const thumbTranslate = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [8, 12, 24] });
  
  const thumbColor = thumbActiveColor && typeof thumbActiveColor === 'string'
    ? anim.interpolate({ inputRange: [0, 1], outputRange: [OFF_THUMB, thumbActiveColor], extrapolate: 'clamp' })
    : value ? thumbActiveColor : OFF_THUMB;

  const toggleSwitch = () => {
    // Direction-aware: Android has distinct Toggle_On / Toggle_Off primitives,
    // so flipping a switch feels like the OS's own switches.
    haptics.toggle(!value);
    onValueChange(!value);
  };

  return (
    <AnimatedPressable onPress={toggleSwitch}>
      <Animated.View style={[styles.track, { backgroundColor: trackBg }]}>
        <Animated.View
          style={{
            width: thumbWidth,
            height: thumbHeight,
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
    justifyContent: 'center',
  },
});
