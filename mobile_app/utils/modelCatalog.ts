import { t } from '@/utils/i18n';

/**
 * The model catalog: pure data plus the two label helpers.
 *
 * Split from ModelManager so the web build (ModelManager.web.ts) shares it
 * instead of keeping a copy. The copy went stale and the browser preview died
 * on a missing export.
 */

export interface ModelDef {
  id: string;
  /**
   * What the user sees. A speed/quality tier, NOT the model's name - nobody
   * choosing a transcriber knows whether "Qwen 2.5 0.5B Q4_K_M" is better than
   * "Llama 3.2 1B", and the answer depends on their phone anyway. The tier is
   * the only part of that they can actually act on.
   *
   * Tiers are ORDINAL, not measured: within a group each entry is faster than
   * the one below it. Real times depend on the phone, so the app doesn't
   * promise seconds.
   *
   * `name`/`description` are the English text AND the fallback. What actually
   * shows on screen goes through modelName()/modelDesc(), which look up
   * `nameKey`/`descKey` in the current language and fall back to these. Render
   * anything through the helpers, never the raw fields - otherwise the pickers
   * stay English while the rest of the app is translated.
   */
  name: string;
  /** The actual model, kept for debugging and the curious. Not shown by default. */
  technicalName: string;
  url: string;
  size: string;
  description: string;
  /** i18n keys under `models.` - the translated tier name and per-model blurb. */
  nameKey: string;
  descKey: string;
  isEnglishOnly?: boolean;
}

/** The tier label in the current app language, English if untranslated. */
/**
 * Set from the root layout, next to setAppLanguage, and for the same reason.
 *
 * A module flag rather than an argument because modelName() is called from four
 * places and the LAST time one of them resolved a label its own way, every model
 * picker in the app stayed in English while the rest of it translated. One
 * function, one answer, no call site allowed to differ.
 */
let showTechnicalNames = false;

export function setShowModelNames(on: boolean): void {
  showTechnicalNames = on;
}

export function modelName(m: ModelDef): string {
  if (showTechnicalNames && m.technicalName) return m.technicalName;
  return t(m.nameKey) || m.name;
}

/** The one-line blurb in the current app language, English if untranslated. */
export function modelDesc(m: ModelDef): string {
  return t(m.descKey) || m.description;
}

// Each group is ordered fastest -> best, so the list itself is the ladder.
export const WHISPER_MODELS: readonly ModelDef[] = [
  // No English-only Whisper here on purpose: the app is multilingual, and a
  // Every tier is q8_0, not fp16. The dotprod/i8mm kernels that shipped in
  // vc65 give q8_0 an mmla GEMM path, and phone inference is bound by memory
  // bandwidth long before arithmetic, so halving the weights is the win: Tiny
  // 74 MB -> 42 MB, Small 466 MB -> 252 MB. It is also half the RAM, which is
  // what decides whether a 4 GB phone can run the tier at all.
  //
  // "Fast" option that silently only did English was a trap - people picked it
  // for the speed and got nothing in their language. Tiny is already the fast
  // multilingual floor, so that's the fast tier.
  {
    id: 'ggml-tiny-q8_0.bin',
    name: 'Fastest',
    technicalName: 'Whisper Tiny',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q8_0.bin',
    size: '42 MB',
    description: 'Short, clear speech. Lowest accuracy.',
    nameKey: 'models.tierFastest',
    descKey: 'models.descWhisperFastest',
  },
  {
    id: 'ggml-small-q8_0.bin',
    name: 'Balanced',
    technicalName: 'Whisper Small',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q8_0.bin',
    size: '252 MB',
    description: 'General speech. All languages.',
    nameKey: 'models.tierBalanced',
    descKey: 'models.descWhisperBalanced',
  },
  // q8_0, not q5_0: q5 bit-unpacking has no fast SIMD path in this build's
  // plain-NEON kernels and measures several times slower than q8_0 on phones.
  //
  // "Slowest" undersold this, and in the wrong direction: the cost is not per
  // minute of audio, it is a flat toll on every recording. Turbo pairs a full
  // 32-layer encoder with a 4-layer decoder, and the encoder always chews a
  // padded 30s window - so 6 seconds of speech and 37 seconds of speech cost
  // almost the same. Measured on a Pixel 9 Pro XL: 9s of audio took 25.8s, of
  // which 1.9s was loading the model. A two hour lecture barely notices; a
  // voice note pays half a minute for four words. The description says so now,
  // because the alternative fixes all cost accuracy and this is a choice the
  // person recording should get to make.
  {
    id: 'ggml-large-v3-turbo-q8_0.bin',
    name: 'Most accurate',
    technicalName: 'Whisper Large v3 Turbo',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q8_0.bin',
    size: '874 MB',
    description: 'Accents, background noise. All languages.',
    nameKey: 'models.tierAccurate',
    descKey: 'models.descWhisperAccurate',
  },
];

