import { Platform } from 'react-native';

/**
 * User-facing UI scale, three fixed steps - a per-app density override (see the
 * Kotlin module for the mechanism). Values outside these three are never
 * offered: lower breaks tap targets, higher re-creates the overflow bugs.
 */
export type UiScaleStep = 'compact' | 'normal' | 'comfy';

export const UI_SCALE_VALUES: Record<UiScaleStep, number> = {
  compact: 0.9,
  normal: 1.0,
  comfy: 1.1,
};

// Lazy, android-only require: at import time on any other platform the native
// module doesn't exist and requireNativeModule would throw.
let mod: any;
function native() {
  if (!mod && Platform.OS === 'android') {
    mod = require('./src/UiScaleModule').default;
  }
  return mod;
}

/** The saved scale (1.0 when unset or unavailable). */
export function getUiScale(): number {
  try {
    return native()?.getUiScale() ?? 1.0;
  } catch {
    return 1.0;
  }
}

/** Closest step for a saved value, for showing the current selection. */
export function stepFromScale(scale: number): UiScaleStep {
  if (scale <= 0.95) return 'compact';
  if (scale >= 1.05) return 'comfy';
  return 'normal';
}

/**
 * Save and apply a scale. The app's activity RECREATES to re-layout - the
 * screen visibly rebuilds; warn the user before calling.
 */
export async function setUiScale(step: UiScaleStep): Promise<void> {
  await native()?.setUiScale(UI_SCALE_VALUES[step]);
}
