import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

import { ModelManager } from './ModelManager';
import { trimToSpeech } from './wavTrim';

/**
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

/** 0.8 MB, fetched once. Offline just means no trimming until it has been. */
async function ensureVadModel(): Promise<string | null> {
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

export type TrimResult = { path: string; keptSeconds: number; totalSeconds: number };

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
    const trimmed = trimToSpeech(b64ToBytes(b64), spans);
    if (!trimmed) return null;

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
