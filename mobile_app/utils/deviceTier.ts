import * as Device from 'expo-device';

import { ModelDef } from './ModelManager';
import { DeviceTier, ModelGroup, tierForMemoryBytes, recommendedForTier } from './deviceTierData';

/**
 * How much model this phone can actually carry.
 *
 * RAM, not CPU. A model is loaded whole into memory and its KV cache sits on top
 * - a phone that can't hold it doesn't run it slowly, it fails to load at all
 * (which is what "Failed to load model" was, once). CPU only decides how long
 * you wait, and waiting is survivable. The thresholds and recommendations live
 * in deviceTierData.ts (pure, tested); this reads the real device memory.
 */
export type { DeviceTier, ModelGroup } from './deviceTierData';

const GB = 1024 * 1024 * 1024;

export function getDeviceTier(): DeviceTier {
  return tierForMemoryBytes(Device.totalMemory);
}

/** Roughly what the phone reports, for showing the user. */
export function getTotalMemoryGB(): number | null {
  return Device.totalMemory ? Math.round(Device.totalMemory / GB) : null;
}

/** The suggested model id for this device, or null if none is honest. */
export function recommendedModelId(group: ModelGroup, tier: DeviceTier = getDeviceTier()): string | null {
  return recommendedForTier(group, tier);
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
