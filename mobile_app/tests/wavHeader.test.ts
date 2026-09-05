import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseWav } from '../utils/wavHeader.ts';

const RATE = 16000;

/** A mono 16-bit WAV whose sample N has the value N, so slices are identifiable. */
function makeWav(frames: number, extraChunk = false): Uint8Array {
  const dataBytes = frames * 2;
  const extra = extraChunk ? 12 : 0;
  const b = new Uint8Array(44 + extra + dataBytes);
  const t = (at: number, s: string) => { for (let i = 0; i < 4; i++) b[at + i] = s.charCodeAt(i); };
  const w32 = (at: number, v: number) => { b[at] = v & 255; b[at + 1] = (v >> 8) & 255; b[at + 2] = (v >> 16) & 255; b[at + 3] = (v >> 24) & 255; };
  const w16 = (at: number, v: number) => { b[at] = v & 255; b[at + 1] = (v >> 8) & 255; };

  t(0, 'RIFF'); w32(4, 36 + extra + dataBytes); t(8, 'WAVE');
  t(12, 'fmt '); w32(16, 16); w16(20, 1); w16(22, 1); w32(24, RATE); w32(28, RATE * 2); w16(32, 2); w16(34, 16);

  let at = 36;
  if (extraChunk) { t(at, 'LIST'); w32(at + 4, 4); at += 12; }
  t(at, 'data'); w32(at + 4, dataBytes);
  at += 8;
  for (let i = 0; i < frames; i++) w16(at + i * 2, i & 0xffff);
  return b;
}

test('parseWav reads a plain header', () => {
  const info = parseWav(makeWav(100));
  assert.equal(info?.sampleRate, RATE);
  assert.equal(info?.channels, 1);
  assert.equal(info?.dataOffset, 44);
  assert.equal(info?.dataLength, 200);
});

test('parseWav walks past a LIST chunk instead of assuming 44 bytes', () => {
  const info = parseWav(makeWav(100, true));
  assert.equal(info?.dataOffset, 56);
  assert.equal(info?.dataLength, 200);
});

test('parseWav rejects what is not a 16-bit WAV', () => {
  assert.equal(parseWav(new Uint8Array(10)), null);
});

// parseWav is handed only the FRONT of the file now: audioInfo reads a 64 KB
// header rather than megabytes of audio. Without the real size it would clamp
// the data chunk to the fragment and report a few milliseconds of audio.
test('a header-only read reports the whole file, not the slice it was given', () => {
  const whole = makeWav(RATE * 10);
  const head = whole.slice(0, 200);
  assert.equal(parseWav(head)?.dataLength, 200 - 44, 'without the size it can only see the slice');
  assert.equal(parseWav(head, whole.length)?.dataLength, RATE * 10 * 2);
});
