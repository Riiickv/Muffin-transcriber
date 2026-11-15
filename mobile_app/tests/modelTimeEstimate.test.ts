import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  estimateFor,
  formatEstimateSeconds,
  billionsOfParams,
} from '../utils/modelTimeEstimate.ts';

// The catalog cannot be IMPORTED here: ModelManager pulls in expo modules and
// resolves '@/utils/...', neither of which exists in plain Node. Reading its ids
// out of the source keeps the invariant honest anyway - if someone adds a model
// and forgets an estimate for it, this fails.
function catalogIds(group: string): string[] {
  const src = readFileSync(new URL('../utils/modelCatalog.ts', import.meta.url), 'utf8');
  const start = src.indexOf(`export const ${group}: readonly ModelDef[] = [`);
  if (start < 0) throw new Error(`${group} not found in ModelManager`);
  const end = src.indexOf('\n];', start);
  return [...src.slice(start, end).matchAll(/\bid: '([^']+)'/g)].map((m) => m[1]);
}

const WHISPER_IDS = catalogIds('WHISPER_MODELS');
const LLM_IDS = [...catalogIds('FORMATTER_MODELS'), ...catalogIds('CHAT_MODELS')];

// The estimate is shown to people deciding what to download, so the failure
// that matters is not "slightly off" - it is a model with no estimate at all,
// or an estimate that ranks the models in the wrong order.

test('every whisper model in the catalog gets an estimate', () => {
  assert.ok(WHISPER_IDS.length >= 3, 'catalog parse found nothing');
  for (const id of WHISPER_IDS) {
    const e = estimateFor(id, 'high');
    assert.ok(e, `no estimate for ${id}`);
    assert.equal(e!.per, 'recording');
  }
});

test('every formatter and chat model gets an estimate', () => {
  assert.ok(LLM_IDS.length >= 3, 'catalog parse found nothing');
  for (const id of LLM_IDS) {
    const e = estimateFor(id, 'high');
    assert.ok(e, `no estimate for ${id}`);
    assert.equal(e!.per, 'minute');
  }
});

// This test used to assert that estimates rise with catalog position, on the
// reasoning that the catalog runs fastest to best. Measurement killed it: Most
// accurate is 13.6s a window and Balanced is 29.2s, so the quality order and
// the speed order genuinely disagree. What is still true, and worth pinning, is
// that every model has an estimate and Fastest is the fastest of them.
test('every tier is estimated, and Fastest really is the fastest', () => {
  const seconds = WHISPER_IDS.map((id) => estimateFor(id, 'high')!.seconds);
  assert.ok(seconds.every((n) => n > 0), 'a tier has no estimate');
  const fastest = estimateFor('ggml-tiny-q8_0.bin', 'high')!.seconds;
  assert.equal(Math.min(...seconds), fastest, 'something is quoted below Fastest');
});

test('a weaker device is estimated slower, never faster', () => {
  for (const id of WHISPER_IDS) {
    const high = estimateFor(id, 'high')!.seconds;
    const mid = estimateFor(id, 'mid')!.seconds;
    const low = estimateFor(id, 'low')!.seconds;
    assert.ok(mid > high && low > mid, `tiers out of order for ${id}`);
  }
});

test('the anchor still matches what was measured', () => {
  // 102.4s for Large v3 Turbo: encoder weight 32 x 3.2s, re-anchored on the
  // first clean Balanced measurement (38.4s for a 107s message on a rested
  // phone). If a refactor moves this, every number in the UI moved with it.
  const e = estimateFor('ggml-large-v3-turbo-q8_0.bin', 'high')!;
  assert.ok(Math.abs(e.seconds - 29.1) < 0.5, `anchor drifted to ${e.seconds}`);
  assert.equal(e.measured, false);
});

