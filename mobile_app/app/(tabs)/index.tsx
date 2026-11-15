import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { TextInput } from '@/components/Themed';
import { useState, useEffect, useMemo, useRef } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Text } from '@/components/Themed';
import { useTheme } from '@/components/ThemeProvider';
import { FadeInView } from '@/components/FadeInView';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { Icon } from '@/components/Icon';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { useRecording } from '@/components/RecordingProvider';
import { setRecordSheetOpen } from '@/utils/recordSheet';
import { markCoachDone } from '@/utils/coachMarks';
import { setHeroMicOnScreen } from '@/utils/heroMic';
import { useRecordingElapsed, formatElapsed } from '@/hooks/useRecordingElapsed';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { RADIUS, SPACING, TAB_BAR_SPACE, TYPE } from '@/constants/tokens';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import { transcribeProgressive } from '@/utils/progressiveTranscribe';
import { transcribeFile, loadWhisper } from '@/utils/WhisperEngine';
import { createProgressTracker, describeProgress } from '@/utils/transcribeProgress';
import { usePacedReveal } from '@/hooks/usePacedReveal';
import { TranscriptFullscreen } from '@/components/TranscriptFullscreen';
import { TranscriptPanel, type TranscriptTab } from '@/components/TranscriptPanel';
import { convertToWav } from '@/modules/audio-converter';
import { useHistory, updateHistoryItem, HistoryItem } from '@/utils/historyStore';
import { useSettings } from '@/utils/settingsStore';
import { runEnrichment } from '@/utils/transcriptionPipeline';
import { ModelManager, WHISPER_MODELS, isParakeetModel } from '@/utils/ModelManager';
import { useModelOptions } from '@/hooks/useModelOptions';
import { useWhisperPreload } from '@/hooks/useWhisperPreload';
import { useResponsive } from '@/hooks/useResponsive';
import { errorToMessage } from '@/utils/errors';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDialog } from '@/components/Dialog';
import { router, useLocalSearchParams } from 'expo-router';
import { toLanguageCode, getLanguageOptions, parakeetCoversLanguage } from '@/utils/languages';
import { haptics } from '@/utils/haptics';
import { findHighlights } from '@/utils/entityExtraction';
import type { ActionableEntity } from '@/utils/entityExtraction';
import { EntityActionDialog } from '@/components/EntityActionDialog';
import { HighlightedText } from '@/components/HighlightedText';
import { t } from '@/utils/i18n';

