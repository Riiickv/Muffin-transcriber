import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  byNewest,
  createNoteStore,
  decodeNote,
  encodeNote,
  isComplete,
  noteStem,
  type LegacyRow,
  type NoteFiles,
} from '../utils/noteStore.ts';
import { readWithRescue } from '../utils/valueStore.ts';

// The store is run here against a folder held in memory that can be told to
// fail, to hand back a damaged file, or to stop dead at any single step, the
// way a killed app or a flat battery would. What Android itself does with a
// value past 2 MB was measured separately: docs/storage-research.md.

type Note = {
  id: string;
  timestampISO: string;
  rawTranscript: string;
  summary?: string;
  embedding?: number[];
};

class Stop extends Error {}

/** Shared by the folder and the old value, so "the process died" covers both. */
function makeClock() {
  return { steps: 0, stopAt: Infinity, dead: false, log: [] as string[] };
}
type Clock = ReturnType<typeof makeClock>;

/** True when this step is the one the process dies in. Throws when it is already dead. */
function tick(clock: Clock, what: string): boolean {
  if (clock.dead) throw new Stop('dead');
  clock.steps++;
  clock.log.push(what);
  if (clock.steps === clock.stopAt) {
    clock.dead = true;
    return true;
  }
  return false;
}

function makeFolder(clock: Clock = makeClock(), options: { splitMove?: boolean; powerCut?: boolean } = {}) {
  const disk = new Map<string, string>();
  /**
   * Files whose text the phone has accepted and not yet put on disk. Nothing
   * in the app can force that, so a power cut leaves each of them as a name
   * with nothing in it, while the renames done meanwhile stay done.
   */
  const pending = new Set<string>();
  const cut = () => {
    pending.forEach((name) => disk.set(name, ''));
    pending.clear();
  };
  /** The process dies at this step. As a power cut when asked for, otherwise as a killed app. */
  const dies = (what: string): boolean => {
    const stop = tick(clock, what);
    if (stop && options.powerCut) cut();
    return stop;
  };
  const rules = {
    /** Lets a test hold one step back, the way a slow disk would. */
    wait: (_what: string): Promise<void> | void => undefined,
    failList: false,
    failWrite: (_name: string) => false,
    failRead: (_name: string) => false,
    failMove: (_from: string, _to: string) => false,
    /** What actually lands on disk, for a file system that damages what it is given. */
    damage: (_name: string, text: string) => text,
  };
  const files: NoteFiles = {
    async list() {
      if (dies('list')) throw new Stop();
      if (rules.failList) throw new Error('cannot list');
      return Array.from(disk.keys());
    },
    async read(name) {
      if (dies(`read ${name}`)) throw new Stop();
      const text = disk.get(name);
      if (text === undefined) throw new Error(`missing ${name}`);
      if (rules.failRead(name)) throw new Error('read error');
      return text;
    },
    async write(name, text) {
      // A write is not all-or-nothing: stopping in it leaves half a file
      // (a killed app) or an empty one (a power cut).
      if (dies(`write ${name}`)) {
        disk.set(name, options.powerCut ? '' : text.slice(0, Math.floor(text.length / 2)));
        throw new Stop();
      }
      await rules.wait(`write ${name}`);
      if (rules.failWrite(name)) {
        disk.set(name, text.slice(0, Math.floor(text.length / 2)));
        throw new Error('disk full');
      }
      disk.set(name, rules.damage(name, text));
      pending.add(name);
    },
    async move(from, to) {
      const stop = dies(`move ${from} ${to}`);
      // iOS deletes the destination and then renames: a stop can fall between.
      if (stop && options.splitMove) disk.delete(to);
      if (stop) throw new Stop();
      if (rules.failMove(from, to)) throw new Error('cannot move');
      const text = disk.get(from);
      if (text === undefined) throw new Error(`missing ${from}`);
      disk.set(to, text);
      disk.delete(from);
      if (pending.delete(from)) pending.add(to);
      else pending.delete(to);
    },
    async remove(name) {
      if (dies(`remove ${name}`)) throw new Stop();
      disk.delete(name);
      pending.delete(name);
    },
  };
  return { files, disk, rules, clock, cut };
}

function makeLegacy(value: string | null, clock: Clock = makeClock()) {
  const state = {
    value,
    failRead: false,
    failRemove: false,
    reads: 0,
    beforeRemove: () => {},
  };
  const row: LegacyRow = {
    async read() {
      if (tick(clock, 'legacy read')) throw new Stop();
      state.reads++;
      // The message Android gives for a value past 2,097,099 bytes (measured).
      if (state.failRead) throw new Error('Row too big to fit into CursorWindow requiredPos=0, totalRows=1');
      return state.value;
    },
    async remove() {
      if (tick(clock, 'legacy remove')) throw new Stop();
      if (state.failRemove) throw new Error('cannot remove');
      state.beforeRemove();
      state.value = null;
    },
  };
  return { row, state };
}

/** The same cleaning utils/historyStore.ts applies: the old vector is left behind. */
const fromLegacy = (raw: unknown): Note | null => {
  if (!raw || typeof raw !== 'object' || typeof (raw as Note).id !== 'string') return null;
  const { embedding: _dropped, ...rest } = raw as Note;
  return rest;
};

