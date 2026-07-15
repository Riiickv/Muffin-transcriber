import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Two different haptic vocabularies, one per platform — because the generic
 * cross-platform API feels cheap on Android.
 *
 * `notificationAsync` / `impactAsync` are modelled on iOS's Taptic Engine. On
 * Android, expo maps them onto raw Vibrator patterns — timed buzzes, not the
 * device's tuned haptic primitives. That's the "cheap" feeling: Android's own
 * guidance is "favor rich and clear haptics over buzzy haptics"
 * (developer.android.com/develop/ui/views/haptics/haptics-principles).
 *
 * `performAndroidHapticsAsync` hits HapticFeedbackConstants instead — the same
 * primitives the OS uses for its own keyboard and switches, tuned per device by
 * the manufacturer. Crisp on hardware that has a good actuator, and correctly
 * silent on hardware that doesn't.
 *
 * So: Android gets Confirm/Reject/Toggle/Tick. iOS keeps the Taptic API, which
 * is already excellent.
 */

const isAndroid = Platform.OS === 'android';
const isIOS = Platform.OS === 'ios';

// Fire-and-forget: haptics are decoration. A rejection means no actuator —
// nothing to do, and nothing the user needs told.
const fire = (run: () => Promise<void>) => {
  if (!isAndroid && !isIOS) return;
  run().catch(() => {});
};

const android = (effect: Haptics.AndroidHaptics) => Haptics.performAndroidHapticsAsync(effect);

export const haptics = {
  /** Button presses. The workhorse — keep it light, it fires constantly. */
  tap: () =>
    fire(() =>
      isAndroid
        ? android(Haptics.AndroidHaptics.Virtual_Key)
        : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)
    ),

  /** Moving through options — lighter than a tap. */
  select: () =>
    fire(() =>
      isAndroid ? android(Haptics.AndroidHaptics.Clock_Tick) : Haptics.selectionAsync()
    ),

  /** A switch going on/off. Android has distinct effects for each direction. */
  toggle: (on: boolean) =>
    fire(() =>
      isAndroid
        ? android(on ? Haptics.AndroidHaptics.Toggle_On : Haptics.AndroidHaptics.Toggle_Off)
        : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    ),

  /** Work finished. Was the buzziest offender on Android. */
  success: () =>
    fire(() =>
      isAndroid
        ? android(Haptics.AndroidHaptics.Confirm)
        : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    ),

  /** Work failed. */
  error: () =>
    fire(() =>
      isAndroid
        ? android(Haptics.AndroidHaptics.Reject)
        : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    ),

  /** Deliberate, weighty — recording start/stop. Rare by design. */
  impact: () =>
    fire(() =>
      isAndroid
        ? android(Haptics.AndroidHaptics.Long_Press)
        : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    ),
};

// Back-compat alias
export const triggerCrispPop = haptics.tap;
