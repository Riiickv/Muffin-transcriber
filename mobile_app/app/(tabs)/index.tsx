import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Text } from '@/components/Themed';
import { useTheme } from '@/components/ThemeProvider';
import { FadeInView } from '@/components/FadeInView';
import ExpressiveSwitch from '@/components/ExpressiveSwitch';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { SegmentedControl } from '@/components/SegmentedControl';
import { RADIUS, SPACING } from '@/constants/tokens';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import { transcribeFile, loadWhisper } from '@/utils/WhisperEngine';
import { convertToWav } from '@/modules/audio-converter';
import { useHistory, HistoryItem } from '@/utils/historyStore';
import { useSettings, useDebouncedSetting } from '@/utils/settingsStore';
import { formatTranscript, summarizeTranscript, extractMemories, generateTitle } from '@/utils/LLMEngine';
import { ModelManager, WHISPER_MODELS, FORMATTER_MODELS } from '@/utils/ModelManager';
import { SelectDropdown } from '@/components/SelectDropdown';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { useDialog } from '@/components/Dialog';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { toLanguageCode, LANGUAGE_OPTIONS, FORMAT_LANGUAGE_OPTIONS } from '@/utils/languages';
import { haptics } from '@/utils/haptics';
import { t } from '@/utils/i18n';

type TranscriptTab = 'raw' | 'formatted' | 'summary';

const TRANSCRIPT_TABS = [
  { key: 'raw', label: t('transcribe.rawTab') || 'Raw' },
  { key: 'formatted', label: t('transcribe.formattedTab') || 'Formatted' },
  { key: 'summary', label: t('transcribe.summaryTab') || 'Summary' },
] as const satisfies readonly { key: TranscriptTab; label: string }[];