function open(files: NoteFiles, legacy: LegacyRow, onFirstLoad?: (notes: Note[]) => void) {
  const problems: string[] = [];
  const store = createNoteStore<Note>({
    files,
    legacy,
    fromLegacy,
    onFirstLoad,
    log: (message) => problems.push(message),
  });
  return Object.assign(store, { problems });
}

const note = (n: number, over: Partial<Note> = {}): Note => ({
  id: String(1760000000000 + n),
  timestampISO: new Date(Date.UTC(2026, 8, 1, 10, n)).toISOString(),
  rawTranscript: `Nota ${n}: perché "così" è più\nlungo di così 🎙️ € \\ fine`,
  ...over,
});

/** Newest first, as the app has always kept the list. */
const library = (count: number): Note[] =>
  Array.from({ length: count }, (_, i) => note(count - i, { embedding: [0.25, -0.5, i] }));

const cleaned = (notes: Note[]) => notes.map((n) => fromLegacy(n) as Note);
const stem = (n: Note) => noteStem(n.id) as string;

// --- names and order --------------------------------------------------------

test('a timestamp id is its own file name, and nothing else can leave the folder', () => {
  assert.equal(noteStem('1760000000001'), 'n1760000000001');
  const odd = noteStem('../../databases/RKStorage') as string;
  assert.match(odd, /^x[0-9a-f]+$/, 'spelled out in hex, so no dots or slashes survive');
  assert.notEqual(noteStem('Abc'), noteStem('abc'), 'two ids differing only in case get two files');
  assert.equal(noteStem(''), null);
  assert.equal(noteStem('é'.repeat(100)), null, 'too long to be a file name: refused, never cut short');
  assert.equal(noteStem(undefined as unknown as string), null);
});

test('newest first, and the same order at every start', () => {
  const a = note(1);
  const b = note(2);
  const twin = { ...note(2), id: '1760000000099' };
  const noDate = { id: '5', timestampISO: undefined as unknown as string, rawTranscript: '' };
  const sorted = [noDate, a, twin, b].sort(byNewest).map((n) => n.id);
  assert.deepEqual(sorted, [twin.id, b.id, a.id, noDate.id]);
  assert.deepEqual([b, noDate, a, twin].sort(byNewest).map((n) => n.id), sorted);
});

test('a file is a note, a write that stopped halfway, or something not ours to judge', () => {
  const n = note(1);
  const text = encodeNote(n);
  assert.deepEqual(decodeNote(text, stem(n)), { kind: 'ok', note: n });
  assert.equal(decodeNote(text.slice(0, text.length - 5), stem(n)).kind, 'torn');
  assert.equal(decodeNote('', stem(n)).kind, 'empty', 'what a power cut leaves: a name and no text');
  assert.equal(decodeNote(JSON.stringify({ v: 2, note: n }), stem(n)).kind, 'other', 'a later format');
  assert.equal(decodeNote(text, 'n999').kind, 'other', 'a note sitting in another note\'s file');
  assert.equal(decodeNote('null', stem(n)).kind, 'other');
});

// --- the ordinary life of a note -------------------------------------------

test('nothing stored: an empty library that is known to be empty', async () => {
  const { files } = makeFolder();
  const store = open(files, makeLegacy(null).row);
  assert.equal(store.get(), null);
  assert.equal(store.status().loaded, false);
  assert.deepEqual(await store.load(), []);
  assert.ok(isComplete(store.status()));
});

test('each note is its own file, and a second start reads them all back in order', async () => {
  const { files, disk } = makeFolder();
  const store = open(files, makeLegacy(null).row);
  await store.put(note(1));
  await store.put(note(3));
  await store.put(note(2));
  assert.deepEqual(store.get()!.map((n) => n.id), [note(3).id, note(2).id, note(1).id]);
  assert.deepEqual(Array.from(disk.keys()).sort(), [note(1), note(2), note(3)].map((n) => `${stem(n)}.json`).sort());

  const again = open(files, makeLegacy(null).row);
  assert.deepEqual(await again.load(), [note(3), note(2), note(1)]);
  assert.ok(isComplete(again.status()));
});

test('changing one note writes that note only', async () => {
  const { files, clock } = makeFolder();
  const store = open(files, makeLegacy(null).row);
  for (let i = 1; i <= 5; i++) await store.put(note(i));
  clock.log.length = 0;
  assert.equal(await store.patch(note(2).id, { summary: 'breve' }), true);
  assert.ok(clock.log.length > 0);
  assert.ok(clock.log.every((line) => line.includes(stem(note(2)))), `touched other files: ${clock.log.join(', ')}`);
});

test('an update keeps, beside the note, the copy it had when the app started', async () => {
  const { files, disk } = makeFolder();
  await open(files, makeLegacy(null).row).put(note(1));
  assert.equal(disk.has(`${stem(note(1))}.bak`), false, 'a note made in this session has no older copy to keep');

  const store = open(files, makeLegacy(null).row);
  await store.patch(note(1).id, { summary: 'uno' });
  await store.patch(note(1).id, { summary: 'due' });
  await store.patch(note(1).id, { summary: 'tre' });
  // Not 'due': three edits in a row may all still be waiting to reach the
  // disk, and the spare copy has to be one that is certainly there.
  assert.deepEqual(decodeNote(disk.get(`${stem(note(1))}.bak`)!, stem(note(1))), { kind: 'ok', note: note(1) });
  assert.deepEqual(decodeNote(disk.get(`${stem(note(1))}.json`)!, stem(note(1))), {
    kind: 'ok',
    note: note(1, { summary: 'tre' }),
  });
  assert.equal(disk.has(`${stem(note(1))}.tmp`), false);
});

