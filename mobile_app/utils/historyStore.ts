import { useEffect, useState } from 'react';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { loadSettings } from './settingsStore';
import { createNoteStore, isComplete, type NoteStoreStatus } from './noteStore';
import { legacyRow, noteFiles } from './noteFiles';
import { refreshBackup } from './transcriptBackup';

// The one storage value every transcription used to share. On Android it
// could be written past 2 MB and not read back, and a failed read was taken
// for an empty library and saved. It is read once more to move the notes into
// files of their own (utils/noteStore.ts) and never written again.
// What was measured: docs/storage-research.md.
const LEGACY_KEY = 'muffin.history.v1';

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
  /** Not written any more: vectors live in utils/searchIndex.ts. Dropped from old items when they are moved. */
  embedding?: number[];
  extractedDates?: { quote: string; name: string; type: 'date' | 'time' }[];
  /** Whisper's detected code ("it"). Names the language in LLM prompts. */
  detectedLanguage?: string;
}

const store = createNoteStore<HistoryItem>({
  files: noteFiles,
  legacy: legacyRow(LEGACY_KEY),
  // Old items carry a vector of about 8 KB each, from a helper model no
  // longer in use. It is left behind when the note moves to its file.
  fromLegacy: (raw) => {
    if (!raw || typeof raw !== 'object' || typeof (raw as HistoryItem).id !== 'string') return null;
    const { embedding: _dropped, ...rest } = raw as HistoryItem;
    return rest;
  },
  onFirstLoad: (items) => {
    // Fire and forget so we don't block loading.
    if (items.length > 0) void pruneHistoryAudio(items);
  },
});

/**
 * Mirror to the user's folder if they asked for that.
 *
 * Called after every change rather than from each caller, so a backup cannot
 * fall out of date because one code path forgot. Fire and forget on purpose:
 * writing to a SAF folder is somebody else's filesystem and can be slow or
 * refused, and none of that is a reason to make saving a transcript wait, or
 * fail.
 *
 * NOT when some notes could not be read. The backup is written from what is
 * in memory, over the file already there; memory without those notes would
 * take them out of the one copy meant to outlive the app.
 */
function mirrorToBackup(): void {
  void (async () => {
    try {
      if (!isComplete(store.status())) return;
      const s = await loadSettings();
      if (s.keepTranscriptsAfterUninstall && s.backupFolderUri) {
        await refreshBackup(s.backupFolderUri, store.get() ?? []);
      }
    } catch {
      // A backup that cannot be written must never break the save it followed.
    }
  })();
}

export const loadHistory = () => store.load();

/** After loadHistory: false when the list is missing notes that exist and could not be read. */
export const historyIsComplete = () => isComplete(store.status());

async function pruneHistoryAudio(history: HistoryItem[]) {
  try {
    const settings = await loadSettings();
    if (settings.autoDeleteCacheDuration === 'Never') return;

    const thresholdDays = settings.autoDeleteCacheDuration === '1 Week' ? 7 : 30;
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    // Each cleared note is patched on its own, over whatever it is by then:
    // an edit or a delete that landed while the audio was being removed stays.
    let cleared = false;
    for (const item of history) {
      if (item.sourceFilePath) {
        const itemTime = new Date(item.timestampISO).getTime();
        if (now - itemTime > thresholdMs) {
          try {
            await FileSystemLegacy.deleteAsync(item.sourceFilePath, { idempotent: true });
          } catch {}
          if (await store.patch(item.id, { sourceFilePath: undefined })) cleared = true;
        }
      }
    }
    if (cleared) mirrorToBackup();
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
  const found = await store.patch(id, patch);
  if (found) mirrorToBackup();
  return found;
}

const NONE: HistoryItem[] = [];

/** `read` must be a constant (one of the two below), or the effect would run again on every render. */
function useStore<V>(read: () => V): V {
  const [value, setValue] = useState<V>(read);

  useEffect(() => {
    let mounted = true;
    const sync = () => {
      if (mounted) setValue(read());
    };
    const unsubscribe = store.subscribe(sync);
    void store.load().then(sync);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [read]);

  return value;
}

const readItems = () => store.get() ?? NONE;
const readStatus = () => store.status();

/** Whether the list on screen is everything there is. `loaded` is false until the first read has finished. */
export function useHistoryStatus(): NoteStoreStatus & { complete: boolean } {
  const status = useStore(readStatus);
  return { ...status, complete: isComplete(status) };
}

export function useHistory() {
  const items = useStore(readItems);

  const addOrUpdate = async (item: HistoryItem) => {
    await store.put(item);
    mirrorToBackup();
  };

  const deleteItem = async (id: string) => {
    const itemToDelete = (await store.load()).find((h) => h.id === id);
    if (itemToDelete?.sourceFilePath) {
      FileSystemLegacy.deleteAsync(itemToDelete.sourceFilePath, { idempotent: true }).catch(() => {});
    }
    await store.remove(id);
    mirrorToBackup();
  };

  return { items, addOrUpdate, deleteItem };
}
