import { Platform } from 'react-native';

// Lazy-load so importing this module never touches the native package on web.
let ReactNativeHapticFeedback: any;
function getHapticFeedback() {
  if (!ReactNativeHapticFeedback && Platform.OS !== 'web') {
    ReactNativeHapticFeedback = require('react-native-haptic-feedback').default;
  }
  return ReactNativeHapticFeedback;
}

const options = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: true,
};

// Preferred → fallback pairs. `impactSoft` is iOS 13+ only — falls back to
// `impactLight` on older iOS and Android where Soft isn't defined by the
// native lib. `selection` is the picker-wheel tick, lighter than any impact.
const tryTrigger = (preferred: string, fallback: string) => {
  const api = getHapticFeedback();
  if (!api) return;
  try {
    api.trigger(preferred, options);
  } catch {
    try {
      api.trigger(fallback, options);
    } catch {
      /* no-op */
    }
  }
};

export const haptics = {
  // Subtle tap — the "modern" iOS 13+ feel, not a chunky vibration.
  tap: () => tryTrigger('impactSoft', 'impactLight'),
  select: () => tryTrigger('selection', 'impactLight'),
  success: () => tryTrigger('notificationSuccess', 'impactLight'),
  error: () => tryTrigger('notificationError', 'impactLight'),
};

// Back-compat alias
export const triggerCrispPop = haptics.tap;
