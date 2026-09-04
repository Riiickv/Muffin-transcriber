import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

import { ModelManager } from './ModelManager';
import { trimToSpeech, durationSeconds } from './wavTrim';

/**
 * SUPERSEDED, AND DELIBERATELY STILL HERE.
 *
 * whisper.cpp runs Silero itself now, on the samples it has already decoded
 * into memory, via the vad fields in whisper_full_params that the whisper.rn
 * binding was patched to pass through. See the comment in WhisperEngine's
 * transcribeFile. That removes this module's entire reason to exist: the second
 * file read, the base64 round trip in both directions, the rewritten WAV, and
 * the third read of that rewrite.
 *
 * Everything below except ensureVadModel is therefore unused. It is kept for
 * exactly one build, because native VAD has not yet run on a real phone and
 * there is no emulator here to run it on. If the Speed report from a device
 * shows "silence trimmed by whisper", delete trimSilence, discardTrim, the
 * base64 helpers, and trimToSpeech/speechRanges/framesIn in wavTrim, keeping
 * parseWav, which audioInfo uses to read durations.
 *
 * ensureVadModel stays whatever happens: getting the 0.8 MB Silero file onto
 * the phone is still this module's job, and whisper only wants the path.
 *
 * ---
 *
 * Removes the silence from a recording before whisper ever sees it.
 *
 * Strictly additive: every failure path here returns null and the caller
 * transcribes the untouched original. Silero not downloaded, no network, an
 * unparseable file, a clip that is all speech, an exception anywhere - all of
 * them mean "carry on as before", never a worse transcription.
 */

const VAD_MODEL = 'ggml-silero-v5.1.2.bin';
const VAD_URL = `https://huggingface.co/ggml-org/whisper-vad/resolve/main/${VAD_MODEL}`;

let vadContext: any = null;
let vadUnavailable = false;

function getInitVad(): any {
  if (Platform.OS === 'web') return null;
  try {
    return require('whisper.rn').initWhisperVad;
  } catch {
    return null;
  }
}

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

async function getVadContext(): Promise<any> {
  if (vadContext) return vadContext;
  if (vadUnavailable) return null;

  const init = getInitVad();
  if (!init) { vadUnavailable = true; return null; }

  const filePath = await ensureVadModel();
  if (!filePath) return null; // not permanent: the next attempt may have network

  try {
    vadContext = await init({ filePath, useGpu: false, nThreads: 2 });
    return vadContext;
  } catch {
    vadUnavailable = true;
    return null;
  }
}

// Hermes provides atob/btoa; this is the only base64 the file needs.
const b64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const bytesToB64 = (bytes: Uint8Array): string => {
  let bin = '';
  const CHUNK = 0x8000; // fromCharCode blows the stack on a whole recording
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
};

export type TrimResult = {
  /**
   * The speech-only copy to transcribe, or NULL meaning "use the original".
   *
   * Nullable so a declined trim can still report the duration it measured. The
   * caller must not try to delete a null path.
   */
  path: string | null;
  keptSeconds: number;
  totalSeconds: number;
};

/**
 * Returns a path to a speech-only copy, or null to use the original.
 * The caller must delete the copy when it is done with it.
 */
export async function trimSilence(wavPath: string): Promise<TrimResult | null> {
  if (!wavPath.toLowerCase().split('?')[0].endsWith('.wav')) return null;

  try {
    const vad = await getVadContext();
    if (!vad) return null;

    const spans = await vad.detectSpeech(wavPath, {
      // Whisper wants a moment of lead-in or it clips the first word, and a
      // gap shorter than this is a breath rather than the end of a sentence.
      speechPadMs: 200,
      minSilenceDurationMs: 300,
    });
    if (!Array.isArray(spans) || spans.length === 0) return null;

    const b64 = await FileSystem.readAsStringAsync(wavPath, { encoding: 'base64' as any });
    const bytes = b64ToBytes(b64);
    const trimmed = trimToSpeech(bytes, spans);
    if (!trimmed) {
      // The trim DECLINED, which for continuous speech is the normal outcome:
      // it does nothing when it would save under 15%. That used to return null
      // and the transcription carried on with the original, which is right.
      //
      // What was wrong is that it also threw away the duration, and the Speed
      // report then fell back to the end of whisper's last segment. Report the
      // real length instead, so a declined trim stops being a silently
      // different measurement from an accepted one.
      const seconds = durationSeconds(bytes);
      if (seconds === null) return null;
      return { path: null, keptSeconds: seconds, totalSeconds: seconds };
    }

    const out = `${FileSystem.cacheDirectory}muffin-speech-${Date.now()}.wav`;
    await FileSystem.writeAsStringAsync(out, bytesToB64(trimmed.wav), { encoding: 'base64' as any });

    return {
      path: out,
      keptSeconds: trimmed.keptFrames / 16000,
      totalSeconds: trimmed.totalFrames / 16000,
    };
  } catch {
    return null;
  }
}

export async function discardTrim(path: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {}
}
