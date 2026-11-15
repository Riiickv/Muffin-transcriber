import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import type { LegacyRow, NoteFiles } from './noteStore';
import { readStoredValue } from './persistentStore';

// Where utils/noteStore.ts keeps the transcriptions, and where they used to be.
//
// On the phone: a folder in the app's documents, one file per note. Read in
// expo-file-system 57.0.0: on Android a write opens the file, cuts it to
// nothing and then fills it, with nothing that makes that all-or-nothing, and
// a move is a plain rename. On iOS a move deletes the destination and then
// renames. noteStore assumes no more than that (docs/storage-research.md).
//
// In the browser there is no such folder, so each note is one storage key.
// Same store, same rules; the browser build is a preview, not a product.

const FOLDER = (FileSystem.documentDirectory || '') + 'transcriptions/';

const folder: NoteFiles = {
  async list() {
    await FileSystem.makeDirectoryAsync(FOLDER, { intermediates: true });
    return FileSystem.readDirectoryAsync(FOLDER);
  },
  read: (name) => FileSystem.readAsStringAsync(FOLDER + name),
  write: (name, text) => FileSystem.writeAsStringAsync(FOLDER + name, text),
  move: (from, to) => FileSystem.moveAsync({ from: FOLDER + from, to: FOLDER + to }),
  remove: (name) => FileSystem.deleteAsync(FOLDER + name, { idempotent: true }),
};

const PREFIX = 'muffin.note/';

const keys: NoteFiles = {
  async list() {
    const all = await AsyncStorage.getAllKeys();
    return all.filter((k) => k.startsWith(PREFIX)).map((k) => k.slice(PREFIX.length));
  },
  async read(name) {
    const text = await AsyncStorage.getItem(PREFIX + name);
    if (text === null) throw new Error(`No such note file: ${name}`);
    return text;
  },
  write: (name, text) => AsyncStorage.setItem(PREFIX + name, text),
  async move(from, to) {
    const text = await AsyncStorage.getItem(PREFIX + from);
    if (text === null) throw new Error(`No such note file: ${from}`);
    await AsyncStorage.setItem(PREFIX + to, text);
    await AsyncStorage.removeItem(PREFIX + from);
  },
  remove: (name) => AsyncStorage.removeItem(PREFIX + name),
};

export const noteFiles: NoteFiles = Platform.OS === 'web' ? keys : folder;

/**
 * The one value every transcription used to be kept in. Read once more, to
 * move it; never written again. Past 2 MB it is read in pieces on Android.
 */
export function legacyRow(key: string): LegacyRow {
  return {
    read: () => readStoredValue(key),
    remove: () => AsyncStorage.removeItem(key),
  };
}