test('patching a note that was deleted writes nothing and brings nothing back', async () => {
  const { files, disk } = makeFolder();
  const store = open(files, makeLegacy(null).row);
  await store.put(note(1));
  await store.remove(note(1).id);
  assert.equal(await store.patch(note(1).id, { summary: 'late enrichment' }), false);
  assert.equal(disk.size, 0);
  assert.deepEqual(store.get(), []);
});

test('deleting a note removes every copy of it', async () => {
  const { files, disk } = makeFolder();
  await open(files, makeLegacy(null).row).put(note(1));
  const store = open(files, makeLegacy(null).row);
  await store.patch(note(1).id, { summary: 'two copies now' });
  assert.equal(disk.size, 2);
  await store.put(note(2));
  await store.remove(note(1).id);
  assert.deepEqual(Array.from(disk.keys()), [`${stem(note(2))}.json`]);
});

test('two quick changes to one note land in order, whole', async () => {
  const { files, disk } = makeFolder();
  const store = open(files, makeLegacy(null).row);
  await store.put(note(1));
  await Promise.all([
    store.patch(note(1).id, { summary: 'first' }),
    store.patch(note(1).id, { rawTranscript: 'second' }),
    store.patch(note(1).id, { summary: 'third' }),
  ]);
  const onDisk = decodeNote<Note>(disk.get(`${stem(note(1))}.json`)!, stem(note(1)));
  assert.deepEqual(onDisk, { kind: 'ok', note: note(1, { rawTranscript: 'second', summary: 'third' }) });
});

test('a slow write is not overtaken by the change that came after it', async () => {
  const { files, disk, rules } = makeFolder();
  const store = open(files, makeLegacy(null).row);
  await store.put(note(1));
  let held = false;
  rules.wait = (what) => {
    if (held || !what.startsWith('write')) return;
    held = true;
    return new Promise((resolve) => setTimeout(resolve, 30));
  };
  const first = store.patch(note(1).id, { summary: 'first, slow' });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = store.patch(note(1).id, { summary: 'second, quick' });
  await Promise.all([first, second]);
  assert.deepEqual(decodeNote(disk.get(`${stem(note(1))}.json`)!, stem(note(1))), {
    kind: 'ok',
    note: note(1, { summary: 'second, quick' }),
  });
  assert.deepEqual(store.problems, []);
});

test('the people watching hear about every change', async () => {
  const { files } = makeFolder();
  const store = open(files, makeLegacy(null).row);
  let calls = 0;
  const stop = store.subscribe(() => calls++);
  await store.load();
  const afterLoad = calls;
  assert.ok(afterLoad >= 1, 'the load itself is a change: loaded goes from false to true');
  await store.put(note(1));
  assert.ok(calls > afterLoad);
  stop();
  const seen = calls;
  await store.put(note(2));
  assert.equal(calls, seen);
});

test('no limit on the size of a note or of the library', async () => {
  const { files } = makeFolder();
  const store = open(files, makeLegacy(null).row);
  // One note larger than the 2,097,099 bytes the old storage could read back.
  const long = note(1, { rawTranscript: 'parola '.repeat(450_000) });
  assert.ok(encodeNote(long).length > 3_000_000);
  await store.put(long);
  for (let i = 2; i <= 40; i++) await store.put(note(i, { rawTranscript: 'x'.repeat(200_000) }));
  const again = open(files, makeLegacy(null).row);
  const back = await again.load();
  assert.equal(back.length, 40);
  assert.equal(back.find((n) => n.id === long.id)!.rawTranscript.length, long.rawTranscript.length);
});

// --- moving the old value over ---------------------------------------------

test('the old value becomes one file per note, in the same order, and goes one start later', async () => {
  const old = library(6);
  const { files, disk } = makeFolder();
  const legacy = makeLegacy(JSON.stringify(old));
  let checked = false;
  legacy.state.beforeRemove = () => {
    // At the moment the old value is removed, every note in it must already
    // be in a file that reads back as that note.
    for (const n of cleaned(old)) {
      assert.deepEqual(decodeNote(disk.get(`${stem(n)}.json`) ?? '', stem(n)), { kind: 'ok', note: n });
    }
    checked = true;
  };
  const store = open(files, legacy.row);
  const loaded = await store.load();
  assert.deepEqual(loaded, cleaned(old), 'same notes, same order, minus the old vectors');
  assert.equal(legacy.state.value, JSON.stringify(old), 'still there: the files were written a moment ago');
  assert.ok(isComplete(store.status()), 'and nothing is missing, so nothing to warn about');
  assert.deepEqual(store.problems, []);

  const again = open(files, legacy.row);
  assert.deepEqual(await again.load(), cleaned(old));
  assert.ok(checked);
  assert.equal(legacy.state.value, null);
  assert.ok(isComplete(again.status()));
  assert.deepEqual(again.problems, []);
});

