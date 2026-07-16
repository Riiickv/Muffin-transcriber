import * as Device from 'expo-device';

import { ModelDef } from './ModelManager';

/**
 * How much model this phone can actually carry.
 *
 * RAM, not CPU. A model is loaded whole into memory and its KV cache sits on top
 * — a phone that can't hold it doesn't run it slowly, it fails to load at all
 * (which is what "Failed to load model" was, once). CPU only decides how long
 * you wait, and waiting is survivable.
 *
 * Thresholds are deliberately conservative: the OS, the launcher and whatever
 * else is open all want RAM too, and Android will kill us before it kills them.
 * Being told a model is "suggested" and then watching it fail is worse than
 * being pointed at a smaller one that works.
 */
export type DeviceTier = 'low' | 'mid' | 'high';

const GB = 1024 * 1024 * 1024;

export function getDeviceTier(): DeviceTier {
  const bytes = Device.totalMemory;
  // Unknown device: assume the weakest. An over-promise costs a failed load; an
  // under-promise costs a slightly rougher transcript.
  if (!bytes) return 'low';
  const gb = bytes / GB;
  if (gb >= 7.5) return 'high'; // 8 GB+ phones
  if (gb >= 5.5) return 'mid'; // 6 GB
  return 'low'; // 4 GB and under
}

/** Roughly what the phone reports, for showing the user. */
export function getTotalMemoryGB(): number | null {
  return Device.totalMemory ? Math.round(Device.totalMemory / GB) : null;
}

/**
 * The heaviest model in a group this tier should be pointed at, by id.
 *
 * Per-group and hand-written rather than derived from file size: what matters is
 * the peak RAM while running, which is the weights PLUS the context, and those
 * don't scale together. Chat models are the exception — they're big enough that
 * a low-end phone gets nothing at all, and saying so honestly beats suggesting
 * something that will crawl.
 */
const RECOMMENDED: Record<DeviceTier, Record<string, string | null>> = {
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

export type ModelGroup = 'whisper' | 'formatter' | 'chat' | 'embedding';

/** The suggested model id for this device, or null if none is honest. */
export function recommendedModelId(group: ModelGroup, tier: DeviceTier = getDeviceTier()): string | null {
  return RECOMMENDED[tier][group] ?? null;
}

/**
 * The group's models with the suggested one first.
 *
 * Only for the setup and the Models screen, where the point is "start here".
 * The catalog's own order is speed-ascending and stays the source of truth for
 * everything else.
 */
export function withRecommendedFirst(models: readonly ModelDef[], group: ModelGroup): ModelDef[] {
  const id = recommendedModelId(group);
  if (!id) return [...models];
  const pick = models.find((m) => m.id === id);
  if (!pick) return [...models];
  return [pick, ...models.filter((m) => m.id !== id)];
}
