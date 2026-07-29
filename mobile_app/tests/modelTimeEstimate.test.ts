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
  const src = readFileSync(new URL('../utils/ModelManager.ts', import.meta.url), 'utf8');
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

test('the order matches the quality ladder', () => {
  // The catalog is ordered fastest to best, so estimates must rise with it.
  const seconds = WHISPER_IDS.map((id) => estimateFor(id, 'high')!.seconds);
  for (let i = 1; i < seconds.length; i++) {
    assert.ok(seconds[i] >= seconds[i - 1], `${WHISPER_IDS[i]} is not slower than the one before`);
  }
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
  // 26s for Large v3 Turbo on the phone this was calibrated against. If a
  // refactor moves this, every number in the UI moved with it.
  const e = estimateFor('ggml-large-v3-turbo-q8_0.bin', 'high')!;
  assert.ok(Math.abs(e.seconds - 26) < 0.5, `anchor drifted to ${e.seconds}`);
  assert.equal(e.measured, false);
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