test('every new file is read back, and the old value is removed only at a start that wrote nothing', async () => {
  const old = library(4);
  const folder = makeFolder();
  const legacy = makeLegacy(JSON.stringify(old), folder.clock);
  await open(folder.files, legacy.row).load();
  const log = folder.clock.log;
  for (const n of old) {
    const lastWrite = log.lastIndexOf(`move ${stem(n)}.tmp ${stem(n)}.json`);
    const readBack = log.indexOf(`read ${stem(n)}.json`, lastWrite);
    assert.ok(lastWrite >= 0 && readBack > lastWrite, `note ${n.id} was not read back`);
  }
  assert.equal(log.includes('legacy remove'), false, 'not in the session that wrote the files');

  const secondStart = log.length;
  await open(folder.files, legacy.row).load();
  const removal = log.indexOf('legacy remove');
  assert.ok(removal > secondStart);
  for (const n of old) {
    const found = log.indexOf(`read ${stem(n)}.json`, secondStart);
    assert.ok(found >= secondStart && found < removal, `note ${n.id} was not found again first`);
  }
  const wrote = log.slice(secondStart).some((step) => step.startsWith('write ') || step.startsWith('move '));
  assert.equal(wrote, false);
});

test('a power cut right after the move: the notes come back from the old value', async () => {
  const old = library(5);
  const folder = makeFolder();
  const legacy = makeLegacy(JSON.stringify(old));
  const first = open(folder.files, legacy.row);
  await first.load();
  await first.patch(old[0].id, { summary: 'edited in the same session' });
  folder.cut();
  assert.ok(folder.disk.size >= 5);
  assert.equal(Array.from(folder.disk.values()).every((text) => text === ''), true, 'not one file reached the disk');

  const later = makeFolderFrom(folder.disk);
  const second = open(later.files, legacy.row);
  assert.deepEqual(await second.load(), cleaned(old), 'all five, as the old value had them');
  assert.equal(second.status().unreadable, 0);
  assert.ok(isComplete(second.status()));
  assert.equal(legacy.state.value, JSON.stringify(old), 'written again at this start, so it stays once more');

  await open(later.files, legacy.row).load();
  assert.equal(legacy.state.value, null);
});

test('an empty old value is simply removed', async () => {
  const { files, disk } = makeFolder();
  const legacy = makeLegacy('[]');
  const store = open(files, legacy.row);
  assert.deepEqual(await store.load(), []);
  assert.equal(legacy.state.value, null);
  assert.equal(disk.size, 0);
  assert.ok(isComplete(store.status()));
});

test('a file that does not read back as written keeps the old value, and is not taken for the note later', async () => {
  const old = library(3);
  const folder = makeFolder();
  const bad = `${stem(old[1])}.tmp`;
  folder.rules.damage = (name, text) => (name === bad ? text.replace('Nota', 'Note') : text);
  const legacy = makeLegacy(JSON.stringify(old));
  const store = open(folder.files, legacy.row);
  assert.deepEqual(await store.load(), cleaned(old), 'the session still shows the notes as they were stored');
  assert.equal(legacy.state.value, JSON.stringify(old), 'the old value is untouched');
  assert.equal(store.status().legacyKept, true);
  assert.equal(isComplete(store.status()), false);
  assert.equal(folder.disk.has(`${stem(old[1])}.json`), false, 'the wrong copy is not left to be believed');

  // Next start, the file system behaves: the move finishes with the right text.
  folder.rules.damage = (_name, text) => text;
  const again = open(folder.files, legacy.row);
  assert.deepEqual(await again.load(), cleaned(old));
  assert.ok(isComplete(again.status()));
  assert.equal(legacy.state.value, JSON.stringify(old), 'one file was written at this start, so not yet');
  await open(folder.files, legacy.row).load();
  assert.equal(legacy.state.value, null);
});

test('a move stopped by a full disk loses nothing and finishes at a later start', async () => {
  const old = library(5);
  const folder = makeFolder();
  const legacy = makeLegacy(JSON.stringify(old));
  let writes = 0;
  folder.rules.failWrite = () => ++writes > 2;
  const store = open(folder.files, legacy.row);
  assert.deepEqual(await store.load(), cleaned(old), 'all five on screen, two of them already in files');
  assert.equal(legacy.state.value, JSON.stringify(old));
  assert.equal(store.status().legacyKept, true);

  folder.rules.failWrite = () => false;
  const again = open(folder.files, legacy.row);
  assert.deepEqual(await again.load(), cleaned(old));
  assert.ok(isComplete(again.status()));
  assert.equal(legacy.state.value, JSON.stringify(old), 'three files were written at this start, so not yet');
  assert.equal(Array.from(folder.disk.keys()).filter((k) => k.endsWith('.json')).length, 5);
  await open(folder.files, legacy.row).load();
  assert.equal(legacy.state.value, null);
});

