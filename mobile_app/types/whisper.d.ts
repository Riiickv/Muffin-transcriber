declare module 'whisper.rn' {
  export function initWhisper(options: any): Promise<WhisperContext>;
  export function initParakeet(options: { filePath: string; useGpu?: boolean }): Promise<ParakeetContext>;
  export interface ParakeetContext {
    transcribe(path: string, options?: { maxThreads?: number }): { promise: Promise<any>, stop: () => Promise<void> };
    transcribeData(data: ArrayBuffer, options?: { maxThreads?: number }): { promise: Promise<any>, stop: () => Promise<void> };
    release(): Promise<void>;
  }
  export interface WhisperContext {
    transcribe(path: string, options?: any): { promise: Promise<any>, stop: () => Promise<void> };
    release(): Promise<void>;
  }
}
