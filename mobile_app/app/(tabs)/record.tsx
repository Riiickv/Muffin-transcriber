import { ActivityIndicator, Animated, ScrollView, StyleSheet, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import {
  useAudioRecorder,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { Text } from '@/components/Themed';
import { useTheme } from '@/components/ThemeProvider';
import { FadeInView } from '@/components/FadeInView';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { Icon } from '@/components/Icon';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import ExpressiveSwitch from '@/components/ExpressiveSwitch';
import { MOTION, SPACING, TAB_BAR_SPACE } from '@/constants/tokens';
import { loadWhisper } from '@/utils/WhisperEngine';
import { transcribeAudio, ensureAudioDir, AUDIO_DIR } from '@/utils/audioTranscription';
import * as Clipboard from 'expo-clipboard';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { useHistory, updateHistoryItem, HistoryItem } from '@/utils/historyStore';
import { useSettings } from '@/utils/settingsStore';
import { useDialog } from '@/components/Dialog';
import { runEnrichment } from '@/utils/transcriptionPipeline';
import { ModelManager, WHISPER_MODELS, modelName } from '@/utils/ModelManager';
import { useModelOptions } from '@/hooks/useModelOptions';
import { warmWhisperIfReady } from '@/hooks/useWhisperPreload';
import { errorToMessage } from '@/utils/errors';
import { toLanguageCode, getLanguageOptions, getFormatLanguageOptions } from '@/utils/languages';
import { WHISPER_RECORDING_PRESET } from '@/utils/audioRecording';
import { SelectDropdown } from '@/components/SelectDropdown';
import { haptics } from '@/utils/haptics';
import { t } from '@/utils/i18n';

export default function RecordScreen() {
  const { theme } = useTheme();
  const { addOrUpdate } = useHistory();
  const { settings, setSetting } = useSettings();
  const dialog = useDialog();

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  // Surfaced on-screen: transcribing used to write only to History, so from
  // this tab you couldn't tell whether anything had happened at all.
  const [transcript, setTranscript] = useState('');
  const [status, setStatus] = useState<string>(t('record.readyToTranscribe') || 'Ready to Transcribe');
  const recorder = useAudioRecorder(WHISPER_RECORDING_PRESET as any);

  // THE RECORD BUTTON'S STATE MUST BE REACT STATE.
  //
  // This used to be `const isRecording = recorder.isRecording` - a plain
  // property read off a native object. Nothing subscribes to it, so React had
  // no reason to re-render when recording began: the mic went live (Android
  // showed its indicator) while the button still displayed the idle mic icon.
  // The next tap then read a stale `isRecording === false`, took the START
  // branch again, and prepareToRecordAsync() threw on an already-recording
  // recorder - the "it failed" on the second tap.
  //
  // Set from the two places that actually know: right after record() and stop()
  // return. expo-audio also offers useAudioRecorderState(), but it POLLS
  // getStatus() and re-renders whenever durationMillis moves >50ms - i.e. every
  // single poll while recording - so a poll fast enough to make the icon feel
  // instant also re-renders this whole screen ~10x/sec. We know precisely when
  // the transitions happen, so we don't need to ask.
  const [isRecording, setIsRecording] = useState(false);

  // The polled state can't help a fast double-tap either; starting twice is
  // exactly the failure above, so serialise the handler.
  const transitioning = useRef(false);

  useEffect(() => {
    (async () => {
      const { granted } = await requestRecordingPermissionsAsync();
      setHasPermission(granted);
    })();
  }, []);

  // Live pulse while recording. Kept in its own Animated.View so the press-
  // scale from AnimatedPressable composes cleanly with it.
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  const { whisperOptions, formatterOptions } = useModelOptions();

  const selectedWhisperDef = WHISPER_MODELS.find((m) => m.id === settings.preferredWhisperModel);
  const isEnglishOnly = selectedWhisperDef?.isEnglishOnly ?? false;

  const dynamicLanguageOptions = isEnglishOnly
    ? getLanguageOptions().filter((o) => o.value === 'English' || o.value === 'Auto-Detect')
    : getLanguageOptions();

  useEffect(() => {
    if (isEnglishOnly && settings.defaultLanguage !== 'English' && settings.defaultLanguage !== 'Auto-Detect') {
      setSetting('defaultLanguage', 'Auto-Detect');
    }
  }, [isEnglishOnly, settings.defaultLanguage]);

  const handleRecord = async () => {
    // `hasPermission` is null until the mount effect resolves, and null is not
    // false - so the old guard let the very first tap straight through to
    // prepareToRecordAsync() while the OS permission dialog was still up, which
    // throws "Recording failed". Tapping again worked because permission had
    // landed by then. Resolve it here instead of racing it.
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
    if (isBusy) return;
    if (transitioning.current) return;
    transitioning.current = true;
    try {

    if (isRecording) {
      haptics.tap();
      try {
        await recorder.stop();
        setIsRecording(false);
      } catch (e) {
        console.error('recorder.stop failed:', e);
        dialog.show({ title: t('dialog.recordingFailed.title') || 'Recording failed', message: t('dialog.recordingFailed.messageStop') || 'Could not stop the recording.', icon: 'warning', iconTone: 'danger' });
        return;
      }

      const uri = recorder.uri;
      if (!uri) {
        dialog.show({ title: t('dialog.recordingFailed.title') || 'Recording failed', message: t('dialog.recordingFailed.messageNoFile') || 'No audio file was produced.', icon: 'warning', iconTone: 'danger' });
        return;
      }

      if (!settings.preferredWhisperModel) {
        dialog.show({ title: t('dialog.noWhisperModel.title') || 'No Whisper model selected', message: t('dialog.noWhisperModel.messagePickOne'), icon: 'warning' });
        return;
      }

      setIsBusy(true);
      setTranscript('');
      try {
        setStatus(t('record.loadingModel') || 'Loading model...');
        const isDownloaded = await ModelManager.isModelDownloaded(settings.preferredWhisperModel);
        if (!isDownloaded) {
          dialog.show({ title: t('dialog.modelNotDownloaded.title') || 'Model not downloaded', message: t('dialog.modelNotDownloaded.messageWhisper'), icon: 'download' });
          return;
        }
        const whisperPath = ModelManager.getModelPath(settings.preferredWhisperModel);
        await loadWhisper(whisperPath);

        // Move the recording somewhere permanent, keeping it in the format the
        // recorder produced. expo-audio writes to the CACHE, which Android is
        // free to evict, so history playback needs its own copy.
        //
        // The m4a, not a WAV. whisper needs a WAV, but that WAV is ~1.9 MB/min
        // against the m4a's ~0.5 - keeping it as the stored recording made every
        // voice note 4x more expensive on disk, with auto-delete defaulting to
        // Never. transcribeAudio makes a throwaway WAV in the cache and deletes
        // it; what's kept for playback is the small file the phone recorded.
        setStatus(t('transcribe.convertingAudio') || 'Converting audio...');
        await ensureAudioDir();
        const ext = uri.match(/\.[^/.]+$/)?.[0] ?? '.m4a';
        const audioPath = `${AUDIO_DIR}recording_${Date.now()}${ext}`;
        await FileSystemLegacy.moveAsync({ from: uri, to: audioPath });

        setStatus(t('record.transcribing') || 'Transcribing...');
        // Tagged so finishing here can't release Home's concurrent wake lock.
        await activateKeepAwakeAsync('record-transcription');
        const langCode = toLanguageCode(settings.defaultLanguage);
        const result = await transcribeAudio(audioPath, langCode);
        setTranscript(result.text.trim());

        // Save the raw transcript right away - the user shouldn't wait through
        // LLM enrichment (title/format/summary) to see their recording.
        const baseItem: HistoryItem = {
          id: Date.now().toString(),
          timestampISO: new Date().toISOString(),
          sourceFileName: t('transcribe.noTitle') || 'Voice Memo',
          language: settings.defaultLanguage || 'Auto-Detect',
          rawTranscript: result.text,
          sourceFilePath: audioPath,
        };
        await addOrUpdate(baseItem);
        haptics.success();
        setStatus(t('record.readyToTranscribe') || 'Ready to Transcribe');

        // Enrichment runs in the background and updates the history item as
        // results land (same pattern as the Home screen).
        const hasLlm = !!settings.preferredFormatterModel;
        const llmPath = hasLlm ? ModelManager.getModelPath(settings.preferredFormatterModel) : '';
        (async () => {
          try {
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
            // Patch only what enrichment produced; updateHistoryItem merges over
            // the current item and is a no-op if the user deleted it meanwhile.
            const patch: Partial<HistoryItem> = {};
            if (enrich.title) patch.sourceFileName = enrich.title;
            if (enrich.formatted) patch.formattedTranscript = enrich.formatted;
            if (enrich.summarized) patch.summary = enrich.summarized;
            if (enrich.embedding) patch.embedding = enrich.embedding;
            if (enrich.extractedDates) patch.extractedDates = enrich.extractedDates;
            if (Object.keys(patch).length > 0) {
              await updateHistoryItem(baseItem.id, patch);
            }
          } catch (err) {
            console.error('Background enrichment failed:', err);
          }
        })();
      } catch (e) {
        console.error('Transcription error:', e);
        haptics.error();
        dialog.show({ title: t('dialog.transcriptionFailed.title') || 'Transcription failed', message: errorToMessage(e), icon: 'warning', iconTone: 'danger' });
        setStatus(t('record.readyToTranscribe') || 'Ready to Transcribe');
      } finally {
        deactivateKeepAwake('record-transcription');
        setIsBusy(false);
      }
    } else {
      haptics.tap();
      try {
        // expo-audio's documented pre-recording step. iOS won't route the mic
        // without allowsRecording; harmless on Android.
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        setIsRecording(true);
        // Transcription is now guaranteed - load the model while they speak,
        // so it's warm by the time they hit stop.
        warmWhisperIfReady(settings.preferredWhisperModel);
      } catch (e) {
        console.error('recorder.record failed:', e);
        dialog.show({ title: t('dialog.recordingFailed.title') || 'Recording failed', message: t('dialog.recordingFailed.messageStart') || 'Could not start recording.', icon: 'warning', iconTone: 'danger' });
      }
    }

    } finally {
      transitioning.current = false;
    }
  };

  const selectedWhisper = WHISPER_MODELS.find((m) => m.id === settings.preferredWhisperModel);
  const modelLabel = settings.preferredWhisperModel
    ? (selectedWhisper ? modelName(selectedWhisper) : settings.preferredWhisperModel)
    : (t('record.noModelSelected') || 'No model selected');

  return (
    <FadeInView index={1} style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        style={{ flex: 1, width: '100%' }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>{isRecording ? (t('record.listening') || 'Listening...') : status}</Text>
        <Text style={[styles.modelStatusText, { color: theme.textMuted }]}>{t('record.using') || 'Using'} {modelLabel}</Text>
      </View>

      <View style={styles.recordContainer}>
        {isBusy ? (
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={theme.tint} />
            <Text style={{ fontSize: 15, color: theme.textMuted, textAlign: 'center', marginTop: SPACING.lg, paddingHorizontal: SPACING.lg }}>
              {status}
            </Text>
          </View>
        ) : (
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <AnimatedPressable
              onPress={handleRecord}
              accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
              disabled={isBusy}
              style={[
                styles.recordButton,
                {
                  backgroundColor: isRecording ? theme.danger : theme.tint,
                  shadowColor: isRecording ? theme.danger : theme.tint,
                  opacity: isBusy ? 0.6 : 1,
                },
              ]}
            >
              <Icon
                name={isRecording ? 'stop' : 'mic'}
                filled
                size={48}
                color={isRecording ? '#FFFFFF' : '#000000'}
              />
            </AnimatedPressable>
          </Animated.View>
        )}
      </View>

      {/* Transcript lives in the dead space under the mic button. Without it
          this tab gave no evidence it had done anything - the text went
          straight to History, so you had to leave the screen to find out
          whether it worked. */}
      <View style={{ width: '100%', paddingHorizontal: SPACING.md, paddingBottom: SPACING.md }}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
            <Text style={{ fontSize: 14, fontWeight: 'bold' }}>{t('record.transcriptTitle') || 'Transcript'}</Text>
            <Button
              variant="ghost"
              size="sm"
              icon="copy"
              disabled={!transcript}
              style={{ height: 32 }}
              onPress={async () => {
                haptics.success();
                await Clipboard.setStringAsync(transcript);
                setStatus(t('record.copied') || 'Copied!');
              }}
            >
              {t('record.copyButton') || 'Copy'}
            </Button>
          </View>
          <ScrollView
            nestedScrollEnabled
            style={{ maxHeight: 140 }}
            contentContainerStyle={{ paddingBottom: SPACING.xs }}
          >
            <Text
              selectable
              style={{ fontSize: 14, lineHeight: 20, color: transcript ? theme.text : theme.textSubtle }}
            >
              {transcript || t('record.transcriptPlaceholder') || 'Your words will appear here after you record.'}
            </Text>
          </ScrollView>
        </Card>
      </View>

      <View style={{ width: '100%', paddingHorizontal: SPACING.md, paddingBottom: SPACING.md }}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md }}>
            <Text style={{ fontSize: 14, fontWeight: '500' }}>{t('record.formatToggle') || 'Format Transcript'}</Text>
            <ExpressiveSwitch
              value={settings.formatByDefault}
              onValueChange={(v) => setSetting('formatByDefault', v)}
              activeColor={theme.tint}
              thumbActiveColor="#000000"
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md }}>
            <Text style={{ fontSize: 14, fontWeight: '500' }}>{t('record.summarizeToggle') || 'Summarize'}</Text>
            <ExpressiveSwitch
              value={settings.summarizeByDefault}
              onValueChange={(v) => setSetting('summarizeByDefault', v)}
              activeColor={theme.tint}
              thumbActiveColor="#000000"
            />
          </View>

          <View style={{ flexDirection: 'row', marginBottom: SPACING.md }}>
            <View style={{ flex: 1, paddingRight: SPACING.sm }}>
              <Text style={{ fontSize: 12, marginBottom: 4, color: theme.textMuted }}>{t('record.whisperModelLabel') || 'Whisper'}</Text>
              <SelectDropdown
                options={whisperOptions}
                fieldLabel={t('record.whisperModelLabel') || 'Whisper'}
                value={settings.preferredWhisperModel}
                onSelect={(val) => setSetting('preferredWhisperModel', val)}
                placeholder="Not Set"
                compact
              />
            </View>
            <View style={{ flex: 1, paddingLeft: SPACING.sm }}>
              <Text style={{ fontSize: 12, marginBottom: 4, color: theme.textMuted }}>{t('record.languageLabel') || 'Language'}</Text>
              <SelectDropdown
                options={dynamicLanguageOptions}
                fieldLabel={t('record.languageLabel') || 'Language'}
                value={settings.defaultLanguage}
                onSelect={(val) => setSetting('defaultLanguage', val)}
                placeholder="Auto-Detect"
                compact
              />
            </View>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1, paddingRight: SPACING.sm }}>
              <Text style={{ fontSize: 12, marginBottom: 4, color: theme.textMuted }}>{t('record.formatterModelLabel') || 'Formatter'}</Text>
              <SelectDropdown
                options={formatterOptions}
                fieldLabel={t('record.formatterModelLabel') || 'Formatter'}
                value={settings.preferredFormatterModel}
                onSelect={(val) => setSetting('preferredFormatterModel', val)}
                placeholder="Not Set"
                compact
              />
            </View>
            <View style={{ flex: 1, paddingLeft: SPACING.sm }}>
              <Text style={{ fontSize: 12, marginBottom: 4, color: theme.textMuted }}>{t('record.formatLanguageLabel') || 'Output'}</Text>
              <SelectDropdown
                options={getFormatLanguageOptions()}
                fieldLabel={t('record.formatLanguageLabel') || 'Output'}
                value={settings.formatLanguage}
                onSelect={(val) => setSetting('formatLanguage', val)}
                placeholder="Original"
                compact
              />
            </View>
          </View>
        </Card>
      </View>
      </ScrollView>
    </FadeInView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.xxl,
    paddingBottom: TAB_BAR_SPACE,
  },
  statusContainer: {
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  statusText: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  modelStatusText: {
    fontSize: 16,
  },
  recordContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  recordButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
