/**
 * The transcriptions, one file each.
 *
 * WHY THIS EXISTS. They used to be one value in the app's key-value storage.
 * On Android that storage is a single database of 6 MB in all, and a value is
 * read back through a 2 MB window: past 2,097,099 bytes the value can still be
 * written and can no longer be read. The old loader took a failed read for an
 * empty library, and the next save then wrote that empty library over the real
 * one. Measurements and sources: docs/storage-research.md.
 *
 * WHAT IS DIFFERENT HERE.
 *   - One note, one file. No write touches any note but its own, so no single
 *     failure can take the library with it, and nothing grows towards a limit.
 *   - A note is written under a temporary name and renamed into place, and the
 *     copy it had when the app started is kept beside it. A write that stops
 *     halfway, or a power cut before the phone has put the new text on disk,
 *     leaves the last good copy readable.
 *   - A file that cannot be read is counted and left exactly as it is. It is
 *     never treated as "no note", never overwritten, never deleted.
 *   - The old value is moved over note by note, and each new file is read back
 *     and compared. It is removed one start later, when every note in it is
 *     found in its file again.
 *
 * PURE on purpose: no React, no native modules. The files and the old value
 * are handed in, so tests/noteStore.test.ts runs every failure on Node,
 * including a stop at each single step. Same split as transcriptExport.
 */

export interface NoteLike {
  id: string;
  timestampISO: string;
}

/** The folder the notes live in. Names only, never paths. */
export interface NoteFiles {
  /** Names of the files in the folder. Makes the folder when it is missing. */
  list(): Promise<string[]>;
  /** Throws when the file is missing or cannot be read. */
  read(name: string): Promise<string>;
  /** Replaces the contents. NOT assumed to be all-or-nothing. */
  write(name: string, text: string): Promise<void>;
  /** Renames, replacing `to` when it exists. Assumed all-or-nothing. */
  move(from: string, to: string): Promise<void>;
  /** Does nothing when the file is missing. */
  remove(name: string): Promise<void>;
}

/** The single value the notes used to be kept in. */
export interface LegacyRow {
  /** The stored text, or null when there is none. Throws when it cannot be read. */
  read(): Promise<string | null>;
  remove(): Promise<void>;
}

export interface NoteStoreStatus {
  /** False until the first load has finished. */
  loaded: boolean;
  /** The folder could not be listed: nothing is known about what it holds. */
  failed: boolean;
  /** Notes whose file is there and could not be read. Left as they are. */
  unreadable: number;
  /** The old value is still there, not or not fully moved over. Left as it is. */
  legacyKept: boolean;
  /** Notes changed in this session whose file could not be written. */
  unsaved: number;
}

/** True when what is in memory is everything there is. Only then may it be copied over a backup. */
export function isComplete(status: NoteStoreStatus): boolean {
  return status.loaded && !status.failed && status.unreadable === 0 && !status.legacyKept;
}

export interface NoteStore<T extends NoteLike> {
  /** The notes in memory, newest first, or null before the first load. */
  get(): T[] | null;
  /** Loads once; later calls return what is in memory. A failed listing is tried again. */
  load(): Promise<T[]>;
  /** Adds the note, or replaces the one with the same id. */
  put(note: T): Promise<void>;
  /** Merges fields into a note. False, and nothing written, when it is gone. */
  patch(id: string, change: Partial<T>): Promise<boolean>;
  remove(id: string): Promise<void>;
  status(): NoteStoreStatus;
  /** Called after the notes or the status change. Returns the way to stop. */
  subscribe(fn: () => void): () => void;
  /** Resolves when every write asked for so far has finished. */
  settled(): Promise<void>;
}

const FORMAT = 1;
const READS_AT_ONCE = 8;

type Ext = 'json' | 'tmp' | 'bak' | 'gone';
const FILE_NAME = /^([nx][0-9a-z_-]+)\.(json|tmp|bak|gone)$/;
const PLAIN_ID = /^[0-9a-z_-]{1,100}$/;
const MAX_STEM = 200;

/**
 * The file name of a note, without its ending, or null when the id cannot be
 * made into one.
 *
 * Ids are timestamps in digits today and pass through as they are. Anything
 * else is spelled out in hex, so no id can reach outside the folder, and two
 * ids that differ only in upper and lower case cannot land on the same file
 * where the file system ignores case.
 */
export function noteStem(id: string): string | null {
  if (typeof id !== 'string' || id.length === 0) return null;
  if (PLAIN_ID.test(id)) return 'n' + id;
  let hex = '';
  for (let i = 0; i < id.length; i++) hex += id.charCodeAt(i).toString(16).padStart(4, '0');
  return hex.length < MAX_STEM ? 'x' + hex : null;
}

