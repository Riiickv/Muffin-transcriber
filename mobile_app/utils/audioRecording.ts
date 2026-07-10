import { AudioQuality } from 'expo-audio';

// Whisper wants 16 kHz mono. HIGH_QUALITY (44.1 kHz stereo) gives noticeably
// worse transcripts on Android because whisper.rn has to resample on the fly.
export const WHISPER_RECORDING_PRESET = {
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 128000,
  android: {
    outputFormat: 'default',
    audioEncoder: 'default',
  },
  ios: {
    audioQuality: AudioQuality.MEDIUM,
    outputFormat: 'lpcm',
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/wav',
    bitsPerSecond: 128000,
  },
} as const;
