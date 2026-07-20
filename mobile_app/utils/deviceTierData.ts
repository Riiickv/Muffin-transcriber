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
    whisper: 'ggml-tiny.bin',
    formatter: 'qwen2.5-0.5b-instruct-q4_0.gguf',
    chat: null, // nothing here is honest on 4 GB
    embedding: 'all-MiniLM-L6-v2-q4_k_m.gguf',
  },
  mid: {
    whisper: 'ggml-small.bin',
    formatter: 'qwen2.5-1.5b-instruct-q4_0.gguf',
    chat: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    embedding: 'all-MiniLM-L6-v2-q4_k_m.gguf',
  },
  high: {
    whisper: 'ggml-large-v3-turbo-q8_0.bin',
    formatter: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    chat: 'Phi-3-mini-4k-instruct-q4.gguf',
    embedding: 'all-MiniLM-L6-v2-q4_k_m.gguf',
  },
};

/** The suggested model id for a given tier, or null if none is honest. */
export function recommendedForTier(group: ModelGroup, tier: DeviceTier): string | null {
  return RECOMMENDED[tier][group] ?? null;
}
