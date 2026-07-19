import * as FileSystem from 'expo-file-system/legacy';

import { t } from '@/utils/i18n';

const MODELS_DIR = FileSystem.documentDirectory + 'models/';

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
export function modelName(m: ModelDef): string {
  return t(m.nameKey) || m.name;
}

/** The one-line blurb in the current app language, English if untranslated. */
export function modelDesc(m: ModelDef): string {
  return t(m.descKey) || m.description;
}

// Each group is ordered fastest -> best, so the list itself is the ladder.
export const WHISPER_MODELS: readonly ModelDef[] = [
  // No English-only Whisper here on purpose: the app is multilingual, and a
  // "Fast" option that silently only did English was a trap - people picked it
  // for the speed and got nothing in their language. Tiny is already the fast
  // multilingual floor, so that's the fast tier.
  {
    id: 'ggml-tiny.bin',
    name: 'Fastest',
    technicalName: 'Whisper Tiny',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
    size: '74 MB',
    description: 'Roughest wording. Fine for short, clear notes.',
    nameKey: 'models.tierFastest',
    descKey: 'models.descWhisperFastest',
  },
  {
    id: 'ggml-small.bin',
    name: 'Balanced',
    technicalName: 'Whisper Small',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
    size: '466 MB',
    description: 'The sweet spot for most voice notes.',
    nameKey: 'models.tierBalanced',
    descKey: 'models.descWhisperBalanced',
  },
  // q8_0, not q5_0: q5 bit-unpacking has no fast SIMD path in this build's
  // plain-NEON kernels and measures several times slower than q8_0 on phones.
  {
    id: 'ggml-large-v3-turbo-q8_0.bin',
    name: 'Most accurate',
    technicalName: 'Whisper Large v3 Turbo',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q8_0.bin',
    size: '874 MB',
    description: 'Best with accents and background noise. Slowest.',
    nameKey: 'models.tierAccurate',
    descKey: 'models.descWhisperAccurate',
  },
];

export const FORMATTER_MODELS: readonly ModelDef[] = [
  // Q4_0 variants: llama.cpp repacks Q4_0 into ARM dotprod/i8mm kernels at
  // load time - noticeably faster prompt processing than Q4_K_M on most
  // modern phones, at slightly lower output quality.
  {
    id: 'qwen2.5-0.5b-instruct-q4_0.gguf',
    name: 'Fastest',
    technicalName: 'Qwen 2.5 0.5B (Q4_0)',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_0.gguf',
    size: '409 MB',
    description: 'Tuned for newer phone chips.',
    nameKey: 'models.tierFastest',
    descKey: 'models.descFmtFastest',
  },
  {
    id: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    name: 'Fast',
    technicalName: 'Qwen 2.5 0.5B',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    size: '398 MB',
    description: 'Slightly better wording than Fastest.',
    nameKey: 'models.tierFast',
    descKey: 'models.descFmtFast',
  },
  {
    id: 'qwen2.5-1.5b-instruct-q4_0.gguf',
    name: 'Balanced',
    technicalName: 'Qwen 2.5 1.5B (Q4_0)',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_0.gguf',
    size: '1.0 GB',
    description: 'Bigger, still quick on newer phones.',
    nameKey: 'models.tierBalanced',
    descKey: 'models.descFmtBalanced',
  },
  {
    id: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    name: 'Best quality',
    technicalName: 'Qwen 2.5 1.5B',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    size: '1.1 GB',
    description: 'Cleanest wording. Slowest.',
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
    description: 'Quick replies, simpler answers.',
    nameKey: 'models.tierFast',
    descKey: 'models.descChatFast',
  },
  {
    id: 'Phi-3-mini-4k-instruct-q4.gguf',
    name: 'Best quality',
    technicalName: 'Phi-3 Mini 4K',
    url: 'https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf',
    size: '2.3 GB',
    description: 'Smarter answers. Wants a newer phone.',
    nameKey: 'models.tierBest',
    descKey: 'models.descChatBest',
  },
];

// Not a speed choice - there's one, and it either works or Chat can't search.
// So it gets named for what it does.
export const EMBEDDING_MODELS: readonly ModelDef[] = [
  {
    id: 'all-MiniLM-L6-v2-q4_k_m.gguf',
    name: 'Smart search',
    technicalName: 'MiniLM-L6-v2',
    url: 'https://huggingface.co/Mungert/all-MiniLM-L6-v2-GGUF/resolve/main/all-MiniLM-L6-v2-q4_k_m.gguf',
    size: '14 MB',
    description: 'Lets Chat find the right transcript by meaning, not just words.',
    nameKey: 'models.tierSmartSearch',
    descKey: 'models.descEmbed',
  },
];

