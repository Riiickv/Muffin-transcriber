import React, { useRef } from 'react';
import { Animated, Pressable, PressableProps, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { MOTION } from '@/constants/tokens';

type StyleFn = (state: { pressed: boolean }) => StyleProp<ViewStyle>;
type ChildrenFn = (state: { pressed: boolean }) => React.ReactNode;

interface AnimatedPressableProps extends Omit<PressableProps, 'style' | 'children'> {
  children?: React.ReactNode | ChildrenFn;
  style?: StyleProp<ViewStyle> | StyleFn;
  scaleTo?: number;
}

// Keys that must sit on the Pressable element itself — otherwise the button
// can't participate in its parent's flex layout on react-native-web (where
// Pressable becomes a <button>/<div>). Everything else is applied to the inner
// Animated.View so the press-scale animation covers the visible surface and
// any caller-provided transforms still compose.
const OUTER_KEYS = new Set([
  'flex', 'flexGrow', 'flexShrink', 'flexBasis',
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  'alignSelf', 'position', 'top', 'right', 'bottom', 'left', 'zIndex',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'marginVertical', 'marginHorizontal', 'marginStart', 'marginEnd',
]);

const splitStyle = (resolved: StyleProp<ViewStyle> | undefined) => {
  const flat = StyleSheet.flatten(resolved) as Record<string, unknown> | undefined;
  if (!flat) return { outer: undefined, inner: undefined };
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const key of Object.keys(flat)) {
    if (OUTER_KEYS.has(key)) outer[key] = flat[key];
    else inner[key] = flat[key];
  }
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
};

export const AnimatedPressable = ({ children, style, scaleTo = 0.97, ...props }: AnimatedPressableProps) => {
  const pressScale = useRef(new Animated.Value(1)).current;

  const handlePressIn = (e: any) => {
    Animated.spring(pressScale, { toValue: scaleTo, useNativeDriver: true, ...MOTION.springPress }).start();
    props.onPressIn?.(e);
  };

  const handlePressOut = (e: any) => {
    Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, ...MOTION.springPress }).start();
    props.onPressOut?.(e);
  };

  const pressableStyle = (state: { pressed: boolean }): ViewStyle => {
    const resolved = typeof style === 'function' ? (style as StyleFn)({ pressed: state.pressed }) : style;
    return splitStyle(resolved).outer ?? {};
  };

  return (
    <Pressable {...props} style={pressableStyle} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      {({ pressed }) => {
        const resolved = typeof style === 'function' ? (style as StyleFn)({ pressed }) : style;
        const { inner } = splitStyle(resolved);
        const innerTransforms: any[] = Array.isArray((inner as any)?.transform)
          ? ((inner as any).transform as any[])
          : [];
        return (
          <Animated.View
            style={[
              inner,
              // Stretch across whatever size Pressable ended up being so the
              // visible surface (bg, border, padding) actually fills the button.
              // NOTE: flexGrow makes unsized buttons expand inside centered
              // fixed-height containers — give those buttons an explicit height
              // (like the record button does) instead of changing this: a
              // minHeight:'100%' variant broke every control in the app on Yoga.
              { alignSelf: 'stretch', flexGrow: 1, transform: [...innerTransforms, { scale: pressScale }] },
            ]}
          >
            {typeof children === 'function' ? children({ pressed }) : children}
          </Animated.View>
        );
      }}
    </Pressable>
  );
};
