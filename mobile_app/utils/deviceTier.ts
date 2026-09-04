import * as Device from 'expo-device';

import { ModelDef } from './ModelManager';
import { DeviceTier, ModelGroup, tierForMemoryBytes, recommendedForTier } from './deviceTierData';

/**
 * How much model this phone can actually carry.
 *
 * The TIERS are RAM. A model is loaded whole into memory and its KV cache sits
 * on top - a phone that can't hold it doesn't run it slowly, it fails to load at
 * all (which is what "Failed to load model" was, once). So RAM is what decides
 * which tier a device belongs to, and that part has not changed.
 *
 * The RECOMMENDATIONS are not RAM alone, and used to be. The old rule here said
 * "CPU only decides how long you wait, and waiting is survivable", and measuring
 * it proved that false: on a 16 GB flagship the model this table recommended ran
 * at 0.38x to 0.81x realtime, so a two minute voice message cost between two and
 * five minutes and heated the phone doing it. RAM said yes and the wait was
 * unusable. Fitting in memory is now a necessary condition for a recommendation
 * rather than a sufficient one; see the note on the high tier in
 * deviceTierData.ts for the numbers.
 *
 * The thresholds and recommendations live in deviceTierData.ts (pure, tested);
 * this reads the real device memory.
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
