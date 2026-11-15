import { useEffect, useMemo, useRef, useState } from 'react';
import { View, PanResponder, StyleSheet, type ColorValue, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useTheme } from './ThemeProvider';
import { waveformBars } from '@/utils/waveform';

const HEIGHT = 36;
const BAR_W = 3;
const GAP = 2;
/** The tallest bar at rest, as a share of the height. The rest is room to rise into. */
const REST = 0.66;
/** How many bars either side of the playhead rise as it passes. */
const REACH = 3.5;
/** How much taller the bar right under the playhead gets. */
const LIFT = 0.48;
/** How often the player reports its position (expo-audio's default). */
const TICK_MS = 500;

/**
 * The audio position, drawn as a waveform you can tap or drag along.
 *
 * `progress` is where playback is (0 to 1). While a finger is down the bar
 * shows the finger instead, reports it through `onScrub` so the time label can
 * follow, and seeks once on release.
 *
 * The position lives in one shared value. The bars read it on the UI thread:
 * each fills in as the playhead reaches it, and the few around the playhead
 * rise and settle as it goes by, so the line ripples while it plays or is
 * dragged and lies flat when nothing is moving.
 */
export function WaveformSeekBar({
  progress,
  onSeek,
  onScrub,
  seedId,
  disabled = false,
}: {
  progress: number;
  onSeek: (fraction: number) => void;
  /** The position under the finger while dragging, then null when it lifts. */
  onScrub?: (fraction: number | null) => void;
  seedId: string;
  /** No audio to move through: drawn dimmed and ignores touches. */
  disabled?: boolean;
}) {
  const { theme } = useTheme();
  const [width, setWidth] = useState(0);
  const [held, setHeld] = useState(false);

  // As many 3px bars as fit, rather than a fixed 44 squeezed to hairlines.
  const count = Math.max(8, Math.floor((width + GAP) / (BAR_W + GAP)));
  const bars = useMemo(() => waveformBars(seedId, count), [seedId, count]);

  const pos = useSharedValue(progress);
  /** 0 = lying flat, 1 = rippling. Up while the playhead moves, down after. */
  const energy = useSharedValue(0);
  const dragging = useRef(false);
  const lastTarget = useRef(progress);

  const stir = () => {
    energy.set(withSequence(
      withTiming(1, { duration: 140 }),
      withDelay(TICK_MS, withTiming(0, { duration: 450, easing: Easing.out(Easing.quad) }))
    ));
  };

  // The player reports twice a second. Gliding to each report over the same
  // half second turns those steps into one steady movement; a bigger change
  // (a seek, or the end of the file) gets there quickly instead.
  useEffect(() => {
    if (dragging.current || progress === lastTarget.current) return;
    const far = Math.abs(progress - lastTarget.current) > 0.2;
    lastTarget.current = progress;
    pos.set(withTiming(
      progress,
      far ? { duration: 200, easing: Easing.out(Easing.cubic) } : { duration: TICK_MS, easing: Easing.linear }
    ));
    stir();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pos and energy are stable shared values
  }, [progress]);

  // The responder below is built once, so it must not close over props: it
  // would keep calling the `onSeek` of the first render for ever. That one was
  // created before the audio had loaded, saw a duration of 0 and refused to
  // seek, so the line could be dragged but letting go never moved the audio.
  // It reads the current props through this instead.
  const live = useRef({ onSeek, onScrub, disabled, width });
  live.current = { onSeek, onScrub, disabled, width };

  const startX = useRef(0);
  const lastScrub = useRef(-1);
  const moveTo = (x: number) => {
    const f = Math.max(0, Math.min(1, x / (live.current.width || 1)));
    pos.set(f);
    lastTarget.current = f;
    // The label only shows whole seconds; no need to re-render for every pixel.
    const step = Math.round(f * 200);
    if (step !== lastScrub.current) {
      lastScrub.current = step;
      live.current.onScrub?.(f);
    }
    return f;
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !live.current.disabled,
      onMoveShouldSetPanResponder: () => !live.current.disabled,
      // The bar sits in a page that scrolls. Once a drag has started here it
      // stays here, even if the finger wanders up or down a little.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        dragging.current = true;
        lastScrub.current = -1;
        setHeld(true);
        energy.set(withTiming(1, { duration: 140 }));
        startX.current = e.nativeEvent.locationX;
        moveTo(startX.current);
      },
      onPanResponderMove: (_e, g) => {
        moveTo(startX.current + g.dx);
      },
      onPanResponderRelease: (_e, g) => {
        const f = moveTo(startX.current + g.dx);
        dragging.current = false;
        setHeld(false);
        stir();
        live.current.onScrub?.(null);
        live.current.onSeek(f);
      },
      onPanResponderTerminate: () => {
        dragging.current = false;
        setHeld(false);
        stir();
        live.current.onScrub?.(null);
      },
    })
  ).current;

  const headW = held ? 6 : 4;
  const headStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pos.value * width - headW / 2 }],
  }));

  return (
    <View
      style={[styles.container, disabled && { opacity: 0.4 }]}
      // Taller to the touch than it is drawn.
      hitSlop={{ top: 10, bottom: 10 }}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      {...pan.panHandlers}
    >
      {width > 0 &&
        bars.map((h, i) => (
          <Bar
            key={i}
            index={i}
            count={count}
            height={Math.max(3, Math.round(h * HEIGHT * REST))}
            pos={pos}
            energy={energy}
            base={theme.divider}
            tint={theme.tint}
          />
        ))}
      {/* The playhead: a rounded bar the full height of the line, a little
          wider while a finger holds it. */}
      {width > 0 && !disabled && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.head,
            { width: headW, borderRadius: headW / 2, backgroundColor: theme.tint },
            headStyle,
          ]}
        />
      )}
    </View>
  );
}

function Bar({
  index,
  count,
  height,
  pos,
  energy,
  base,
  tint,
}: {
  index: number;
  count: number;
  height: number;
  pos: SharedValue<number>;
  energy: SharedValue<number>;
  base: ColorValue;
  tint: ColorValue;
}) {
  // Rises with how close the playhead is, squared so the bump has a round top.
  const liftStyle = useAnimatedStyle(() => {
    const near = Math.max(0, 1 - Math.abs(pos.value * count - (index + 0.5)) / REACH);
    return { transform: [{ scaleY: 1 + LIFT * near * near * energy.value }] };
  });
  // The played colour is a layer faded in over the unplayed one, so the edge
  // between the two is soft and the accent can be a system colour (which
  // cannot be blended with another in JS).
  const fillStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, pos.value * count - index)),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ width: BAR_W, height, borderRadius: BAR_W / 2, backgroundColor: base, overflow: 'hidden' }, liftStyle]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: tint }, fillStyle]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  head: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: HEIGHT,
  },
});
