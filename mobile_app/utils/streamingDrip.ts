/**
 * Paces streamed transcript text onto the screen.
 *
 * Whisper doesn't type, it finishes a ~30s window of audio and hands back the
 * whole thing. Measured on a 10 minute podcast at "Most accurate": a burst
 * roughly every 34 seconds, each carrying a paragraph. Painted as they arrive,
 * that's a wall of text followed by half a minute of nothing, which reads as
 * frozen even though it's working.
 *
 * So each burst is spread across the gap until the next one. The gap is
 * MEASURED, not assumed: a faster phone or a lighter model bursts more often,
 * and the same hardcoded speed would either crawl or strobe. Same reasoning as
 * the ETA - the device tells us, we don't guess.
 */

/** Until two bursts have been seen. ~34s observed, rounded down a little. */
const DEFAULT_GAP_MS = 30000;
/**
 * Drain a backlog in slightly LESS than the gap. Over 1.0 and each burst
 * finishes late, so the lag compounds across a long recording and the end
 * arrives in one dump.
 */
const DRAIN_RATIO = 0.8;
/** How long the first burst takes to appear, before any gap has been measured. */
const FIRST_BURST_DRAIN_MS = 6000;
/**
 * Never slower than this, or a tiny burst looks stuck. Low on purpose: a slow
 * device bursting every 90s needs ~5 chars/s to fill the gap, and a floor above
 * that empties the buffer early and leaves the screen frozen for the remainder.
 */
const MIN_CPS = 2;
/** Catching up after the screen was backgrounded should be quick, not silly. */
const MAX_CPS = 2000;
/** A tick longer than this means we were suspended; don't credit the whole gap. */
const MAX_TICK_MS = 500;

export function createDrip(now: () => number = Date.now) {
  let shown = 0;
  let target = 0;
  let lastArrival = now();
  let lastTick = now();
  let gapMs = DEFAULT_GAP_MS;
  let seenBurst = false;
  /** Size of the very first burst, so it can be revealed at a flat rate. */
  let firstBurstChars = 0;

  return {
    /** A new burst landed; `length` is the full transcript length so far. */
    push(length: number) {
      const t = now();
      if (length <= target) return;
      const observed = t - lastArrival;
      // Ignore implausibly tight arrivals (whisper can emit twice in a row for
      // one window) so they don't drag the estimate to near-zero.
      if (observed > 1000) {
        gapMs = seenBurst ? gapMs + 0.4 * (observed - gapMs) : observed;
        seenBurst = true;
      }
      lastArrival = t;
      if (!firstBurstChars) firstBurstChars = length;
      target = length;
    },

    /** Advance the reveal. Returns how many characters should be visible. */
    tick(done = false): number {
      const t = now();
      const dt = Math.min(MAX_TICK_MS, t - lastTick) / 1000;
      lastTick = t;

      if (done) {
        shown = target;
        return shown;
      }
      const backlog = target - shown;
      if (backlog <= 0) return shown;

      // Note `backlog` shrinks as text is revealed, so `backlog / drainSeconds`
      // is an exponential decay, not a linear drain - drainSeconds is a time
      // constant, not a deadline. That decay is deliberate for later bursts:
      // it keeps trickling instead of finishing early and freezing.
      //
      // The FIRST burst is different. There's no measured gap yet, only the 30s
      // assumption, and decaying against it takes ~27s to show one paragraph -
      // long enough that re-transcribe reads as broken rather than slow. It's
      // the one moment the user is waiting for any sign of life, so it gets a
      // flat rate sized to finish on time. From the second burst the real gap
      // is known and the normal pacing takes over.
      const cps = seenBurst
        ? Math.min(MAX_CPS, Math.max(MIN_CPS, backlog / Math.max(1, (gapMs * DRAIN_RATIO) / 1000)))
        : Math.max(MIN_CPS, firstBurstChars / (FIRST_BURST_DRAIN_MS / 1000));
      shown = Math.min(target, shown + cps * dt);
      return shown;
    },

    /** For tests and diagnostics. */
    get state() {
      return { shown, target, gapMs };
    },
  };
}

/**
 * Blend two #rrggbb colours. Returns `to` unchanged if either isn't plain hex,
 * which matters because the Material You theme hands out PlatformColor objects
 * for the accent - those can't be interpolated, so callers pass theme.tintString.
 */
export function mixHex(from: string, to: string, t: number): string {
  const parse = (c: string) => {
    const m = /^#([0-9a-f]{6})$/i.exec(c?.trim?.() ?? '');
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const a = parse(from);
  const b = parse(to);
  if (!a || !b) return to;
  const k = Math.max(0, Math.min(1, t));
  const mix = a.map((v, i) => Math.round(v + (b[i] - v) * k));
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