export default function HomeScreen() {
  const { theme } = useTheme();
  const { addOrUpdate } = useHistory();
  const { settings, setSetting } = useSettings();
  const [customPrompt, setCustomPrompt] = useDebouncedSetting('customFormatSystemPrompt');
  const dialog = useDialog();

  // Identifies the in-flight run; background LLM work checks it so a newer run can't overwrite the screen with stale results.
  const activeRunIdRef = useRef<string | null>(null);

  const [transcriptTab, setTranscriptTab] = useState<TranscriptTab>('raw');
  const [selectedFileUri, setSelectedFileUri] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [rawText, setRawText] = useState('');
  const [formattedText, setFormattedText] = useState('');
  const [summaryText, setSummaryText] = useState('');

  const [downloadedWhisperIds, setDownloadedWhisperIds] = useState<string[]>([]);
  const [downloadedLLMIds, setDownloadedLLMIds] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      ModelManager.getDownloadedModelIds().then((ids) => {
        setDownloadedWhisperIds(WHISPER_MODELS.filter((m) => ids.includes(m.id)).map((m) => m.id));
        setDownloadedLLMIds(FORMATTER_MODELS.filter((m) => ids.includes(m.id)).map((m) => m.id));
      });
    }, [])
  );

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

  // Sync default language if current setting becomes invalid due to model switch
  useEffect(() => {
    if (isEnglishOnly && settings.defaultLanguage !== 'English' && settings.defaultLanguage !== 'Auto-Detect') {
      setSetting('defaultLanguage', 'Auto-Detect');
    }
  }, [isEnglishOnly, settings.defaultLanguage]);

  // Share intent target — copy the file into cache with the legacy API,
  // because the new expo-file-system module has no `cacheDirectory`.
  const params = useLocalSearchParams<{ uri?: string }>();
  useEffect(() => {
    if (!params.uri) return;
    const decoded = decodeURIComponent(params.uri);
    if (decoded.startsWith('content://')) {
      const destPath = `${FileSystemLegacy.cacheDirectory}shared_audio_${Date.now()}`;
      FileSystemLegacy.copyAsync({ from: decoded, to: destPath })
        .then(() => {
          setSelectedFileUri(destPath);
          setSelectedFileName('Shared audio');
        })
        .catch((err) => {
          console.error('Failed to copy content uri:', err);
          setSelectedFileUri(decoded);
          setSelectedFileName('Shared audio');
        });
    } else {
      setSelectedFileUri(decoded);
      setSelectedFileName(decoded.split('/').pop() ?? 'Shared audio');
    }
  }, [params.uri]);

  const handlePickFile = async () => {
    haptics.tap();
    const result = await DocumentPicker.getDocumentAsync({ type: ['audio/*', 'video/*'] });
    if (!result.canceled && result.assets.length > 0) {
      setSelectedFileUri(result.assets[0].uri);
      setSelectedFileName(result.assets[0].name ?? 'Selected audio');
    }
  };

  const handleTranscribe = async () => {
    if (isTranscribing) return;
    if (!selectedFileUri) {
      dialog.show({ title: t('dialog.noFileSelected.title'), message: t('dialog.noFileSelected.message'), icon: 'warning' });
      return;
    }
    if (!settings.preferredWhisperModel) {
      dialog.show({ title: t('dialog.noWhisperModel.title'), message: t('dialog.noWhisperModel.message'), icon: 'warning' });
      return;
    }

    haptics.tap();
    setIsTranscribing(true);
    setTranscriptTab('raw');
    setRawText('');
    setFormattedText('');
    setSummaryText('');
    setRawText(t('transcribe.loadingModel'));

    try {
      const isDownloaded = await ModelManager.isModelDownloaded(settings.preferredWhisperModel);
      if (!isDownloaded) {
        dialog.show({ title: t('dialog.modelNotDownloaded.title'), message: t('dialog.modelNotDownloaded.message'), icon: 'download' });
        setIsTranscribing(false);
        return;
      }
      const whisperPath = ModelManager.getModelPath(settings.preferredWhisperModel);
      await loadWhisper(whisperPath);
      const langCode = toLanguageCode(settings.defaultLanguage);

      // 1. Resolve content:// URIs to a local file (DocumentPicker / share
      //    intents on Android use content providers, not filesystem paths).
      let localPath = selectedFileUri;
      if (localPath.startsWith('content://')) {
        const ext = selectedFileName?.match(/\.\w+$/)?.[0] ?? '';
        const tmpPath = `${FileSystemLegacy.cacheDirectory}transcribe_src_${Date.now()}${ext}`;
        await FileSystemLegacy.copyAsync({ from: localPath, to: tmpPath });
        localPath = tmpPath;
      }

      // 2. Convert to 16 kHz mono WAV in a permanent dir so history replay works.
      const audioDir = `${FileSystemLegacy.documentDirectory}MuffinAudio/`;
      const dirInfo = await FileSystemLegacy.getInfoAsync(audioDir);
      if (!dirInfo.exists) {
        await FileSystemLegacy.makeDirectoryAsync(audioDir, { intermediates: true });
      }

      const wavPath = `${audioDir}transcribe_${Date.now()}.wav`;
      setRawText(t('transcribe.convertingAudio'));
      await convertToWav(localPath, wavPath);

      if (localPath !== selectedFileUri) {
        await FileSystemLegacy.deleteAsync(localPath, { idempotent: true });
      }

      setRawText(t('transcribe.transcribing'));
      const result = await transcribeFile(wavPath, langCode);
      const cleanText = result.text.trim();
      setRawText(cleanText);
      setIsTranscribing(false);

      const newItemId = Date.now().toString();
      const runId = newItemId;
      activeRunIdRef.current = runId;
      let currentItem: HistoryItem = {
        id: newItemId,
        timestampISO: new Date().toISOString(),
        sourceFileName: selectedFileName ?? t('transcribe.noTitle'),
        language: settings.defaultLanguage || 'Auto-Detect',
        rawTranscript: cleanText,
        sourceFilePath: wavPath,
      };
      await addOrUpdate(currentItem);
      haptics.success();

      // Heavy LLM work runs in the background; UI writes gated on runId, history writes keyed by item id.
      (async () => {
        const isCurrent = () => activeRunIdRef.current === runId;
        try {
          if (!settings.preferredFormatterModel) return;
          const modelPath = ModelManager.getModelPath(settings.preferredFormatterModel);

          // format + summarize run concurrently but serialize under the hood in llama.rn (shared singleton).
          if (isCurrent()) {
            setFormattedText(settings.formatByDefault ? (t('transcribe.formatting') || '') : '');
            setSummaryText(settings.summarizeByDefault ? (t('transcribe.summarizing') || '') : '');
            if (settings.formatByDefault) setTranscriptTab('formatted');
          }

          const [formatted, summarized] = await Promise.all([
            settings.formatByDefault
              ? formatTranscript(cleanText, modelPath, settings.preferredFormatterModel).catch(() => '')
              : Promise.resolve(''),
            settings.summarizeByDefault
              ? summarizeTranscript(cleanText, modelPath, settings.preferredFormatterModel).catch(() => '')
              : Promise.resolve(''),
          ]);

          if (formatted) {
            if (isCurrent()) {
              setFormattedText(formatted);
              setTranscriptTab('formatted');
            }
            currentItem = { ...currentItem, formattedTranscript: formatted };
          }
          if (summarized) {
            if (isCurrent()) {
              setSummaryText(summarized);
              if (!formatted) setTranscriptTab('summary');
            }
            currentItem = { ...currentItem, summary: summarized };
          }
          await addOrUpdate(currentItem);

          const [finalTitle] = await Promise.all([
            generateTitle(formatted || cleanText, modelPath, settings.preferredFormatterModel).catch(() => ''),
            extractMemories(cleanText, modelPath, settings.preferredFormatterModel).catch(console.warn),
          ]);

          if (finalTitle) {
            currentItem = { ...currentItem, sourceFileName: finalTitle };
            await addOrUpdate(currentItem);
          }
        } catch (err) {
          console.error("Background LLM processing failed:", err);
        }
      })();
    } catch (e) {
      console.error(e);
      haptics.error();
      const msg = e instanceof Error
        ? e.message
        : typeof e === 'object' && e !== null
          ? JSON.stringify(e)
          : String(e);
      dialog.show({ title: t('dialog.transcriptionFailed.title') || 'Transcription failed', message: msg, icon: 'warning', iconTone: 'danger' });
    } finally {
      setIsTranscribing(false);
    }
  };

  const currentText =
    transcriptTab === 'raw' ? rawText : transcriptTab === 'formatted' ? formattedText : summaryText;

  const handleCopy = async () => {
    if (!currentText) return;
    haptics.tap();
    await Clipboard.setStringAsync(currentText);
    haptics.success();
  };

  return (
    <KeyboardScreen>
    <FadeInView index={0} style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Formatting card first — configure once, then hit Transcribe. */}
      <Card style={{ marginBottom: SPACING.lg }}>
        <View style={styles.switchRow}>
          <Text style={styles.label}>{t('settings.formatByDefault') || 'Format'}</Text>
          <ExpressiveSwitch
            value={settings.formatByDefault}
            onValueChange={(v) => setSetting('formatByDefault', v)}
            activeColor={theme.tint}
            thumbActiveColor="#000000"
          />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.label}>{t('settings.summarizeByDefault') || 'Summarize'}</Text>
          <ExpressiveSwitch
            value={settings.summarizeByDefault}
            onValueChange={(v) => setSetting('summarizeByDefault', v)}
            activeColor={theme.tint}
            thumbActiveColor="#000000"
          />
        </View>

        <View style={styles.row}>
          <View style={styles.flex1}>
            <Text style={styles.label}>{t('settings.preferredFormatter') || 'Formatter Model'}</Text>
            <SelectDropdown
              options={formatterOptions}
              value={settings.preferredFormatterModel}
              onSelect={(val) => setSetting('preferredFormatterModel', val)}
              placeholder="Not Set"
            />
          </View>
          <View style={styles.gutter} />
          <View style={styles.flex1}>
            <Text style={styles.label}>{t('settings.formatLanguage') || 'Format Language'}</Text>
            <SelectDropdown
              options={FORMAT_LANGUAGE_OPTIONS}
              value={settings.formatLanguage}
              onSelect={(val) => setSetting('formatLanguage', val)}
              placeholder="Original"
            />
          </View>
        </View>

        <View style={{ marginTop: SPACING.lg }}>
          <Text style={styles.label}>{t('settings.customPrompt') || 'Custom Prompt'}</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.divider }]}
            value={customPrompt}
            onChangeText={setCustomPrompt}
            placeholder="e.g. Translate to Spanish, use bullet points..."
            placeholderTextColor={theme.textSubtle}
            multiline
          />
        </View>
      </Card>

      <Card style={{ marginBottom: SPACING.lg }}>
        <View style={styles.row}>
          <View style={styles.flex1}>
            <Text style={styles.label}>{t('settings.defaultLanguage') || 'Language'}</Text>
            <SelectDropdown
              options={dynamicLanguageOptions}
              value={settings.defaultLanguage}
              onSelect={(val) => setSetting('defaultLanguage', val)}
              placeholder="Auto-Detect"
            />
          </View>
          <View style={styles.gutter} />
          <View style={styles.flex1}>
            <Text style={styles.label}>{t('settings.whisperModel') || 'Whisper Model'}</Text>
            <SelectDropdown
              options={whisperOptions}
              value={settings.preferredWhisperModel}
              onSelect={(val) => setSetting('preferredWhisperModel', val)}
              placeholder="Not Set"
            />
          </View>
        </View>

        <View style={[styles.row, { marginTop: SPACING.lg }]}>
          <View style={styles.flex1}>
            <Button variant="secondary" size="lg" onPress={handlePickFile}>
              {selectedFileName ? selectedFileName : (t('transcribe.selectFileButton') || 'Pick Audio File')}
            </Button>
          </View>
          <View style={styles.gutter} />
          <View style={styles.flex1}>
            <Button
              variant="primary"
              size="lg"
              onPress={handleTranscribe}
              disabled={isTranscribing || !selectedFileUri}
            >
              {isTranscribing ? t('transcribe.transcribing').split('\n')[0] || 'Transcribing...' : (t('transcribe.transcribeButton') || 'Transcribe')}
            </Button>
          </View>
        </View>
      </Card>

      <Card style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{t('transcribe.transcriptTitle') || 'Transcript'}</Text>

        <View style={styles.tabRow}>
          <SegmentedControl
            style={{ flex: 1, marginRight: SPACING.md }}
            segments={TRANSCRIPT_TABS}
            value={transcriptTab}
            onChange={setTranscriptTab}
          />
          <Button
            variant="ghost"
            size="sm"
            icon="copy"
            onPress={handleCopy}
            disabled={!currentText}
          >
            {t('historyDetail.copyButton') || 'Copy'}
          </Button>
        </View>

        {isTranscribing ? (
          <View style={[styles.transcriptBox, { borderColor: theme.divider, flex: 1, justifyContent: 'center', alignItems: 'center' }]}>
            <ActivityIndicator size="large" color={theme.tint} />
            <Text style={{ fontSize: 15, color: theme.textMuted, textAlign: 'center', marginTop: SPACING.lg, paddingHorizontal: SPACING.lg }}>
              {currentText}
            </Text>
          </View>
        ) : (
          <TextInput
            style={[styles.transcriptBox, { color: theme.text, borderColor: theme.divider, flex: 1 }]}
            placeholder={t('transcribe.transcriptPlaceholder') || 'Transcript will appear here.'}
            placeholderTextColor={theme.textSubtle}
            multiline
            editable={false}
            value={currentText}
          />
        )}
      </Card>
    </FadeInView>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: SPACING.lg,
  },
  row: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
  },
  gutter: {
    width: SPACING.md,
  },
  flex1: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: SPACING.xs + 2,
    opacity: 0.8,
  },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    minHeight: 60,
    maxHeight: 80,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    backgroundColor: 'transparent',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: SPACING.md,
  },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  transcriptBox: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    minHeight: 150,
    textAlignVertical: 'top',
  },
});
