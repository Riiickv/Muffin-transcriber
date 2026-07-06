declare module 'whisper.rn' {
  export function initWhisper(options: any): Promise<WhisperContext>;
  export interface WhisperContext {
    transcribe(path: string, options?: any): { promise: Promise<any>, stop: () => Promise<void> };
    release(): Promise<void>;
  }
}
