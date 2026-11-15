/**
 * One stored value: a copy in memory, the people watching it, and one rule.
 *
 * THE RULE: a value that could not be read is never written over.
 *
 * It was not always so. A read that failed used to hand back the starting
 * value (an empty list, for the transcriptions) as if that were what had been
 * stored, and the next save wrote it out. On Android a value past 2 MB can be
 * written and cannot be read (docs/storage-research.md), so that was every
 * transcription gone, quietly, on the first recording after the limit.
 *
 * Now a failed read leaves the stored value alone for the rest of the session.
 * The app still runs on the starting value, changes still show, and they are
 * not kept. Losing one session's changes can be undone by the next start;
 * overwriting what could not be read cannot.
 *
 * PURE on purpose (no React, no native modules): the storage is handed in, so
 * tests/valueStore.test.ts runs this on Node. utils/persistentStore.ts adds the
 * real storage and the React hook.
 */

export interface KeyValue {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

type Read = (key: string) => Promise<string | null>;

/**
 * A read with a second way in when the first one throws: on Android, reading
 * the value in pieces (modules/storage-rescue), for values past the 2,097,099
 * bytes the storage library can read back (docs/storage-research.md).
 *
 * Only text counts as rescued. When the second way throws too, or finds
 * nothing where the first found something it could not read, the FIRST error
 * is thrown, so the caller still treats the value as unreadable and keeps it.
 */
export function readWithRescue(
  read: Read,
  rescue: Read | null,
  log: (message: string, error?: unknown) => void = (message, error) => console.error(message, error)
): Read {
  return async (key) => {
    try {
      return await read(key);
    } catch (first) {
      if (!rescue) throw first;
      let text: string | null;
      try {
        text = await rescue(key);
      } catch (second) {
        log(`${key} could not be read in pieces either`, second);
        throw first;
      }
      if (typeof text !== 'string') {
        log(`${key} could not be read, and reading it in pieces found nothing`);
        throw first;
      }
      log(`${key} was too large to read at once, and was read in pieces (${text.length} characters)`);
      return text;
    }
  };
}

export interface ValueStore<T> {
  /** Current cached value, or null if it hasn't been loaded yet. */
  get(): T | null;
  /** Load (and cache) the value; concurrent calls are coalesced. */
  load(): Promise<T>;
  /** Persist a new value: updates the cache, notifies subscribers, writes. */
  save(value: T): Promise<void>;
  /** Subscribe to value changes; returns an unsubscribe fn. */
  subscribe(fn: (value: T) => void): () => void;
  /** True when the stored value could not be read. It is kept, and saves stay in memory. */
  readFailed(): boolean;
}

export interface ValueStoreOptions<T> {
  // Merge/transform the raw parsed JSON on load (e.g. spread over defaults).
  hydrate?: (parsed: any) => T;
  // Fires once, right after the first successful load resolves from storage.
  onFirstLoad?: (value: T) => void;
  log?: (message: string, error?: unknown) => void;
}

export function createValueStore<T>(
  storage: KeyValue,
  key: string,
  initial: T,
  options: ValueStoreOptions<T> = {}
): ValueStore<T> {
  const log = options.log ?? ((message, error) => console.error(message, error));
  let cached: T | null = null;
  let subscribers: ((value: T) => void)[] = [];
  let inFlight: Promise<T> | null = null;
  let unreadable = false;
  let warned = false;

  const notify = () => {
    if (cached !== null) {
      const snapshot = cached;
      subscribers.forEach((s) => s(snapshot));
    }
  };

  const load = async (): Promise<T> => {
    if (cached !== null) return cached;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        const data = await storage.getItem(key);
        if (data != null) {
          const parsed = JSON.parse(data);
          const value = options.hydrate ? options.hydrate(parsed) : (parsed as T);
          cached = value;
          options.onFirstLoad?.(value);
          return value;
        }
      } catch (e) {
        // Something IS stored, or may be, and it did not come back. That is
        // not the same as nothing stored.
        unreadable = true;
        log(`Failed to load ${key}. The stored value is kept and will not be overwritten.`, e);
      }
      cached = initial;
      return initial;
    })();

    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  };

  const save = async (value: T): Promise<void> => {
    cached = value;
    notify();
    if (unreadable) {
      if (!warned) {
        warned = true;
        log(`Not saving ${key}: the stored value could not be read.`);
      }
      return;
    }
    try {
      await storage.setItem(key, JSON.stringify(value));
    } catch (e) {
      log(`Failed to save ${key}`, e);
    }
  };

  const subscribe = (fn: (value: T) => void): (() => void) => {
    subscribers.push(fn);
    return () => {
      subscribers = subscribers.filter((s) => s !== fn);
    };
  };

  return { get: () => cached, load, save, subscribe, readFailed: () => unreadable };
}
