import * as FileSystem from 'expo-file-system/legacy';

const MODELS_DIR = FileSystem.documentDirectory + 'models/';

export interface ModelDef {
  id: string;
  /**
   * What the user sees. A speed/quality tier, NOT the model's name — nobody
   * choosing a transcriber knows whether "Qwen 2.5 0.5B Q4_K_M" is better than
   * "Llama 3.2 1B", and the answer depends on their phone anyway. The tier is
   * the only part of that they can actually act on.
   *
   * Tiers are ORDINAL, not measured: within a group each entry is faster than
   * the one below it. Real times depend on the phone, so the app doesn't
   * promise seconds.
   */
  name: string;
  /** The actual model, kept for debugging and the curious. Not shown by default. */
  technicalName: string;
  url: string;
  size: string;
  description: string;
  isEnglishOnly?: boolean;
}

// Each group is ordered fastest -> best, so the list itself is the ladder.
export const WHISPER_MODELS: readonly ModelDef[] = [
  {
    id: 'ggml-tiny.bin',
    name: 'Fastest',
    technicalName: 'Whisper Tiny',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
    size: '74 MB',
    description: 'Roughest wording. Fine for short, clear notes.',
  },
  {
    id: 'ggml-base.en.bin',
    name: 'Fast',
    technicalName: 'Whisper Base',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
    size: '142 MB',
    description: 'English only. Good with clear speech.',
    isEnglishOnly: true,
  },
  {
    id: 'ggml-small.bin',
    name: 'Balanced',
    technicalName: 'Whisper Small',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
    size: '466 MB',
    description: 'The sweet spot for most voice notes.',
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
  },
];

export const FORMATTER_MODELS: readonly ModelDef[] = [
  // Q4_0 variants: llama.cpp repacks Q4_0 into ARM dotprod/i8mm kernels at
  // load time — noticeably faster prompt processing than Q4_K_M on most
  // modern phones, at slightly lower output quality.
  {
    id: 'qwen2.5-0.5b-instruct-q4_0.gguf',
    name: 'Fastest',
    technicalName: 'Qwen 2.5 0.5B (Q4_0)',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_0.gguf',
    size: '409 MB',
    description: 'Tuned for newer phone chips.',
  },
  {
    id: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    name: 'Fast',
    technicalName: 'Qwen 2.5 0.5B',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    size: '398 MB',
    description: 'Slightly better wording than Fastest.',
  },
  {
    id: 'qwen2.5-1.5b-instruct-q4_0.gguf',
    name: 'Balanced',
    technicalName: 'Qwen 2.5 1.5B (Q4_0)',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_0.gguf',
    size: '1.0 GB',
    description: 'Bigger, still quick on newer phones.',
  },
  {
    id: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    name: 'Best quality',
    technicalName: 'Qwen 2.5 1.5B',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    size: '1.1 GB',
    description: 'Cleanest wording. Slowest.',
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
  },
  {
    id: 'Phi-3-mini-4k-instruct-q4.gguf',
    name: 'Best quality',
    technicalName: 'Phi-3 Mini 4K',
    url: 'https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf',
    size: '2.3 GB',
    description: 'Smarter answers. Wants a newer phone.',
  },
];

// Not a speed choice — there's one, and it either works or Chat can't search.
// So it gets named for what it does.
export const EMBEDDING_MODELS: readonly ModelDef[] = [
  {
    id: 'all-MiniLM-L6-v2-q4_k_m.gguf',
    name: 'Smart search',
    technicalName: 'MiniLM-L6-v2',
    url: 'https://huggingface.co/Mungert/all-MiniLM-L6-v2-GGUF/resolve/main/all-MiniLM-L6-v2-q4_k_m.gguf',
    size: '14 MB',
    description: 'Lets Chat find the right transcript by meaning, not just words.',
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
    // Models removed from the catalog — free the orphaned space.
    for (const obsolete of ['ggml-large-v3-turbo-q5_0.bin']) {
      this.deleteModel(obsolete).catch(() => {});
    }
  }

  static getModelPath(filename: string) {
    return MODELS_DIR + filename;
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
    const downloadResumable = FileSystem.createDownloadResumable(
      url,
      path,
      {},
      (downloadProgress) => {
        const written = downloadProgress.totalBytesWritten;
        const total = downloadProgress.totalBytesExpectedToWrite;
        const progress = written / total;
        onProgress({ progress: Math.max(0, Math.min(1, progress)), written, total });
      }
    );
    
    return downloadResumable.downloadAsync();
  }
}
