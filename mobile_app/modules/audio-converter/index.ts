import AudioConverterModule from './src/AudioConverterModule';

/**
 * Convert any audio/video file to a 16 kHz mono PCM WAV for whisper.rn. Uses
 * Android's MediaExtractor + MediaCodec, so any OS-playable format works with no
 * extra native deps. inputPath must be a filesystem path, not a content:// URI.
 */
export async function convertToWav(
  inputPath: string,
  outputPath: string
): Promise<string> {
  return AudioConverterModule.convertToWav(inputPath, outputPath);
}
