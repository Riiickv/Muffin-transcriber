import * as FileSystem from 'expo-file-system/legacy';

import {
  formatAsJson,
  formatAsText,
  toExportable,
  BACKUP_FILENAME,
  EXPORT_FILENAME,
  type ExportableItem,
} from './transcriptExport';

/**
 * Writing the history somewhere Android will not delete.
 *
 * Everything Muffin stores lives in app-private storage with allowBackup off,
 * which is correct for an app that promises recordings never leave the phone,
 * and which means an uninstall destroys all of it with no way to save it first.
 * The Storage Access Framework is the escape hatch: the user picks a real
 * folder, the app writes into it, and that folder belongs to THEM. It outlives
 * the app because it was never the app's to begin with.
 *
 * Nothing here is sent anywhere. A SAF folder is a directory on the device (or
 * a cloud provider the user chose in the picker, which is their call to make,
 * not ours to make silently).
 */

/** From the v57 docs, verified: `{granted: false}` or `{granted: true, directoryUri}`. */
type PermissionResult = { granted: boolean; directoryUri?: string };

/**
 * Ask for a folder. Returns its URI, or null if the user backed out.
 *
 * The picker is the ONLY place the user grants this, and it is deliberately not
 * called automatically anywhere: a file picker appearing unbidden is alarming
 * in an app whose selling point is that it keeps to itself.
 */
export async function pickFolder(): Promise<string | null> {
  try {
    const saf = (FileSystem as any).StorageAccessFramework;
    if (!saf?.requestDirectoryPermissionsAsync) return null;
    const res: PermissionResult = await saf.requestDirectoryPermissionsAsync();
    return res?.granted && res.directoryUri ? res.directoryUri : null;
  } catch {
    return null;
  }
}

/**
 * The URI of a file already in the folder, or null.
 *
 * Needed because SAF's createFileAsync does NOT overwrite: calling it twice
 * with the same name leaves "muffin-transcriptions.json" beside
 * "muffin-transcriptions (1).json", and a backup that silently forks into a
 * dozen numbered copies is not a backup. So an existing file is found and
 * rewritten, and only a missing one is created.
 *
 * Matching is done on the ENCODED name inside the SAF URI, because SAF returns
 * opaque document URIs rather than paths, and the display name arrives
 * percent-encoded within them.
 */
async function findExisting(dirUri: string, fileName: string): Promise<string | null> {
  try {
    const saf = (FileSystem as any).StorageAccessFramework;
    const entries: string[] = await saf.readDirectoryAsync(dirUri);
    const needle = encodeURIComponent(fileName).toLowerCase();
    return entries.find((u) => u.toLowerCase().endsWith(needle)) ?? null;
  } catch {
    return null;
  }
}

async function writeInto(
  dirUri: string,
  fileName: string,
  mimeType: string,
  contents: string,
): Promise<string> {
  const saf = (FileSystem as any).StorageAccessFramework;

  const existing = await findExisting(dirUri, fileName);
  let target: string;
  if (existing) {
    target = existing;
  } else {
    // createFileAsync takes the name WITHOUT its extension and derives the
    // extension from the mime type. Passing "x.json" produces "x.json.json".
    const base = fileName.replace(/\.[^.]+$/, '');
    target = await saf.createFileAsync(dirUri, base, mimeType);
  }

  // Writing to a SAF URI requires the file to exist already, which is why the
  // create above is not optional on the first run.
  await FileSystem.writeAsStringAsync(target, contents);
  return target;
}

/**
 * Human readable text, for someone who wants to read or send their transcripts.
 *
 * Items are passed IN rather than loaded here. transcriptBackup importing
 * historyStore while historyStore triggers a backup would be a cycle, and a
 * cycle through Metro leaves one side holding an undefined function at call
 * time, which this codebase has already paid for once.
 */
export async function exportReadable(
  dirUri: string,
  items: readonly Record<string, any>[],
): Promise<{ count: number; uri: string }> {
  const rows: ExportableItem[] = items.map(toExportable);
  const uri = await writeInto(dirUri, EXPORT_FILENAME, 'text/plain', formatAsText(rows));
  return { count: rows.length, uri };
}

/**
 * The complete json, for surviving an uninstall.
 *
 * exportedAt is stamped here rather than inside the formatter, so the formatter
 * stays pure and testable.
 */
export async function writeBackup(
  dirUri: string,
  items: readonly Record<string, any>[],
): Promise<{ count: number; uri: string }> {
  const rows: ExportableItem[] = items.map(toExportable);
  const json = formatAsJson(rows, new Date().toISOString());
  const uri = await writeInto(dirUri, BACKUP_FILENAME, 'application/json', json);
  return { count: rows.length, uri };
}

/**
 * Refresh the backup after something changed, without ever interrupting the
 * thing that changed it.
 *
 * Returns whether it worked, and the caller decides whether that is worth
 * telling the user about. It CAN stop working without warning: the folder
 * grant is Android's to revoke, and the docs do not promise it survives a
 * restart. A backup that quietly stopped months ago is worse than none, so the
 * failure is reported rather than swallowed.
 */
export async function refreshBackup(
  dirUri: string | undefined,
  items: readonly Record<string, any>[],
): Promise<boolean> {
  if (!dirUri) return false;
  try {
    await writeBackup(dirUri, items);
    return true;
  } catch {
    return false;
  }
}
