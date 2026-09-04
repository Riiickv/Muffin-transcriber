import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { pickDraftModel, shouldDraft } from '../utils/progressiveDraft.ts';

// The catalog cannot be IMPORTED here: ModelManager pulls in expo modules and
// resolves '@/utils/...', neither of which exists in plain Node. Read its ids
// out of the source instead, so these tests break if the real order changes.
const SRC = readFileSync(new URL('../utils/ModelManager.ts', import.meta.url), 'utf8');
const WHISPER_BLOCK = SRC.slice(
  SRC.indexOf('WHISPER_MODELS'),
  SRC.indexOf('FORMATTER_MODELS'),
);
const ORDER = [...WHISPER_BLOCK.matchAll(/id: '([^']+)'/g)].map((m) => m[1]);

const TINY = 'ggml-tiny-q8_0.bin';
const SMALL = 'ggml-small-q8_0.bin';
const TURBO = 'ggml-large-v3-turbo-q8_0.bin';

test('the catalog is still ordered fastest first, which the whole thing rests on', () => {
  assert.ok(ORDER.length >= 3, 'expected at least three whisper models');
  assert.equal(ORDER[0], TINY, 'tiny must be first or the index comparison is meaningless');
  assert.ok(ORDER.indexOf(SMALL) > ORDER.indexOf(TINY));
  assert.ok(ORDER.indexOf(TURBO) > ORDER.indexOf(SMALL));
});

test('drafts the fastest model the user actually has', () => {
  assert.equal(pickDraftModel(TURBO, [TINY, SMALL, TURBO], ORDER), TINY);
});

test('falls back to the next fastest when tiny is not downloaded', () => {
  assert.equal(pickDraftModel(TURBO, [SMALL, TURBO], ORDER), SMALL);
});

test('no draft when the user already chose the fastest', () => {
  assert.equal(pickDraftModel(TINY, [TINY, SMALL, TURBO], ORDER), null);
});

test('no draft when nothing faster is downloaded', () => {
  assert.equal(pickDraftModel(SMALL, [SMALL, TURBO], ORDER), null);
});

test('never drafts with the chosen model itself', () => {
  for (const id of ORDER) {
    assert.notEqual(pickDraftModel(id, ORDER, ORDER), id);
  }
});

test('an unknown model id refuses rather than guessing', () => {
  assert.equal(pickDraftModel('ggml-something-else.bin', [TINY], ORDER), null);
});

test('short audio is not worth a draft, long audio is', () => {
  assert.equal(shouldDraft(2000), false);
  assert.equal(shouldDraft(30000), true);
  assert.equal(shouldDraft(8000), true, 'the threshold itself counts as worth it');
});

test('unknown length drafts, because that is the shared voice message case', () => {
  assert.equal(shouldDraft(undefined), true);
  assert.equal(shouldDraft(0), true);
});
