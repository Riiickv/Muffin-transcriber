import type { DeviceTier } from './deviceTierData';

/**
 * How long a model is likely to take on THIS device.
 *
 * PURE - no native modules, no storage, no i18n. The callers pass in the tier
 * and whatever real measurements they already have, so this file can be unit
 * tested in plain Node.
 *
 * ---------------------------------------------------------------------------
 * WHAT THESE NUMBERS ARE, AND WHAT THEY ARE NOT
 *
 * There is exactly ONE device these were measured on: a Pixel 9 Pro XL (Tensor
 * G4, 4 performance cores, both engines on their dotprod+i8mm builds).
 *
 * The FIRST calibration, from clips of 6 to 37 seconds, concluded the cost was a
 * flat per-recording toll: six times the audio for 22% more time. That is true
 * only while the whole clip fits in one or two of whisper's padded 30 second
 * windows, and it was measured entirely inside that range. Longer recordings
 * scale with the number of windows, and the flat reading understated them badly:
 * it predicted 26s for large-v3-turbo, which on a 107 second voice message
 * actually cost between 132s and 285s.
 *
 * RE-CALIBRATED 2026-09-04 against runs on real voice messages. The shape that
 * fits both ends is per WINDOW, not per recording:
 *
 *     total ~= vad + ceil(seconds / 30) * ENCODER_WEIGHT * k
 *
 *   tiny,  111s (4 windows), 6.7s total, 3.6s vad   ->  k = 0.78
 *   turbo, 107s (4 windows), 132.2s,     3.1s vad   ->  k = 1.01
 *   turbo, 107s (4 windows), 158.4s,     3.7s vad   ->  k = 1.21
 *   turbo, 107s (4 windows), 284.6s,     5.4s vad   ->  k = 2.18   (outlier)
 *   turbo,  45s (2 windows), 165.7s,     3.9s vad   ->  k = 2.53   (outlier)
 *
 * A 40x span of model sizes agreeing on k within about 1.5x is a real fit, and
 * k = 1.2 comes from those three rows alone. The two outliers were excluded and
 * remain unexplained.
 *
 * THE 45s ROW IS NOT TRUSTWORTHY AND ITS WINDOW COUNT MAY BE WRONG. When these
 * were taken, audioSeconds fell back to the end of whisper's last segment
 * whenever the silence trim declined, which is the normal outcome for
 * continuous speech. That is where whisper stopped emitting words, not where
 * the audio stops, so the recording may have been considerably longer than 45
 * seconds and the row may not be an outlier at all. Fixed since, in the same
 * change that added this note: audioSeconds is now the real duration. Re-take
 * these measurements before trusting the fit any further than it is trusted
 * here, and do not add more rows from before that fix.
 *
 * The remaining candidates for the outliers, neither confirmed: thermal
 * throttling (the COLD column, which is close to pure I/O, degraded 2.6x across
 * the same session, which no decode explanation covers) and whisper's
 * temperature fallback, which can decode a bad window up to six times. Treat k
 * as 1.2 with a long tail rather than a constant.
 *
 * This file still reports per RECORDING, because the Models screen shows the
 * estimate before any recording exists and has no length to scale by. So the
 * anchor is a TYPICAL voice message, about one minute, i.e. two windows:
 * k = 1.2 x 2 windows = 2.4 seconds per unit of encoder weight. Anything much
 * longer scales roughly linearly in windows on top of that.
 *
 * Between models it scales by encoder depth (a real, published ratio) and
 * between devices by tier (a guess, and the weakest link here).
 *
 * Everything derived from that one anchor is an ESTIMATE and must be shown as
 * one. Where the user's own history has a real measurement for a model, prefer
 * it - a number from this phone beats any number from mine.
 * ---------------------------------------------------------------------------
 */

/**
 * Encoder cost relative to tiny, from the layer counts whisper ships: tiny 4,
 * base 6, small 12, medium 24, large 32. Not linear in layers alone, because
 * width grows with depth, so these follow the published relative speeds rather
 * than a layer ratio.
 *
 * large-v3-turbo carries the FULL large-v3 encoder and only trims the decoder
 * to 4 layers, which is exactly why it is nearly as slow as large here while
 * being much faster on long audio.
 */
const ENCODER_WEIGHT: Record<string, number> = {
  'ggml-tiny-q8_0.bin': 1,
  'ggml-tiny.bin': 1,
  'ggml-base.bin': 2,
  'ggml-small-q8_0.bin': 6,
  'ggml-small.bin': 6,
  'ggml-large-v3-turbo-q8_0.bin': 32,
  'ggml-large-v3.bin': 32,
};

