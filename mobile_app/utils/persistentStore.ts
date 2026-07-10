import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

// A single AsyncStorage-backed value with an in-memory cache and a subscriber
// list, plus a React hook. Every persistent store in the app (settings,
// history, memory, ...) shares this so caching/subscription semantics live in
// one place instead of being hand-rolled per store.
export interface PersistentStore<T> {
  /** Current cached value, or null if it hasn't been loaded yet. */
  get(): T | null;
  /** Load (and cache) the value; concurrent calls are coalesced. */
  load(): Promise<T>;
  /** Persist a new value: updates the cache, notifies subscribers, writes. */
  save(value: T): Promise<void>;
  /** Subscribe to value changes; returns an unsubscribe fn. */
  subscribe(fn: (value: T) => void): () => void;
  /** React hook returning the live value. */
  useValue(): T;
}

interface Options<T> {
  // Merge/transform the raw parsed JSON on load (e.g. spread over defaults).
  hydrate?: (parsed: any) => T;
  // Fires once, right after the first successful load resolves from storage.
  onFirstLoad?: (value: T) => void;
}

export function createPersistentStore<T>(
  key: string,
  initial: T,
  options: Options<T> = {}
): PersistentStore<T> {
  let cached: T | null = null;
  let subscribers: ((value: T) => void)[] = [];
  let inFlight: Promise<T> | null = null;

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
        const data = await AsyncStorage.getItem(key);
        if (data != null) {
          const parsed = JSON.parse(data);
          const value = options.hydrate ? options.hydrate(parsed) : (parsed as T);
          cached = value;
          options.onFirstLoad?.(value);
          return value;
        }
      } catch (e) {
        console.error(`Failed to load ${key}`, e);
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
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error(`Failed to save ${key}`, e);
    }
  };

  const subscribe = (fn: (value: T) => void): (() => void) => {
    subscribers.push(fn);
    return () => {
      subscribers = subscribers.filter((s) => s !== fn);
    };
  };

  const useValue = (): T => {
    const [value, setValue] = useState<T>(cached ?? initial);

    useEffect(() => {
      let mounted = true;
      if (cached === null) {
        load().then((v) => {
          if (mounted) setValue(v);
        });
      } else {
        setValue(cached);
      }
      const unsubscribe = subscribe((v) => {
        if (mounted) setValue(v);
      });
      return () => {
        mounted = false;
        unsubscribe();
      };
    }, []);

    return value;
  };

  return { get: () => cached, load, save, subscribe, useValue };
}