/** Newest first. Ties, and notes without a date, fall back to the id so the order never changes between starts. */
export function byNewest(a: NoteLike, b: NoteLike): number {
  const ta = typeof a.timestampISO === 'string' ? a.timestampISO : '';
  const tb = typeof b.timestampISO === 'string' ? b.timestampISO : '';
  if (ta !== tb) return ta < tb ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export function encodeNote(note: NoteLike): string {
  return JSON.stringify({ v: FORMAT, note });
}

type Copy<T> = { kind: 'ok'; note: T } | { kind: 'torn' } | { kind: 'empty' } | { kind: 'other' };

/**
 * What a file holds.
 *   ok     a note of this format, in the file its id belongs in
 *   torn   not JSON at all: a write that stopped halfway. May still hold most of the text.
 *   empty  a name with nothing in it, which is what a power cut leaves of a file
 *          the phone had not yet put on disk. Nothing to read and nothing to protect.
 *   other  JSON this build does not understand (a later format, say). Not ours to judge.
 */
export function decodeNote<T extends NoteLike>(text: string, stem: string): Copy<T> {
  if (text.length === 0) return { kind: 'empty' };
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return { kind: 'torn' };
  }
  const note = data && typeof data === 'object' ? data.note : null;
  if (data?.v !== FORMAT || !note || typeof note !== 'object' || noteStem(note.id) !== stem) {
    return { kind: 'other' };
  }
  return { kind: 'ok', note };
}

