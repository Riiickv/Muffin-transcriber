import notifee, {
  AndroidImportance,
  AndroidForegroundServiceType,
  EventType,
  Event,
} from 'react-native-notify-kit';

// Alias imports (not relative): these MUST resolve to the SAME module instances
// the React components use, or the service would talk to a duplicate
// downloadManager with none of the real downloads in it. (See the i18n
// duplicate-module lesson.)
import {
  getDownloads,
  pauseDownload,
  resumeDownload,
  cancelDownload,
  onDownloadsChanged,
  subscribeDownloads,
} from '@/utils/downloadManager';
import {
  WHISPER_MODELS,
  FORMATTER_MODELS,
  CHAT_MODELS,
  EMBEDDING_MODELS,
  modelName,
} from '@/utils/ModelManager';
import { t } from '@/utils/i18n';

// The Android foreground service that keeps a download alive while the app is
// backgrounded or closed, with a live notification carrying the same
// pause/resume + cancel buttons as the in-app UI. Uses react-native-notify-kit
// (a maintained, new-architecture notifee fork - the original notifee has no new
// arch support and would not build here).
//
// registerForegroundService + the event handlers are set up once from the JS
// entry (index.js), so they're live even when the app is launched straight into
// the background to service a button press.

const CHANNEL_ID = 'downloads';
const NOTIF_ID = 'muffin-download';
const UPDATE_MS = 800; // don't repaint the notification on every byte

let initialised = false;
let channelReady = false;
let permissionAsked = false;
let serviceRunning = false;
let lastPaint = 0;

const ALL_MODELS = [...WHISPER_MODELS, ...FORMATTER_MODELS, ...CHAT_MODELS, ...EMBEDDING_MODELS];
const labelFor = (id: string): string => {
  const def = ALL_MODELS.find((m) => m.id === id);
  return def ? modelName(def) : id;
};

function summarize() {
  const dl = getDownloads();
  const ids = Object.keys(dl);
  if (ids.length === 0) return null;
  const avg = ids.reduce((s, id) => s + (dl[id].progress || 0), 0) / ids.length;
  return { id: ids[0], avg, paused: dl[ids[0]].status === 'paused' };
}

async function paint(): Promise<void> {
  const s = summarize();
  if (!s) {
    await stopService();
    return;
  }
  try {
    if (!permissionAsked) {
      permissionAsked = true;
      await notifee.requestPermission();
    }
    if (!channelReady) {
      await notifee.createChannel({ id: CHANNEL_ID, name: 'Downloads', importance: AndroidImportance.LOW });
      channelReady = true;
    }
    const pct = Math.round(s.avg * 100);
    const title = (t('downloads.downloadingModel') || 'Downloading {model}').replace('{model}', labelFor(s.id));
    await notifee.displayNotification({
      id: NOTIF_ID,
      title,
      body: `${pct}%`,
      android: {
        channelId: CHANNEL_ID,
        asForegroundService: true,
        foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_DATA_SYNC],
        smallIcon: 'ic_launcher',
        ongoing: true,
        onlyAlertOnce: true,
        progress: { max: 100, current: pct },
        pressAction: { id: 'default', launchActivity: 'default' },
        actions: [
          {
            title: s.paused ? t('downloads.resume') || 'Resume' : t('downloads.pause') || 'Pause',
            pressAction: { id: s.paused ? 'resume' : 'pause' },
          },
          { title: t('downloads.cancel') || 'Cancel', pressAction: { id: 'cancel' } },
        ],
      },
    });
    serviceRunning = true;
  } catch (e) {
    console.error('foreground service paint failed', e);
  }
}

async function stopService(): Promise<void> {
  if (!serviceRunning) return;
  serviceRunning = false;
  try {
    await notifee.stopForegroundService();
  } catch {}
  try {
    await notifee.cancelNotification(NOTIF_ID);
  } catch {}
}

// A notification button was pressed (either app-alive or headless). The service
// keeps the process alive, so the download manager's state is available here.
function handleEvent(event: Event): void {
  if (event.type !== EventType.ACTION_PRESS) return;
  const id = event.detail?.pressAction?.id;
  const s = summarize();
  if (!s || !id) return;
  if (id === 'pause') pauseDownload(s.id);
  else if (id === 'resume') resumeDownload(s.id);
  else if (id === 'cancel') cancelDownload(s.id);
}

/** Called ONCE from index.js, before the app renders. */
export function initDownloadForegroundService(): void {
  if (initialised) return;
  initialised = true;

  // The runner promise never resolves; the service ends via stopForegroundService().
  notifee.registerForegroundService(() => new Promise<void>(() => {}));
  notifee.onBackgroundEvent(async (event) => handleEvent(event));
  notifee.onForegroundEvent((event) => handleEvent(event));

  // Structural changes (start / pause / resume / cancel / finish) repaint at once
  // so the buttons and the appear/vanish are immediate.
  onDownloadsChanged(() => {
    lastPaint = Date.now();
    paint();
  });
  // Progress ticks repaint at most a few times a second.
  subscribeDownloads(() => {
    const now = Date.now();
    if (now - lastPaint < UPDATE_MS) return;
    lastPaint = now;
    paint();
  });
}
