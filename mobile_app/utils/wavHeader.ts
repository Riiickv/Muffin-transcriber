/**
 * Reading a 16-bit PCM WAV header.
 *
 * This file used to cut silence out of recordings in JS, and that whole
 * apparatus is gone: whisper.cpp now runs Silero itself, on the samples it has
 * already decoded, via the vad fields in whisper_full_params that the whisper.rn
 * binding is patched to pass through. See WhisperEngine's transcribeFile.
 *
 * What survives is the part that was never about trimming: reading the header
 * so the Speed report can state the true length and format of what it was
 * given, instead of guessing from where whisper stopped emitting words.
 *
 * Pure on purpose. None of this can be tested on a phone from here, so it is
 * written as functions over bytes and covered by tests/wavHeader.test.ts.
 */

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
