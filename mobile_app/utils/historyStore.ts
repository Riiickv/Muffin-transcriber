import * as FileSystemLegacy from 'expo-file-system/legacy';
import { loadSettings } from './settingsStore';
import { createPersistentStore } from './persistentStore';
import { refreshBackup } from './transcriptBackup';

const HISTORY_KEY = 'muffin.history.v1';

export interface HistoryItem {
  id: string;
  timestampISO: string;
  sourceFileName: string;
  language: string;
  rawTranscript: string;
  formattedTranscript?: string;
  summary?: string;
  sourceFilePath?: string;
  audioDurationMs?: number;
  embedding?: number[];
  extractedDates?: { quote: string; name: string; type: 'date' | 'time' }[];
  /** Whisper's detected code ("it"). Names the language in LLM prompts. */
  detectedLanguage?: string;
}

const store = createPersistentStore<HistoryItem[]>(HISTORY_KEY, [], {
  onFirstLoad: (items) => {
    // Fire and forget so we don't block loading.
    if (items.length > 0) pruneHistoryAudio(items);
  },
});

/**
 * Save, then mirror to the user's folder if they asked for that.
 *
 * Every write goes through here rather than store.save directly, so a backup
 * cannot fall out of date because one code path forgot. Fire and forget on
 * purpose: writing to a SAF folder is somebody else's filesystem and can be
 * slow or refused, and none of that is a reason to make saving a transcript
 * wait, or fail.
 */
async function saveHistory(next: HistoryItem[]): Promise<void> {
  await store.save(next);
  void (async () => {
    try {
      const s = await loadSettings();
      if (s.keepTranscriptsAfterUninstall && s.backupFolderUri) {
        await refreshBackup(s.backupFolderUri, next);
      }
    } catch {
      // A backup that cannot be written must never break the save it followed.
    }
  })();
}

export const loadHistory = () => store.load();

async function pruneHistoryAudio(history: HistoryItem[]) {
  try {
    const settings = await loadSettings();
    if (settings.autoDeleteCacheDuration === 'Never') return;

    const thresholdDays = settings.autoDeleteCacheDuration === '1 Week' ? 7 : 30;
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    // Collect which items' audio we actually delete. We DON'T persist the
    // snapshot we were handed - any addOrUpdate/deleteItem that landed while we
    // awaited would be clobbered. Instead we re-read the current cache and apply
    // only the cleared ids.
    const cleared = new Set<string>();
    for (const item of history) {
      if (item.sourceFilePath) {
        const itemTime = new Date(item.timestampISO).getTime();
        if (now - itemTime > thresholdMs) {
          try {
            await FileSystemLegacy.deleteAsync(item.sourceFilePath, { idempotent: true });
          } catch {}
          cleared.add(item.id);
        }
      }
    }

    if (cleared.size > 0) {
      const current = store.get() ?? history;
      const next = current.map((h) =>
        cleared.has(h.id) ? { ...h, sourceFilePath: undefined } : h
      );
      await saveHistory(next);
    }
  } catch (e) {
    console.error('Failed to prune history audio', e);
  }
}

// Merge a patch into an existing item. Returns false (writes nothing) if the
// item was deleted in the meantime - background enrichment must never
// resurrect a memo the user removed, and merging over the CURRENT stored item
// (not a caller snapshot) preserves concurrent edits like renames or the
// audio-duration backfill.
export async function updateHistoryItem(id: string, patch: Partial<HistoryItem>): Promise<boolean> {
  const current = store.get() ?? (await store.load());
  const index = current.findIndex((h) => h.id === id);
  if (index < 0) return false;
  const next = current.map((h, i) => (i === index ? { ...h, ...patch } : h));
  await saveHistory(next);
  return true;
}

export function useHistory() {
  const items = store.useValue();

  const addOrUpdate = async (item: HistoryItem) => {
    const current = store.get() ?? (await store.load());
    const index = current.findIndex((h) => h.id === item.id);
    const next =
      index >= 0
        ? current.map((h, i) => (i === index ? item : h))
        : [item, ...current];
    await saveHistory(next);
  };

  const deleteItem = async (id: string) => {
    const current = store.get() ?? (await store.load());
    const itemToDelete = current.find((h) => h.id === id);
    if (itemToDelete?.sourceFilePath) {
      FileSystemLegacy.deleteAsync(itemToDelete.sourceFilePath, { idempotent: true }).catch(() => {});
    }
    await saveHistory(current.filter((h) => h.id !== id));
  };

  return { items, addOrUpdate, deleteItem };
}