// The old anchor said 26s. Measured runs on a real voice message came back
// between 132s and 285s, so the screen where people CHOOSE this model was
// promising a fifth of the true wait, on the tier that had it as the default.
// A too-slow estimate costs a shrug; a too-fast one costs trust.
test('the whisper estimate is not wildly optimistic any more', () => {
  const turbo = estimateFor('ggml-large-v3-turbo-q8_0.bin', 'high')!.seconds;
  // Turbo measured 13.6s a window, so a one minute recording (two windows) is
  // about 27s. The bound used to be "> 60" from when this was thought to be the
  // slowest tier; it is in fact the middle one.
  assert.ok(turbo > 20 && turbo < 40, `turbo quoted at ${turbo}s`);

  // Small is the high tier's recommendation now, so its estimate is the one
  // most people will read. It must stay in "worth waiting for" territory.
  // Balanced measured 29.2s PER WINDOW, so a one minute recording (two windows)
  // is about 58s. The estimate must not drift back toward the optimistic
  // numbers that made 165s and 210s runs look inexplicable.
  const small = estimateFor('ggml-small-q8_0.bin', 'high')!.seconds;
  assert.ok(small > 45 && small < 70, `small quoted at ${small}s`);
  // Deliberately inverted, and measured: Balanced is 29.2s a window against
  // Turbo's 13.6s, because Turbo barely triggers whisper's temperature fallback
  // and Balanced retries constantly. Layer counting says the opposite, which is
  // why this assertion exists.
  assert.ok(turbo < small, 'Turbo measured FASTER than Balanced on this audio');
});

test('a real measurement wins over the table and says so', () => {
  const e = estimateFor('ggml-large-v3-turbo-q8_0.bin', 'high', 41.2)!;
  assert.equal(e.seconds, 41.2);
  assert.equal(e.measured, true);
});

test('an unknown model gets no estimate rather than a made-up one', () => {
  assert.equal(estimateFor('something-new.bin', 'high'), null);
});

test('parameter counts come out of the filenames the catalog uses', () => {
  assert.equal(billionsOfParams('qwen2.5-1.5b-instruct-q4_k_m.gguf'), 1.5);
  assert.equal(billionsOfParams('qwen2.5-0.5b-instruct-q4_0.gguf'), 0.5);
  assert.equal(billionsOfParams('Llama-3.2-1B-Instruct-Q4_K_M.gguf'), 1);
  assert.equal(billionsOfParams('ggml-tiny.bin'), null);
});

test('durations are rounded, not spuriously precise', () => {
  assert.equal(formatEstimateSeconds(0.8), '1s');
  assert.equal(formatEstimateSeconds(4.9), '5s');
  assert.equal(formatEstimateSeconds(26), '25s');
  assert.equal(formatEstimateSeconds(88), '90s');
  assert.equal(formatEstimateSeconds(104), '1.7m');
  assert.equal(formatEstimateSeconds(700), '12m');
  // Nothing ever reads "0s", which would say the work is free.
  assert.equal(formatEstimateSeconds(0.1), '1s');
});

test('the Fast speech model is estimated per recording, from the phone run', () => {
  const fast = estimateFor('ggml-parakeet-tdt-0.6b-v3-q4_0.bin', 'high');
  assert.ok(fast, 'no estimate for the Fast model');
  assert.equal(fast!.per, 'recording');
  // Measured: 11.1s for 116s, so about 5.7s for the one minute the anchor uses.
  assert.ok(fast!.seconds > 4.5 && fast!.seconds < 7, `got ${fast!.seconds}`);
  const accurate = estimateFor('ggml-large-v3-turbo-q8_0.bin', 'high');
  assert.ok(accurate!.seconds / fast!.seconds > 4, 'Fast should be several times quicker than Most accurate');
});

test('a speech file nobody measured gets no estimate, not a text model one', () => {
  // "0.6b" in the name used to be read as a 0.6 billion parameter text model.
  assert.equal(estimateFor('ggml-parakeet-tdt-0.6b-v3-q8_0.bin', 'high'), null);
});