test('while the old value is still there, an edited note keeps its edit and a deleted note stays deleted', async () => {
  const old = library(4);
  const folder = makeFolder();
  const legacy = makeLegacy(JSON.stringify(old));
  const first = open(folder.files, legacy.row);
  await first.load();
  await first.patch(old[0].id, { summary: 'edited after the move' });
  await first.remove(old[1].id);
  assert.ok(folder.disk.has(`${stem(old[1])}.gone`), 'a marker, because the old value still holds this note');
  const expected = cleaned(old).filter((n) => n.id !== old[1].id);
  expected[0] = { ...expected[0], summary: 'edited after the move' };

  // The removal itself can fail as well. Nothing depends on it.
  legacy.state.failRemove = true;
  const second = open(folder.files, legacy.row);
  assert.deepEqual(await second.load(), expected);
  assert.equal(legacy.state.value, JSON.stringify(old));
  assert.ok(isComplete(second.status()));
  assert.ok(folder.disk.has(`${stem(old[1])}.gone`), 'the marker stays as long as the old value does');

  legacy.state.failRemove = false;
  const third = open(folder.files, legacy.row);
  assert.deepEqual(await third.load(), expected);
  assert.equal(legacy.state.value, null);
  assert.equal(Array.from(folder.disk.keys()).some((k) => k.endsWith('.gone')), false, 'markers go with the old value');
  assert.ok(isComplete(third.status()));
});

test('an old value that cannot be read is never removed, and recording goes on beside it', async () => {
  const old = library(3);
  const folder = makeFolder();
  const legacy = makeLegacy(JSON.stringify(old), folder.clock);
  legacy.state.failRead = true;
  const store = open(folder.files, legacy.row);
  assert.deepEqual(await store.load(), []);
  assert.equal(store.status().legacyKept, true);
  assert.equal(isComplete(store.status()), false, 'an empty list here does not mean an empty library');

  const fresh = note(50);
  await store.put(fresh);
  await store.remove(fresh.id);
  await store.put(note(51));
  assert.equal(legacy.state.value, JSON.stringify(old), 'still there, byte for byte');
  assert.ok(folder.clock.log.includes('legacy read') && !folder.clock.log.includes('legacy remove'));

  // The day it reads again (a later build, a repaired database): both libraries, nothing twice.
  legacy.state.failRead = false;
  const later = open(folder.files, legacy.row);
  assert.deepEqual(await later.load(), [note(51), ...cleaned(old)]);
  assert.ok(isComplete(later.status()));
  await open(folder.files, legacy.row).load();
  assert.equal(legacy.state.value, null);
});

test('an old value too large to read at once is moved when it can be read in pieces', async () => {
  const old = library(4);
  const folder = makeFolder();
  const legacy = makeLegacy(JSON.stringify(old), folder.clock);
  legacy.state.failRead = true;
  // What utils/noteFiles.ts does on Android: the ordinary read, then the pieces (modules/storage-rescue).
  let rescued = 0;
  const read = readWithRescue(() => legacy.row.read(), async () => {
    rescued++;
    return legacy.state.value;
  }, () => {});
  const row: LegacyRow = { read: () => read('muffin.history.v1'), remove: legacy.row.remove };
  const store = open(folder.files, row);
  assert.deepEqual(await store.load(), cleaned(old));
  assert.ok(isComplete(store.status()));
  assert.equal(legacy.state.value, JSON.stringify(old), 'kept for one more start, as always');

  const again = open(folder.files, row);
  assert.deepEqual(await again.load(), cleaned(old));
  assert.equal(legacy.state.value, null);
  assert.equal(rescued, 2);
});

test('an old value that is not a list of notes is left alone', async () => {
  for (const text of ['{"not":"a list"}', 'not json at all', '[{"id":"1760000000001","timestampISO":"x","rawTranscript":""}, 7]']) {
    const folder = makeFolder();
    const legacy = makeLegacy(text);
    const store = open(folder.files, legacy.row);
    await store.load();
    assert.equal(legacy.state.value, text);
    assert.equal(store.status().legacyKept, true);
  }
});

test('the same note twice in the old value: the first is kept, and the old value stays', async () => {
  const twice = [note(2), note(1), { ...note(2), rawTranscript: 'an older copy' }];
  const folder = makeFolder();
  const legacy = makeLegacy(JSON.stringify(twice));
  const store = open(folder.files, legacy.row);
  assert.deepEqual(await store.load(), [note(2), note(1)]);
  assert.equal(legacy.state.value, JSON.stringify(twice));
});

// --- files that went wrong --------------------------------------------------

test('a save that stopped before its rename is finished at the next start', async () => {
  const { files, disk } = makeFolder();
  const first = open(files, makeLegacy(null).row);
  await first.put(note(1));
  disk.set(`${stem(note(1))}.tmp`, encodeNote(note(1, { summary: 'written in full, never renamed' })));

  const store = open(files, makeLegacy(null).row);
  assert.deepEqual(await store.load(), [note(1, { summary: 'written in full, never renamed' })]);
  assert.equal(disk.has(`${stem(note(1))}.tmp`), false);
  assert.deepEqual(decodeNote(disk.get(`${stem(note(1))}.bak`)!, stem(note(1))), { kind: 'ok', note: note(1) });
  assert.ok(isComplete(store.status()));
});

