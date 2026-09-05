import * as FileSystem from 'expo-file-system/legacy';

import { ModelManager } from './ModelManager';

/**
 * Getting the Silero VAD model onto the phone.
 *
 * All this file used to do was cut silence out in JS before whisper saw it:
 * read the WAV a second time as base64, walk it into bytes a character at a
 * time, splice out the quiet parts, walk it back to base64, write a new file.
 * whisper.cpp does that itself now, on the samples already in memory, and only
 * needs to be told where this model lives. So the trimming is gone and the
 * download is all that is left.
 *
 * Still strictly additive: no model means no trim, never a failed
 * transcription.
 */

const VAD_MODEL = 'ggml-silero-v5.1.2.bin';
const VAD_URL = `https://huggingface.co/ggml-org/whisper-vad/resolve/main/${VAD_MODEL}`;

/**
 * 0.8 MB, fetched once. Offline just means no trimming until it has been.
 *
 * Exported because whisper.cpp now runs this model ITSELF, on the samples it
 * has already decoded, and only needs to be told where the file is. Getting the
 * file onto the phone is still this module's job.
 */
export async function ensureVadModel(): Promise<string | null> {
  const path = ModelManager.getModelPath(VAD_MODEL);
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists && (info as any).size > 100000) return path;

    const partial = `${path}.part`;
    await FileSystem.downloadAsync(VAD_URL, partial);
    const got = await FileSystem.getInfoAsync(partial);
    if (!got.exists || (got as any).size < 100000) {
      await FileSystem.deleteAsync(partial, { idempotent: true });
      return null;
    }
    await FileSystem.moveAsync({ from: partial, to: path });
    return path;
  } catch {
    return null;
  }
}
