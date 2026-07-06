import { Animated, StyleSheet, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useAudioRecorder, requestRecordingPermissionsAsync } from 'expo-audio';

import { Text } from '@/components/Themed';
import { useTheme } from '@/components/ThemeProvider';
import { FadeInView } from '@/components/FadeInView';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { Icon } from '@/components/Icon';
import { Card } from '@/components/Card';
import ExpressiveSwitch from '@/components/ExpressiveSwitch';
import { MOTION, SPACING } from '@/constants/tokens';
import { transcribeFile, loadWhisper } from '@/utils/WhisperEngine';
import { useHistory, HistoryItem } from '@/utils/historyStore';
import { useSettings } from '@/utils/settingsStore';
import { Button } from '@/components/Button';
import { useDialog } from '@/components/Dialog';
import { formatTranscript, summarizeTranscript, extractActionableEntities, generateTitle } from '@/utils/LLMEngine';
import { generateEmbedding } from '@/utils/EmbeddingEngine';
import { ModelManager, WHISPER_MODELS, FORMATTER_MODELS } from '@/utils/ModelManager';
import { toLanguageCode, LANGUAGE_OPTIONS } from '@/utils/languages';
import { WHISPER_RECORDING_PRESET } from '@/utils/audioRecording';
import { SelectDropdown } from '@/components/SelectDropdown';
import { haptics } from '@/utils/haptics';
import { t } from '@/utils/i18n';
const WHISPER_LABELS: Record<string, string> = {
  'ggml-tiny.bin': 'Whisper Tiny',
  'ggml-base.en.bin': 'Whisper Base (English)',
  'ggml-small.bin': 'Whisper Small',
};

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

  const [downloadedWhisperIds, setDownloadedWhisperIds] = useState<string[]>([]);
  const [downloadedLLMIds, setDownloadedLLMIds] = useState<string[]>([]);

  useEffect(() => {
    ModelManager.getDownloadedModelIds().then((ids) => {
      setDownloadedWhisperIds(WHISPER_MODELS.filter((m) => ids.includes(m.id)).map((m) => m.id));
      setDownloadedLLMIds(FORMATTER_MODELS.filter((m) => ids.includes(m.id)).map((m) => m.id));
    });
  }, []);

  const whisperOptions = WHISPER_MODELS.filter((m) => downloadedWhisperIds.includes(m.id)).map((m) => ({
    label: m.name,
    value: m.id,
  }));

  const formatterOptions = FORMATTER_MODELS.filter((m) => downloadedLLMIds.includes(m.id)).map((m) => ({
    label: m.name,
    value: m.id,
  }));

  const selectedWhisperDef = WHISPER_MODELS.find((m) => m.id === settings.preferredWhisperModel);
  const isEnglishOnly = selectedWhisperDef?.isEnglishOnly ?? false;

  const dynamicLanguageOptions = isEnglishOnly
    ? LANGUAGE_OPTIONS.filter((o) => o.value === 'English' || o.value === 'Auto-Detect')
    : LANGUAGE_OPTIONS;

  const FORMAT_LANG_OPTIONS = [
    { label: 'Original', value: 'Auto-Detect / Original' },
    { label: 'English', value: 'English' },
    { label: 'Italian', value: 'Italian' },
    { label: 'Spanish', value: 'Spanish' },
  ];

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
      // ---- Stop recording ---------------------------------------------------
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
        const langCode = toLanguageCode(settings.defaultLanguage);
        const result = await transcribeFile(uri, langCode);

        let formatted: string | undefined;
        let summarized: string | undefined;

        // Run format + summarize concurrently — they both only need the raw
        // transcript and share the same LLM context (so they'll serialize
        // under the hood), but this avoids unnecessary sequential awaiting.
        const llmPath = settings.preferredFormatterModel
          ? ModelManager.getModelPath(settings.preferredFormatterModel)
          : null;

        setStatus(t('transcribe.formatting') || 'Processing...');
        const [formatResult, summarizeResult] = await Promise.all([
          (settings.formatByDefault && llmPath && settings.preferredFormatterModel)
            ? formatTranscript(result.text, llmPath, settings.preferredFormatterModel).catch(() => undefined)
            : Promise.resolve(undefined),
          (settings.summarizeByDefault && llmPath && settings.preferredFormatterModel)
            ? summarizeTranscript(result.text, llmPath, settings.preferredFormatterModel).catch(() => undefined)
            : Promise.resolve(undefined),
        ]);
        formatted = formatResult;
        summarized = summarizeResult;

        // Run embedding (separate model context) concurrently with LLM tasks
        // (extractDates + generateTitle) since they use different native contexts.
        setStatus(t('record.analyzing') || 'Analyzing...');
        const textForAnalysis = formatted || result.text;

        const [embedding, extractedDatesResult, titleResult] = await Promise.all([
          generateEmbedding(textForAnalysis).catch(() => null),
          (llmPath && settings.preferredFormatterModel)
            ? extractActionableEntities(textForAnalysis, llmPath, settings.preferredFormatterModel).catch(() => [] as any[])
            : Promise.resolve([] as any[]),
          (llmPath && settings.preferredFormatterModel)
            ? generateTitle(textForAnalysis, llmPath, settings.preferredFormatterModel).catch(() => t('transcribe.noTitle') || 'Voice Memo')
            : Promise.resolve(t('transcribe.noTitle') || 'Voice Memo'),
        ]);

        const newItem: HistoryItem = {
          id: Date.now().toString(),
          timestampISO: new Date().toISOString(),
          sourceFileName: titleResult,
          language: settings.defaultLanguage || 'Auto-Detect',
          rawTranscript: result.text,
          formattedTranscript: formatted,
          summary: summarized,
          sourceFilePath: uri,
          embedding: embedding || undefined,
          extractedDates: extractedDatesResult.length > 0 ? extractedDatesResult : undefined,
        };
        await addOrUpdate(newItem);
        haptics.success();
        setStatus(t('record.readyToTranscribe') || 'Ready to Transcribe');
      } catch (e) {
        console.error('Transcription error:', e);
        haptics.error();
        const msg = e instanceof Error
          ? e.message
          : typeof e === 'object' && e !== null
            ? JSON.stringify(e)
            : String(e);
        dialog.show({ title: t('dialog.transcriptionFailed.title') || 'Transcription failed', message: msg, icon: 'warning', iconTone: 'danger' });
        setStatus(t('record.readyToTranscribe') || 'Ready to Transcribe');
      } finally {
        setIsBusy(false);
      }
    } else {
      // ---- Start recording --------------------------------------------------
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
    ? WHISPER_LABELS[settings.preferredWhisperModel] ?? settings.preferredWhisperModel
    : (t('record.noModelSelected') || 'No model selected');

  return (
    <FadeInView index={1} style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>{isRecording ? (t('record.listening') || 'Listening...') : status}</Text>
        <Text style={[styles.modelStatusText, { color: theme.textMuted }]}>{t('record.using') || 'Using'} {modelLabel}</Text>
      </View>

      <View style={styles.recordContainer}>
        {isBusy ? (
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="favorite" size={48} color={theme.tint} />
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginTop: SPACING.md, marginBottom: SPACING.sm }}>{t('record.whileWaiting')}</Text>
            <Text style={{ fontSize: 14, color: theme.textMuted, textAlign: 'center', marginBottom: SPACING.lg }}>
              {status}
            </Text>
            <Button
              onPress={() => {
                haptics.tap();
                dialog.show({
                  title: t('record.supportMe'),
                  message: t('transcribe.supportDesc') || 'This would trigger an ad in production to support development!',
                  icon: 'favorite',
                  iconTone: 'primary',
                  primaryAction: { label: t('transcribe.watchAd') || 'Watch Ad', onPress: () => {} },
                  secondaryAction: { label: t('dialog.confirmDelete.cancel') || 'Cancel', onPress: () => {} }
                });
              }}
              icon="favorite"
            >
              {t('record.supportMe')}
            </Button>
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
                options={FORMAT_LANG_OPTIONS}
                value={settings.formatLanguage}
                onSelect={(val) => setSetting('formatLanguage', val)}
                placeholder="Original"
                compact
              />
            </View>
          </View>
        </Card>
      </View>
    </FadeInView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 60,
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
