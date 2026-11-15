import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { tierForMemoryBytes, recommendedForTier, RECOMMENDED, FAST_SPEECH_MODEL_ID } from '../utils/deviceTierData.ts';

const GB = 1024 * 1024 * 1024;

test('tierForMemoryBytes maps RAM to the right tier, on the boundaries', () => {
  assert.equal(tierForMemoryBytes(8 * GB), 'high');
  assert.equal(tierForMemoryBytes(7.5 * GB), 'high'); // exact boundary
  assert.equal(tierForMemoryBytes(7.4 * GB), 'mid');
  assert.equal(tierForMemoryBytes(6 * GB), 'mid');
  assert.equal(tierForMemoryBytes(5.5 * GB), 'mid'); // exact boundary
  assert.equal(tierForMemoryBytes(5.4 * GB), 'low');
  assert.equal(tierForMemoryBytes(4 * GB), 'low');
});

test('unknown memory assumes the weakest tier', () => {
  assert.equal(tierForMemoryBytes(0), 'low');
  assert.equal(tierForMemoryBytes(null), 'low');
  assert.equal(tierForMemoryBytes(undefined), 'low');
});

test('every tier recommends whisper/formatter/embedding, and only low opts out of chat', () => {
  for (const tier of ['low', 'mid', 'high'] as const) {
    assert.ok(recommendedForTier('whisper', tier), `${tier} has no whisper pick`);
    assert.ok(recommendedForTier('formatter', tier), `${tier} has no formatter pick`);
    assert.ok(recommendedForTier('embedding', tier), `${tier} has no embedding pick`);
  }
  assert.equal(recommendedForTier('chat', 'low'), null); // honest: nothing fits 4 GB
  assert.ok(recommendedForTier('chat', 'mid'));
  assert.ok(recommendedForTier('chat', 'high'));
});

test('INVARIANT: every recommended id exists in the model catalog', () => {
  // Read the catalog source rather than importing ModelManager (native imports).
  const catalog = readFileSync(new URL('../utils/modelCatalog.ts', import.meta.url), 'utf8');
  const catalogIds = new Set([...catalog.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]));
  assert.ok(catalogIds.size >= 8, 'catalog parse looks wrong');

  const recommendedIds = Object.values(RECOMMENDED)
    .flatMap((byGroup) => Object.values(byGroup))
    .filter((id): id is string => id !== null);

  for (const id of [...recommendedIds, FAST_SPEECH_MODEL_ID]) {
    assert.ok(catalogIds.has(id), `recommended model "${id}" is not in the catalog - it would silently not highlight`);
  }
});

test('Fast is the speech suggestion on mid and high when the phone language fits, and only then', () => {
  assert.equal(recommendedForTier('whisper', 'high', true), FAST_SPEECH_MODEL_ID);
  assert.equal(recommendedForTier('whisper', 'mid', true), FAST_SPEECH_MODEL_ID);
  // Unmeasured on a 4 GB phone, so low keeps the small model.
  assert.equal(recommendedForTier('whisper', 'low', true), RECOMMENDED.low.whisper);
  // A phone set to a language it does not cover gets what it got before.
  assert.equal(recommendedForTier('whisper', 'high', false), RECOMMENDED.high.whisper);
  assert.equal(recommendedForTier('whisper', 'high'), RECOMMENDED.high.whisper);
  // It is a speech model: it never leaks into the other groups.
  assert.equal(recommendedForTier('formatter', 'high', true), RECOMMENDED.high.formatter);
  assert.equal(recommendedForTier('chat', 'low', true), null);
});
