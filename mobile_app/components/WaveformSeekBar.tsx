import { useMemo, useRef, useState } from 'react';
import { View, PanResponder, StyleSheet, type LayoutChangeEvent } from 'react-native';

import { useTheme } from './ThemeProvider';
import { waveformBars } from '@/utils/waveform';
import { RADIUS } from '@/constants/tokens';

// Thin bars, WhatsApp-style. Fixed count + flex:1 so it fills whatever width the
// player row leaves, on any screen, without measuring anything to lay out.
const BAR_COUNT = 44;

/**
 * A tappable / draggable waveform that doubles as the seek bar.
 *
 * The bars are a stylised shape (see utils/waveform); the scrubbing is real.
 * Dragging shows the target position live and commits the seek on release, so
 * the audio isn't hammered with a seekTo on every finger move.
 */
export function WaveformSeekBar({
  progress,
  onSeek,
  seedId,
}: {
  /** Played fraction, 0..1. */
  progress: number;
  /** Fired once, on release, with the target fraction 0..1. */
  onSeek: (fraction: number) => void;
  /** Stable seed (the history item id) so the shape never changes per render. */
  seedId: string;
}) {
  const { theme } = useTheme();
  const bars = useMemo(() => waveformBars(seedId, BAR_COUNT), [seedId]);

  const widthRef = useRef(0);
  // The touch's start x, captured on grant (reliable), then advanced by the
  // gesture's dx. Using dx rather than each move's locationX sidesteps the RN
  // quirk where locationX during a move is relative to the child under the finger.
  const startXRef = useRef(0);
  const [dragFrac, setDragFrac] = useState<number | null>(null);

  const shown = dragFrac ?? progress;

  const fracFrom = (x: number) => {
    const w = widthRef.current || 1;
    return Math.max(0, Math.min(1, x / w));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        startXRef.current = e.nativeEvent.locationX;
        setDragFrac(fracFrom(startXRef.current));
      },
      onPanResponderMove: (_e, g) => {
        setDragFrac(fracFrom(startXRef.current + g.dx));
      },
      onPanResponderRelease: (_e, g) => {
        const f = fracFrom(startXRef.current + g.dx);
        setDragFrac(null);
        onSeek(f);
      },
      onPanResponderTerminate: () => setDragFrac(null),
    })
  ).current;

  return (
    <View
      style={styles.container}
      onLayout={(e: LayoutChangeEvent) => {
        widthRef.current = e.nativeEvent.layout.width;
      }}
      {...pan.panHandlers}
    >
      {bars.map((h, i) => {
        // Bar centre position vs. the played fraction, so the fill tracks the dot.
        const played = (i + 0.5) / BAR_COUNT <= shown;
        return (
          <View
            key={i}
            pointerEvents="none"
            style={{
              flex: 1,
              marginHorizontal: 1,
              height: `${Math.round(h * 100)}%`,
              minHeight: 3,
              borderRadius: RADIUS.pill,
              backgroundColor: played ? theme.tint : theme.divider,
            }}
          />
        );
      })}
      {/* The seek handle. borderColor = page bg so it reads as a raised dot on
          top of the bars rather than blending into them. */}
      <View
        pointerEvents="none"
        style={[styles.handle, { left: `${shown * 100}%`, backgroundColor: theme.tint, borderColor: theme.background }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
  },
  handle: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    marginLeft: -7,
    // (container height - handle height) / 2, so it sits on the centre line.
    top: 11,
  },
});