export const FORMATTER_MODELS: readonly ModelDef[] = [
  // Q4_0 variants: llama.cpp repacks Q4_0 into ARM dotprod/i8mm kernels at
  // load time - noticeably faster prompt processing than Q4_K_M on most
  // modern phones, at slightly lower output quality.
  {
    // Qwen 3, not 2.5. Identical 409 MB and the same tier, two generations
    // newer at following an instruction, which is the entire job here: every
    // repair function below this file exists because a small model ignored a
    // format rule. Mirrored by ggml-org, which is llama.cpp's own org.
    // settingsStore's MODEL_RENAMES moves anyone who had the old one.
    id: 'Qwen3-0.6B-Q4_0.gguf',
    name: 'Fastest',
    technicalName: 'Qwen 3 0.6B (Q4_0)',
    url: 'https://huggingface.co/ggml-org/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_0.gguf',
    size: '409 MB',
    description: 'Improve, Summarize. Lowest quality.',
    nameKey: 'models.tierFastest',
    descKey: 'models.descFmtFastest',
  },
  {
    id: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    name: 'Fast',
    technicalName: 'Qwen 2.5 0.5B',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    size: '398 MB',
    description: 'Improve, Summarize. Low quality.',
    nameKey: 'models.tierFast',
    descKey: 'models.descFmtFast',
  },
  {
    id: 'qwen2.5-1.5b-instruct-q4_0.gguf',
    name: 'Balanced',
    technicalName: 'Qwen 2.5 1.5B (Q4_0)',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_0.gguf',
    size: '1.0 GB',
    description: 'Improve, Summarize. Medium quality.',
    nameKey: 'models.tierBalanced',
    descKey: 'models.descFmtBalanced',
  },
  {
    id: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    name: 'Best quality',
    technicalName: 'Qwen 2.5 1.5B',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    size: '1.1 GB',
    description: 'Improve, Summarize. Highest quality.',
    nameKey: 'models.tierBest',
    descKey: 'models.descFmtBest',
  },
];

export const CHAT_MODELS: readonly ModelDef[] = [
  {
    id: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    name: 'Fast',
    technicalName: 'Llama 3.2 1B Instruct',
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    size: '814 MB',
    description: 'Chat. Short answers.',
    nameKey: 'models.tierFast',
    descKey: 'models.descChatFast',
  },
  {
    id: 'Phi-3-mini-4k-instruct-q4.gguf',
    name: 'Best quality',
    technicalName: 'Phi-3 Mini 4K',
    url: 'https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf',
    size: '2.3 GB',
    description: 'Chat. Detailed answers. High memory use.',
    nameKey: 'models.tierBest',
    descKey: 'models.descChatBest',
  },
];

