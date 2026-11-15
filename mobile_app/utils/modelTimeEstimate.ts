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
 * MEASURED per-window cost relative to Tiny. Not encoder depth, which is what
 * this used to be and what made it wrong twice.
 *
 * From per-window timings on one 107s file, build 105/106, same recording:
 *
 *   Fastest        2.4s a window   ->   1
 *   Most accurate 13.6s a window   ->   5.7
 *   Balanced      29.2s a window   ->  12.2
 *
 * Balanced is the SLOWEST of the three, by more than a factor of two over the
 * model that is supposed to be the heavy one. Encoder arithmetic says the
 * opposite in the strongest terms: Turbo carries the full large-v3 encoder, 32
 * layers at 1280 wide, against Small's 12 at 768. On paper Turbo is seven times
 * the work.
 *
 * The measurement that explains it is the SPREAD between windows in the same
 * run. Balanced came in at 1.9x slowest-over-median, Turbo at 1.1x. That is
 * whisper's temperature fallback: a window whose decode fails the compression
 * or logprob thresholds is decoded again at a higher temperature, up to six
 * times. Turbo trims the decoder to 4 layers but keeps the full encoder, so it
 * is confident first time and almost never retries. Small retries constantly on
 * this audio and pays for its own uncertainty.
 *
 * So being more accurate makes Turbo FASTER here, because it stops doing the
 * work repeatedly. That is not a conclusion any amount of layer-counting would
 * have reached, and the two previous versions of this table were both derived
 * by layer-counting.
 *
 * NOT ESTABLISHED: whether this ordering holds on other recordings. Fallback
 * rate depends on the audio, so a clean studio recording might not trigger it
 * and would put the tiers back in their architectural order. This is one file,
 * one device. It is enough to stop recommending Balanced over Turbo, which is
 * what it is used for, and not enough to treat as a general law.
 */
const ENCODER_WEIGHT: Record<string, number> = {
  'ggml-tiny-q8_0.bin': 1,
  'ggml-tiny.bin': 1,
  'ggml-base.bin': 2,
  // 12, not 6. MEASURED 2026-09-05 from per-window timings on one 107s file:
  // Fastest 2.4s a window, Balanced 29.2s a window, a ratio of 12.2x. The
  // encoder arithmetic agrees exactly - 12 layers at 768 wide against 4 at 384
  // is 12x the work - so the old 6 was simply wrong, and it was wrong in the
  // direction that made every slow Balanced run look mysterious. Runs of
  // 165s and 210s were called unexplained for most of a day because this line
  // predicted half of them.
  'ggml-small-q8_0.bin': 12,
  'ggml-small.bin': 12,
  // MEASURED at 13.6s a window against Fastest's 2.4s. Was 32, from layer
  // counting, which had it four times slower than it is and ranked it below
  // Balanced when it is twice as fast.
  'ggml-large-v3-turbo-q8_0.bin': 6,
  // Full large-v3, 32 decoder layers rather than Turbo's 4, so it does NOT get
  // Turbo's cheap decoding and is left where layer counting put it. Unmeasured.
  'ggml-large-v3.bin': 32,
  // The Fast model (Parakeet). NOT a Whisper model and it has no 30 second
  // windows, so this is not a per-window ratio: it is set so the one-minute
  // anchor below gives what the phone measured. Pixel 9 Pro XL, 2026-11-14,
  // one run: 11.1s for a 116s recording, which is 5.7s for a minute, and
  // 5.7 / 4.85 is 1.2. It grows with length, without Whisper's fixed entry fee.
  'ggml-parakeet-tdt-0.6b-v3-q4_0.bin': 1.2,
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
 * RE-ANCHORED AGAIN 2026-09-05, on per-window timings rather than totals, which
 * is the first evidence good enough to fix the WEIGHTS rather than just the
 * constant:
 *
 *   Fastest,  weight  1  ->  2.4s a window
 *   Balanced, weight 12  -> 29.2s a window
 *
 * Both give the same answer for a one minute recording, which is two windows:
 * 2 x 2.4 / 1 = 4.8, and 2 x 29.2 / 12 = 4.87. Two tiers a dozen times apart
 * agreeing to within 2% is a real fit, where every previous version of this
 * number was one tier's total divided by a guess.
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
/**
 * How expensive a model is per window, relative to Fastest, or null if unknown.
 *
 * Exported so the progressive draft picker can rank by MEASURED cost instead of
 * catalog position. Those used to be the same thing and are not any more: Turbo
 * measures 5.7 against Balanced's 12.2, so the catalog's quality order and its
 * speed order now disagree.
 */
export function relativeCost(modelId: string): number | null {
  const w = ENCODER_WEIGHT[modelId];
  return w === undefined ? null : w;
}

const SECONDS_PER_WEIGHT = 4.85;

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

  // A speech file with no measured weight gets nothing. Without this the 8-bit
  // Parakeet, whose name contains "0.6b", was read as a 0.6 billion parameter
  // text model and given a per-minute-of-transcript estimate.
  if (/^ggml-/i.test(modelId)) return null;

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
