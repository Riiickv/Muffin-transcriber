import { Image, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Text } from '@/components/Themed';
import { useTheme } from '@/components/ThemeProvider';
import { FadeInView } from '@/components/FadeInView';
import ExpressiveSwitch from '@/components/ExpressiveSwitch';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { SegmentedControl } from '@/components/SegmentedControl';
import { RADIUS, SPACING, TAB_BAR_SPACE } from '@/constants/tokens';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import { transcribeFile, loadWhisper } from '@/utils/WhisperEngine';
import { createProgressTracker, describeProgress, ProgressReading } from '@/utils/transcribeProgress';
import { convertToWav } from '@/modules/audio-converter';
import { useHistory, updateHistoryItem, HistoryItem } from '@/utils/historyStore';
import { useSettings, useDebouncedSetting } from '@/utils/settingsStore';
import { runEnrichment } from '@/utils/transcriptionPipeline';
import { ModelManager, WHISPER_MODELS } from '@/utils/ModelManager';
import { useModelOptions } from '@/hooks/useModelOptions';
import { useWhisperPreload } from '@/hooks/useWhisperPreload';
import { errorToMessage } from '@/utils/errors';
import { SelectDropdown } from '@/components/SelectDropdown';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WaitingCard, showSupportDialog } from '@/components/WaitingCard';
import { StreamingText } from '@/components/StreamingText';
import { useDialog } from '@/components/Dialog';
import { router, useLocalSearchParams } from 'expo-router';
import { toLanguageCode, getLanguageOptions, getFormatLanguageOptions } from '@/utils/languages';
import { haptics } from '@/utils/haptics';
import { t } from '@/utils/i18n';

type TranscriptTab = 'raw' | 'formatted' | 'summary';

