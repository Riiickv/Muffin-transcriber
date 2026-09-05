import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { shouldRunVad } from '../utils/vadPolicy.ts';

const SRC = readFileSync(new URL('../utils/ModelManager.ts', import.meta.url), 'utf8');
const WHISPER_BLOCK = SRC.slice(SRC.indexOf('WHISPER_MODELS'), SRC.indexOf('FORMATTER_MODELS'));
const ORDER = [...WHISPER_BLOCK.matchAll(/id: '([^']+)'/g)].map((m) => m[1]);

test('the fastest tier skips the trim, because Silero costs more than it saves there', () => {
  assert.equal(shouldRunVad('ggml-tiny-q8_0.bin'), false);
});

test('every slower tier still trims', () => {
  assert.equal(shouldRunVad('ggml-small-q8_0.bin'), true);
  assert.equal(shouldRunVad('ggml-large-v3-turbo-q8_0.bin'), true);
});

test('the decision covers the real catalog, not just the ids hardcoded here', () => {
  assert.ok(ORDER.length >= 3, 'catalog parse found nothing');
  // Exactly one tier opts out today. If a new fast tier is added, this fails
  // and someone has to decide deliberately rather than inherit a default.
  const skipped = ORDER.filter((id) => !shouldRunVad(id));
  assert.deepEqual(skipped, ['ggml-tiny-q8_0.bin']);
});

test('a re-quantised Tiny is still Tiny', () => {
  assert.equal(shouldRunVad('ggml-tiny-q5_0.bin'), false);
  assert.equal(shouldRunVad('ggml-tiny.bin'), false);
});

test('an empty id asks for nothing rather than guessing', () => {
  assert.equal(shouldRunVad(''), false);
});