export default function HomeScreen() {
  const { theme } = useTheme();
  const { addOrUpdate } = useHistory();
  const { settings, setSetting, loaded: settingsLoaded } = useSettings();
  // Closed by default: optional detail, and on a short phone an always-open
  // prompt pushes the transcript off the bottom of the screen.
  const dialog = useDialog();

  // Identifies the in-flight run; background LLM work checks it so a newer run can't overwrite the screen with stale results.
  const activeRunIdRef = useRef<string | null>(null);
  /** The file the transcript on screen came from. See resetAll. */
  const resultFileRef = useRef<string | null>(null);

  const [transcriptTab, setTranscriptTab] = useState<TranscriptTab>('raw');
  // Armed when enrichment starts; the effect below switches to it once the raw
  // typewriter has finished, so transcription isn't cut off mid-reveal.
  const [pendingAutoTab, setPendingAutoTab] = useState<TranscriptTab | null>(null);
  const [selectedFileUri, setSelectedFileUri] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [rawText, setRawText] = useState('');
  /** When the transcript on screen was made: the Butler counts "domani" from here. */
  const [transcribedAt, setTranscribedAt] = useState<Date | null>(null);
  /** Live transcript while whisper runs, and how far along it is. */
  const [streamingText, setStreamingText] = useState('');
  const [transcribePercent, setTranscribePercent] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  /** Partial format/summary output while the LLM generates it. */
  const [formatPartial, setFormatPartial] = useState('');
  const [summaryPartial, setSummaryPartial] = useState('');
  const [formattedText, setFormattedText] = useState('');
  const [summaryText, setSummaryText] = useState('');

  const { whisperOptions, downloadedIds, ready: modelsChecked } = useModelOptions();
  // The welcome hides BOTH the header and the tab bar, so this screen is on its
  // own for the notch and the gesture bar - normally the navigator handles them.
  const insets = useSafeAreaInsets();
  // Compact spacing preset on short/display-zoomed windows - see useResponsive.
  const { isShort } = useResponsive();
  // Once a file is picked, transcription is imminent - warm the model.
  useWhisperPreload(!!selectedFileUri, { progressive: true });

  const selectedWhisperDef = WHISPER_MODELS.find((m) => m.id === settings.preferredWhisperModel);
  const isEnglishOnly = selectedWhisperDef?.isEnglishOnly ?? false;
  const fastSpeech = isParakeetModel(settings.preferredWhisperModel);


  // Sync default language if current setting becomes invalid due to model switch
  useEffect(() => {
    if (isEnglishOnly && settings.defaultLanguage !== 'English' && settings.defaultLanguage !== 'Auto-Detect') {
      setSetting('defaultLanguage', 'Auto-Detect');
    } else if (fastSpeech && !parakeetCoversLanguage(settings.defaultLanguage)) {
      // The Fast model only knows its 25 languages and cannot be told one.
      setSetting('defaultLanguage', 'Auto-Detect');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSetting is a new function every render; the effect keys on the values it reads
  }, [isEnglishOnly, fastSpeech, settings.defaultLanguage]);

  // One-time welcome. seenWelcome is a NEW key rather than a reuse of
  // seenTesterWelcome, and deliberately: everyone who was on the closed track
  // has that old flag set to true, and they are exactly the people who should
  // not be told they are still testing something. A new key means the people
  // who tested this for months get the new message once, alongside every fresh
  // install. The ref guards a double-show while the saved flag is being
  // written.
  const welcomeShownRef = useRef(false);
  useEffect(() => {
    if (welcomeShownRef.current || !settingsLoaded) return;
    if (modelsChecked && downloadedIds.length > 0 && !settings.seenWelcome) {
      welcomeShownRef.current = true;
      setSetting('seenWelcome', true);
      dialog.show({
        title: t('welcome.welcomeTitle'),
        message: t('welcome.welcomeBody'),
        buttons: [{ label: t('welcome.welcomeOk') || 'Got it', variant: 'primary' }],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dialog/setSetting are recreated per render; the ref guard makes this fire once
  }, [modelsChecked, downloadedIds.length, settings.seenWelcome, settingsLoaded]);

  // Share intent target - copy the file into cache with the legacy API,
  // because the new expo-file-system module has no `cacheDirectory`.
  const params = useLocalSearchParams<{ uri?: string }>();
  useEffect(() => {
    if (!params.uri) return;
    // The result view replaces the start view, so a previous transcript left
    // on screen would hide the file that was just shared in.
    setRawText('');
    setFormattedText('');
    setSummaryText('');
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
    setPendingAutoTab(null);
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
      const result = await transcribeProgressive(
        wavPath,
        langCode,
        settings.preferredWhisperModel,
        // Length is not known before transcription here, and unknown means
        // draft: the unknown case IS the shared voice message.
        undefined,
        {
          onProgress: (raw) => {
            const reading = tracker.update(raw);
            const now = Date.now();
            if (now - lastPush < 500 && reading.percent < 100) return;
            lastPush = now;
            setTranscribePercent(reading.percent);
            // The WaitingCard's status line, which rawText feeds, was set once
            // to "Transcribing..." and then never moved again. On the most
            // accurate model that is a static string for two to five minutes,
            // with the progress bar unable to help: it renders inside the
            // STREAMING branch, so it does not exist until there is text, and
            // without a draft there is no text until whisper finishes its first
            // 30s window. The honest report of "is this thing working" was a
            // word that never changed. describeProgress adds the percentage and
            // the measured time remaining, and returns the bare label until
            // there is enough signal to say either honestly.
            setRawText(describeProgress(transcribingLabel, reading));
          },
          // Never let the visible text get SHORTER. The accurate pass starts
          // from nothing, so without this the finished draft would be replaced
          // by the accurate model's first three words and the reader would
          // watch the transcript go backwards. Instead the draft stays up,
          // being read, until the accurate pass overtakes it and quietly takes
          // over.
          onPartialText: (text) =>
            setStreamingText((prev) => (text.length >= prev.length ? text : prev)),
          onDraft: (draft) => setStreamingText(draft.text.trim()),
        },
        settings.progressiveTranscription,
      );
      setStreamingText('');
      setTranscribePercent(0);
      const cleanText = result.text.trim();
      setRawText(cleanText);
      setIsTranscribing(false);

      const newItemId = Date.now().toString();
      const runId = newItemId;
      activeRunIdRef.current = runId;
      resultFileRef.current = selectedFileUri;
      setTranscribedAt(new Date());
      const currentItem: HistoryItem = {
        id: newItemId,
        timestampISO: new Date().toISOString(),
        sourceFileName: selectedFileName ?? t('transcribe.noTitle'),
        language: settings.defaultLanguage || 'Auto-Detect',
        rawTranscript: cleanText,
        // Stored so a later Format/Summarize from History can name the language
        // in its prompt rather than hoping the model infers it.
        detectedLanguage: result.language,
        sourceFilePath: wavPath,
      };
      await addOrUpdate(currentItem);
      haptics.success();

      // Heavy LLM work runs in the background; UI writes gated on runId, history writes keyed by item id.
      (async () => {
        const isCurrent = () => activeRunIdRef.current === runId;
        try {
          if (!settings.preferredFormatterModel) {
            console.warn('Enrichment skipped: no text model selected, so no title either.');
            return;
          }
          const modelPath = ModelManager.getModelPath(settings.preferredFormatterModel);

          if (isCurrent()) {
            setFormattedText(settings.formatByDefault ? (t('transcribe.formatting') || '') : '');
            setSummaryText(settings.summarizeByDefault ? (t('transcribe.summarizing') || '') : '');
            // Arm, don't switch: the raw typewriter is still catching up, and
            // jumping tabs now cuts it off mid-type (a tester hit this). The
            // effect switches once the raw reveal is done.
            setPendingAutoTab(settings.formatByDefault ? 'formatted' : settings.summarizeByDefault ? 'summary' : null);
          }

          // Serialized under the hood: format, summarize and title all share the
          // one llama context, so runEnrichment awaits them in sequence.
          const enrich = await runEnrichment({
            rawText: cleanText,
            modelPath,
            modelFile: settings.preferredFormatterModel,
            sourceLanguage: result.language,
            format: settings.formatByDefault,
            summarize: settings.summarizeByDefault,
            title: true,
            entities: false,
            memories: true,
            onFormatPartial: (p) => {
              if (isCurrent()) setFormatPartial(p);
            },
            onSummaryPartial: (p) => {
              if (isCurrent()) setSummaryPartial(p);
            },
            onFormatted: (f) => {
              if (isCurrent()) {
                setFormatPartial('');
                setFormattedText(f);
              }
            },
            onSummarized: (s) => {
              if (isCurrent()) {
                setSummaryPartial('');
                setSummaryText(s);
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
        } finally {
          // If format or summarize threw, their onFormatted/onSummarized never
          // fired, and a half-generated partial would sit on screen for good.
          if (isCurrent()) {
            setFormatPartial('');
            setSummaryPartial('');
          }
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
      setTranscribePercent(0);
      setFullscreen(false);
    }
  };

  const currentText =
    transcriptTab === 'raw' ? rawText : transcriptTab === 'formatted' ? formattedText : summaryText;

  // The Butler: dates and times in the text, tappable. "Domani" counts from
  // the moment this transcript was made, not from whenever the tab is looked at.
  const highlights = useMemo(
    () => findHighlights(currentText, [], transcribedAt ?? undefined),
    [currentText, transcribedAt]
  );
  const [activeEntity, setActiveEntity] = useState<ActionableEntity | null>(null);

  /**
   * Whatever is being generated for the tab on screen. Whisper's output is
   * paced (bursts need spreading); the LLM's isn't, because its tokens already
   * arrive one at a time and pacing them would only add lag.
   */
  const live =
    transcriptTab === 'raw' && isTranscribing && streamingText
      ? { text: streamingText, paced: true }
      : transcriptTab === 'formatted' && formatPartial
      ? { text: formatPartial, paced: false }
      : transcriptTab === 'summary' && summaryPartial
      ? { text: summaryPartial, paced: false }
      : null;
  const liveText = live?.text ?? '';
  // ONE reveal for the inline panel and fullscreen, so the typing carries
  // over when fullscreen opens instead of starting again from zero.
  const { revealed, done: revealDone } = usePacedReveal(liveText, live?.paced ?? false, {
    enabled: settings.enableTypewriter,
    speed: settings.typewriterSpeed,
  });
  // Hold the typewriter view until the reveal catches up, so a short import
  // still types out after its single burst completes.
  const revealing = revealed.length > 0 && !revealDone;

  // Hold on Raw until its typewriter finishes, THEN switch to the tab the run
  // armed. Switching the instant enrichment started cut the raw transcription
  // off mid-type. Guarded on 'raw' so a manual switch during the run wins.
  useEffect(() => {
    if (pendingAutoTab && revealDone && transcriptTab === 'raw') {
      setTranscriptTab(pendingAutoTab);
      setPendingAutoTab(null);
    }
  }, [pendingAutoTab, revealDone, transcriptTab]);

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

  /** Back to the empty screen. */
  const resetAll = () => {
    haptics.tap();
    // Late format/summary output from the run being dismissed must not land on
    // the next one. The run itself carries on and still updates History.
    activeRunIdRef.current = null;
    setRawText('');
    setFormattedText('');
    setSummaryText('');
    setFormatPartial('');
    setSummaryPartial('');
    setTranscriptTab('raw');
    setPendingAutoTab(null);
    // Only forget the file this result came from. A file shared in while the
    // previous one was still transcribing is waiting its turn, not finished.
    if (selectedFileUri === resultFileRef.current) {
      setSelectedFileUri(null);
      setSelectedFileName(null);
    }
    resultFileRef.current = null;
  };

  const clearFile = () => {
    haptics.tap();
    setSelectedFileUri(null);
    setSelectedFileName(null);
  };

  // One screen, two jobs, never both at once: start something, or read what
  // came out. The old layout showed an empty transcript box under two cards of
  // settings at all times, so neither job had the room it needed.
  const hasResult = isTranscribing || !!rawText || !!streamingText;

  const optionsSummary = [
    getLanguageOptions().find((o) => o.value === settings.defaultLanguage)?.label ?? settings.defaultLanguage,
    whisperOptions.find((o) => o.value === settings.preferredWhisperModel)?.label,
    settings.formatByDefault ? t('transcribe.formatToggle') || 'Improve' : null,
    settings.summarizeByDefault ? t('transcribe.summarizeToggle') || 'Summarize' : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <KeyboardScreen>
    <FadeInView index={0} style={[styles.root, { backgroundColor: theme.background }]}>
      {/* ScrollView + flexGrow content: fills the screen on a normal phone and
          only scrolls when a short or font-scaled screen genuinely cannot fit
          it (a ZTE Blade A76 once pushed the transcript off the bottom,
          unreachable). The bottom padding is the tab bar's real height, the
          pill plus the device inset, because a fixed number clipped phones
          with a three-button nav bar. */}
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.container, { paddingBottom: Math.max(TAB_BAR_SPACE, insets.bottom + 60) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {hasResult ? (
          <>
            <View style={styles.resultBar}>
              <Icon name="audio-file" size={20} color={theme.textMuted} />
              <Text numberOfLines={1} ellipsizeMode="middle" style={[styles.resultName, { color: theme.textMuted }]}>
                {selectedFileName ?? ''}
              </Text>
              {/* Hidden while it runs: there is no cancel, and a button that
                  only appears to abandon the work would be a lie. */}
              {!isTranscribing && (
                <Button variant="secondary" size="sm" icon="add" onPress={resetAll}>
                  {t('transcribe.newTranscription') || 'New'}
                </Button>
              )}
            </View>

            {/* flex:1 absorbs the rest of the screen. The transcript's content
                sits in an absolute layer inside the panel, so a long one
                scrolls inside the card instead of stretching the page. */}
            <Card style={{ flex: 1, minHeight: 240 }}>
              <TranscriptPanel
                tab={transcriptTab}
                onTabChange={setTranscriptTab}
                streaming={!!live || revealing}
                revealed={revealed}
                progressPercent={isTranscribing ? transcribePercent : null}
                waiting={isTranscribing}
                waitingStatus={currentText}
                renderStatic={() =>
                  highlights.length > 0 ? (
                    /* The History detail's own structure, so it lays out the
                       same way inside the panel. Only when there is something
                       to tap; otherwise the plain field below stays. */
                    <View style={{ flex: 1 }}>
                      <ScrollView nestedScrollEnabled style={{ flex: 1 }}>
                        <HighlightedText
                          text={currentText}
                          highlights={highlights}
                          onPress={setActiveEntity}
                          style={styles.highlightedText}
                        />
                      </ScrollView>
                    </View>
                  ) : (
                    <TextInput
                      style={[styles.transcriptText, { color: theme.text }]}
                      placeholder={t('transcribe.transcriptPlaceholder') || 'Transcript will appear here.'}
                      placeholderTextColor={theme.textSubtle}
                      multiline
                      editable={false}
                      value={currentText}
                    />
                  )
                }
                onCopy={handleCopy}
                copyDisabled={!currentText}
                onFullscreen={() => {
                  haptics.tap();
                  setFullscreen(true);
                }}
                fullscreenDisabled={!currentText && !liveText}
              />
            </Card>
          </>
        ) : (
          <>
            <View style={styles.hero}>
              <HeroMic compact={isShort} />
            </View>

            {selectedFileUri ? (
              <Card style={{ marginBottom: SPACING.md }}>
                <View style={styles.fileRow}>
                  <View style={[styles.fileIcon, { backgroundColor: theme.tintFill }]}>
                    <Icon name="audio-file" size={22} color={theme.tintText} />
                  </View>
                  <Text numberOfLines={1} ellipsizeMode="middle" style={styles.fileName}>
                    {selectedFileName}
                  </Text>
                  <IconButton
                    icon="close"
                    variant="ghost"
                    onPress={clearFile}
                    accessibilityLabel={t('transcribe.removeFile') || 'Remove file'}
                  />
                </View>
                <Button variant="primary" size="lg" onPress={handleTranscribe} style={{ marginTop: SPACING.md }}>
                  {t('transcribe.transcribeButton') || 'Transcribe'}
                </Button>
              </Card>
            ) : (
              <Button
                variant="secondary"
                size="lg"
                icon="upload-file"
                onPress={handlePickFile}
                style={{ marginBottom: SPACING.md }}
              >
                {t('transcribe.selectFileButton') || 'Pick file'}
              </Button>
            )}

            <AnimatedPressable
              onPress={() => {
                haptics.tap();
                setRecordSheetOpen(true);
              }}
              scaleTo={0.99}
              accessibilityRole="button"
              accessibilityLabel={t('record.optionsTitle') || 'Options'}
              style={[styles.optionsRow, { backgroundColor: theme.surface }]}
            >
              <Icon name="tune" size={22} color={theme.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.optionsTitle}>{t('record.optionsTitle') || 'Options'}</Text>
                <Text numberOfLines={1} style={[styles.optionsSummary, { color: theme.textMuted }]}>
                  {optionsSummary}
                </Text>
              </View>
              <Icon name="chevron-right" size={20} color={theme.textSubtle} />
            </AnimatedPressable>
          </>
        )}
      </ScrollView>

      <TranscriptFullscreen
        visible={fullscreen}
        onClose={() => setFullscreen(false)}
        text={!!live || revealing ? revealed : currentText}
        streaming={!!live || revealing}
        percent={isTranscribing ? transcribePercent : undefined}
        onCopy={currentText ? handleCopy : undefined}
      />
      <EntityActionDialog entity={activeEntity} onClose={() => setActiveEntity(null)} />
    </FadeInView>
    </KeyboardScreen>
  );
}

/**
 * The record button, as the thing the screen is about.
 *
 * It drives the same recorder as the small mic in the tab bar (that one exists
 * so you can record from History or Settings). Recording, stopping and the
 * hand-off to transcription all live in RecordingProvider; this only asks.
 */
function HeroMic({ compact }: { compact: boolean }) {
  const { theme } = useTheme();
  const { isRecording, toggle } = useRecording();
  const elapsed = useRecordingElapsed(isRecording);
  const size = compact ? 104 : 128;

  // While this is on screen the tab bar puts its own small mic away.
  useEffect(() => {
    setHeroMicOnScreen(true);
    return () => setHeroMicOnScreen(false);
  }, []);

  // One plain circle. It breathes while recording and is still otherwise.
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = isRecording
      ? withRepeat(withTiming(1.06, { duration: 800, easing: Easing.inOut(Easing.quad) }), -1, true)
      : withTiming(1, { duration: 200 });
  }, [isRecording, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <View style={{ alignItems: 'center' }}>
      <Animated.View style={pulseStyle}>
        <AnimatedPressable
          onPress={() => {
            markCoachDone('mic');
            toggle();
          }}
          onLongPress={() => {
            haptics.select();
            setRecordSheetOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={isRecording ? t('transcribe.heroStop') : t('transcribe.heroRecord')}
          accessibilityState={{ selected: isRecording }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: isRecording ? theme.danger : theme.tint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon
            name={isRecording ? 'stop' : 'mic'}
            filled
            size={Math.round(size * 0.42)}
            color={isRecording ? '#FFFFFF' : theme.tintForeground}
          />
        </AnimatedPressable>
      </Animated.View>
      {/* The small mic in the tab bar shows the running time, and it is put
          away while this one is on screen, so the time is shown here. */}
      <Text style={[styles.heroTitle, isRecording && styles.heroTime]}>
        {isRecording ? formatElapsed(elapsed) : t('transcribe.heroRecord') || 'Tap to record'}
      </Text>
      {isRecording && (
        <Text style={[styles.heroHint, { color: theme.textMuted }]}>
          {t('transcribe.heroStop') || 'Recording. Tap to stop'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  welcome: {
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
    fontSize: TYPE.body,
    lineHeight: 24,
    textAlign: 'center',
  },
  container: {
    flexGrow: 1,
    padding: SPACING.lg,
    paddingBottom: TAB_BAR_SPACE,
  },
  hero: {
    flex: 1,
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
  },
  heroTitle: {
    fontSize: TYPE.title,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: SPACING.lg,
  },
  heroTime: {
    fontSize: TYPE.display,
    fontVariant: ['tabular-nums'],
  },
  heroHint: {
    fontSize: TYPE.label,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  fileIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileName: {
    flex: 1,
    fontSize: TYPE.body,
    fontWeight: '600',
  },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    minHeight: 64,
    borderRadius: RADIUS.lg,
  },
  optionsTitle: {
    fontSize: TYPE.label,
    fontWeight: '600',
  },
  optionsSummary: {
    fontSize: TYPE.caption,
    marginTop: 2,
  },
  resultBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    minHeight: 40,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.xs,
  },
  resultName: {
    flex: 1,
    fontSize: TYPE.label,
    fontWeight: '600',
  },
  transcriptText: {
    flex: 1,
    fontSize: 17,
    lineHeight: 27,
    padding: 0,
    textAlignVertical: 'top',
  },
  // Same type as above, minus the input-only properties.
  highlightedText: {
    fontSize: 17,
    lineHeight: 27,
  },
});