// Not a speed choice - there's one, and it either works or Chat can't search.
// So it gets named for what it does.
export const EMBEDDING_MODELS: readonly ModelDef[] = [
  {
    // Multilingual on purpose. The model here before, MiniLM-L6-v2, is
    // English only and could not tell two Italian notes apart (measured,
    // docs/chat-research.md section 12). q8_0 because it is the only
    // quantisation published in the standard format the engine loads; a
    // q4 would save 11 MB of 132, the word list being most of the file.
    // The address names one exact revision, so the file measured is the
    // file downloaded even if its repository changes.
    id: 'multilingual-e5-small-q8_0.gguf',
    name: 'Smart search',
    technicalName: 'Multilingual E5 small',
    url: 'https://huggingface.co/TwinSunsLLC/multilingual-e5-small-gguf/resolve/b6cac9615d4ecce28d7f22539b7322d695fc2886/multilingual-e5-small-q8_0.gguf',
    size: '132 MB',
    description: 'Chat search by meaning. All languages.',
    nameKey: 'models.tierSmartSearch',
    descKey: 'models.descEmbed',
  },
];

/**
 * The Fast speech model: NVIDIA Parakeet TDT 0.6B v3, 4-bit.
 *
 * Not in WHISPER_MODELS, on purpose. It is a different kind of model with its
 * own engine (utils/ParakeetEngine.ts), and everything keyed on that list is
 * Whisper-specific: the draft pass, the silence-trim policy, the per-window
 * time table. Pickers and the Models screen get it through speechModels().
 *
 * Promoted from a hidden test model on 2026-11-15, after the phone run in
 * docs/speed-research.md section 15: 11.1 s against Most accurate's 65.7 s on
 * the same 116 s recording, and Ricky judged its Italian text the better one.
 *
 * What it cannot do: any language outside its 25 (languageData.ts), a language
 * setting (it always detects), and a prompt, so remembered terms do not reach
 * it. Most accurate stays for all of that.
 */
export const PARAKEET_MODELS: readonly ModelDef[] = [
  {
    id: 'ggml-parakeet-tdt-0.6b-v3-q4_0.bin',
    name: 'Fast, high quality',
    technicalName: 'Parakeet TDT 0.6B v3',
    url: 'https://huggingface.co/ggml-org/parakeet-GGUF/resolve/main/ggml-parakeet-tdt-0.6b-v3-q4_0.bin',
    size: '356 MB',
    description: 'Speech in 25 European languages.',
    nameKey: 'models.tierFastQuality',
    descKey: 'models.descSpeechFast',
  },
];

/**
 * Speech models UNDER TEST. They only show when the hidden "test models"
 * switch is on (hold the version line in Settings), so nobody who installs the
 * app from the store ever meets them. No translation keys on purpose: these
 * are names, and this is not shipped UI.
 *
 * The 8-bit Parakeet is still here because it has not been run on a phone. On
 * the PC it was 1.5 times slower than the 4-bit one for one or two fewer
 * errors in 383 words (docs/speed-research.md, 3.3 and 3.4).
 */
export const TEST_SPEECH_MODELS: readonly ModelDef[] = [
  {
    id: 'ggml-parakeet-tdt-0.6b-v3-q8_0.bin',
    name: 'Parakeet q8 (test)',
    technicalName: 'Parakeet TDT 0.6B v3 q8_0',
    url: 'https://huggingface.co/ggml-org/parakeet-GGUF/resolve/main/ggml-parakeet-tdt-0.6b-v3-q8_0.bin',
    size: '669 MB',
    description: 'NVIDIA Parakeet TDT 0.6B v3, 8-bit',
    nameKey: '',
    descKey: '',
  },
];

/** True for a Parakeet model, given its file name or a full path to it. */
export function isParakeetModel(idOrPath: string): boolean {
  return /(^|[\\/])ggml-parakeet[^\\/]*$/i.test(idOrPath);
}

/**
 * Every speech model a person can choose, in the order they are listed.
 *
 * Fast goes just below Most accurate. That is download size ascending (42,
 * 252, 356, 874 MB) and it keeps the rule modelSelection relies on: the last
 * installed entry is the strongest one they have.
 */
export function speechModels(includeTest = false): readonly ModelDef[] {
  const top = WHISPER_MODELS[WHISPER_MODELS.length - 1];
  const list = [...WHISPER_MODELS.slice(0, -1), ...PARAKEET_MODELS, top];
  return includeTest ? [...list, ...TEST_SPEECH_MODELS] : list;
}
