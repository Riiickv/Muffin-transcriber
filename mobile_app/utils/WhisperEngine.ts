import { Platform } from 'react-native';
import type { WhisperContext } from 'whisper.rn';
import { loadSettings } from './settingsStore';
import { loadMemories } from './memoryStore';
import { createSegmentAccumulator } from './segmentAccumulator';
import { getOptimalThreads } from './cpuThreads';
import { trimSilence, discardTrim } from './speechTrim';

export { createSegmentAccumulator };



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
      // doom this attempt - fall through and try our own load.
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
// nothing is loaded or loading - never swaps a live context out from under a
// running transcription.
export function preloadWhisper(modelPath: string): void {
  if (whisperContext || loadPromise) return;
  loadWhisper(modelPath).catch(() => {});
}

/**
 * @param audioPath  Absolute path to a 16 kHz mono WAV/PCM file.
 * @param languageCode  ISO 639-1 code (`en`, `it`, ...) or `auto` for detect.
 *                      Do NOT pass display names like "Italian" - call
 *                      `toLanguageCode()` from utils/languages.ts first.
 */
/** Set while a transcription is decoding, so it can be interrupted. */
let stopCurrentTranscription: (() => Promise<void>) | null = null;

/**
 * Abort the transcription in flight, if any. The context stays loaded, so a
 * new one can start straight away.
 */
export async function stopWhisperWork(): Promise<void> {
  try {
    await stopCurrentTranscription?.();
  } catch (e) {
    console.warn('Could not stop the transcription:', e);
  }
}

/** Serializes work on the single shared whisper context. */
let whisperChain: Promise<unknown> = Promise.resolve();
function whisperQueue<T>(job: () => Promise<T>): Promise<T> {
  const run = whisperChain.then(job);
  whisperChain = run.catch(() => {});
  return run;
}

export type TranscribeCallbacks = {
  /** 0-100, straight from whisper. Fires many times a second, so throttle in the UI. */
  onProgress?: (progress: number) => void;
  /**
   * The transcript so far, growing as whisper finishes each window of audio.
   *
   * This is why we don't split long recordings into one-minute files: whisper
   * already works through the audio in windows and hands back each one as it
   * lands, so the text can stream out with the audio left whole. Cutting a
   * 10-minute lecture into 10 files would slice ~9 boundaries mid-word and
   * throw away the context across each join, for the same visible result.
   */
  onPartialText?: (text: string) => void;
};

export async function transcribeFile(
  audioPath: string,
  languageCode: string = 'auto',
  callbacks?: TranscribeCallbacks
): Promise<{ text: string; segments: Segment[]; language?: string }> {
  if (!whisperContext) {
    throw new Error('Whisper not loaded. Call loadWhisper first.');
  }

  const settings = await loadSettings();

  // Whisper's encoder always processes a full 30s window (1500 frames), so a
  // 10s voice note spends two thirds of the encode on padding. Shrinking the
  // context for short clips was worth roughly 3x on those, and the code that
  // did it is still patched into whisper.rn.
  //
  // DISABLED. Shrinking it broke the output in two ways that both read as the
  // app being broken rather than fast: an Italian recording came back as
  // French, and clips ended in a sentence repeated four times over. Whisper's
  // encoder was trained at the full 1500-frame context and its language
  // detection reads that same encoder output, so a truncated context degrades
  // the representation everything downstream depends on.
  //
  // Re-enabling this needs measured evidence per model tier, not a proportional
  // formula: Tiny has the least headroom to lose and is exactly where it showed.
  const audioCtx = 0; // 0 = whisper default (1500)

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

  const handleNewSegments = createSegmentAccumulator((text) => callbacks?.onPartialText?.(text));

  const options: any = {
    // Must be the literal string 'auto' - NOT undefined. whisper.rn's
    // docstring claims undefined means auto-detect, but the implementation
    // only assigns params.language when the JS value is a non-empty string:
    //     config.language = getStringProperty(runtime, options, "language");
    //     if (!config.language.empty()) { config.params.language = ...; }
    // (cpp/jsi/RNWhisperJSI.cpp). With `undefined` that assignment is skipped,
    // so whisper.cpp keeps its own default of "en" (`/*.language =*/ "en"`),
    // and auto-detect never runs - every recording was transcribed AS ENGLISH,
    // whatever was actually spoken. whisper.cpp only detects when language is
    // null, "" or "auto".
    language: languageCode || 'auto',
    // Keep transcription in the source language (don't translate to English).
    translate: false,
    // Greedy decoding: ~3-5x faster than beam search with negligible quality
    // loss for speech transcription. Token timestamps stay off - nothing in
    // the app consumes them and they add per-token cost.
    beamSize: 1,
    bestOf: 1,
    // Temperature fallback stays at whisper.cpp's default. Turning it off
    // (temperatureInc 0) was a real speed win and an unusable one: the retry
    // is what CATCHES a degenerate decode, so without it Tiny returned
    // "bieno 150 deha" twice over with Japanese characters in the middle of a
    // French clip. Repetition and language-mixing are exactly the failure the
    // compression and logprob thresholds are checking for. Do not disable it
    // again; if the retries need to be cheaper, raise the increment so there
    // are three attempts instead of six rather than removing the recovery.
    // Match thread count to the device's performance cores.
    maxThreads: await getOptimalThreads(),
    // Shrunken encoder context for short clips (0 = default 1500).
    ...(audioCtx > 0 ? { audioCtx } : null),
    // Bias Whisper toward user-taught vocabulary; undefined when empty so we
    // don't prime the decoder with an empty string.
    prompt: initialPrompt,
    ...(callbacks?.onProgress ? { onProgress: callbacks.onProgress } : null),
    ...(callbacks?.onPartialText ? { onNewSegments: handleNewSegments } : null),
  };

  // Serialized on the ONE shared whisper context, for the same reason the llama
  // steps are: two transcriptions decoding at once corrupt each other. There is
  // no queue in whisper.rn, and the call sites are easy to miss - Re-transcribe
  // on a history entry, an imported file, and the recorder all land here - so
  // the guard lives at the engine where nothing can route around it.
  // Cut the silence out first. Whisper spends as long on a silent window as a
  // full one, and silence is where it hallucinates: with nothing to transcribe
  // it emits whatever its language model likes, which is where invented
  // sentences come from. So this is faster AND cleaner, unlike shrinking the
  // encoder context, which was faster and wrong.
  //
  // Every failure inside returns null and we transcribe the original, so the
  // worst case is exactly today's behaviour.
  const trimmed = await trimSilence(audioPath);
  const inputPath = trimmed ? trimmed.path : audioPath;

  return whisperQueue(async () => {
    const { promise, stop } = whisperContext!.transcribe(inputPath, options);
    stopCurrentTranscription = stop;
    try {
      const result = await promise;
      return {
        text: result.result,
        segments: result.segments || [],
        // Whisper's auto-detected language. Was thrown away; the LLM prompts
        // need it to name the output language explicitly, or a small model
        // reading an English prompt answers in English.
        language: (result as any).language,
      };
    } finally {
      stopCurrentTranscription = null;
      if (trimmed) await discardTrim(trimmed.path);
    }
  });
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
