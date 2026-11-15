import { requireOptionalNativeModule } from 'expo-modules-core';

interface StorageRescue {
  readStoredValue(key: string): Promise<string | null>;
}

// Android only (android/.../RowReader.java). Null on iOS, in the browser, and
// in any build made before this module existed: callers then have no second
// way to read, and an unreadable value stays unreadable and kept.
const native = requireOptionalNativeModule<StorageRescue>('StorageRescue');

/**
 * Reads a value of the app's key-value storage in pieces, for values too large
 * for the storage library to read back. Null when there is no such value;
 * rejects when it cannot be read whole.
 */
export const readLargeStoredValue: ((key: string) => Promise<string | null>) | null = native
  ? (key) => native.readStoredValue(key)
  : null;