test('a save that stopped halfway is dropped, and the note is as it was', async () => {
  const { files, disk } = makeFolder();
  const first = open(files, makeLegacy(null).row);
  await first.put(note(1));
  const half = encodeNote(note(1, { summary: 'never finished' }));
  disk.set(`${stem(note(1))}.tmp`, half.slice(0, half.length / 2));

  const store = open(files, makeLegacy(null).row);
  assert.deepEqual(await store.load(), [note(1)]);
  assert.equal(disk.has(`${stem(note(1))}.tmp`), false);
  assert.ok(isComplete(store.status()));
});

test('a power cut during an edit costs the edit, not the note', async () => {
  const folder = makeFolder();
  await open(folder.files, makeLegacy(null).row).put(note(1));
  // Next start, long after: that file is safely on disk.
  const later = makeFolderFrom(folder.disk);
  const store = open(later.files, makeLegacy(null).row);
  await store.patch(note(1).id, { summary: 'one' });
  await store.patch(note(1).id, { summary: 'two' });
  later.cut();
  assert.equal(later.disk.get(`${stem(note(1))}.json`), '', 'the newest text never reached the disk');

  const after = open(makeFolderFrom(later.disk).files, makeLegacy(null).row);
  assert.deepEqual(await after.load(), [note(1)]);
  assert.ok(isComplete(after.status()));
});

test('saving over a damaged file does not put the good spare copy at risk', async () => {
  const folder = makeFolder();
  folder.disk.set(`${stem(note(1))}.json`, encodeNote(note(1, { summary: 'newer' })).slice(0, 30));
  folder.disk.set(`${stem(note(1))}.bak`, encodeNote(note(1)));
  const store = open(folder.files, makeLegacy(null).row);
  assert.deepEqual(await store.load(), [note(1)], 'the spare copy, not nothing');
  assert.ok(isComplete(store.status()));

  await store.patch(note(1).id, { summary: 'again' });
  folder.cut();
  const after = open(makeFolderFrom(folder.disk).files, makeLegacy(null).row);
  assert.deepEqual(await after.load(), [note(1)], 'the edit is lost to the power cut, the note is not');
});

test('a note recorded moments before a power cut leaves nothing behind, and no false alarm', async () => {
  const folder = makeFolder();
  const store = open(folder.files, makeLegacy(null).row);
  await store.put(note(1));
  folder.cut();
  const after = open(makeFolderFrom(folder.disk).files, makeLegacy(null).row);
  assert.deepEqual(await after.load(), []);
  assert.equal(after.status().unreadable, 0, 'an empty file holds nothing that could be read');
  assert.ok(isComplete(after.status()));
});

function makeFolderFrom(disk: Map<string, string>) {
  const folder = makeFolder();
  disk.forEach((text, name) => folder.disk.set(name, text));
  return folder;
}

test('a note that cannot be read is counted, shown as missing, and never touched', async () => {
  const { files, disk } = makeFolder();
  const first = open(files, makeLegacy(null).row);
  await first.put(note(1));
  await first.put(note(2));
  const half = encodeNote(note(2)).slice(0, 40);
  disk.set(`${stem(note(2))}.json`, half);

  const store = open(files, makeLegacy(null).row);
  assert.deepEqual(await store.load(), [note(1)]);
  assert.equal(store.status().unreadable, 1);
  assert.equal(isComplete(store.status()), false);
  await store.put(note(3));
  await store.patch(note(1).id, { summary: 's' });
  await store.remove(note(3).id);
  assert.equal(disk.get(`${stem(note(2))}.json`), half, 'exactly as it was found');
});

test('a file in a format this build does not know is left alone, even by the move from the old value', async () => {
  const old = library(2);
  const folder = makeFolder();
  const future = JSON.stringify({ v: 2, note: { ...old[0], extra: 'from a later build' } });
  folder.disk.set(`${stem(old[0])}.json`, future);
  const legacy = makeLegacy(JSON.stringify(old));
  const store = open(folder.files, legacy.row);
  const loaded = await store.load();
  assert.deepEqual(loaded, cleaned(old), 'the old copy is shown');
  assert.equal(folder.disk.get(`${stem(old[0])}.json`), future, 'and the unknown file is not overwritten');
  assert.equal(store.status().unreadable, 1);
  assert.equal(legacy.state.value, JSON.stringify(old), 'so the old value has to stay');
  await store.patch(old[0].id, { summary: 'cannot be saved over the unknown file' });
  assert.equal(folder.disk.get(`${stem(old[0])}.json`), future);
  assert.equal(store.status().unsaved, 1);
});

test('a file that will not open is not mistaken for a file with nothing in it', async () => {
  const folder = makeFolder();
  await open(folder.files, makeLegacy(null).row).put(note(1));
  await open(folder.files, makeLegacy(null).row).patch(note(1).id, { summary: 'newer' });
  folder.rules.failRead = (name) => name === `${stem(note(1))}.json`;

  const store = open(folder.files, makeLegacy(null).row);
  assert.deepEqual(await store.load(), [], 'not the older copy either: the newer one may be perfectly fine');
  assert.equal(store.status().unreadable, 1);
  assert.equal(folder.disk.size, 2);
});

