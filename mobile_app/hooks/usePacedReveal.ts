import { useEffect, useMemo, useRef, useState } from 'react';

import { createDrip } from '@/utils/streamingDrip';

/** How often the reveal advances. ~25fps: reads as typing, stays cheap. */
const TICK_MS = 40;

export type TypewriterSpeed = 'slow' | 'balanced' | 'fast';

/**
 * Rate multipliers. "slow" is the 6s-first-burst baseline (still brisk typing);
 * balanced and fast divide that time by these factors. Slow also happens to
 * keep a long recording's screen busiest between bursts, fast the least - the
 * trade the user picks when they choose.
 */
const SPEED_FACTOR: Record<TypewriterSpeed, number> = { slow: 1, balanced: 2, fast: 5 };

export type TypewriterConfig = { enabled: boolean; speed: TypewriterSpeed };

/**
 * How much of a stream should be on screen right now, typed out over time.
 *
 * Lives at the SCREEN, not inside the text component, so the inline panel and
 * the fullscreen panel share ONE reveal - two separate drips disagreed, which
 * is what stopped the typing carrying into fullscreen.
 *
 * It keeps revealing after `text` clears, holding the last target until it's
 * fully shown. That's what makes a SHORT note type out: whisper hands a
 * <30s clip back as one burst at the very end, the job completes almost
 * immediately, and without the hold there'd be nothing left on screen to
 * animate. `done` tells the screen when the reveal has caught up so it can
 * swap to the final (highlighted) view.
 *
 * `paced` false, or the effect disabled, shows the text as-is - for LLM tokens
 * that already arrive at reading speed, and for users who turn the typewriter
 * off because of its per-frame cost.
 */
export function usePacedReveal(
  text: string,
  paced: boolean,
  cfg: TypewriterConfig
): { revealed: string; done: boolean } {
  const drip = useMemo(() => createDrip(Date.now, SPEED_FACTOR[cfg.speed]), [cfg.speed]);
  const [shown, setShown] = useState(0);
  const targetRef = useRef('');
  /** How the CURRENT stream reveals; captured at its start so a mid-stream flag
   *  flip (the job ending) can't abort the reveal partway. */
  const modeRef = useRef<'paced' | 'plain'>('plain');

  useEffect(() => {
    if (!text) return; // hold the current target and finish revealing it

    const cur = targetRef.current;
    // Whisper partials are cumulative, so a continuation extends `cur`. Anything
    // that neither extends nor is a prefix of it is a brand-new stream.
    const isNew = cur.length === 0 || (!text.startsWith(cur) && !cur.startsWith(text));

    if (isNew) {
      drip.reset();
      targetRef.current = text;
      modeRef.current = paced && cfg.enabled ? 'paced' : 'plain';
      if (modeRef.current === 'paced') {
        setShown(0);
        drip.push(text.length);
      } else {
        setShown(text.length);
      }
      return;
    }

    if (text.length > cur.length) targetRef.current = text;
    if (modeRef.current === 'paced') drip.push(targetRef.current.length);
    else setShown(targetRef.current.length);
  }, [text, paced, cfg.enabled, drip]);

  useEffect(() => {
    if (!cfg.enabled) return; // no interval = no per-frame cost when off
    const id = setInterval(() => {
      if (modeRef.current !== 'paced') return;
      const next = Math.floor(drip.tick(false));
      setShown((prev) => (prev === next ? prev : next));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [drip, cfg.enabled]);

  const target = targetRef.current;
  const revealed = target.slice(0, Math.min(shown, target.length));
  return { revealed, done: shown >= target.length };
}
