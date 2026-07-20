import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleProp, TextStyle } from 'react-native';

import { Text } from './Themed';
import { useTheme } from './ThemeProvider';
import { createDrip, mixHex } from '@/utils/streamingDrip';

/** ~25fps. Fast enough to read as typing, slow enough to be cheap. */
const TICK_MS = 40;
/** How much of the end carries the accent trail. */
const TAIL_CHARS = 44;
/** Colour steps across that trail. More is smoother and costs more nodes. */
const TAIL_STEPS = 8;
/**
 * Text older than the trail is frozen in blocks of this size.
 *
 * This is the whole performance story. A 10-minute podcast is tens of thousands
 * of characters, and re-rendering that as one growing string 25 times a second
 * would melt exactly the long transcriptions this exists for. Everything behind
 * the trail is split into blocks that stop changing once complete, so a tick
 * only re-lays-out the last partial block plus the handful of trail nodes.
 */
const BLOCK_CHARS = 600;

/** A finished block. Frozen by memo: same text in, no re-render. */
const FrozenBlock = memo(function FrozenBlock({ text }: { text: string }) {
  return <Text>{text}</Text>;
});

export function StreamingText({
  text,
  done,
  paced = true,
  style,
}: {
  /** The full text so far. */
  text: string;
  /** Reveal everything immediately - the job has finished. */
  done?: boolean;
  /**
   * Pace the reveal (whisper: paragraph-sized bursts 30s apart, which need
   * spreading out). Turn OFF for an LLM, whose tokens already arrive one at a
   * time at a readable rate - pacing that would only add lag to something
   * already typing itself.
   */
  paced?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const { theme } = useTheme();
  const drip = useRef(createDrip()).current;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    drip.push(text.length);
  }, [text, drip]);

  useEffect(() => {
    if (!paced) return;
    const id = setInterval(() => {
      const next = Math.floor(drip.tick(!!done));
      setShown((prev) => (prev === next ? prev : next));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [drip, done, paced]);

  const visible = paced ? text.slice(0, Math.min(shown, text.length)) : text;
  const tailStart = Math.max(0, visible.length - TAIL_CHARS);

  // Only advances a block at a time, so `frozen` keeps its identity for
  // hundreds of ticks and the memo above actually bites.
  const frozenEnd = Math.floor(tailStart / BLOCK_CHARS) * BLOCK_CHARS;
  const blocks = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < frozenEnd; i += BLOCK_CHARS) out.push(text.slice(i, i + BLOCK_CHARS));
    return out;
  }, [text, frozenEnd]);

  const settled = visible.slice(frozenEnd, tailStart);
  const tail = visible.slice(tailStart);

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
