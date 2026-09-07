/**
 * Turning the history into something that can leave the app.
 *
 * WHY THIS HAS TO EXIST. Muffin keeps everything in app-private storage and
 * sets allowBackup false, which is the right call for an app whose whole pitch
 * is that recordings never leave the device: nothing is synced to Google, and
 * `adb backup` cannot reach it either. The cost is that Android deletes all of
 * it on uninstall, and until now there was no way to get a single transcript
 * out except copying it to the clipboard one at a time. Change phone, clear
 * data, or reinstall, and years of transcriptions are simply gone.
 *
 * PURE on purpose. Formatting is arithmetic over an array and belongs in tests;
 * the filesystem and the folder picker live in the caller. Same split as
 * modelTimeEstimate and progressiveDraft.
 *
 * TWO FORMATS, because they answer different questions.
 *
 *   readable text  - what a person wants: dates, languages, the actual words,
 *                    openable in any text editor forever, no app required.
 *   json           - what a MACHINE wants: every field of every item, so a
 *                    future import can put the history back exactly as it was.
 *
 * The backup written by "keep after uninstalling" is the json one, because a
 * backup that cannot be restored is a souvenir. The manual export is the text
 * one, because someone exporting is usually trying to read or send it.
 */

export type ExportableItem = {
  id: string;
  timestampISO: string;
  sourceFileName: string;
  language: string;
  rawTranscript: string;
  formattedTranscript?: string;
  summary?: string;
  audioDurationMs?: number;
  detectedLanguage?: string;
};

/** Current shape of the json backup. Bumped if the fields ever change. */
export const BACKUP_VERSION = 1;

export const BACKUP_FILENAME = 'muffin-transcriptions.json';
export const EXPORT_FILENAME = 'muffin-transcriptions.txt';

/** "3:07" or "1:02:33". Blank when the length was never recorded. */
function formatDuration(ms: number | undefined): string {
  if (!ms || ms <= 0) return '';
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * The date as the phone's own locale writes it, falling back to the raw ISO
 * string rather than inventing a format. A timestamp nobody can read is worse
 * than one that looks technical.
 */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Everything, as plain text, newest first.
 *
 * Deliberately not markdown, csv or anything with a syntax. A transcript can
 * contain any character in six languages, including the ones that would need
 * escaping, and an export that mangles somebody's words to satisfy a file
 * format has failed at the one job it has.
 */
export function formatAsText(items: readonly ExportableItem[]): string {
  if (items.length === 0) return 'Muffin Transcriber\n\nNo transcriptions yet.\n';

  const blocks = items.map((item) => {
    const head = [formatWhen(item.timestampISO), item.sourceFileName, formatDuration(item.audioDurationMs)]
      .filter(Boolean)
      .join('  |  ');

    const parts = [head, '='.repeat(Math.min(head.length, 60)), ''];

    const lang = item.detectedLanguage || item.language;
    if (lang) parts.push(`Language: ${lang}`, '');

    parts.push(item.rawTranscript.trim() || '(empty)');

    if (item.formattedTranscript?.trim()) {
      parts.push('', '--- Improved ---', '', item.formattedTranscript.trim());
    }
    if (item.summary?.trim()) {
      parts.push('', '--- Summary ---', '', item.summary.trim());
    }
    return parts.join('\n');
  });

  return (
    `Muffin Transcriber\n${items.length} transcription${items.length === 1 ? '' : 's'}\n\n` +
    blocks.join('\n\n\n') +
    '\n'
  );
}

/**
 * Everything, as json, for a restore that has to be exact.
 *
 * Wrapped in an object with a version rather than being a bare array, so a
 * future import can tell what it is holding instead of guessing from shape.
 * `exportedAt` is passed IN rather than read from the clock, which keeps this
 * function pure and testable.
 */
export function formatAsJson(items: readonly ExportableItem[], exportedAtISO: string): string {
  return JSON.stringify(
    { app: 'Muffin Transcriber', backupVersion: BACKUP_VERSION, exportedAt: exportedAtISO, count: items.length, items },
    null,
    2,
  );
}

/**
 * Strips the fields a backup has no business carrying.
 *
 * `embedding` is hundreds of floats per item and is derivable again from the
 * text, so keeping it would multiply the file size for nothing.
 * `sourceFilePath` points into app-private storage that will not exist after
 * the uninstall this backup is meant to survive, so restoring it would only
 * produce dead links to missing audio.
 */
export function toExportable(item: Record<string, any>): ExportableItem {
  return {
    id: item.id,
    timestampISO: item.timestampISO,
    sourceFileName: item.sourceFileName,
    language: item.language,
    rawTranscript: item.rawTranscript,
    formattedTranscript: item.formattedTranscript,
    summary: item.summary,
    audioDurationMs: item.audioDurationMs,
    detectedLanguage: item.detectedLanguage,
  };
}
