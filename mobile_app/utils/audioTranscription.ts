import * as FileSystemLegacy from 'expo-file-system/legacy';

import { convertToWav } from '@/modules/audio-converter';
import { transcribeFile, TranscribeCallbacks } from './WhisperEngine';

/**
 * Transcribe an audio file in whatever format it happens to be.
 *
 * whisper.rn reads audio with a hand-written RIFF parser: 16 kHz mono PCM WAV
 * or nothing. Every caller therefore has to convert first, and every caller that
 * forgot has produced the same unexplained "Invalid WAV file" - the Record tab
 * did for months, and Re-transcribe still does for anything recorded before that
 * was fixed. One function, so there is no longer a path that can forget.
 *
 * The WAV is a THROWAWAY. It's ~1.9 MB/min against the ~0.5 MB/min of the m4a it
 * came from, so keeping it as the stored recording quadrupled what a voice note
 * costs on disk - with auto-delete defaulting to Never. It lives in the cache
 * for the length of one transcription and is deleted in a finally, even when
 * transcription throws.
 */
export async function transcribeAudio(
  sourcePath: string,
  languageCode: string,
  callbacks?: TranscribeCallbacks
): Promise<{ text: string; segments: any[]; language?: string }> {
  const tmpWav = `${FileSystemLegacy.cacheDirectory}muffin_tmp_${Date.now()}.wav`;
  try {
    try {
      await convertToWav(sourcePath, tmpWav);
    } catch {
      // The converter couldn't read it. The one case where that's recoverable
      // is a file that's ALREADY the PCM WAV whisper wants, so let whisper look
      // at the source before giving up. If it isn't, whisper's own error is the
      // more useful one to surface anyway.
      return await transcribeFile(sourcePath, languageCode, callbacks);
    }
    return await transcribeFile(tmpWav, languageCode, callbacks);
  } finally {
    await FileSystemLegacy.deleteAsync(tmpWav, { idempotent: true }).catch(() => {});
  }
}

/** Where recordings live. Permanent, unlike the cache the recorder writes to. */
export const AUDIO_DIR = `${FileSystemLegacy.documentDirectory}MuffinAudio/`;

export async function ensureAudioDir(): Promise<void> {
  const info = await FileSystemLegacy.getInfoAsync(AUDIO_DIR);
  if (!info.exists) {
    await FileSystemLegacy.makeDirectoryAsync(AUDIO_DIR, { intermediates: true });
  }
}
