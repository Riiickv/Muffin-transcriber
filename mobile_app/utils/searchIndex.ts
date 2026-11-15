import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { EMBEDDING_ID, embedQuestion, generateEmbedding, helperInstalled } from './EmbeddingEngine';
import { MEANING_MIN_NOTES, clearestByMeaning, packVector, textMark } from './chatPlan';

// The vectors of search by meaning, one per note, in a file of their own.
//
// They used to sit inside each history item. All transcriptions are one row
// of the app's storage, that storage stops at 6 MB in all, Android reads a row
// through a 2 MB window, and a vector written out in full is about 8 KB: a few
// hundred notes of vectors alone would have filled it. Nothing in this file is
// worth keeping: lose it and the notes are read again by the helper model.
// Sources and sizes: docs/chat-research.md, section 13.

type Entry = { m: string; v: number[] };
type Index = { model: string; notes: Record<string, Entry> };
export type IndexNote = { id: string; text: string };

const FILE = (FileSystem.documentDirectory || '') + 'search-index.json';
const SAVE_EVERY = 8;
/** Notes the helper model failed on in a row before a run is abandoned. */
const GIVE_UP_AFTER = 3;

let cached: Index | null = null;
let loading: Promise<Index> | null = null;

function load(): Promise<Index> {
  if (cached) return Promise.resolve(cached);
  if (!loading) {
    loading = (async () => {
      let index: Index = { model: EMBEDDING_ID, notes: {} };
      try {
        const info = await FileSystem.getInfoAsync(FILE);
        if (info.exists) {
          const read = JSON.parse(await FileSystem.readAsStringAsync(FILE));
          // Vectors of another model have the same length and mean nothing here.
          if (read && read.model === EMBEDDING_ID && read.notes && typeof read.notes === 'object') index = read;
        }
      } catch (e) {
        console.warn('Search index unreadable, starting again', e);
      }
      cached = index;
      loading = null;
      return index;
    })();
  }
  return loading;
}

async function save(index: Index): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(FILE, JSON.stringify(index));
  } catch (e) {
    console.warn('Search index not saved', e);
  }
}

let running = false;
let held = 0;
let gaveUp = false;

/** While an answer is being written, reading notes waits: the two would fight for the processor. */
export function holdIndexing(on: boolean) {
  held = Math.max(0, held + (on ? 1 : -1));
}

/**
 * Has the helper model read every note it has not read yet, or whose text
 * changed since. One run at a time; does nothing without the helper model.
 */
export async function indexNotes(notes: IndexNote[]): Promise<void> {
  if (running || gaveUp || Platform.OS === 'web') return;
  running = true;
  try {
    const index = await load();
    let changed = false;
    const alive = new Set(notes.map((n) => n.id));
    for (const id of Object.keys(index.notes)) {
      if (!alive.has(id)) {
        delete index.notes[id];
        changed = true;
      }
    }
    const todo = notes.filter((n) => n.text.trim() && index.notes[n.id]?.m !== textMark(n.text));
    if (todo.length > 0 && (await helperInstalled())) {
      let unsaved = 0;
      let failures = 0;
      for (const note of todo) {
        while (held > 0) await new Promise((r) => setTimeout(r, 400));
        const vector = await generateEmbedding(note.text);
        if (!vector) {
          if (++failures >= GIVE_UP_AFTER) {
            gaveUp = true;
            break;
          }
          continue;
        }
        failures = 0;
        index.notes[note.id] = { m: textMark(note.text), v: packVector(vector) };
        changed = true;
        if (++unsaved >= SAVE_EVERY) {
          await save(index);
          unsaved = 0;
        }
      }
    }
    if (changed) await save(index);
  } catch (e) {
    console.warn('Indexing notes for search failed', e);
  } finally {
    running = false;
  }
}

/** The one note a question is about, by meaning, or null. Only notes already read by the helper model count. */
export async function noteByMeaning(question: string, notes: IndexNote[]): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const index = await load();
  const known = notes.filter((n) => index.notes[n.id]).map((n) => ({ id: n.id, vector: index.notes[n.id].v }));
  if (known.length < MEANING_MIN_NOTES) return null;
  const asked = await embedQuestion(question);
  return asked ? clearestByMeaning(asked, known) : null;
}
