import { Platform } from 'react-native';
import type { WhisperContext } from 'whisper.rn';
import { loadSettings } from './settingsStore';
import { loadMemories } from './memoryStore';

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

export async function loadWhisper(modelPath: string): Promise<void> {
  if (whisperContext && currentModelPath === modelPath) {
    return;
  }

  if (whisperContext) {
    await unloadWhisper();
  }

  try {
    const init = getInitWhisper();
    whisperContext = await init({ filePath: modelPath, useFlashAttn: true });
    currentModelPath = modelPath;
  } catch (error) {
    console.error('Failed to load whisper model:', error);
    throw error;
  }
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
    // Use more CPU threads — most modern phones have 8 cores.
    maxThreads: 4,
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