test('a folder that cannot be listed is not an empty library, and a new recording is still saved', async () => {
  const folder = makeFolder();
  const first = open(folder.files, makeLegacy(null).row);
  await first.put(note(1));
  await first.put(note(2));
  const before = new Map(folder.disk);

  folder.rules.failList = true;
  let firstLoads = 0;
  const store = open(folder.files, makeLegacy(null).row, () => firstLoads++);
  assert.deepEqual(await store.load(), []);
  assert.equal(store.status().failed, true);
  assert.equal(isComplete(store.status()), false);
  assert.equal(firstLoads, 0, 'clean-up jobs do not run on a list that is not the library');
  await store.put(note(3));
  for (const [name, text] of before) assert.equal(folder.disk.get(name), text);
  assert.ok(folder.disk.has(`${stem(note(3))}.json`));

  // The folder answers again: everything is there, including what was recorded meanwhile.
  folder.rules.failList = false;
  assert.deepEqual(await store.load(), [note(3), note(2), note(1)]);
  assert.ok(isComplete(store.status()));
  assert.equal(firstLoads, 1);
});

test('a note that could not be written is reported, kept in memory, and written by the next change', async () => {
  const folder = makeFolder();
  const store = open(folder.files, makeLegacy(null).row);
  await store.load();
  folder.rules.failWrite = () => true;
  await store.put(note(1));
  assert.deepEqual(store.get(), [note(1)]);
  assert.equal(store.status().unsaved, 1);
  assert.equal(folder.disk.size, 0, 'no half file left behind');

  folder.rules.failWrite = () => false;
  await store.patch(note(1).id, { summary: 'now it fits' });
  assert.equal(store.status().unsaved, 0);
  const again = open(folder.files, makeLegacy(null).row);
  assert.deepEqual(await again.load(), [note(1, { summary: 'now it fits' })]);
});

// --- stopping at every single step -----------------------------------------

/**
 * A first start that moves six old notes, then a new recording, an edit, a
 * delete and a second edit. The run is repeated once per file operation, each
 * time dying AT that operation, and the app is then started again on whatever
 * was left. Whatever the step, no note may be lost, damaged or brought back.
 */
async function life(store: ReturnType<typeof open>, old: Note[], fresh: Note) {
  await store.load();
  await store.put(fresh);
  await store.patch(old[1].id, { summary: 'edited' });
  await store.remove(old[2].id);
  await store.put({ ...fresh, rawTranscript: 'second version' });
  await store.settled();
}

for (const splitMove of [false, true]) {
  test(`stopped at every step, nothing is lost (${splitMove ? 'move that deletes first' : 'plain rename'})`, async () => {
    const old = library(6);
    const fresh = note(20);
    const original = cleaned(old);

    const dry = makeFolder(makeClock(), { splitMove });
    await life(open(dry.files, makeLegacy(JSON.stringify(old), dry.clock).row), old, fresh);
    const total = dry.clock.steps;
    const script = dry.clock.log.slice();
    assert.ok(total >= 30, `expected a long script, got ${total} steps`);
    const stepOf = (what: string, from = 0) => script.indexOf(what, from) + 1;
    const firstPutDone = stepOf(`move ${stem(fresh)}.tmp ${stem(fresh)}.json`);
    const deleteDone = stepOf(`remove ${stem(old[2])}.tmp`);
    const secondPutDone = stepOf(`move ${stem(fresh)}.tmp ${stem(fresh)}.json`, firstPutDone);
    assert.ok(firstPutDone > 0 && deleteDone > firstPutDone && secondPutDone > deleteDone);

    for (let stopAt = 1; stopAt <= total; stopAt++) {
      const clock = makeClock();
      clock.stopAt = stopAt;
      const folder = makeFolder(clock, { splitMove });
      const legacy = makeLegacy(JSON.stringify(old), clock);
      await life(open(folder.files, legacy.row), old, fresh).catch(() => undefined);
      assert.equal(clock.dead, true);

      // The app starts again on what is left.
      const where = `stopped at step ${stopAt} (${script[stopAt - 1]})`;
      const restart = makeFolderFrom(folder.disk);
      const legacyAfter = makeLegacy(legacy.state.value);
      const store = open(restart.files, legacyAfter.row);
      const after = await store.load();
      const byId = new Map(after.map((n) => [n.id, n]));

      assert.equal(store.status().unreadable, 0, `${where}: a stop must never leave a note unreadable`);
      assert.ok(isComplete(store.status()), `${where}: the move finishes at the next start`);

      for (const n of original) {
        const found = byId.get(n.id);
        if (n.id === old[2].id) {
          if (stopAt > deleteDone) assert.equal(found, undefined, `${where}: a deleted note came back`);
          else if (found) assert.deepEqual(found, n, where);
        } else if (n.id === old[1].id) {
          assert.ok(found, `${where}: note ${n.id} is gone`);
          const { summary, ...rest } = found;
          assert.ok(summary === undefined || summary === 'edited', where);
          assert.deepEqual(rest, n, where);
        } else {
          assert.deepEqual(found, n, `${where}: note ${n.id} is gone or changed`);
        }
      }
      const saved = byId.get(fresh.id);
      if (stopAt > secondPutDone) assert.deepEqual(saved, { ...fresh, rawTranscript: 'second version' }, where);
      else if (stopAt > firstPutDone) assert.ok(saved, `${where}: a recording that was saved is gone`);
      if (saved) assert.ok(['second version', fresh.rawTranscript].includes(saved.rawTranscript), where);
      assert.equal(after.length, new Set(after.map((n) => n.id)).size, `${where}: a note appears twice`);

      // And a third start changes nothing more. By then the old value is gone.
      const third = open(makeFolderFrom(restart.disk).files, legacyAfter.row);
      assert.deepEqual(await third.load(), after, where);
      assert.equal(legacyAfter.state.value, null, `${where}: the old value is still there after three starts`);
    }
  });
}

