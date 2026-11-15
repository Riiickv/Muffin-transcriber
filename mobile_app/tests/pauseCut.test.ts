import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  findQuietCut,
  nextRead,
  describePieces,
  PIECE_MIN_SECONDS,
  PIECE_MAX_SECONDS,
  TAIL_SECONDS,
} from '../utils/pauseCut.ts';

const RATE = 16000;

/** Loud everywhere except the given spans, which are silent. */
function clip(seconds: number, quiet: [number, number][]): Int16Array {
  const out = new Int16Array(seconds * RATE);
  for (let i = 0; i < out.length; i++) out[i] = i % 2 === 0 ? 9000 : -9000;
  for (const [a, b] of quiet) out.fill(0, Math.floor(a * RATE), Math.floor(b * RATE));
  return out;
}

test('cuts in the pause, not at the end of the window', () => {
  const cut = findQuietCut(clip(30, [[24, 24.5]]), RATE);
  assert.ok(cut >= 24 * RATE && cut <= 24.5 * RATE, `cut at ${cut / RATE}s`);
});

test('a pause before the minimum length is ignored', () => {
  const cut = findQuietCut(clip(30, [[5, 6]]), RATE);
  assert.ok(cut >= PIECE_MIN_SECONDS * RATE, `cut at ${cut / RATE}s`);
});

test('of two pauses the later one wins, so pieces are as long as allowed', () => {
  const cut = findQuietCut(clip(30, [[21, 21.4], [28, 28.4]]), RATE);
  assert.ok(cut >= 28 * RATE && cut <= 28.4 * RATE, `cut at ${cut / RATE}s`);
});

test('never cuts outside the window, even with no pause at all', () => {
  const cut = findQuietCut(clip(30, []), RATE);
  assert.ok(cut >= PIECE_MIN_SECONDS * RATE && cut <= PIECE_MAX_SECONDS * RATE);
});

test('a buffer shorter than the minimum is returned whole', () => {
  const short = clip(8, [[3, 4]]);
  assert.equal(findQuietCut(short, RATE), short.length);
});

test('negative samples count as loud', () => {
  const samples = new Int16Array(30 * RATE).fill(-9000);
  samples.fill(0, 25 * RATE, 25.3 * RATE);
  const cut = findQuietCut(samples, RATE);
  assert.ok(cut >= 25 * RATE && cut <= 25.3 * RATE, `cut at ${cut / RATE}s`);
});

test('a recording that fits in one piece plus a tail is read whole', () => {
  const left = (PIECE_MAX_SECONDS + TAIL_SECONDS) * RATE;
  assert.deepEqual(nextRead(left, RATE), { samples: left, whole: true });
  assert.deepEqual(nextRead(6 * RATE, RATE), { samples: 6 * RATE, whole: true });
});

test('anything longer is read one window at a time', () => {
  const left = (PIECE_MAX_SECONDS + TAIL_SECONDS) * RATE + 1;
  assert.deepEqual(nextRead(left, RATE), { samples: PIECE_MAX_SECONDS * RATE, whole: false });
});

test('pieces cover a long recording exactly once, each within the limits', () => {
  const total = 181 * RATE;
  const audio = clip(181, [[27, 27.3], [55, 55.3], [83, 83.2], [110, 110.4], [139, 139.3], [165, 165.2]]);
  let at = 0;
  const lengths: number[] = [];
  while (at < total) {
    const { samples, whole } = nextRead(total - at, RATE);
    const take = whole ? samples : findQuietCut(audio.subarray(at, at + samples), RATE);
    assert.ok(take > 0);
    lengths.push(take / RATE);
    at += take;
  }
  assert.equal(at, total);
  for (const s of lengths.slice(0, -1)) {
    assert.ok(s >= PIECE_MIN_SECONDS && s <= PIECE_MAX_SECONDS, `piece of ${s}s`);
  }
  assert.ok(lengths[lengths.length - 1] <= PIECE_MAX_SECONDS + TAIL_SECONDS);
});

test('the report line reads naturally for one piece and for several', () => {
  assert.equal(describePieces([1200]), '1 piece, median 1.2s, slowest 1.2s');
  assert.equal(describePieces([2000, 3000, 2100]), '3 pieces, median 2.1s, slowest 3.0s');
  assert.equal(describePieces([]), 'no pieces');
});
