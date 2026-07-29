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
 * G4, 4 performance cores, both engines on their dotprod+i8mm builds). On it,
 * ggml-large-v3-turbo-q8_0 cost ~26s for a 9 second clip, of which 1.9s was
 * loading the model. 37 seconds of audio cost 41s and 6 seconds cost 34s - six
 * times the audio for 22% more time - so the dominant term is FIXED per
 * recording, not per minute. That fixed term is the encoder, which always
 * processes a padded 30 second window whatever it was handed.
 *
 * So the whisper estimate is a per-recording constant, scaled between models by
 * encoder depth (which is a real, published ratio) and between devices by tier
 * (which is a guess, and the weakest link here).
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

/** Seconds per unit of encoder weight, from the measured anchor: 26s / 32. */
const SECONDS_PER_WEIGHT = 26 / 32;

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
