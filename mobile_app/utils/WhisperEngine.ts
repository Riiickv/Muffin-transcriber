import { Platform } from 'react-native';
import type { WhisperContext } from 'whisper.rn';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { loadSettings } from './settingsStore';
import { loadMemories } from './memoryStore';

// ggml synchronizes all threads per graph node, so one little core stalls the
// big ones — on 2-big-core phones 4 threads is ~60% SLOWER than 2. Count the
// performance cores from sysfs (world-readable) and clamp to [2,5]; any read
// failure falls back to 4 (correct for modern 4-5-big-core SoCs).
let cachedThreads: number | null = null;
async function getOptimalThreads(): Promise<number> {
  if (cachedThreads !== null) return cachedThreads;
  let threads = 4;
  try {
    const possible = await FileSystemLegacy.readAsStringAsync('file:///sys/devices/system/cpu/possible');
    const m = possible.trim().match(/(\d+)-(\d+)/);
    const nCpu = m ? parseInt(m[2], 10) + 1 : 8;
    const freqs: number[] = [];
    for (let i = 0; i < Math.min(nCpu, 16); i++) {
      try {
        const f = await FileSystemLegacy.readAsStringAsync(
          `file:///sys/devices/system/cpu/cpu${i}/cpufreq/cpuinfo_max_freq`
        );
        const v = parseInt(f.trim(), 10);
        if (isFinite(v) && v > 0) freqs.push(v);
      } catch {}
    }
    if (freqs.length >= 2) {
      const max = Math.max(...freqs);
      const perfCores = freqs.filter((f) => f >= max * 0.8).length;
      threads = Math.max(2, Math.min(5, perfCores));
    }
  } catch {}
  cachedThreads = threads;
  return threads;
}

let initWhisper: any;
function getInitWhisper() {
  if (!initWhisper && Platform.OS !== 'web') {
    initWhisper = require('whisper.rn').initWhisper;
  }
  return initWhisper;
}

export interface Segment {
  t0: number; // Start time in 10ms ticks (or frames depending on the wrapper)
  t1: number; // End time
  text: string;
}

let whisperContext: WhisperContext | null = null;
let currentModelPath = '';
let loadPromise: Promise<void> | null = null;

export async function loadWhisper(modelPath: string): Promise<void> {
  if (whisperContext && currentModelPath === modelPath) {
    return;
  }

  // Coalesce concurrent loads (same pattern as LLMEngine): two init() calls
  // while the context is still null orphan the first native context.
  while (loadPromise) {
    try {
      await loadPromise;
    } catch {
      // A failed background preload (partial download, corrupt file) must not
      // doom this attempt — fall through and try our own load.
    }
    if (whisperContext && currentModelPath === modelPath) return;
  }

  const p = (async () => {
    if (whisperContext) await unloadWhisper();
    const init = getInitWhisper();
    // No flash attention: whisper.rn recommends it only when a GPU backend is
    // available (iOS). On Android's CPU path it slows decoding down.
    whisperContext = await init({ filePath: modelPath });
    currentModelPath = modelPath;
  })();
  loadPromise = p;

  try {
    await p;
  } catch (error) {
    console.error('Failed to load whisper model:', error);
    throw error;
  } finally {
    if (loadPromise === p) loadPromise = null;
  }
}

// Cold-start warm-up: kick off the (multi-second) model load while the user is
// still looking at the screen, so tapping Transcribe doesn't pay it. Only when
// nothing is loaded or loading — never swaps a live context out from under a
// running transcription.
export function preloadWhisper(modelPath: string): void {
  if (whisperContext || loadPromise) return;
  loadWhisper(modelPath).catch(() => {});
}

/**
 * @param audioPath  Absolute path to a 16 kHz mono WAV/PCM file.
 * @param languageCode  ISO 639-1 code (`en`, `it`, ...) or `auto` for detect.
 *                      Do NOT pass display names like "Italian" — call
 *                      `toLanguageCode()` from utils/languages.ts first.
 */
export async function transcribeFile(
  audioPath: string,
  languageCode: string = 'auto'
): Promise<{ text: string; segments: Segment[] }> {
  if (!whisperContext) {
    throw new Error('Whisper not loaded. Call loadWhisper first.');
  }

  const settings = await loadSettings();

  // Whisper's encoder always processes a full 30s window (1500 frames), so a
  // 10s voice note wastes 2/3 of the encode on silence. For short WAV clips,
  // shrink the encoder context proportionally (patched into whisper.rn via
  // patches/whisper.rn+0.6.0.patch). Conservative: +128 frames headroom,
  // floor 256, only under 25s — too-small contexts cause token repetition.
  let audioCtx = 0; // 0 = whisper default
  try {
    if (audioPath.toLowerCase().split('?')[0].endsWith('.wav')) {
      const info = await FileSystemLegacy.getInfoAsync(audioPath);
      if (info.exists && typeof info.size === 'number' && info.size > 44) {
        const seconds = (info.size - 44) / 32000; // 16 kHz mono s16le
        if (seconds > 0 && seconds <= 25) {
          audioCtx = Math.max(256, Math.min(1500, Math.ceil(((seconds / 30) * 1500 + 128) / 64) * 64));
        }
      }
    }
  } catch {}

  let initialPrompt = undefined;
  if (settings.enableContextLearning) {
    const memories = await loadMemories();
    if (memories.length > 0) {
      // The prompt is re-processed for EVERY ~30s audio window, so an unbounded
      // memory list slows the whole transcription. Cap it to the most recent
      // entries and ~400 chars.
      const memoryText = memories.slice(0, 15).map(m => m.text).join(', ').slice(0, 400);
      initialPrompt = `The following transcript contains these specific terms: ${memoryText}.`;
    }
  }

  const options: any = {
    // Whisper.rn treats `undefined` language as auto-detect.
    language: languageCode && languageCode !== 'auto' ? languageCode : undefined,
    // Keep transcription in the source language (don't translate to English).
    translate: false,
    // Greedy decoding: ~3-5x faster than beam search with negligible quality
    // loss for speech transcription. Token timestamps stay off — nothing in
    // the app consumes them and they add per-token cost.
    beamSize: 1,
    bestOf: 1,
    // Match thread count to the device's performance cores.
    maxThreads: await getOptimalThreads(),
    // Shrunken encoder context for short clips (0 = default 1500).
    ...(audioCtx > 0 ? { audioCtx } : null),
    // Bias Whisper toward user-taught vocabulary; undefined when empty so we
    // don't prime the decoder with an empty string.
    prompt: initialPrompt,
  };

  const { promise } = whisperContext.transcribe(audioPath, options);
  const result = await promise;

  return {
    text: result.result,
    segments: result.segments || [],
  };
}

export async function unloadWhisper(): Promise<void> {
  if (whisperContext) {
    try {
      await whisperContext.release();
    } catch (e) {
      console.warn('Error releasing whisper context:', e);
    }
    whisperContext = null;
    currentModelPath = '';
  }
}
