const webMockStorage = new Set<string>();

export class ModelManager {
  static async init() {
    return;
  }

  static getModelPath(filename: string) {
    return '';
  }

  static async isModelDownloaded(filename: string) {
    return webMockStorage.has(filename);
  }

  static async deleteModel(filename: string) {
    webMockStorage.delete(filename);
  }

  static startDownload(
    url: string,
    filename: string,
    onProgress: (info: { progress: number, written: number, total: number }) => void
  ) {
    return new Promise((resolve) => {
      let p = 0;
      const total = 500 * 1024 * 1024; // Fake 500MB
      const interval = setInterval(() => {
        p += 0.05;
        const currentP = Math.min(1, p);
        onProgress({
          progress: currentP,
          written: total * currentP,
          total: total
        });
        if (p >= 1) {
          clearInterval(interval);
          webMockStorage.add(filename);
          resolve({});
        }
      }, 500);
    });
  }
}
