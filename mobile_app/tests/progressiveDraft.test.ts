import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { pickDraftModel as pick, shouldDraft } from '../utils/progressiveDraft.ts';
import { relativeCost } from '../utils/modelTimeEstimate.ts';

/** Every test here means the production call, which supplies real costs. */
const pickDraftModel = (
  chosen: string,
  downloaded: readonly string[],
  ordered: readonly string[],
  languageIsAuto: boolean = false,
) => pick(chosen, downloaded, ordered, languageIsAuto, relativeCost);

// The catalog cannot be IMPORTED here: ModelManager pulls in expo modules and
// resolves '@/utils/...', neither of which exists in plain Node. Read its ids
// out of the source instead, so these tests break if the real order changes.
const SRC = readFileSync(new URL('../utils/modelCatalog.ts', import.meta.url), 'utf8');
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

// Was: "falls back to the next fastest when tiny is not downloaded", expecting
// SMALL. Measurement inverted it. Balanced runs at 29.2s a window against
// Turbo's 13.6s, so offering Balanced as the draft for a Turbo run would put a
// 165 second preview in front of a 76 second job.
test('never drafts with something slower than the model actually chosen', () => {
  assert.equal(pickDraftModel(TURBO, [SMALL, TURBO], ORDER), null);
});

test('still drafts with Fastest, which really is cheaper than both', () => {
  assert.equal(pickDraftModel(TURBO, [TINY, SMALL, TURBO], ORDER), TINY);
  assert.equal(pickDraftModel(SMALL, [TINY, SMALL], ORDER), TINY);
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

// Whisper identifies the language from the first window, and Tiny's is weak
// enough to call Italian English. A draft in the wrong language, replaced a
// minute later, reads as a broken app rather than a refinement.
// Was: "tiny is skipped and the next model drafts instead", expecting SMALL.
// Two rules now have to agree and they rule everything out. Tiny is skipped on
// Auto-Detect because its language ID is weak enough to draft in the wrong
// language, and Balanced no longer qualifies as a draft for Most accurate at
// all, because it measures 12.2x Fastest against Turbo's 5.7x. Nothing is both
// rougher and cheaper, so nothing drafts, which is the correct answer rather
// than a gap.
test('on Auto-Detect there is no draft for Most accurate, and that is right', () => {
  assert.equal(pickDraftModel(TURBO, [TINY, SMALL, TURBO], ORDER, true), null);
});

test('with a language chosen, Fastest drafts for Most accurate as before', () => {
  assert.equal(pickDraftModel(TURBO, [TINY, SMALL, TURBO], ORDER, false), TINY);
});

test('with a language chosen, tiny is fine to draft with', () => {
  assert.equal(pickDraftModel(TURBO, [TINY, SMALL, TURBO], ORDER, false), TINY);
});

test('on Auto-Detect with only tiny available, there is no draft at all', () => {
  assert.equal(pickDraftModel(TURBO, [TINY, TURBO], ORDER, true), null);
});

test('the language flag defaults to trusting the model, so old callers are unchanged', () => {
  assert.equal(pickDraftModel(TURBO, [TINY, SMALL, TURBO], ORDER), TINY);
});
