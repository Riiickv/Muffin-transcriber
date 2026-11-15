import * as FileSystem from 'expo-file-system/legacy';

import { FORMATTER_MODELS, CHAT_MODELS, EMBEDDING_MODELS, speechModels } from './modelCatalog';

export * from './modelCatalog';

const MODELS_DIR = FileSystem.documentDirectory + 'models/';

export class ModelManager {
  static async getDownloadedModelIds(): Promise<string[]> {
    const ids: string[] = [];
    for (const m of [...speechModels(true), ...FORMATTER_MODELS, ...CHAT_MODELS, ...EMBEDDING_MODELS]) {
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
    for (const obsolete of ['ggml-large-v3-turbo-q5_0.bin', 'ggml-tiny.bin', 'ggml-small.bin', 'ggml-base.en.bin', 'all-MiniLM-L6-v2-q4_k_m.gguf']) {
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
    const def = [...speechModels(true), ...FORMATTER_MODELS, ...CHAT_MODELS, ...EMBEDDING_MODELS]
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

  // Downloads go to a .part file and are only promoted to the real name once
  // COMPLETE (see finishDownload). Writing straight to the final path meant any
  // interruption (leaving the screen, a dropped connection, the phone sleeping)
  // left a truncated .gguf at the real filename - isModelDownloaded only checks
  // existence, so that stump passed every check and llama.cpp then failed to
  // load it with no hint why. With .part, an interrupted download is simply
  // "not installed".
  //
  // Returns the resumable so the caller (downloadManager) can pause/resume/cancel
  // it. The manager owns the completion promise and the promote/cleanup steps.
  static createDownload(
    url: string,
    filename: string,
    onProgress: (info: { progress: number; written: number; total: number }) => void
  ) {
    const partPath = this.getModelPath(filename) + '.part';
    return FileSystem.createDownloadResumable(url, partPath, {}, (downloadProgress) => {
      const written = downloadProgress.totalBytesWritten;
      const total = downloadProgress.totalBytesExpectedToWrite;
      const progress = total > 0 ? Math.max(0, Math.min(1, written / total)) : 0;
      onProgress({ progress, written, total });
    });
  }

  /** Promote a finished .part file to its real model name. */
  static async finishDownload(filename: string): Promise<void> {
    const path = this.getModelPath(filename);
    await FileSystem.moveAsync({ from: path + '.part', to: path });
  }

  /** Throw away a partial download (cancel or failure). */
  static async cleanupDownload(filename: string): Promise<void> {
    await FileSystem.deleteAsync(this.getModelPath(filename) + '.part', { idempotent: true }).catch(() => {});
  }
}
