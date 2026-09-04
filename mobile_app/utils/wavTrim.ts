/**
 * Cutting silence out of a 16-bit PCM WAV, given the speech regions Silero
 * found.
 *
 * This is BOTH faster and more accurate, which is why it is worth doing where
 * shrinking the encoder context was not. Whisper spends the same effort on a
 * silent 30-second window as a full one, so removing silence removes real work.
 * And silence is where whisper hallucinates: with nothing to transcribe it
 * emits whatever its language model finds likely, which is where the invented
 * sentences and the repeated phrases come from. No silence, no hallucination.
 *
 * Pure on purpose. None of this can be tested on a phone from here, so it is
 * written as functions over bytes and covered by tests/wavTrim.test.ts.
 */

export type VadSpan = { t0: number; t1: number };
export type SampleRange = { start: number; end: number };

export type WavInfo = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataLength: number;
};

const u32 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24);
const u16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const tag = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);

/**
 * Walks the RIFF chunks rather than assuming a 44-byte header: recorders
 * routinely insert LIST/fact chunks before the data, and a fixed offset would
 * splice metadata into the audio.
 */
/**
 * @param totalFileBytes  The real size of the file on disk, when `bytes` is
 *   only its first few KB. Without it the data chunk is clamped to the slice
 *   and a header-only read reports a few milliseconds of audio. Omit it when
 *   `bytes` really is the whole file.
 */
export function parseWav(bytes: Uint8Array, totalFileBytes?: number): WavInfo | null {
  if (bytes.length < 44 || tag(bytes, 0) !== 'RIFF' || tag(bytes, 8) !== 'WAVE') return null;
  const fileBytes = totalFileBytes && totalFileBytes > 0 ? totalFileBytes : bytes.length;

  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataOffset = 0;
  let dataLength = 0;

  let at = 12;
  while (at + 8 <= bytes.length) {
    const id = tag(bytes, at);
    const size = u32(bytes, at + 4);
    const body = at + 8;
    if (size < 0 || body > bytes.length) break;

    if (id === 'fmt ') {
      channels = u16(bytes, body + 2);
      sampleRate = u32(bytes, body + 4);
      bitsPerSample = u16(bytes, body + 14);
    } else if (id === 'data') {
      dataOffset = body;
      // A truncated recording can claim more than it holds.
      dataLength = Math.min(size, fileBytes - body);
      break;
    }
    at = body + size + (size % 2); // chunks are word-aligned
  }

  if (!sampleRate || !channels || bitsPerSample !== 16 || !dataOffset || dataLength <= 0) return null;
  return { sampleRate, channels, bitsPerSample, dataOffset, dataLength };
}

/**
 * Silero reports centiseconds. Converts to frame indices, clamps to the file,
 * drops empties and merges anything that overlaps or touches, so the output is
 * always ordered and disjoint.
 */
export function speechRanges(spans: VadSpan[], totalFrames: number, sampleRate: number): SampleRange[] {
  const out: SampleRange[] = [];

  for (const s of spans) {
    const start = Math.max(0, Math.floor((s.t0 / 100) * sampleRate));
    const end = Math.min(totalFrames, Math.ceil((s.t1 / 100) * sampleRate));
    if (end > start) out.push({ start, end });
  }

  out.sort((a, b) => a.start - b.start);

  const merged: SampleRange[] = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

export function framesIn(ranges: SampleRange[]): number {
  return ranges.reduce((n, r) => n + (r.end - r.start), 0);
}

/**
 * Builds a new WAV holding only those ranges.
 *
 * Returns null when there is nothing worth doing, and the caller then
 * transcribes the original untouched. That is the whole safety story: this can
 * only ever be a saving, never a risk of losing speech.
 *
 * `minSavingRatio` is how much of the file has to be silence before it is worth
 * rewriting: below that the copy costs more than the skipped audio saves.
 */
/**
 * How long the recording is, straight from its own header.
 *
 * Exists because the Speed report was quoting a length it had guessed. When the
 * trim declines, which is the common case for continuous speech, trimToSpeech
 * returns null and the caller fell back to the end of whisper's LAST SEGMENT.
 * That is where whisper stopped emitting words, not where the audio stops, so
 * any trailing silence or an early-finishing decode made the recording look
 * shorter than it was and the realtime factor look worse than it was. One run
 * was reported as 45 seconds of audio and used, in this repo, to argue that
 * short clips cost more than long ones.
 *
 * trimToSpeech already computes this and throws it away on every decline path.
 * This is the same arithmetic, kept.
 */
export function durationSeconds(bytes: Uint8Array): number | null {
  const info = parseWav(bytes);
  if (!info) return null;
  const bytesPerFrame = info.channels * 2;
  if (bytesPerFrame <= 0 || info.sampleRate <= 0) return null;
  const frames = Math.floor(info.dataLength / bytesPerFrame);
  return frames > 0 ? frames / info.sampleRate : null;
}

export function trimToSpeech(
  bytes: Uint8Array,
  spans: VadSpan[],
  minSavingRatio = 0.15
): { wav: Uint8Array; keptFrames: number; totalFrames: number } | null {
  const info = parseWav(bytes);
  if (!info) return null;

  const bytesPerFrame = info.channels * 2;
  const totalFrames = Math.floor(info.dataLength / bytesPerFrame);
  if (totalFrames <= 0) return null;

  const ranges = speechRanges(spans, totalFrames, info.sampleRate);
  // No speech found at all means the detector failed or the clip really is
  // silent. Either way, hand back the original rather than an empty file.
  if (ranges.length === 0) return null;

  const kept = framesIn(ranges);
  if (kept <= 0) return null;
  if (kept / totalFrames > 1 - minSavingRatio) return null;

  const dataBytes = kept * bytesPerFrame;
  const wav = new Uint8Array(44 + dataBytes);

  const writeTag = (at: number, s: string) => {
    for (let i = 0; i < 4; i++) wav[at + i] = s.charCodeAt(i);
  };
  const write32 = (at: number, v: number) => {
    wav[at] = v & 0xff; wav[at + 1] = (v >> 8) & 0xff; wav[at + 2] = (v >> 16) & 0xff; wav[at + 3] = (v >> 24) & 0xff;
  };
  const write16 = (at: number, v: number) => {
    wav[at] = v & 0xff; wav[at + 1] = (v >> 8) & 0xff;
  };

  writeTag(0, 'RIFF');
  write32(4, 36 + dataBytes);
  writeTag(8, 'WAVE');
  writeTag(12, 'fmt ');
  write32(16, 16);
  write16(20, 1); // PCM
  write16(22, info.channels);
  write32(24, info.sampleRate);
  write32(28, info.sampleRate * bytesPerFrame); // byte rate
  write16(32, bytesPerFrame);
  write16(34, 16);
  writeTag(36, 'data');
  write32(40, dataBytes);

  let at = 44;
  for (const r of ranges) {
    const from = info.dataOffset + r.start * bytesPerFrame;
    const to = info.dataOffset + r.end * bytesPerFrame;
    wav.set(bytes.subarray(from, to), at);
    at += to - from;
  }

  return { wav, keptFrames: kept, totalFrames };
}
