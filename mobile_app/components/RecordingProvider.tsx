import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  useAudioRecorder,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import * as FileSystemLegacy from 'expo-file-system/legacy';

import { useDialog } from '@/components/Dialog';
import { loadWhisper } from '@/utils/WhisperEngine';
import { transcribeAudio, ensureAudioDir, AUDIO_DIR } from '@/utils/audioTranscription';
import { useHistory, updateHistoryItem, HistoryItem } from '@/utils/historyStore';
import { useSettings } from '@/utils/settingsStore';
import { runEnrichment } from '@/utils/transcriptionPipeline';
import { ModelManager } from '@/utils/ModelManager';
import { warmWhisperIfReady } from '@/hooks/useWhisperPreload';
import { errorToMessage } from '@/utils/errors';
import { toLanguageCode } from '@/utils/languages';
import { WHISPER_RECORDING_PRESET } from '@/utils/audioRecording';
import { haptics } from '@/utils/haptics';
import { t } from '@/utils/i18n';

// Recording used to live inside the Record tab. That tab is gone; the mic button
// in the tab bar records from anywhere. So the recorder, and the whole
// stop -> transcribe -> enrich -> History flow, live here in an always-mounted
// provider. The transcription runs here, not on a screen, so it keeps going
// after the stop navigates you to the new transcript.

interface RecordingContextValue {
  isRecording: boolean;
  /** id of the history item currently being transcribed, or null. */
  transcribingId: string | null;
  /** Tap the mic: start if idle, stop + transcribe if recording. */
  toggle: () => void;
}

const RecordingContext = createContext<RecordingContextValue>({
  isRecording: false,
  transcribingId: null,
  toggle: () => {},
});

export const useRecording = () => useContext(RecordingContext);

