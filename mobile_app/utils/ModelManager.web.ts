/**
 * Browser stand-in for ModelManager, used ONLY by the web preview.
 *
 * There is no emulator on the dev machine, so the browser build is how layout
 * gets looked at before it reaches a phone. Nothing here downloads or runs a
 * model: it pretends a sensible set is installed so every screen past the
 * welcome can be reached. Set localStorage.muffinFirstRun = '1' to see the
 * welcome instead.
 */
export * from './modelCatalog';

const firstRun = (() => {
  try { return globalThis.localStorage?.getItem('muffinFirstRun') === '1'; } catch { return false; }
})();

const installed = new Set<string>(
  firstRun
    ? []
    : ['ggml-tiny-q8_0.bin', 'ggml-small-q8_0.bin', 'ggml-large-v3-turbo-q8_0.bin', 'qwen2.5-1.5b-instruct-q4_k_m.gguf'],
);

export class ModelManager {
  static async getDownloadedModelIds(): Promise<string[]> { return [...installed]; }
  static async init() {}
  static getModelPath(filename: string) { return '/models/' + filename; }
  static async verifyModelFile(filename: string) {
    return { ok: installed.has(filename), actualBytes: 0, expectedBytes: 0 };
  }
  static async isModelDownloaded(filename: string) { return installed.has(filename); }
  static async deleteModel(filename: string) { installed.delete(filename); }
  static async finishDownload(filename: string) { installed.add(filename); }
  static async cleanupDownload(_filename: string) {}

  static createDownload(
    _url: string,
    _filename: string,
    onProgress: (info: { progress: number; written: number; total: number }) => void,
  ) {
    let timer: any = null;
    let p = 0;
    const total = 500 * 1024 * 1024;
    const run = () =>
      new Promise<{ status: number } | undefined>((resolve) => {
        timer = setInterval(() => {
          p = Math.min(1, p + 0.04);
          onProgress({ progress: p, written: total * p, total });
          if (p >= 1) { clearInterval(timer); resolve({ status: 200 }); }
        }, 300);
      });
    return {
      downloadAsync: run,
      resumeAsync: run,
      pauseAsync: async () => { clearInterval(timer); return { resumeData: '' }; },
      cancelAsync: async () => { clearInterval(timer); },
      savable: () => ({ resumeData: '' }),
    } as any;
  }
}
