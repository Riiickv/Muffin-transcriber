import { useEffect, useRef, useState } from 'react';

import { createDrip } from '@/utils/streamingDrip';

/** How often the reveal advances. ~25fps: reads as typing, stays cheap. */
const TICK_MS = 40;

/**
 * How much of `text` should be on screen right now.
 *
 * Lives at the SCREEN, not inside the text component, because the inline panel
 * and the fullscreen panel are two components showing one stream. When each
 * owned its own drip they disagreed: opening fullscreen mid-generation started
 * a second reveal from zero, so the typing didn't carry over - and if that
 * second instance stalled, fullscreen sat empty while the panel behind it
 * filled. One reveal, shared, means both always show the same thing.
 *
 * `paced` off returns the text untouched, for LLM tokens that already arrive
 * at reading speed.
 */
export function usePacedReveal(text: string, paced: boolean): string {
  const drip = useRef(createDrip()).current;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    drip.push(text.length);
  }, [text, drip]);

  useEffect(() => {
    if (!paced) return;
    const id = setInterval(() => {
      const next = Math.floor(drip.tick(false));
      setShown((prev) => (prev === next ? prev : next));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [drip, paced]);

  if (!paced) return text;
  return text.slice(0, Math.min(shown, text.length));
}