// A function, not a const: built at module scope these labels would be
// evaluated once at import and keep the language the app started in, so
// switching language left Raw/Formatted/Summary in the old one.
const getTranscriptTabs = (): readonly { key: TranscriptTab; label: string }[] => [
  { key: 'raw', label: t('transcribe.rawTab') || 'Raw' },
  { key: 'formatted', label: t('transcribe.formattedTab') || 'Formatted' },
  { key: 'summary', label: t('transcribe.summaryTab') || 'Summary' },
];

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
  /** Live transcript while whisper runs, and the percent/estimate line under it. */
  const [streamingText, setStreamingText] = useState('');
  const [progressLine, setProgressLine] = useState('');
  const [formattedText, setFormattedText] = useState('');
  const [summaryText, setSummaryText] = useState('');

  const { whisperOptions, formatterOptions, downloadedIds, ready: modelsChecked } = useModelOptions();
  // The welcome hides BOTH the header and the tab bar, so this screen is on its
  // own for the notch and the gesture bar - normally the navigator handles them.
  const insets = useSafeAreaInsets();
  // Once a file is picked, transcription is imminent - warm the model.
  useWhisperPreload(!!selectedFileUri);

  const selectedWhisperDef = WHISPER_MODELS.find((m) => m.id === settings.preferredWhisperModel);
  const isEnglishOnly = selectedWhisperDef?.isEnglishOnly ?? false;

  const dynamicLanguageOptions = isEnglishOnly
    ? getLanguageOptions().filter((o) => o.value === 'English' || o.value === 'Auto-Detect')
    : getLanguageOptions();

  // Sync default language if current setting becomes invalid due to model switch
  useEffect(() => {
    if (isEnglishOnly && settings.defaultLanguage !== 'English' && settings.defaultLanguage !== 'Auto-Detect') {
      setSetting('defaultLanguage', 'Auto-Detect');
    }
  }, [isEnglishOnly, settings.defaultLanguage]);

  // Share intent target - copy the file into cache with the legacy API,
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
      // Keep the screen on: Android throttles the CPU hard when it dims,
      // which can multiply transcription time. Tagged so finishing here can't
      // release the Record tab's concurrent wake lock.
      await activateKeepAwakeAsync('home-transcription');
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

      const transcribingLabel = t('transcribe.transcribing');
      setRawText(transcribingLabel);
      // An imported file is the longest job the app takes, so this is the one
      // that most needs to say how far along it is.
      const tracker = createProgressTracker();
      let lastPush = 0;
      // Kept OUT of rawText: rawText feeds the WaitingCard's status line, so
      // streaming into it rendered the whole transcript as a centred, muted
      // status message stacked above the support button.
      const result = await transcribeFile(wavPath, langCode, {
        onProgress: (raw) => {
          const reading = tracker.update(raw);
          const now = Date.now();
          if (now - lastPush < 500 && reading.percent < 100) return;
          lastPush = now;
          setProgressLine(describeProgress(transcribingLabel, reading));
        },
        onPartialText: setStreamingText,
      });
      setStreamingText('');
      setProgressLine('');
      const cleanText = result.text.trim();
      setRawText(cleanText);
      setIsTranscribing(false);

      const newItemId = Date.now().toString();
      const runId = newItemId;
      activeRunIdRef.current = runId;
      const currentItem: HistoryItem = {
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

          if (isCurrent()) {
            setFormattedText(settings.formatByDefault ? (t('transcribe.formatting') || '') : '');
            setSummaryText(settings.summarizeByDefault ? (t('transcribe.summarizing') || '') : '');
            if (settings.formatByDefault) setTranscriptTab('formatted');
          }

          // Serialized under the hood: format, summarize and title all share the
          // one llama context, so runEnrichment awaits them in sequence.
          let formattedOut = '';
          const enrich = await runEnrichment({
            rawText: cleanText,
            modelPath,
            modelFile: settings.preferredFormatterModel,
            format: settings.formatByDefault,
            summarize: settings.summarizeByDefault,
            title: true,
            embedding: false,
            entities: false,
            memories: true,
            onFormatted: (f) => {
              formattedOut = f;
              if (isCurrent()) {
                setFormattedText(f);
                setTranscriptTab('formatted');
              }
            },
            onSummarized: (s) => {
              if (isCurrent()) {
                setSummaryText(s);
                if (!formattedOut) setTranscriptTab('summary');
              }
            },
          });

          // Patch only what enrichment produced; updateHistoryItem merges over
          // the current item and is a no-op if the user deleted it meanwhile.
          const patch: Partial<HistoryItem> = {};
          if (enrich.formatted) patch.formattedTranscript = enrich.formatted;
          if (enrich.summarized) patch.summary = enrich.summarized;
          if (enrich.title) patch.sourceFileName = enrich.title;
          if (Object.keys(patch).length > 0) {
            await updateHistoryItem(newItemId, patch);
          }
        } catch (err) {
          console.error("Background LLM processing failed:", err);
        }
      })();
    } catch (e) {
      console.error(e);
      haptics.error();
      dialog.show({ title: t('dialog.transcriptionFailed.title') || 'Transcription failed', message: errorToMessage(e), icon: 'warning', iconTone: 'danger' });
    } finally {
      deactivateKeepAwake('home-transcription');
      setIsTranscribing(false);
      // Also on the failure path, or a half-finished transcript would sit under
      // the box after the error dialog is dismissed.
      setStreamingText('');
      setProgressLine('');
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

  // FIRST RUN. With no models the app cannot do anything at all - every control
  // below is dead and the Go button fails - so showing them is a lie about what
  // the app is ready to do. This is also the only screen a Play reviewer sees on
  // a fresh install. `modelsChecked` gates it so existing users never see it
  // flash while the disk is being read.
  if (modelsChecked && downloadedIds.length === 0) {
    return (
      <FadeInView index={0} style={[styles.root, { backgroundColor: theme.background }]}>
        {/* A ScrollView with flexGrow:1 and centred content: on a normal phone
            there's nothing to scroll and it sits dead centre, but on a short
            screen - or with the system font cranked up - the text and button can
            exceed it, and RN children don't shrink. Without this the Setup
            button is simply unreachable, and it's the only thing on the page. */}
        <ScrollView
          style={styles.root}
          contentContainerStyle={[
            styles.welcome,
            { paddingTop: insets.top + SPACING.xl, paddingBottom: insets.bottom + SPACING.xl },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* The APP's logo, not RickLogo - that smile is Ricky's signature and
              belongs on the support button, not on the screen introducing
              Muffin. splash-icon is the mark on transparency; icon.png carries
              its own dark square, which would sit as a visible box here.
              Untinted on purpose: a logo keeps its colours, and a tint would
              flatten the magenta star into the pink bars. */}
          <Image
            source={require('@/assets/images/splash-icon.png')}
            style={{ width: 132, height: 132 }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <Text style={styles.welcomeTitle}>{t('transcribe.welcomeTitle')}</Text>
          <Text style={[styles.welcomeBody, { color: theme.textMuted }]}>
            {t('transcribe.welcomeBody')}
          </Text>
          <Text style={[styles.welcomeBody, { color: theme.textMuted }]}>
            {t('transcribe.welcomeStep')}
          </Text>

          {/* Explicit height: an unsized Button balloons inside a centered
              container (see WaitingCard). */}
          <Button
            variant="primary"
            size="lg"
            style={{ marginTop: SPACING.xl, height: 48 }}
            onPress={() => {
              haptics.tap();
              // The guided setup, not the raw Models list: eleven downloads with
              // sizes in gigabytes is where someone who just wanted their voice
              // notes read out closes the app.
              router.push('/setup' as any);
            }}
          >
            {t('transcribe.welcomeButton')}
          </Button>
        </ScrollView>
      </FadeInView>
    );
  }

  return (
    <KeyboardScreen>
    <FadeInView index={0} style={[styles.root, { backgroundColor: theme.background }]}>
      {/* A ScrollView with flexGrow:1 on its content, NOT a plain View: when
          everything fits (the normal phone case) the content is exactly one
          screen tall and there is nothing to scroll, so this still behaves as
          the fixed page it's meant to be. When it does NOT fit - short screen,
          large system font, big display-size setting - the page scrolls instead
          of quietly cutting the Transcript card off the bottom. RN children
          don't shrink by default, so without this the overflow is unreachable. */}
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
      {/* Formatting card first - configure once, then hit Transcribe. */}
      <Card index={0} style={{ marginBottom: SPACING.lg }}>
        <View style={styles.switchRow}>
          <Text style={styles.label}>{t('transcribe.formatToggle') || 'Format'}</Text>
          <ExpressiveSwitch
            value={settings.formatByDefault}
            onValueChange={(v) => setSetting('formatByDefault', v)}
            activeColor={theme.tint}
            thumbActiveColor="#000000"
          />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.label}>{t('transcribe.summarizeToggle') || 'Summarize'}</Text>
          <ExpressiveSwitch
            value={settings.summarizeByDefault}
            onValueChange={(v) => setSetting('summarizeByDefault', v)}
            activeColor={theme.tint}
            thumbActiveColor="#000000"
          />
        </View>

        <View style={styles.row}>
          <View style={styles.flex1}>
            <Text style={styles.label}>{t('transcribe.formatterModelLabel') || 'Formatter Model'}</Text>
            <SelectDropdown
              options={formatterOptions}
              fieldLabel={t('transcribe.formatterModelLabel') || 'Formatter Model'}
              value={settings.preferredFormatterModel}
              onSelect={(val) => setSetting('preferredFormatterModel', val)}
              placeholder="Not Set"
            />
          </View>
          <View style={styles.gutter} />
          <View style={styles.flex1}>
            <Text style={styles.label}>{t('transcribe.formatLanguageLabel') || 'Format Language'}</Text>
            <SelectDropdown
              options={getFormatLanguageOptions()}
              fieldLabel={t('transcribe.formatLanguageLabel') || 'Format Language'}
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

      <Card index={1} style={{ marginBottom: SPACING.lg }}>
        <View style={styles.row}>
          <View style={styles.flex1}>
            <Text style={styles.label}>{t('transcribe.languageLabel') || 'Language'}</Text>
            <SelectDropdown
              options={dynamicLanguageOptions}
              fieldLabel={t('transcribe.languageLabel') || 'Language'}
              value={settings.defaultLanguage}
              onSelect={(val) => setSetting('defaultLanguage', val)}
              placeholder="Auto-Detect"
            />
          </View>
          <View style={styles.gutter} />
          <View style={styles.flex1}>
            <Text style={styles.label}>{t('transcribe.whisperModelLabel') || 'Whisper Model'}</Text>
            <SelectDropdown
              options={whisperOptions}
              fieldLabel={t('transcribe.whisperModelLabel') || 'Whisper Model'}
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

      {/* minHeight matters now that this sits in a scroll container: `flex: 1`
          is flexBasis:0%, so with no free space to grow into the card would
          collapse to zero instead of pushing the page taller. */}
      <Card index={2} style={{ flex: 1, minHeight: 260 }}>
        <Text style={styles.sectionTitle}>{t('transcribe.transcriptTitle') || 'Transcript'}</Text>

        <View style={styles.tabRow}>
          <SegmentedControl
            style={{ flex: 1, marginRight: SPACING.md }}
            segments={getTranscriptTabs()}
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
          <View style={[styles.transcriptBox, { borderColor: theme.divider, flex: 1 }]}>
            {streamingText ? (
              /* Reads as a transcript, not as a status message: left aligned,
                 normal text colour, with the progress line and a quiet support
                 link tucked underneath rather than a card wrapped around it. */
              <ScrollView nestedScrollEnabled>
                <StreamingText text={streamingText} style={[styles.streamingText, { color: theme.text }]} />
                {!!progressLine && (
                  <Text style={[styles.streamingNote, { color: theme.textMuted }]}>{progressLine}</Text>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  style={{ alignSelf: 'flex-start', marginTop: SPACING.xs }}
                  onPress={() => showSupportDialog(dialog)}
                >
                  {t('transcribe.supportMe') || 'Support me!'}
                </Button>
              </ScrollView>
            ) : (
              <WaitingCard status={currentText} />
            )}
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
      </ScrollView>
    </FadeInView>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  welcome: {
    // flexGrow, not flex: fills the screen when it fits, exceeds it when it
    // doesn't, rather than clipping the button off the bottom.
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.md,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: SPACING.md,
  },
  welcomeBody: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  // Content container: flexGrow (not flex) so it fills a tall screen but is
  // free to exceed a short one and scroll.
  container: {
    flexGrow: 1,
    padding: SPACING.lg,
    paddingBottom: TAB_BAR_SPACE,
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
  /** Live transcript: matches the finished one so nothing shifts when it lands. */
  streamingText: {
    fontSize: 16,
    lineHeight: 24,
  },
  streamingNote: {
    fontSize: 13,
    marginTop: SPACING.md,
    fontStyle: 'italic',
  },
});