export class ModelManager {
  static async getDownloadedModelIds(): Promise<string[]> {
    const ids: string[] = [];
    for (const m of [...WHISPER_MODELS, ...FORMATTER_MODELS, ...CHAT_MODELS, ...EMBEDDING_MODELS]) {
      if (await this.isModelDownloaded(m.id)) {
        ids.push(m.id);
      }
    }
    return ids;
  }

  static async init() {
    const dirInfo = await FileSystem.getInfoAsync(MODELS_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(MODELS_DIR, { intermediates: true });
    }
    // Models removed from the catalog - free the orphaned space.
    for (const obsolete of ['ggml-large-v3-turbo-q5_0.bin']) {
      this.deleteModel(obsolete).catch(() => {});
    }
  }

  static getModelPath(filename: string) {
    return MODELS_DIR + filename;
  }

  /**
   * Existence is not integrity. Downloads older than the .part fix could leave
   * a truncated file under the real name, and existence checks pass it all the
   * way to llama.cpp, which fails with an unexplained "Failed to load model".
   * The catalog's display size ("814 MB") is approximate, so this uses a loose
   * 85% floor: honest downloads land within rounding of the advertised size,
   * while an interrupted one is usually a small fraction of it.
   */
  static async verifyModelFile(
    filename: string
  ): Promise<{ ok: boolean; actualBytes: number; expectedBytes: number }> {
    const def = [...WHISPER_MODELS, ...FORMATTER_MODELS, ...CHAT_MODELS, ...EMBEDDING_MODELS]
      .find((m) => m.id === filename);
    let expectedBytes = 0;
    if (def) {
      const m = def.size.match(/([\d.]+)\s*(GB|MB)/i);
      if (m) expectedBytes = parseFloat(m[1]) * (m[2].toUpperCase() === 'GB' ? 1e9 : 1e6);
    }
    try {
      const info = await FileSystem.getInfoAsync(this.getModelPath(filename));
      const actualBytes = info.exists && 'size' in info ? (info as any).size ?? 0 : 0;
      const ok = info.exists && (expectedBytes === 0 || actualBytes >= expectedBytes * 0.85);
      return { ok, actualBytes, expectedBytes };
    } catch {
      return { ok: false, actualBytes: 0, expectedBytes };
    }
  }

  static async isModelDownloaded(filename: string) {
    try {
      const info = await FileSystem.getInfoAsync(this.getModelPath(filename));
      return info.exists;
    } catch {
      return false;
    }
  }

  static async deleteModel(filename: string) {
    const path = this.getModelPath(filename);
    // Also sweep a leftover .part from an interrupted download of this model.
    await FileSystem.deleteAsync(path + '.part', { idempotent: true }).catch(() => {});
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) {
        await FileSystem.deleteAsync(path);
      }
    } catch (e) {
      console.error('Error deleting model', e);
    }
  }

  static startDownload(
    url: string,
    filename: string,
    onProgress: (info: { progress: number, written: number, total: number }) => void
  ) {
    const path = this.getModelPath(filename);

    // Download to a .part file and only promote it to the real name once the
    // download COMPLETED. It used to write straight to the final path, which
    // meant any interruption (leaving the screen, connection drop, phone
    // sleeping) left a truncated .gguf at the real filename. isModelDownloaded
    // only checks existence, so that stump passed every check in the app - the
    // Models screen showed it as installed, the picker offered it, Settings
    // selected it - and llama.cpp then failed on the truncated file with
    // "Failed to load model" and no hint why. With .part, an interrupted
    // download simply never becomes "installed".
    const partPath = path + '.part';
    const downloadResumable = FileSystem.createDownloadResumable(
      url,
      partPath,
      {},
      (downloadProgress) => {
        const written = downloadProgress.totalBytesWritten;
        const total = downloadProgress.totalBytesExpectedToWrite;
        const progress = written / total;
        onProgress({ progress: Math.max(0, Math.min(1, progress)), written, total });
      }
    );

    return (async () => {
      const result = await downloadResumable.downloadAsync();
      // downloadAsync resolves undefined when paused; anything but a 2xx means
      // the server sent an error page, not a model.
      if (!result || result.status < 200 || result.status >= 300) {
        await FileSystem.deleteAsync(partPath, { idempotent: true }).catch(() => {});
        throw new Error(`Download failed (HTTP ${result ? result.status : 'interrupted'})`);
      }
      await FileSystem.moveAsync({ from: partPath, to: path });
      return result;
    })();
  }
}
