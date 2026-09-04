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
    embedding: 'all-MiniLM-L6-v2-q4_k_m.gguf',
  },
  mid: {
    whisper: 'ggml-small-q8_0.bin',
    formatter: 'qwen2.5-1.5b-instruct-q4_0.gguf',
    chat: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    embedding: 'all-MiniLM-L6-v2-q4_k_m.gguf',
  },
  high: {
    // Small, NOT turbo, and this is a speed decision on a table that otherwise
    // only weighs RAM.
    //
    // Measured on a Pixel 9 Pro XL (16 GB, Tensor G4, 4 threads, i8mm kernels),
    // 2026-09-04. Same 107s voice message, three runs of turbo: 132.2s, 158.4s
    // and 284.6s, i.e. 0.81x, 0.68x and 0.38x realtime. Tiny on a comparable
    // 111s clip: 3.1s of transcribe, about 36x realtime. Turbo is roughly 40x
    // the cost of tiny and never once finished faster than the audio was long.
    //
    // That phone is close to the ceiling of what Android hardware does, and it
    // was the tier's own recommendation that put turbo there: a voice note cost
    // two to five minutes and left the phone hot. Recommending it by RAM alone
    // gave the best devices the worst experience, which is the exact opposite of
    // what a tier table is for.
    //
    // Turbo stays in the catalog and stays selectable - it is genuinely the most
    // accurate, and someone transcribing a lecture they will read later is right
    // to choose it. It is just not what an unattended default should hand to
    // someone waiting on a voice message.
    //
    // NOT YET MEASURED: small on this hardware. Its encoder is about 7x lighter
    // than turbo's (12 layers x 768 wide against 32 x 1280), and the tiny/turbo
    // ratio came in about half what that kind of arithmetic predicts, so the
    // honest expectation is 3-4x realtime, roughly half a minute for a two
    // minute message. That is an estimate from architecture, not a measurement,
    // and it should be replaced with a real number from a Speed report.
    whisper: 'ggml-small-q8_0.bin',
    formatter: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    chat: 'Phi-3-mini-4k-instruct-q4.gguf',
    embedding: 'all-MiniLM-L6-v2-q4_k_m.gguf',
  },
};

/** The suggested model id for a given tier, or null if none is honest. */
export function recommendedForTier(group: ModelGroup, tier: DeviceTier): string | null {
  return RECOMMENDED[tier][group] ?? null;
}
