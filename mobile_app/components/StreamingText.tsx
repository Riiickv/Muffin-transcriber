import React, { memo, useMemo } from 'react';
import { StyleProp, TextStyle } from 'react-native';

import { Text } from './Themed';
import { useTheme } from './ThemeProvider';
import { mixHex } from '@/utils/streamingDrip';

/** How much of the end carries the accent trail. */
const TAIL_CHARS = 44;
/** Colour steps across that trail. More is smoother and costs more nodes. */
const TAIL_STEPS = 8;
/**
 * Text behind the trail is frozen in blocks of this size.
 *
 * This is the whole performance story. A 10-minute podcast is tens of thousands
 * of characters, and re-rendering that as one growing string 25 times a second
 * would melt exactly the long transcriptions this exists for. Blocks stop
 * changing once complete, so an update only re-lays-out the last partial block
 * plus the handful of trail nodes.
 */
const BLOCK_CHARS = 600;

/** A finished block. Frozen by memo: same text in, no re-render. */
const FrozenBlock = memo(function FrozenBlock({ text }: { text: string }) {
  return <Text>{text}</Text>;
});

/**
 * Draws already-revealed text with an accent trail on the newest characters.
 *
 * Deliberately has NO timing of its own. The reveal lives in usePacedReveal at
 * the screen, so the inline and fullscreen panels share one - two components
 * with private drips disagreed with each other, which is what stopped the
 * typing carrying into fullscreen.
 */
export function StreamingText({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const { theme } = useTheme();

  const tailStart = Math.max(0, text.length - TAIL_CHARS);
  // Only advances a block at a time, so `blocks` keeps its identity for many
  // updates and the memo above actually bites.
  const frozenEnd = Math.floor(tailStart / BLOCK_CHARS) * BLOCK_CHARS;
  const blocks = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < frozenEnd; i += BLOCK_CHARS) out.push(text.slice(i, i + BLOCK_CHARS));
    return out;
  }, [text, frozenEnd]);

  const settled = text.slice(frozenEnd, tailStart);
  const tail = text.slice(tailStart);

  // theme.tint is a PlatformColor object under Material You and can't be
  // interpolated; tintString is the hex kept alongside it for exactly this.
  const trail = useMemo(() => {
    if (!tail) return null;
    const parts: React.ReactNode[] = [];
    for (let i = 0; i < TAIL_STEPS; i++) {
      const from = Math.floor((i * tail.length) / TAIL_STEPS);
      const to = Math.floor(((i + 1) * tail.length) / TAIL_STEPS);
      const chunk = tail.slice(from, to);
      if (!chunk) continue;
      // Oldest end of the trail is already normal text; newest is full accent.
      const newness = (i + 1) / TAIL_STEPS;
      parts.push(
        <Text key={i} style={{ color: mixHex(theme.text, theme.tintString, newness) }}>
          {chunk}
        </Text>
      );
    }
    return parts;
  }, [tail, theme.text, theme.tintString]);

  return (
    <Text style={style}>
      {blocks.map((b, i) => (
        <FrozenBlock key={i} text={b} />
      ))}
      {settled}
      {trail}
    </Text>
  );
}
