// The device-tier thresholds and the per-tier model recommendations - PURE (no
// expo-device import), so they're unit-testable. deviceTier.ts reads the real
// device memory and wraps these.

export type DeviceTier = 'low' | 'mid' | 'high';
export type ModelGroup = 'whisper' | 'formatter' | 'chat' | 'embedding';

const GB = 1024 * 1024 * 1024;

/**
 * Total RAM in bytes -> tier. Conservative on purpose: the OS and everything
 * else open want RAM too, and being pointed at a model that then fails to load
 * is worse than a smaller one that works. Unknown memory assumes the weakest.
 */
export function tierForMemoryBytes(bytes: number | null | undefined): DeviceTier {
  if (!bytes) return 'low';
  const gb = bytes / GB;
  if (gb >= 7.5) return 'high'; // 8 GB+ phones
  if (gb >= 5.5) return 'mid'; // 6 GB
  return 'low'; // 4 GB and under
}

/**
 * The heaviest model in a group this tier should be pointed at, by id.
 *
 * Per-group and hand-written rather than derived from file size: what matters is
 * the peak RAM while running, which is the weights PLUS the context, and those
 * don't scale together. Chat models are the exception - they're big enough that
 * a low-end phone gets nothing at all, and saying so honestly beats suggesting
 * something that will crawl.
 *
 * INVARIANT: every id here must exist in the model catalog (ModelManager), or
 * the recommendation silently vanishes at first run - no highlight, no guidance.
 * tests/deviceTierData.test.ts guards it.
 */
export const RECOMMENDED: Record<DeviceTier, Record<ModelGroup, string | null>> = {
  low: {
    whisper: 'ggml-tiny-q8_0.bin',
    formatter: 'Qwen3-0.6B-Q4_0.gguf',
    chat: null, // nothing here is honest on 4 GB
    embedding: 'multilingual-e5-small-q8_0.gguf',
  },
  mid: {
    whisper: 'ggml-small-q8_0.bin',
    formatter: 'qwen2.5-1.5b-instruct-q4_0.gguf',
    chat: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    embedding: 'multilingual-e5-small-q8_0.gguf',
  },
  high: {
    // Back to Turbo, and this reverses a change made earlier the same day on
    // arithmetic that measurement then contradicted.
    //
    // MEASURED per window on one 107s recording, Pixel 9 Pro XL, build 105/106:
    //
    //   Fastest        2.4s a window,  1.9x spread,  11.2s total
    //   Most accurate 13.6s a window,  1.1x spread,  76.3s total
    //   Balanced      29.2s a window,  1.9x spread, 164.9s total
    //
    // Most accurate is more than twice as fast as Balanced. Every piece of
    // reasoning available beforehand said the opposite: Turbo carries the full
    // large-v3 encoder, 32 layers at 1280 wide, against Small's 12 at 768, so on
    // paper it is seven times the work.
    //
    // The spread column is what explains it. Balanced sits at 1.9x
    // slowest-over-median and Turbo at 1.1x, which is whisper's temperature
    // fallback: a window failing the compression or logprob thresholds gets
    // decoded again at a higher temperature, up to six times. Turbo trims the
    // DECODER to 4 layers while keeping the full encoder, so it is confident
    // first time and almost never retries. Small pays repeatedly for its own
    // uncertainty. Being more accurate makes Turbo faster here.
    //
    // NOT ESTABLISHED: whether this holds for other recordings. The fallback
    // rate depends on the audio, so a cleaner clip might put the tiers back in
    // their architectural order. One file, one device. Enough to stop
    // recommending the slower model to everyone; not a general law.
    whisper: 'ggml-large-v3-turbo-q8_0.bin',
    formatter: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    chat: 'Phi-3-mini-4k-instruct-q4.gguf',
    embedding: 'multilingual-e5-small-q8_0.gguf',
  },
};

/** The Fast speech model (Parakeet, 4-bit). Must exist in the catalog, like the ids above. */
export const FAST_SPEECH_MODEL_ID = 'ggml-parakeet-tdt-0.6b-v3-q4_0.bin';

/**
 * The suggested model id for a given tier, or null if none is honest.
 *
 * `fastSpeechFits` is "this phone is set to a language the Fast speech model
 * covers" (deviceTier.ts works it out). When it does, Fast is the suggestion
 * on mid and high: measured on the Pixel 9 Pro XL at 5.9 times the speed of
 * Most accurate with text Ricky judged better (docs/speed-research.md, 15).
 *
 * NOT on low, and that is my caution rather than a measurement: nobody has run
 * the 356 MB file on a 4 GB phone, and this table's rule is that a suggestion
 * which then fails to load is worse than a smaller one that works.
 */
export function recommendedForTier(group: ModelGroup, tier: DeviceTier, fastSpeechFits = false): string | null {
  if (group === 'whisper' && fastSpeechFits && tier !== 'low') return FAST_SPEECH_MODEL_ID;
  return RECOMMENDED[tier][group] ?? null;
}
