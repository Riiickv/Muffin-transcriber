import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { readLargeStoredValue } from '@/modules/storage-rescue';
import { createValueStore, readWithRescue, type KeyValue, type ValueStore, type ValueStoreOptions } from './valueStore';

/**
 * AsyncStorage.getItem, and on Android, when that throws because the value is
 * past 2 MB, the same value read in pieces. Also used for the old single
 * transcription value (utils/noteFiles.ts).
 */
export const readStoredValue = readWithRescue((key) => AsyncStorage.getItem(key), readLargeStoredValue);

const storage: KeyValue = {
  getItem: readStoredValue,
  setItem: (key, value) => AsyncStorage.setItem(key, value),
};

// A single AsyncStorage-backed value with an in-memory cache and a subscriber
// list, plus a React hook. Every small persistent store in the app (settings,
// chats, memory, ...) shares this so caching/subscription semantics live in
// one place instead of being hand-rolled per store.
//
// The caching and the rule that an unreadable value is never overwritten are
// in utils/valueStore.ts, which has no native imports and is tested on Node.
// The transcriptions are NOT kept here any more: see utils/noteStore.ts.
export interface PersistentStore<T> extends ValueStore<T> {
  /** React hook returning the live value. */
  useValue(): T;
}

export function createPersistentStore<T>(
  key: string,
  initial: T,
  options: ValueStoreOptions<T> = {}
): PersistentStore<T> {
  const store = createValueStore<T>(storage, key, initial, options);

  const useValue = (): T => {
    const [value, setValue] = useState<T>(store.get() ?? initial);

    useEffect(() => {
      let mounted = true;
      const cached = store.get();
      if (cached === null) {
        store.load().then((v) => {
          if (mounted) setValue(v);
        });
      } else {
        setValue(cached);
      }
      const unsubscribe = store.subscribe((v) => {
        if (mounted) setValue(v);
      });
      return () => {
        mounted = false;
        unsubscribe();
      };
    }, []);

    return value;
  };

  return { ...store, useValue };
}