export function RecordingProvider({ children }: { children: React.ReactNode }) {
  const recorder = useAudioRecorder(WHISPER_RECORDING_PRESET as any);
  const router = useRouter();
  const dialog = useDialog();
  const { settings } = useSettings();
  const { addOrUpdate } = useHistory();

  const [isRecording, setIsRecording] = useState(false);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  // Serialise the handler: a fast double-tap otherwise starts twice, and
  // prepareToRecordAsync() throws on an already-recording recorder.
  const transitioning = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const { granted } = await requestRecordingPermissionsAsync();
        setHasPermission(granted);
      } catch {
        setHasPermission(false);
      }
    })();
  }, []);

  const startRecording = async () => {
    haptics.tap();
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
      // Transcription is now guaranteed - warm the model while they speak.
      warmWhisperIfReady(settings.preferredWhisperModel);
    } catch (e) {
      console.error('recorder.record failed:', e);
      dialog.show({
        title: t('dialog.recordingFailed.title') || 'Recording failed',
        message: t('dialog.recordingFailed.messageStart') || 'Could not start recording.',
        icon: 'warning',
        iconTone: 'danger',
      });
    }
  };

  const stopAndTranscribe = async () => {
    haptics.tap();
    let uri: string | null | undefined;
    try {
      await recorder.stop();
      setIsRecording(false);
      uri = recorder.uri;
    } catch (e) {
      console.error('recorder.stop failed:', e);
      setIsRecording(false);
      dialog.show({
        title: t('dialog.recordingFailed.title') || 'Recording failed',
        message: t('dialog.recordingFailed.messageStop') || 'Could not stop the recording.',
        icon: 'warning',
        iconTone: 'danger',
      });
      return;
    }

    if (!uri) {
      dialog.show({
        title: t('dialog.recordingFailed.title') || 'Recording failed',
        message: t('dialog.recordingFailed.messageNoFile') || 'No audio file was produced.',
        icon: 'warning',
        iconTone: 'danger',
      });
      return;
    }
    if (!settings.preferredWhisperModel) {
      dialog.show({
        title: t('dialog.noWhisperModel.title') || 'No Whisper model selected',
        message: t('dialog.noWhisperModel.messagePickOne'),
        icon: 'warning',
      });
      return;
    }

    // Move the recording somewhere permanent (expo-audio writes to the evictable
    // cache), create the history item straight away, and send the user to it -
    // then transcribe in the background and fill it in.
    let audioPath: string | undefined;
    try {
      await ensureAudioDir();
      const ext = uri.match(/\.[^/.]+$/)?.[0] ?? '.m4a';
      audioPath = `${AUDIO_DIR}recording_${Date.now()}${ext}`;
      await FileSystemLegacy.moveAsync({ from: uri, to: audioPath });
    } catch (e) {
      console.error('Could not store the recording:', e);
      dialog.show({
        title: t('dialog.recordingFailed.title') || 'Recording failed',
        message: t('dialog.recordingFailed.messageNoFile') || 'No audio file was produced.',
        icon: 'warning',
        iconTone: 'danger',
      });
      return;
    }

    const id = Date.now().toString();
    const item: HistoryItem = {
      id,
      timestampISO: new Date().toISOString(),
      sourceFileName: t('transcribe.noTitle') || 'Voice Memo',
      language: settings.defaultLanguage || 'Auto-Detect',
      rawTranscript: '',
      sourceFilePath: audioPath,
    };
    await addOrUpdate(item);
    setTranscribingId(id);
    haptics.success();
    router.push({ pathname: '/history/[id]', params: { id } });

    // Transcribe + enrich in the background. This runs in the always-mounted
    // provider, so leaving the History screen doesn't stop it.
    (async () => {
      try {
        await activateKeepAwakeAsync('record-transcription');
        const isDownloaded = await ModelManager.isModelDownloaded(settings.preferredWhisperModel);
        if (!isDownloaded) {
          dialog.show({
            title: t('dialog.modelNotDownloaded.title') || 'Model not downloaded',
            message: t('dialog.modelNotDownloaded.messageWhisper'),
            icon: 'download',
          });
          return;
        }
        await loadWhisper(ModelManager.getModelPath(settings.preferredWhisperModel));
        const langCode = toLanguageCode(settings.defaultLanguage);
        const result = await transcribeAudio(audioPath!, langCode);
        await updateHistoryItem(id, { rawTranscript: result.text.trim() });

        const hasLlm = !!settings.preferredFormatterModel;
        const llmPath = hasLlm ? ModelManager.getModelPath(settings.preferredFormatterModel) : '';
        const enrich = await runEnrichment({
          rawText: result.text,
          modelPath: llmPath,
          modelFile: settings.preferredFormatterModel,
          format: settings.formatByDefault && hasLlm,
          summarize: settings.summarizeByDefault && hasLlm,
          title: hasLlm,
          embedding: true,
          entities: hasLlm,
          memories: false,
        });
        const patch: Partial<HistoryItem> = {};
        if (enrich.title) patch.sourceFileName = enrich.title;
        if (enrich.formatted) patch.formattedTranscript = enrich.formatted;
        if (enrich.summarized) patch.summary = enrich.summarized;
        if (enrich.embedding) patch.embedding = enrich.embedding;
        if (enrich.extractedDates) patch.extractedDates = enrich.extractedDates;
        if (Object.keys(patch).length > 0) await updateHistoryItem(id, patch);
      } catch (e) {
        console.error('Transcription error:', e);
        haptics.error();
        dialog.show({
          title: t('dialog.transcriptionFailed.title') || 'Transcription failed',
          message: errorToMessage(e),
          icon: 'warning',
          iconTone: 'danger',
        });
      } finally {
        deactivateKeepAwake('record-transcription');
        setTranscribingId(null);
      }
    })();
  };

  const toggle = () => {
    if (transitioning.current) return;
    transitioning.current = true;
    (async () => {
      try {
        let granted = hasPermission;
        if (granted === null) {
          try {
            const res = await requestRecordingPermissionsAsync();
            granted = res.granted;
            setHasPermission(res.granted);
          } catch {
            granted = false;
          }
        }
        if (!granted) {
          dialog.show({
            title: t('dialog.micPermission.title') || 'Microphone permission required',
            message: t('dialog.micPermission.message') || 'Enable microphone access in Settings to record voice notes.',
            icon: 'mic',
            iconTone: 'danger',
          });
          return;
        }
        if (isRecording) await stopAndTranscribe();
        else await startRecording();
      } finally {
        transitioning.current = false;
      }
    })();
  };

  return (
    <RecordingContext.Provider value={{ isRecording, transcribingId, toggle }}>
      {children}
    </RecordingContext.Provider>
  );
}
