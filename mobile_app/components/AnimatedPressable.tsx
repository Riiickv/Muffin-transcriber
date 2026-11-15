import React, { useRef } from 'react';
import { Animated, Easing, Pressable, PressableProps, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { spring } from '@/utils/motion';

type StyleFn = (state: { pressed: boolean }) => StyleProp<ViewStyle>;
type ChildrenFn = (state: { pressed: boolean }) => React.ReactNode;

interface AnimatedPressableProps extends Omit<PressableProps, 'style' | 'children'> {
  children?: React.ReactNode | ChildrenFn;
  style?: StyleProp<ViewStyle> | StyleFn;
  /** The least it gives when pressed. Small things give more, see EDGE_PX. */
  scaleTo?: number;
}

// Keys that must sit on the Pressable element itself - otherwise the button
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

/** How long going in takes. Short enough that a held press feels instant. */
const PRESS_MS = 90;
// A scale is a share of the size, so the same 0.97 moves the edge of a wide
// card five pixels and the edge of an icon button half of one, which nobody
// sees, and a spring back from half a pixel is no spring at all. So the press
// is counted in pixels: the ends of the longer side each come in by about
// this much, whatever the size. Capped so a tiny target never caves in.
const EDGE_PX = 3;
const MAX_GIVE = 0.14;

/**
 * Every pressable thing in the app. Pressed, it gives a little; let go, it
 * springs back past its size and settles, the way the bottom bar moves. Only
 * the transform changes, so nothing around it is ever laid out again.
 */
export const AnimatedPressable = ({ children, style, scaleTo = 0.97, ...props }: AnimatedPressableProps) => {
  const wide = useRef(new Animated.Value(1)).current;
  const tall = useRef(new Animated.Value(1)).current;
  const longSide = useRef(0);
  const pressedAt = useRef(0);

  const pressedScale = () => {
    const give = longSide.current > 0 ? Math.min(MAX_GIVE, (2 * EDGE_PX) / longSide.current) : 0;
    return Math.min(scaleTo, 1 - give);
  };

  const goIn = (ms: number) => {
    const to = pressedScale();
    const step = (v: Animated.Value) =>
      Animated.timing(v, { toValue: to, duration: ms, easing: Easing.out(Easing.quad), useNativeDriver: true });
    return Animated.parallel([step(wide), step(tall)]);
  };

  const handlePressIn = (e: any) => {
    pressedAt.current = Date.now();
    goIn(PRESS_MS).start();
    props.onPressIn?.(e);
  };

  const handlePressOut = (e: any) => {
    const back = Animated.parallel([
      Animated.spring(wide, { toValue: 1, useNativeDriver: true, ...spring('releaseWide') }),
      Animated.spring(tall, { toValue: 1, useNativeDriver: true, ...spring('releaseTall') }),
    ]);
    // A quick tap lets go before the press has gone in, and there would be
    // nothing to spring back from. Finish going in first.
    const left = PRESS_MS - (Date.now() - pressedAt.current);
    if (left > 8) Animated.sequence([goIn(left), back]).start();
    else back.start();
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
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              longSide.current = Math.max(width, height);
            }}
            style={[
              inner,
              // Stretch across whatever size Pressable ended up being so the
              // visible surface (bg, border, padding) actually fills the button.
              // NOTE: flexGrow makes unsized buttons expand inside centered
              // fixed-height containers - give those buttons an explicit height
              // (like the record button does) instead of changing this: a
              // minHeight:'100%' variant broke every control in the app on Yoga.
              { alignSelf: 'stretch', flexGrow: 1, transform: [...innerTransforms, { scaleX: wide }, { scaleY: tall }] },
            ]}
          >
            {typeof children === 'function' ? children({ pressed }) : children}
          </Animated.View>
        );
      }}
    </Pressable>
  );
};
