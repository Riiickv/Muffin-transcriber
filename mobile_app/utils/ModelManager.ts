import * as FileSystem from 'expo-file-system/legacy';

const MODELS_DIR = FileSystem.documentDirectory + 'models/';

export interface ModelDef {
  id: string;
  name: string;
  url: string;
  size: string;
  description: string;
  isEnglishOnly?: boolean;
}

export const WHISPER_MODELS: readonly ModelDef[] = [
  { id: 'ggml-tiny.bin', name: 'Whisper Tiny', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin', size: '74 MB', description: 'Extremely fast for basic transcriptions.' },
  { id: 'ggml-base.en.bin', name: 'Whisper Base (English)', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin', size: '142 MB', description: 'Fast and highly accurate for native English speakers.', isEnglishOnly: true },
  { id: 'ggml-small.bin', name: 'Whisper Small (Multilingual)', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin', size: '466 MB', description: 'Great balance of speed and accuracy.' },
  { id: 'ggml-large-v3-turbo-q5_0.bin', name: 'Whisper Large V3 (Turbo)', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin', size: '547 MB', description: 'State-of-the-art accuracy. Runs great on newer phones.' },
];

export const FORMATTER_MODELS: readonly ModelDef[] = [
  { id: 'qwen2.5-0.5b-instruct-q4_k_m.gguf', name: 'Qwen 2.5 0.5B', url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf', size: '398 MB', description: 'Extremely fast and lightweight formatting model.' },
  { id: 'qwen2.5-1.5b-instruct-q4_k_m.gguf', name: 'Qwen 2.5 1.5B', url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf', size: '1.1 GB', description: 'Larger and higher quality formatter.' },
];

export const CHAT_MODELS: readonly ModelDef[] = [
  { id: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf', name: 'Llama 3.2 1B Instruct', url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf', size: '814 MB', description: 'Very fast and capable conversational model.' },
  { id: 'Phi-3-mini-4k-instruct-q4.gguf', name: 'Phi 3 Mini (4K)', url: 'https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf', size: '2.3 GB', description: 'High quality Microsoft conversational model.' },
];

export const EMBEDDING_MODELS: readonly ModelDef[] = [
  { id: 'all-MiniLM-L6-v2-q4_k_m.gguf', name: 'MiniLM-L6-v2 (Embeddings)', url: 'https://huggingface.co/Mungert/all-MiniLM-L6-v2-GGUF/resolve/main/all-MiniLM-L6-v2-q4_k_m.gguf', size: '14 MB', description: 'Extremely fast model used to generate semantic meaning vectors.' },
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
