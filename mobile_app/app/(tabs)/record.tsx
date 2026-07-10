import { ActivityIndicator, Animated, ScrollView, StyleSheet, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useAudioRecorder, requestRecordingPermissionsAsync } from 'expo-audio';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { Text } from '@/components/Themed';
import { useTheme } from '@/components/ThemeProvider';
import { FadeInView } from '@/components/FadeInView';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { Icon } from '@/components/Icon';
import { Card } from '@/components/Card';
import ExpressiveSwitch from '@/components/ExpressiveSwitch';
import { MOTION, SPACING } from '@/constants/tokens';
import { transcribeFile, loadWhisper } from '@/utils/WhisperEngine';
import { useHistory, updateHistoryItem, HistoryItem } from '@/utils/historyStore';
import { useSettings } from '@/utils/settingsStore';
import { useDialog } from '@/components/Dialog';
import { runEnrichment } from '@/utils/transcriptionPipeline';
import { ModelManager, WHISPER_MODELS } from '@/utils/ModelManager';
import { useModelOptions } from '@/hooks/useModelOptions';
import { errorToMessage } from '@/utils/errors';
import { toLanguageCode, LANGUAGE_OPTIONS, FORMAT_LANGUAGE_OPTIONS } from '@/utils/languages';
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
  const [status, setStatus] = useState<string>(t('record.readyToTranscribe') || 'Ready to Transcribe');
  const recorder = useAudioRecorder(WHISPER_RECORDING_PRESET as any);
  const isRecording = recorder.isRecording;

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
    ? LANGUAGE_OPTIONS.filter((o) => o.value === 'English' || o.value === 'Auto-Detect')
    : LANGUAGE_OPTIONS;

  useEffect(() => {
    if (isEnglishOnly && settings.defaultLanguage !== 'English' && settings.defaultLanguage !== 'Auto-Detect') {
      setSetting('defaultLanguage', 'Auto-Detect');
    }
  }, [isEnglishOnly, settings.defaultLanguage]);

  const handleRecord = async () => {
    if (hasPermission === false) {
      dialog.show({
        title: t('dialog.micPermission.title') || 'Microphone permission required',
        message: t('dialog.micPermission.message') || 'Enable microphone access in Settings to record voice notes.',
        icon: 'mic',
        iconTone: 'danger',
      });
      return;
    }
    if (isBusy) return;

    if (isRecording) {
      haptics.tap();
      try {
        await recorder.stop();
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
        dialog.show({ title: t('dialog.noWhisperModel.title') || 'No Whisper model selected', message: t('dialog.noWhisperModel.message') || 'Pick one on the Home tab or in Settings.', icon: 'warning' });
        return;
      }

      setIsBusy(true);
      try {
        setStatus(t('record.loadingModel') || 'Loading model...');
        const isDownloaded = await ModelManager.isModelDownloaded(settings.preferredWhisperModel);
        if (!isDownloaded) {
          dialog.show({ title: t('dialog.modelNotDownloaded.title') || 'Model not downloaded', message: t('dialog.modelNotDownloaded.message') || 'Go to Settings → Models to download the Whisper model.', icon: 'download' });
          return;
        }
        const whisperPath = ModelManager.getModelPath(settings.preferredWhisperModel);
        await loadWhisper(whisperPath);

        setStatus(t('record.transcribing') || 'Transcribing...');
        // Tagged so finishing here can't release Home's concurrent wake lock.
        await activateKeepAwakeAsync('record-transcription');
        const langCode = toLanguageCode(settings.defaultLanguage);
        const result = await transcribeFile(uri, langCode);

        // Save the raw transcript right away — the user shouldn't wait through
        // LLM enrichment (title/format/summary) to see their recording.
        const baseItem: HistoryItem = {
          id: Date.now().toString(),
          timestampISO: new Date().toISOString(),
          sourceFileName: t('transcribe.noTitle') || 'Voice Memo',
          language: settings.defaultLanguage || 'Auto-Detect',
          rawTranscript: result.text,
          sourceFilePath: uri,
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
        await recorder.prepareToRecordAsync();
        recorder.record();
      } catch (e) {
        console.error('recorder.record failed:', e);
        dialog.show({ title: t('dialog.recordingFailed.title') || 'Recording failed', message: t('dialog.recordingFailed.messageStart') || 'Could not start recording.', icon: 'warning', iconTone: 'danger' });
      }
    }
  };

  const modelLabel = settings.preferredWhisperModel
    ? WHISPER_MODELS.find((m) => m.id === settings.preferredWhisperModel)?.name ?? settings.preferredWhisperModel
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

      <View style={{ width: '100%', paddingHorizontal: SPACING.md, paddingBottom: SPACING.md }}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md }}>
            <Text style={{ fontSize: 14, fontWeight: '500' }}>{t('settings.formatByDefault') || 'Format Transcript'}</Text>
            <ExpressiveSwitch
              value={settings.formatByDefault}
              onValueChange={(v) => setSetting('formatByDefault', v)}
              activeColor={theme.tint}
              thumbActiveColor="#000000"
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md }}>
            <Text style={{ fontSize: 14, fontWeight: '500' }}>{t('settings.summarizeByDefault') || 'Summarize'}</Text>
            <ExpressiveSwitch
              value={settings.summarizeByDefault}
              onValueChange={(v) => setSetting('summarizeByDefault', v)}
              activeColor={theme.tint}
              thumbActiveColor="#000000"
            />
          </View>

          <View style={{ flexDirection: 'row', marginBottom: SPACING.md }}>
            <View style={{ flex: 1, paddingRight: SPACING.sm }}>
              <Text style={{ fontSize: 12, marginBottom: 4, color: theme.textMuted }}>{t('settings.whisperModel') || 'Whisper'}</Text>
              <SelectDropdown
                options={whisperOptions}
                value={settings.preferredWhisperModel}
                onSelect={(val) => setSetting('preferredWhisperModel', val)}
                placeholder="Not Set"
                compact
              />
            </View>
            <View style={{ flex: 1, paddingLeft: SPACING.sm }}>
              <Text style={{ fontSize: 12, marginBottom: 4, color: theme.textMuted }}>{t('settings.defaultLanguage') || 'Language'}</Text>
              <SelectDropdown
                options={dynamicLanguageOptions}
                value={settings.defaultLanguage}
                onSelect={(val) => setSetting('defaultLanguage', val)}
                placeholder="Auto-Detect"
                compact
              />
            </View>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1, paddingRight: SPACING.sm }}>
              <Text style={{ fontSize: 12, marginBottom: 4, color: theme.textMuted }}>{t('settings.preferredFormatter') || 'Formatter'}</Text>
              <SelectDropdown
                options={formatterOptions}
                value={settings.preferredFormatterModel}
                onSelect={(val) => setSetting('preferredFormatterModel', val)}
                placeholder="Not Set"
                compact
              />
            </View>
            <View style={{ flex: 1, paddingLeft: SPACING.sm }}>
              <Text style={{ fontSize: 12, marginBottom: 4, color: theme.textMuted }}>{t('settings.formatLanguage') || 'Output'}</Text>
              <SelectDropdown
                options={FORMAT_LANGUAGE_OPTIONS}
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
    paddingVertical: SPACING.xxl,
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
