import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// A single system notification that mirrors a running download when the app is
// backgrounded. Stage 3a: it's posted on the way to the background with the
// last-known progress; it does not tick up on its own yet (that needs the
// foreground service - Stage 3b). Every call is wrapped: a notification problem
// must never take the download or the app down with it.

const CHANNEL_ID = 'downloads';
const NOTIF_ID = 'muffin-download-progress';

let channelReady = false;
let permissionGranted = false;
let handlerSet = false;

function ensureHandler() {
  if (handlerSet) return;
  handlerSet = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // older/newer shape - ignore, defaults are fine
  }
}

/**
 * Make sure we have a channel and permission. Called when a download STARTS, so
 * the permission prompt lands while the app is in the foreground and the user
 * just chose to download - not later, out of nowhere, while backgrounded.
 */
export async function ensureNotificationSetup(): Promise<boolean> {
  try {
    ensureHandler();
    if (Platform.OS === 'android' && !channelReady) {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Downloads',
        importance: Notifications.AndroidImportance.LOW,
        showBadge: false,
      });
      channelReady = true;
    }
    let status = (await Notifications.getPermissionsAsync()).status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    permissionGranted = status === 'granted';
    return permissionGranted;
  } catch (e) {
    console.error('notification setup failed', e);
    return false;
  }
}

/** Show or update the ongoing download notification. No-op without permission. */
export async function showDownloadNotification(title: string, body: string): Promise<void> {
  if (!permissionGranted) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIF_ID,
      content: {
        title,
        body,
        sticky: true,
        autoDismiss: false,
        // @ts-ignore - Android-only, harmless elsewhere
        channelId: CHANNEL_ID,
      },
      trigger: null,
    });
  } catch (e) {
    console.error('show download notification failed', e);
  }
}

/** Clear the download notification (called when the app returns to the front). */
export async function dismissDownloadNotification(): Promise<void> {
  try {
    await Notifications.dismissNotificationAsync(NOTIF_ID);
  } catch {
    // already gone
  }
}
