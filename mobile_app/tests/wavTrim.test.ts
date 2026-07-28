import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseWav, speechRanges, framesIn, trimToSpeech } from '../utils/wavTrim.ts';

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

test('speechRanges converts centiseconds and clamps to the file', () => {
  // 0.00-0.50s and 1.00-9.00s of a 2s file.
  const r = speechRanges([{ t0: 0, t1: 50 }, { t0: 100, t1: 900 }], 2 * RATE, RATE);
  assert.deepEqual(r, [{ start: 0, end: 8000 }, { start: 16000, end: 32000 }]);
});

test('speechRanges merges overlapping and touching spans', () => {
  const r = speechRanges([{ t0: 0, t1: 100 }, { t0: 90, t1: 200 }, { t0: 200, t1: 300 }], 10 * RATE, RATE);
  assert.deepEqual(r, [{ start: 0, end: 48000 }]);
  assert.equal(framesIn(r), 48000);
});

test('speechRanges drops empty spans and orders them', () => {
  const r = speechRanges([{ t0: 300, t1: 400 }, { t0: 50, t1: 50 }, { t0: 0, t1: 100 }], 10 * RATE, RATE);
  assert.deepEqual(r, [{ start: 0, end: 16000 }, { start: 48000, end: 64000 }]);
});

test('trimToSpeech keeps only the speech, and keeps it in order', () => {
  const wav = makeWav(1000);                       // 1000 frames, values 0..999
  const out = trimToSpeech(wav, [{ t0: 0, t1: 1 }]); // 0..160 frames
  assert.ok(out);
  assert.equal(out!.keptFrames, 160);
  assert.equal(out!.totalFrames, 1000);
  assert.equal(out!.wav.length, 44 + 160 * 2);

  const info = parseWav(out!.wav);
  assert.equal(info?.sampleRate, RATE);
  const first = out!.wav[44] | (out!.wav[45] << 8);
  const last = out!.wav[44 + 159 * 2] | (out!.wav[44 + 159 * 2 + 1] << 8);
  assert.equal(first, 0);
  assert.equal(last, 159);
});

test('trimToSpeech declines when there is little silence to remove', () => {
  const wav = makeWav(1000);
  // 0.62s of a 0.0625s file: everything is speech.
  assert.equal(trimToSpeech(wav, [{ t0: 0, t1: 100 }]), null);
});

test('trimToSpeech declines when the detector found nothing, rather than emptying the clip', () => {
  assert.equal(trimToSpeech(makeWav(1000), []), null);
});

test('trimToSpeech declines on a file it cannot parse', () => {
  assert.equal(trimToSpeech(new Uint8Array(8), [{ t0: 0, t1: 10 }]), null);
});

test('a clip that is mostly silence is cut down to its speech', () => {
  const wav = makeWav(10 * RATE);                       // 10 seconds
  const out = trimToSpeech(wav, [{ t0: 100, t1: 200 }]); // one second of speech
  assert.ok(out);
  assert.equal(out!.keptFrames, RATE);
  // The kept audio is the second second, so it starts at sample 16000.
  const first = out!.wav[44] | (out!.wav[45] << 8);
  assert.equal(first, 16000 & 0xffff);
});
