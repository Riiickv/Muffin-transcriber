import { Platform } from 'react-native';
import { AudioQuality } from 'expo-audio';

// Whisper wants 16 kHz mono. HIGH_QUALITY (44.1 kHz stereo) gives noticeably
// worse transcripts on Android because whisper.rn has to resample on the fly.
//
// IMPORTANT - Android does NOT record WAV, and cannot be made to. It records
// via MediaRecorder, whose formats are 3gp/mpeg4/amrnb/amrwb/aac_adts/mpeg2ts/
// webm; expo-audio's AndroidOutputFormat type has no wav or pcm member. This
// preset used to claim `extension: '.wav'` on every platform, which produced an
// AAC file wearing a .wav name - whisper.rn reads files with a hand-written
// RIFF parser and threw "Invalid WAV file" on every single recording.
// So: Android records .m4a and record.tsx runs it through the audio-converter
// module (MediaExtractor + MediaCodec) to get real 16 kHz mono PCM WAV.
// iOS genuinely does record PCM via lpcm below, so it keeps the .wav name.
export const WHISPER_RECORDING_PRESET = {
  extension: Platform.OS === 'android' ? '.m4a' : '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 128000,
  android: {
    // Explicit rather than 'default': mpeg4+aac is the format the converter is
    // known to handle, and it's what 'default' resolved to anyway.
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
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
