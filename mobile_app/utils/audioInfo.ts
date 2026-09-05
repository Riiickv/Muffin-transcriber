import * as FileSystemLegacy from 'expo-file-system/legacy';

import { parseWav } from './wavHeader';

/**
 * Required lazily, and this is not stylistic.
 *
 * Everything else in this app imports 'expo-file-system/legacy'. This is the
 * FIRST use of the modern module, whose JS entry pulls in a native module that
 * has never been exercised in a Muffin build. A top-level import that failed
 * would take WhisperEngine down with it, and WhisperEngine is the app. Required
 * inside a try instead, so the worst case is a report missing one line.
 */
function getFileClass(): any {
  try {
    return require('expo-file-system').File;
  } catch {
    return null;
  }
}

/**
 * What the app was actually handed, for the Speed report.
 *
 * The report used to say "(107s audio)" and that number was a guess: it came
 * from the silence trim when the trim ran, and from the end of whisper's last
 * segment when it declined, which is where whisper stopped emitting words
 * rather than where the audio stops. Nobody could tell from a pasted report
 * whether a slow run was a long recording, a stereo file being decoded twice
 * over, or a 48 kHz file being resampled.
 *
 * So this reads the truth off the file itself, and it reads only the HEADER.
 * A WAV header is a few hundred bytes; the recording behind it is megabytes.
 * FileHandle.readBytes lets us take the front of the file and leave the rest on
 * disk, which is what makes this cheap enough to run on every single
 * transcription.
 */

export type AudioInfo = {
  /** Lowercase, no dot. 'wav', 'm4a', 'opus'. Empty when the path has none. */
  extension: string;
  /** Size on disk. 0 when it could not be read. */
  bytes: number;
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
  /** Only from a parsed header. Undefined for formats this cannot read. */
  durationSeconds?: number;
};

/**
 * Enough of the front of the file to walk past any LIST or fact chunks a
 * recorder inserted before the audio. 64 KB is far more than any real header
 * and still a rounding error against a multi-megabyte recording.
 */
const HEADER_BYTES = 64 * 1024;

function extensionOf(path: string): string {
  const clean = path.split('?')[0];
  const dot = clean.lastIndexOf('.');
  const slash = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
  if (dot < 0 || dot < slash) return '';
  return clean.slice(dot + 1).toLowerCase();
}

/**
 * Never throws and never blocks the transcription. Every failure returns the
 * least-wrong thing it still knows, down to null, because a diagnostic that can
 * break the thing it is diagnosing is worse than no diagnostic.
 *
 * NOTE: this is the first use of expo-file-system's MODERN api in this app.
 * Everything else imports 'expo-file-system/legacy'. The two are designed to
 * coexist (the v57 legacy docs say so explicitly, and expo-module.config.json
 * registers both native modules), but if the modern module misbehaves on a real
 * device the catch below drops to the legacy size lookup and the app carries on
 * with a slightly poorer report.
 */
export async function readAudioInfo(path: string): Promise<AudioInfo | null> {
  const extension = extensionOf(path);

  let bytes = 0;
  let head: Uint8Array | null = null;

  try {
    const FileClass = getFileClass();
    if (!FileClass) throw new Error('modern file api unavailable');
    const file = new FileClass(path);
    bytes = file.size ?? 0;
    if (bytes > 0 && extension === 'wav') {
      const handle = file.open();
      try {
        head = handle.readBytes(Math.min(HEADER_BYTES, bytes));
      } finally {
        handle.close();
      }
    }
  } catch {
    // Modern API unavailable or unhappy. Fall back to a plain stat, which is
    // all the legacy module can offer, and report what that gives us.
    try {
      const info = await FileSystemLegacy.getInfoAsync(path);
      bytes = (info as any)?.size ?? 0;
    } catch {
      return extension ? { extension, bytes: 0 } : null;
    }
  }

  if (!head) return { extension, bytes };

  // The real file size, not the slice length: parseWav clamps the data chunk to
  // whatever buffer it was given, and this buffer is deliberately a fragment.
  const wav = parseWav(head, bytes);
  if (!wav) return { extension, bytes };

  const bytesPerFrame = wav.channels * (wav.bitsPerSample / 8);
  const durationSeconds =
    bytesPerFrame > 0 && wav.sampleRate > 0
      ? Math.floor(wav.dataLength / bytesPerFrame) / wav.sampleRate
      : undefined;

  return {
    extension,
    bytes,
    sampleRate: wav.sampleRate,
    channels: wav.channels,
    bitsPerSample: wav.bitsPerSample,
    durationSeconds,
  };
}

/**
 * One line for the report: "wav 16 kHz mono 16-bit, 3.3 MB".
 *
 * Written to be readable by someone pasting it into a chat, not parsed by
 * anything. Whatever is unknown is simply left out rather than printed as a
 * zero, so an absent field reads as "not known" instead of "it was zero".
 */
export function describeAudio(info: AudioInfo | null): string | undefined {
  if (!info) return undefined;

  const parts: string[] = [];
  if (info.extension) parts.push(info.extension);
  if (info.sampleRate) parts.push(`${Math.round(info.sampleRate / 100) / 10} kHz`);
  if (info.channels) {
    parts.push(info.channels === 1 ? 'mono' : info.channels === 2 ? 'stereo' : `${info.channels}ch`);
  }
  if (info.bitsPerSample) parts.push(`${info.bitsPerSample}-bit`);

  const head = parts.join(' ');
  const size = info.bytes > 0 ? `${(info.bytes / 1024 / 1024).toFixed(1)} MB` : '';
  if (head && size) return `${head}, ${size}`;
  return head || size || undefined;
}
