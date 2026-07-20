/**
 * Turns whisper's raw 0-100 into something worth putting on screen.
 *
 * The estimate is MEASURED, never assumed. Hardcoding "this usually takes 30
 * seconds" would encode whichever phone it was written on and lie on every
 * other one, and the phones most likely to need the estimate are exactly the
 * ones least like a dev's. So the rate comes from this run, on this device,
 * with this model and this recording - a slow phone isn't a case anyone has to
 * predict, it's just a smaller number.
 */
export type ProgressReading = {
  /** 0-100, clamped and monotonic. */
  percent: number;
  /** Seconds left, or null until there's enough signal to say honestly. */
  secondsLeft: number | null;
};

/** Ignore the first slice: it includes model warmup and reads far too slow. */
const ANCHOR_PERCENT = 3;
/** Below this much elapsed time a rate estimate is mostly noise. */
const MIN_SAMPLE_SECONDS = 2;
/** Weight for the smoothing. Low = steadier number, slower to react. */
const SMOOTHING = 0.25;

export function createProgressTracker(now: () => number = Date.now) {
  let anchorTime: number | null = null;
  let anchorPercent = 0;
  let smoothedRate: number | null = null; // percent per second
  let lastPercent = 0;

  return {
    /** Feed whisper's progress; get back what to display. */
    update(raw: number): ProgressReading {
      const percent = Math.max(lastPercent, Math.min(100, Math.max(0, raw)));
      lastPercent = percent;

      if (percent < ANCHOR_PERCENT) return { percent, secondsLeft: null };

      const t = now();
      if (anchorTime === null) {
        // First reading past warmup becomes the baseline, so model load time
        // isn't charged to the transcription rate.
        anchorTime = t;
        anchorPercent = percent;
        return { percent, secondsLeft: null };
      }

      const elapsed = (t - anchorTime) / 1000;
      const gained = percent - anchorPercent;
      if (elapsed < MIN_SAMPLE_SECONDS || gained <= 0) {
        return { percent, secondsLeft: estimate(smoothedRate, percent) };
      }

      const rate = gained / elapsed;
      smoothedRate = smoothedRate === null ? rate : smoothedRate + SMOOTHING * (rate - smoothedRate);
      return { percent, secondsLeft: estimate(smoothedRate, percent) };
    },
  };
}

function estimate(rate: number | null, percent: number): number | null {
  if (rate === null || rate <= 0 || percent >= 100) return null;
  return Math.max(0, Math.round((100 - percent) / rate));
}

/**
 * "0:42", "2:10", "1:05:00". No words, so it needs no translation and can't
 * end up as the one English string in an otherwise Italian screen.
 */
export function formatSecondsLeft(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/**
 * The status line: "Transcribing... 42% - 2:10".
 *
 * Deliberately drops the estimate rather than guessing when there isn't enough
 * signal yet - a number that jumps around reads as broken, and this is the
 * screen where someone is already wondering whether the app has hung.
 */
export function describeProgress(label: string, reading: ProgressReading | null): string {
  if (!reading || reading.percent <= 0) return label;
  const pct = `${Math.floor(reading.percent)}%`;
  return reading.secondsLeft === null
    ? `${label} ${pct}`
    : `${label} ${pct} - ${formatSecondsLeft(reading.secondsLeft)}`;
}