async function eachLimited<A>(items: A[], limit: number, job: (item: A) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await job(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export function createNoteStore<T extends NoteLike>(deps: {
  files: NoteFiles;
  legacy: LegacyRow;
  /** One element of the old value, cleaned of what is no longer stored. Null when it is not a note. */
  fromLegacy: (raw: unknown) => T | null;
  /** Once, after the first load that could list the folder. */
  onFirstLoad?: (notes: T[]) => void;
  log?: (message: string, error?: unknown) => void;
}): NoteStore<T> {
  const { files, legacy, fromLegacy } = deps;
  const log = deps.log ?? ((message, error) => console.error(message, error));

  let cached: T[] | null = null;
  let inFlight: Promise<T[]> | null = null;
  let firstLoadDone = false;
  let state: NoteStoreStatus = { loaded: false, failed: false, unreadable: 0, legacyKept: false, unsaved: 0 };
  let subscribers: (() => void)[] = [];

  /** Notes whose .json is a good copy: the next write keeps it as .bak. */
  const hasMain = new Set<string>();
  /**
   * Notes whose .json was written since the app started. Their .bak is NOT
   * replaced again: nothing here can force a file onto the disk, so a copy
   * written a moment ago may not survive a power cut, and two quick edits
   * would otherwise leave two such copies and nothing older. The .bak stays
   * the copy the note had when the app started.
   */
  const fresh = new Set<string>();
  /** Files that could not be read. Nothing is ever written to these names. */
  const blocked = new Set<string>();
  const unsaved = new Set<string>();
  /** Until the old value is known to be gone, a delete leaves a marker so the note cannot come back from it. */
  let legacyMayExist = true;

  const notify = () => subscribers.slice().forEach((fn) => fn());
  const setState = (change: Partial<NoteStoreStatus>) => {
    state = { ...state, ...change };
  };

  // One file operation at a time. Two writers on the same temporary name would
  // tear each other's file, and a delete must not overtake the write before it.
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue<R>(job: () => Promise<R>): Promise<R> {
    const run = queue.then(job, job);
    queue = run.catch(() => undefined);
    return run;
  }

  async function readCopy(name: string, stem: string): Promise<Copy<T>> {
    let text: string;
    try {
      text = await files.read(name);
    } catch {
      // The file is listed and will not open. Not the same as torn: say nothing about its contents.
      return { kind: 'other' };
    }
    return decodeNote<T>(text, stem);
  }

  /** The newest good copy of one note, repairing what a stopped write left behind. */
  async function readSlot(stem: string, has: Set<Ext>): Promise<{ note: T | null; unreadable: boolean }> {
    if (has.has('tmp')) {
      const tmp = await readCopy(stem + '.tmp', stem);
      if (tmp.kind === 'ok') {
        // Written in full, never renamed: this is the newest copy. Finish the job.
        const main = has.has('json') ? await readCopy(stem + '.json', stem) : null;
        if (main?.kind === 'other') {
          blocked.add(stem);
          return { note: null, unreadable: true };
        }
        try {
          if (main?.kind === 'ok') await files.move(stem + '.json', stem + '.bak');
          await files.move(stem + '.tmp', stem + '.json');
          hasMain.add(stem);
          // Just written, by the look of it: its .bak is not to be replaced in this session.
          fresh.add(stem);
        } catch (e) {
          log(`Could not finish the interrupted save of note file ${stem}`, e);
        }
        return { note: tmp.note, unreadable: false };
      }
      // Half written and never put in place: dropped, as a database rolls back
      // a transaction that did not commit. The copy it was replacing is intact.
      if (tmp.kind === 'torn' || tmp.kind === 'empty') await files.remove(stem + '.tmp').catch(() => undefined);
    }
    // Damaged AND not empty: it may hold most of a transcript, so it is kept.
    let damaged = false;
    if (has.has('json')) {
      const main = await readCopy(stem + '.json', stem);
      if (main.kind === 'ok') {
        hasMain.add(stem);
        return { note: main.note, unreadable: false };
      }
      if (main.kind === 'other') {
        blocked.add(stem);
        return { note: null, unreadable: true };
      }
      if (main.kind === 'torn') damaged = true;
    }
    if (has.has('bak')) {
      const bak = await readCopy(stem + '.bak', stem);
      // hasMain stays unset, so the next write goes straight over the torn
      // file instead of first pushing it on top of this good copy.
      if (bak.kind === 'ok') return { note: bak.note, unreadable: false };
      if (bak.kind !== 'empty') damaged = true;
    }
    if (damaged) {
      blocked.add(stem);
      return { note: null, unreadable: true };
    }
    return { note: null, unreadable: false };
  }

  /** Temporary name, then rename. Returns the text written, for reading back. */
  async function writeFiles(note: T): Promise<{ stem: string; text: string }> {
    const stem = noteStem(note.id);
    if (!stem) throw new Error('This note id cannot be used as a file name');
    if (blocked.has(stem)) throw new Error('A file that could not be read is in the way');
    const text = encodeNote(note);
    try {
      await files.write(stem + '.tmp', text);
    } catch (e) {
      await files.remove(stem + '.tmp').catch(() => undefined);
      throw e;
    }
    if (hasMain.has(stem) && !fresh.has(stem)) {
      // Keep the copy being replaced. If this fails, the rename below still
      // replaces the file whole; only the spare copy is missing.
      await files.move(stem + '.json', stem + '.bak').catch(() => undefined);
    }
    await files.move(stem + '.tmp', stem + '.json');
    hasMain.add(stem);
    fresh.add(stem);
    return { stem, text };
  }

  async function dropMarkers(stems: Iterable<string>): Promise<void> {
    for (const stem of stems) await files.remove(stem + '.gone').catch(() => undefined);
  }

  /**
   * Moves the old value into files. Safe to run again after any interruption:
   * a note that already has a file is left alone (the file is newer or equal),
   * a note deleted since is skipped, and every file written here is read back
   * and compared. The old value goes only at a start that finds every note in
   * it already in a file, so never in the session that wrote those files.
   */
  async function carryOver(fromFiles: T[], gone: Set<string>): Promise<T[]> {
    let raw: string | null;
    try {
      raw = await legacy.read();
    } catch (e) {
      log('The old transcription storage could not be read. It is left as it is.', e);
      setState({ legacyKept: true });
      return fromFiles;
    }
    if (raw === null) {
      legacyMayExist = false;
      await dropMarkers(gone);
      return fromFiles;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (!Array.isArray(parsed)) {
      log('The old transcription storage is not a list. It is left as it is.');
      setState({ legacyKept: true });
      return fromFiles;
    }

    const have = new Set(fromFiles.map((n) => n.id));
    const seen = new Set<string>();
    const added: T[] = [];
    const written: { stem: string; text: string }[] = [];
    let complete = true;
    for (const element of parsed) {
      const note = fromLegacy(element);
      const stem = note ? noteStem(note.id) : null;
      if (!note || !stem || seen.has(note.id)) {
        complete = false;
        continue;
      }
      seen.add(note.id);
      if (gone.has(stem)) continue;
      if (have.has(note.id)) continue;
      // Shown in this session whatever happens to its file: it is still safe in the old value.
      added.push(note);
      if (blocked.has(stem)) {
        complete = false;
        continue;
      }
      try {
        written.push(await writeFiles(note));
      } catch (e) {
        complete = false;
        log(`Could not move note ${note.id} to its own file`, e);
      }
    }
    for (const file of written) {
      let same = false;
      try {
        same = (await files.read(file.stem + '.json')) === file.text;
      } catch {
        same = false;
      }
      if (!same) {
        complete = false;
        // A wrong copy must not be found at the next start and taken for the note.
        await files.remove(file.stem + '.json').catch(() => undefined);
        hasMain.delete(file.stem);
        fresh.delete(file.stem);
        log(`Note file ${file.stem} did not read back as written`);
      }
    }
    if (!complete) {
      setState({ legacyKept: true });
    } else if (written.length === 0) {
      // Nothing had to be written at this start: every note of the old value
      // was found in a file from an earlier one (or deleted since).
      try {
        await legacy.remove();
        legacyMayExist = false;
        await dropMarkers(gone);
      } catch (e) {
        // Everything is in files. The removal is tried again at the next start.
        log('The old transcription storage could not be removed', e);
      }
    }
    // Otherwise: files were written a moment ago and read back right, and the
    // old value stays all the same. Reading back proves the text went in, not
    // that it is on the disk: nothing here can force that, and a power cut in
    // the next seconds could leave those files empty while the removal of the
    // old value had already been made permanent. The old value goes at a later
    // start, when the files are found again. Until then it is the spare copy.
    return fromFiles.concat(added);
  }

  async function readEverything(): Promise<T[]> {
    let names: string[];
    try {
      names = await files.list();
    } catch (e) {
      log('The transcription folder could not be read', e);
      setState({ loaded: true, failed: true });
      // Notes saved while the folder would not list stay on screen.
      return cached ?? [];
    }
    const slots = new Map<string, Set<Ext>>();
    for (const name of names) {
      const match = FILE_NAME.exec(name);
      if (!match) continue;
      const set = slots.get(match[1]) ?? new Set<Ext>();
      set.add(match[2] as Ext);
      slots.set(match[1], set);
    }
    hasMain.clear();
    blocked.clear();
    const notes: T[] = [];
    let unreadable = 0;
    await eachLimited(Array.from(slots), READS_AT_ONCE, async ([stem, has]) => {
      const slot = await readSlot(stem, has);
      if (slot.note) notes.push(slot.note);
      else if (slot.unreadable) unreadable++;
    });
    setState({ failed: false, unreadable, legacyKept: false });
    const gone = new Set<string>();
    slots.forEach((has, stem) => {
      if (has.has('gone')) gone.add(stem);
    });
    const all = await carryOver(notes, gone);
    // A change that could not be written earlier in this session exists only in
    // memory: there, memory is newer than the file and wins.
    const mine = (cached ?? []).filter((n) => unsaved.has(n.id));
    const mineIds = new Set(mine.map((n) => n.id));
    setState({ loaded: true });
    return all
      .filter((n) => !mineIds.has(n.id))
      .concat(mine)
      .sort(byNewest);
  }

  function load(): Promise<T[]> {
    if (cached !== null && !state.failed) return Promise.resolve(cached);
    if (!inFlight) {
      inFlight = enqueue(readEverything)
        .then((notes) => {
          cached = notes;
          if (!state.failed && !firstLoadDone) {
            firstLoadDone = true;
            deps.onFirstLoad?.(notes);
          }
          return notes;
        })
        .finally(() => {
          inFlight = null;
          notify();
        });
    }
    return inFlight;
  }

  /** Writes whatever the note is when its turn comes, so two quick changes cannot land in the wrong order. */
  function save(id: string): Promise<void> {
    return enqueue(async () => {
      const current = cached?.find((n) => n.id === id);
      if (!current) return;
      try {
        await writeFiles(current);
        unsaved.delete(id);
      } catch (e) {
        unsaved.add(id);
        log(`Could not save note ${id}`, e);
      }
      if (state.unsaved !== unsaved.size) {
        setState({ unsaved: unsaved.size });
        notify();
      }
    });
  }

  const withNote = (notes: T[], note: T) => notes.filter((n) => n.id !== note.id).concat(note).sort(byNewest);

  async function put(note: T): Promise<void> {
    await load();
    cached = withNote(cached ?? [], note);
    notify();
    await save(note.id);
  }

  async function patch(id: string, change: Partial<T>): Promise<boolean> {
    await load();
    // Merged over what is in memory NOW, not over what the caller last saw.
    const current = cached?.find((n) => n.id === id);
    if (!current) return false;
    cached = withNote(cached ?? [], { ...current, ...change, id });
    notify();
    await save(id);
    return true;
  }

  async function remove(id: string): Promise<void> {
    await load();
    if (!cached?.some((n) => n.id === id)) return;
    cached = cached.filter((n) => n.id !== id);
    unsaved.delete(id);
    setState({ unsaved: unsaved.size });
    notify();
    await enqueue(async () => {
      const stem = noteStem(id);
      if (!stem) return;
      try {
        // The marker first: once it is there, the old value cannot bring the note back.
        if (legacyMayExist) await files.write(stem + '.gone', '');
        await files.remove(stem + '.json');
        await files.remove(stem + '.bak');
        await files.remove(stem + '.tmp');
        hasMain.delete(stem);
        fresh.delete(stem);
      } catch (e) {
        log(`Could not delete note ${id}`, e);
      }
    });
  }

  return {
    get: () => cached,
    load,
    put,
    patch,
    remove,
    status: () => state,
    subscribe: (fn) => {
      subscribers.push(fn);
      return () => {
        subscribers = subscribers.filter((s) => s !== fn);
      };
    },
    settled: () => queue.then(() => undefined),
  };
}
