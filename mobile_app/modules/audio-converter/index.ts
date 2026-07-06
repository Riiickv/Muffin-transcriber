import AudioConverterModule from './src/AudioConverterModule';

/**
 * Convert any audio/video file to a 16 kHz mono PCM WAV file suitable for
 * whisper.rn transcription. Uses Android's built-in MediaExtractor +
 * MediaCodec APIs, so every format the OS can play is supported (MP3, M4A,
 * AAC, OGG, FLAC, MP4, etc.) with zero extra native dependencies.
 *
 * @param inputPath  Absolute filesystem path (NOT a content:// URI).
 * @param outputPath Absolute path where the WAV will be written.
 * @returns          Promise resolving to the outputPath on success.
 */
export async function convertToWav(
  inputPath: string,
  outputPath: string
): Promise<string> {
  return AudioConverterModule.convertToWav(inputPath, outputPath);
}