test('a power cut at every step of the first start after the update: no old note is lost', async () => {
  const old = library(5);
  const fresh = note(20);
  const original = cleaned(old);
  const session = async (store: ReturnType<typeof open>) => {
    await store.load();
    await store.patch(old[1].id, { summary: 'edited' });
    await store.put(fresh);
    await store.remove(old[2].id);
    await store.patch(old[1].id, { summary: 'edited twice' });
    await store.settled();
  };
  const dry = makeFolder();
  await session(open(dry.files, makeLegacy(JSON.stringify(old), dry.clock).row));
  const total = dry.clock.steps;
  assert.ok(total >= 25, `expected a long script, got ${total} steps`);

  // One step past the end as well: every write done, none of it on disk yet.
  for (let stopAt = 1; stopAt <= total + 1; stopAt++) {
    const clock = makeClock();
    clock.stopAt = stopAt;
    const folder = makeFolder(clock, { powerCut: true });
    const legacy = makeLegacy(JSON.stringify(old), clock);
    await session(open(folder.files, legacy.row)).catch(() => undefined);
    if (!clock.dead) folder.cut();

    const where = `power cut at step ${stopAt} (${dry.clock.log[stopAt - 1] ?? 'after the last one'})`;
    const store = open(makeFolderFrom(folder.disk).files, makeLegacy(legacy.state.value).row);
    const after = await store.load();
    const byId = new Map(after.map((n) => [n.id, n]));
    assert.equal(store.status().unreadable, 0, where);
    for (const n of original) {
      const found = byId.get(n.id);
      if (n.id === old[2].id) {
        if (found) assert.deepEqual(found, n, where);
        continue;
      }
      assert.ok(found, `${where}: note ${n.id} is gone`);
      const { summary, ...rest } = found;
      assert.ok(n.id === old[1].id ? [undefined, 'edited', 'edited twice'].includes(summary) : summary === undefined, where);
      assert.deepEqual(rest, n, where);
    }
    assert.equal(after.length, byId.size, where);
  }
});

test('a power cut at every step: a note that was on disk when the app started is never lost', async () => {
  const kept = [note(4), note(3), note(2), note(1)];
  const fresh = note(20);
  const base = makeFolder();
  const setup = open(base.files, makeLegacy(null).row);
  for (const n of kept) await setup.put(n);

  const session = async (store: ReturnType<typeof open>) => {
    await store.load();
    await store.patch(kept[0].id, { summary: 'a' });
    await store.patch(kept[0].id, { summary: 'b' });
    await store.put(fresh);
    await store.patch(kept[1].id, { summary: 'x' });
    await store.remove(kept[2].id);
    await store.patch(kept[0].id, { summary: 'c' });
    await store.patch(fresh.id, { summary: 'f' });
    await store.settled();
  };
  const dry = makeFolderFrom(base.disk);
  await session(open(dry.files, makeLegacy(null).row));
  const total = dry.clock.steps;
  assert.ok(total >= 20, `expected a long script, got ${total} steps`);

  // One step past the end as well: every write done, none of it on disk yet.
  for (let stopAt = 1; stopAt <= total + 1; stopAt++) {
    const clock = makeClock();
    clock.stopAt = stopAt;
    const folder = makeFolder(clock, { powerCut: true });
    base.disk.forEach((text, name) => folder.disk.set(name, text));
    await session(open(folder.files, makeLegacy(null).row)).catch(() => undefined);
    if (!clock.dead) folder.cut();

    const where = `power cut at step ${stopAt} (${dry.clock.log[stopAt - 1] ?? 'after the last one'})`;
    const store = open(makeFolderFrom(folder.disk).files, makeLegacy(null).row);
    const after = await store.load();
    const byId = new Map(after.map((n) => [n.id, n]));
    assert.equal(store.status().unreadable, 0, where);

    const first = byId.get(kept[0].id);
    assert.ok(first, `${where}: an old note is gone`);
    assert.ok([undefined, 'a', 'b', 'c'].includes(first.summary), where);
    assert.deepEqual({ ...first, summary: undefined }, { ...kept[0], summary: undefined }, where);
    const second = byId.get(kept[1].id);
    assert.ok(second, `${where}: an old note is gone`);
    assert.ok([undefined, 'x'].includes(second.summary), where);
    assert.deepEqual(byId.get(kept[3].id), kept[3], where);
    const deleted = byId.get(kept[2].id);
    if (deleted) assert.deepEqual(deleted, kept[2], where);
    const recorded = byId.get(fresh.id);
    if (recorded) assert.deepEqual({ ...recorded, summary: undefined }, { ...fresh, summary: undefined }, where);
    assert.equal(after.length, byId.size, where);
  }
});