/**
 * Seconds per unit of encoder weight for a typical one minute recording.
 *
 * RE-ANCHORED 2026-09-05 on the first measurement of this whole exercise taken
 * with nothing else wrong: build 104, Pixel 9 Pro XL, a 107s voice message on
 * Balanced, run FIRST on a rested phone with the model freshly loaded.
 *
 *   Balanced (weight 6), 107s, VAD keeping 97.5s  ->  38.4s, 2.80x realtime
 *   Fastest  (weight 1), 107s, no VAD             ->   8.4s, 12.8x realtime
 *
 * Measured ratio between the two tiers is 4.6x against the table's 6x, so the
 * relative weights are about right and only the constant needed moving. Four
 * windows at weight 6 puts k near 1.6, and a one minute recording is two
 * windows, so 6 x 1.6 x 2 / 6 = 3.2 seconds per unit.
 *
 * WHAT THIS IS ANCHORED ON: exactly one clean run per tier. Every other
 * measurement from that session is unusable, and not for subtle reasons - the
 * three Balanced runs that followed this one took 250s, 279s and 365s, warm,
 * degrading monotonically under nineteen minutes of unbroken CPU load. That is
 * a real effect users will meet on long recordings, and it is deliberately NOT
 * in this number: an estimate should describe the normal case, which is one
 * voice message on a phone that has been idle.
 *
 * The previous value, 2.4, came from a fit across runs that are now known to
 * have been polluted by a stalled screen, a double model load and a
 * use-after-free in the VAD path. It underestimated Balanced by about a third.
 */
const SECONDS_PER_WEIGHT = 3.2;

/**
 * How much slower a tier is than the phone the anchor came from.
 *
 * The honest part: 'high' is 1 because that IS the measured device. The other
 * two are judgement, from the ratio of big-core counts and clocks across the
 * tiers the app already sorts phones into. Being wrong here makes an estimate
 * wrong, which is why the label says estimate.
 */
const TIER_FACTOR: Record<DeviceTier, number> = {
  high: 1,
  mid: 2.2,
  low: 4,
};

/**
 * LLM cost, in seconds per minute of transcript, for the 1.5B at high tier.
 *
 * From the same session: prefill ~105 tok/s and generation ~20 tok/s warm. A
 * minute of speech is roughly 200 tokens in and a similar number out, so
 * 200/105 + 200/20 is about 12 seconds. Generation dominates, and generation is
 * memory-bandwidth bound, so this scales with parameter count.
 */
const LLM_SECONDS_PER_MINUTE_AT_1_5B = 12;

/**
 * Models whose filename does not state a parameter count.
 *
 * Phi-3-mini says "mini" and means 3.8B, which the pattern below cannot know
 * and which matters: at 3.8B it is more than twice the work of the 1.5B, so
 * guessing wrong here understates it by half. A model missing from both the
 * pattern and this table gets NO estimate rather than a plausible fiction, and
 * tests/modelTimeEstimate.test.ts fails the moment the catalog gains one.
 */
const KNOWN_PARAMS: Record<string, number> = {
  'Phi-3-mini-4k-instruct-q4.gguf': 3.8,
};

/** Billions of parameters, parsed from the filename the catalog already uses. */
export function billionsOfParams(modelId: string): number | null {
  const known = KNOWN_PARAMS[modelId];
  if (known !== undefined) return known;
  const m = modelId.match(/(\d+(?:[._]\d+)?)\s*b[-._]/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace('_', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type TimeEstimate = {
  seconds: number;
  /** 'recording' = a flat cost per clip. 'minute' = per minute of transcript. */
  per: 'recording' | 'minute';
  /** True when this came from the user's own runs rather than the table. */
  measured: boolean;
};

/**
 * @param modelId   Catalog id, e.g. 'ggml-small-q8_0.bin'.
 * @param tier      This device's tier.
 * @param measuredSeconds  The user's own average for this model, when known.
 */
export function estimateFor(
  modelId: string,
  tier: DeviceTier,
  measuredSeconds?: number | null
): TimeEstimate | null {
  const weight = ENCODER_WEIGHT[modelId];
  if (weight !== undefined) {
    // A real measurement wins outright. It is this phone, this model, this
    // build - everything the table is guessing at.
    if (measuredSeconds && measuredSeconds > 0) {
      return { seconds: measuredSeconds, per: 'recording', measured: true };
    }
    return {
      seconds: weight * SECONDS_PER_WEIGHT * TIER_FACTOR[tier],
      per: 'recording',
      measured: false,
    };
  }

  const billions = billionsOfParams(modelId);
  if (billions === null) return null;
  if (measuredSeconds && measuredSeconds > 0) {
    return { seconds: measuredSeconds, per: 'minute', measured: true };
  }
  return {
    seconds: (billions / 1.5) * LLM_SECONDS_PER_MINUTE_AT_1_5B * TIER_FACTOR[tier],
    per: 'minute',
    measured: false,
  };
}

/**
 * Seconds as something short enough to sit on one line under a model name.
 *
 * Rounded hard on purpose. "about 27.4s" claims a precision this does not have;
 * below ten seconds it goes to the nearest second, above that to the nearest
 * five, and past ninety it switches to minutes.
 */
export function formatEstimateSeconds(seconds: number): string {
  if (seconds < 10) return `${Math.max(1, Math.round(seconds))}s`;
  if (seconds < 90) return `${Math.round(seconds / 5) * 5}s`;
  const minutes = seconds / 60;
  return minutes < 10 ? `${minutes.toFixed(1).replace(/\.0$/, '')}m` : `${Math.round(minutes)}m`;
}
