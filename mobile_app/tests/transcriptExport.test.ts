import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatAsText,
  formatAsJson,
  toExportable,
  BACKUP_VERSION,
  type ExportableItem,
} from '../utils/transcriptExport.ts';

const item = (over: Partial<ExportableItem> = {}): ExportableItem => ({
  id: 'a1',
  timestampISO: '2026-09-05T14:30:00.000Z',
  sourceFileName: 'voice message.m4a',
  language: 'Auto-Detect',
  rawTranscript: 'Ciao, come stai?',
  ...over,
});

test('an empty history exports a file that says so, not an empty file', () => {
  const out = formatAsText([]);
  assert.ok(out.includes('No transcriptions'), 'a zero-byte export reads as a failed export');
});

test('the text export carries the words, the improved version and the summary', () => {
  const out = formatAsText([
    item({ formattedTranscript: 'Ciao, come stai?', summary: 'A greeting.' }),
  ]);
  assert.ok(out.includes('Ciao, come stai?'));
  assert.ok(out.includes('A greeting.'));
  assert.ok(out.includes('Improved'));
  assert.ok(out.includes('Summary'));
});

test('sections are omitted rather than left as empty headings', () => {
  const out = formatAsText([item()]);
  assert.ok(!out.includes('Improved'), 'an absent improvement must not print a heading');
  assert.ok(!out.includes('Summary'));
});

// Accented and non-Latin characters are the whole point of a six language app,
// and every format with a syntax is a chance to mangle them.
test('text survives accents, quotes and newlines untouched', () => {
  const tricky = 'Perché "così"?\nSeconda riga, ñ, ü, ¿qué?';
  const out = formatAsText([item({ rawTranscript: tricky })]);
  assert.ok(out.includes(tricky), 'the transcript was altered on the way out');
});

test('an empty transcript is marked, not silently blank', () => {
  const out = formatAsText([item({ rawTranscript: '   ' })]);
  assert.ok(out.includes('(empty)'));
});

test('whisper detected language wins over the setting it was recorded under', () => {
  const out = formatAsText([item({ language: 'Auto-Detect', detectedLanguage: 'it' })]);
  assert.ok(out.includes('Language: it'));
  assert.ok(!out.includes('Auto-Detect'), 'Auto-Detect names a setting, not a language');
});

test('duration is human readable, and absent when it was never measured', () => {
  assert.ok(formatAsText([item({ audioDurationMs: 187000 })]).includes('3:07'));
  assert.ok(formatAsText([item({ audioDurationMs: 3723000 })]).includes('1:02:03'));
  // Checked on the HEADER line, not the whole document: a locale timestamp like
  // "2:30:00 PM" contains "0:00" and made the naive version of this pass for
  // the wrong reason.
  const header = (ms?: number) =>
    formatAsText([item({ audioDurationMs: ms })]).split('\n').find((l) => l.includes('voice message.m4a'))!;
  assert.ok(header(187000).endsWith('3:07'), 'the duration belongs on the header line');
  assert.ok(!header(undefined).trimEnd().endsWith('|'), 'an unknown length must not leave a dangling separator');
  assert.ok(!/\d+:\d\d$/.test(header(undefined).trimEnd()), 'an unknown length must not read as a time');
});

test('a bad timestamp falls back to the raw value instead of Invalid Date', () => {
  const out = formatAsText([item({ timestampISO: 'not-a-date' })]);
  assert.ok(out.includes('not-a-date'));
  assert.ok(!out.includes('Invalid Date'));
});

// The json is the one a restore reads, so its shape is a contract.
test('the json backup round-trips and declares what it is', () => {
  const json = formatAsJson([item()], '2026-09-05T15:00:00.000Z');
  const parsed = JSON.parse(json);
  assert.equal(parsed.backupVersion, BACKUP_VERSION);
  assert.equal(parsed.count, 1);
  assert.equal(parsed.items[0].rawTranscript, 'Ciao, come stai?');
  assert.equal(parsed.exportedAt, '2026-09-05T15:00:00.000Z');
});

test('the json is valid with an empty history', () => {
  const parsed = JSON.parse(formatAsJson([], '2026-09-05T15:00:00.000Z'));
  assert.deepEqual(parsed.items, []);
  assert.equal(parsed.count, 0);
});

// A backup exists to survive an uninstall. Anything pointing INTO the storage
// that the uninstall destroys is dead weight that restores as a broken link.
test('the backup drops embeddings and paths that will not exist after a reinstall', () => {
  const stripped = toExportable({
    ...item(),
    embedding: new Array(384).fill(0.1),
    sourceFilePath: 'file:///data/user/0/com.riiick.muffin/files/MuffinAudio/x.m4a',
    extractedDates: [{ quote: 'domani', name: 'tomorrow', type: 'date' }],
  });
  assert.equal((stripped as any).embedding, undefined, 'embeddings would bloat the file for nothing');
  assert.equal((stripped as any).sourceFilePath, undefined, 'the audio does not survive the uninstall');
  assert.equal(stripped.rawTranscript, 'Ciao, come stai?', 'the words must survive');
});

test('toExportable keeps every field a restore actually needs', () => {
  const full = toExportable({
    id: 'x', timestampISO: 't', sourceFileName: 'f', language: 'l',
    rawTranscript: 'r', formattedTranscript: 'fm', summary: 's',
    audioDurationMs: 1000, detectedLanguage: 'it',
  });
  for (const k of ['id','timestampISO','sourceFileName','language','rawTranscript','formattedTranscript','summary','audioDurationMs','detectedLanguage']) {
    assert.ok((full as any)[k] !== undefined, `${k} was dropped from the backup`);
  }
});
