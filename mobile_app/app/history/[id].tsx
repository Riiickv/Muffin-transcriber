import { StyleSheet, View, ScrollView } from 'react-native';
import { TextInput } from '@/components/Themed';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Clipboard from 'expo-clipboard';
import * as FileSystemLegacy from 'expo-file-system/legacy';

import { Text } from '@/components/Themed';
import { useTheme } from '@/components/ThemeProvider';
import { Card } from '@/components/Card';
import { Collapsible } from '@/components/Collapsible';
import { IconButton } from '@/components/IconButton';
import type { IconName } from '@/components/Icon';
import { Button } from '@/components/Button';
import { WaveformSeekBar } from '@/components/WaveformSeekBar';
import { TranscriptFullscreen } from '@/components/TranscriptFullscreen';
import { TranscriptPanel, type TranscriptTab } from '@/components/TranscriptPanel';
import { SelectDropdown } from '@/components/SelectDropdown';
import { RADIUS, SPACING } from '@/constants/tokens';
import { useHistory, updateHistoryItem } from '@/utils/historyStore';
import { useRecording } from '@/components/RecordingProvider';
import { useSettings, useDebouncedSetting } from '@/utils/settingsStore';
import { formatTranscript, summarizeTranscript, extractMemories, extractActionableEntities, findHighlights, stopLlamaWork } from '@/utils/LLMEngine';
import { generateEmbedding } from '@/utils/EmbeddingEngine';
import { loadWhisper, stopWhisperWork } from '@/utils/WhisperEngine';
import { transcribeAudio } from '@/utils/audioTranscription';
import { createProgressTracker, describeProgress } from '@/utils/transcribeProgress';
import { ModelManager } from '@/utils/ModelManager';
import { useModelOptions } from '@/hooks/useModelOptions';
import { useWhisperPreload } from '@/hooks/useWhisperPreload';
import { toLanguageCode } from '@/utils/languages';
import { errorToMessage } from '@/utils/errors';
import { formatDuration, formatHistoryDate } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import { useDialog } from '@/components/Dialog';
import { EntityActionDialog } from '@/components/EntityActionDialog';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { t } from '@/utils/i18n';
import { useResponsive } from '@/hooks/useResponsive';
import { queueLlama } from '@/utils/transcriptionPipeline';
import { startAiJob, updateAiJob, endAiJob, markAiJobStopping, useAiJob } from '@/utils/aiActivity';
import { AiBusyDialog } from '@/components/AiBusyDialog';
import { usePacedReveal } from '@/hooks/usePacedReveal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function HistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  // isShort: compact spacing preset on short/display-zoomed windows.
  const { contentWidth, isShort } = useResponsive();
  const { items, addOrUpdate } = useHistory();
  const item = items.find((h) => h.id === id);
  const { settings, setSetting } = useSettings();
  const [customPrompt, setCustomPrompt] = useDebouncedSetting('customFormatSystemPrompt');
  const [promptOpen, setPromptOpen] = useState(false);
  const dialog = useDialog();
  const insets = useSafeAreaInsets();

  const [transcriptTab, setTranscriptTab] = useState<TranscriptTab>('raw');
  // Derived from the app-wide job, NOT local state: local state dies with the
  // screen, so leaving mid-run and returning showed idle buttons while the
  // work carried on invisibly - worst while a model was still loading and
  // there was no text yet to hint at it.
  const job = useAiJob();
  const myJob = job && job.itemId === id ? job : null;
  const isProcessing = myJob !== null;
  const localProgress = myJob?.progress ?? null;
  const localPartial = myJob?.partial ?? '';
  const [fullscreen, setFullscreen] = useState(false);
  const processingLabel = (myJob?.kind ?? null) as null | 'retranscribe' | 'format' | 'summarize';
  /** Pending confirmation when a second AI action is tapped mid-run. */
  const [busyPrompt, setBusyPrompt] = useState<{ next: string; current: string; run: () => void } | null>(null);
  // App-wide, so work started on another screen (or before this one was
  // re-entered) is still visible here.
  const aiActivity = job?.label ?? null;

  const [activeEntity, setActiveEntity] = useState<{ quote: string; name: string; type: 'date' | 'time' } | null>(null);

  const { whisperOptions, formatterOptions } = useModelOptions();
  // Re-Transcribe is one tap away - warm the model while the user reads.
  useWhisperPreload(!!item?.sourceFilePath);

  // A just-recorded note lands here empty while the recording provider
  // transcribes it in the background. Show a live "Transcribing..." state until
  // the raw text arrives.
  const { transcribingId, transcribeProgress, partialText } = useRecording();
  const isTranscribingThis = transcribingId === id && !item?.rawTranscript;

  const transcript =
    transcriptTab === 'summary'
      ? item?.summary || ''
      : transcriptTab === 'formatted'
      ? item?.formattedTranscript || ''
      : item?.rawTranscript || '';

  // Live text from whatever is running here: the recorder's transcription, or
  // a Re-transcribe / Format / Summarize started on this screen. Only while
  // it's actually running, so a leftover can't sit on the finished transcript.
  const streamingText = (isTranscribingThis && partialText) || (isProcessing && localPartial) || '';
  /**
   * Whisper's output is paced (paragraph bursts need spreading); the LLM's is
   * not, since its tokens already arrive at reading speed. Only whisper
   * reports a percentage, so the hairline follows the same flag.
   */
  const isStreamingWhisper = isTranscribingThis || processingLabel === 'retranscribe';
  // ONE reveal, shared by the inline panel and fullscreen, so opening
  // fullscreen mid-generation carries the typing over instead of restarting.
  const { revealed, done: revealDone } = usePacedReveal(streamingText, isStreamingWhisper, {
    enabled: settings.enableTypewriter,
    speed: settings.typewriterSpeed,
  });
  // Keep the typewriter view up until the reveal catches up, so a short note -
  // which arrives as one burst and completes at once - still types out.
  const revealing = revealed.length > 0 && !revealDone;
  const showStreaming = streamingText !== '' || revealing;

  // Recomputed per tab: the stored quotes come from the raw transcript, but
  // formatted and summary are reworded, so they need their own pass.
  const highlights = useMemo(
    () => findHighlights(transcript, item?.extractedDates ?? []),
    [transcript, item?.extractedDates]
  );

  const dateStr = item ? formatHistoryDate(item.timestampISO) : '';

  const player = useAudioPlayer(item?.sourceFilePath || null);
  const playerStatus = useAudioPlayerStatus(player);
  const isPlaying = playerStatus?.playing ?? false;
  const currentTime = playerStatus?.currentTime ?? 0;
  const duration = playerStatus?.duration ?? 0;
  const progress = duration > 0 ? currentTime / duration : 0;

  useEffect(() => {
    if (playerStatus?.didJustFinish) {
      player.seekTo(0);
    }
  }, [playerStatus?.didJustFinish, player]);

  // Backfill the audio duration the first time the player reports it, so the
  // history list can show a real length instead of nothing.
  useEffect(() => {
    if (item && duration > 0 && !item.audioDurationMs) {
      addOrUpdate({ ...item, audioDurationMs: Math.round(duration * 1000) });
    }
  }, [duration, item, addOrUpdate]);

  const togglePlayback = () => {
    if (!item?.sourceFilePath) {
      dialog.show({ title: t('dialog.noAudio.title') || 'No audio file', message: t('dialog.noAudio.message') || 'This transcript has no associated audio.', icon: 'warning' });
      return;
    }
    haptics.tap();
    if (isPlaying) player.pause();
    else player.play();
  };

  /**
   * Stops whatever is running on THIS entry. The engines keep their contexts
   * loaded, so a restart is warm.
   */
  const stopMyJob = () => {
    haptics.tap();
    markAiJobStopping();
    // Deliberately NOT awaited. The engines only notice the flag between chunks
    // (and never during prefill), so awaiting froze the UI for the whole
    // wind-down and made Stop look ignored. Fire it and say "Stopping".
    void stopWhisperWork();
    void stopLlamaWork();
  };

  /**
   * The running action's own button becomes a red Stop instead of going grey.
   * A disabled button says "not now"; this says what is happening and offers
   * the way out, which is the only control that makes sense mid-run.
   */
  const actionButton = (
    kind: 'retranscribe' | 'format' | 'summarize',
    icon: IconName,
    label: string,
    handler: () => void,
    enabled: boolean
  ) =>
    processingLabel === kind ? (
      <Button
        variant="danger"
        size="md"
        stacked
        icon="stop"
        onPress={stopMyJob}
        disabled={!!myJob?.stopping}
      >
        {myJob?.stopping ? t('historyDetail.stopping') || 'Stopping...' : t('historyDetail.stop') || 'Stop'}
      </Button>
    ) : (
      <Button
        variant="secondary"
        size="md"
        stacked
        icon={icon}
        onPress={() => startAction(kind, handler)}
        disabled={isProcessing || !enabled}
      >
        {label}
      </Button>
    );

  const labelForAction = (a: 'retranscribe' | 'format' | 'summarize') =>
    a === 'retranscribe'
      ? t('historyDetail.retranscribe') || 'Re-Transcribe'
      : a === 'format'
      ? t('historyDetail.format') || 'Improve'
      : t('historyDetail.summarize') || 'Summarize';

  /**
   * Runs `job`, but if something is already generating, asks first - and if the
   * user agrees, actually aborts the running job rather than queueing behind
   * it. Queueing was the old behaviour and looked like the tap did nothing,
   * since a run can take minutes on a CPU-only device.
   */
  const startAction = (action: 'retranscribe' | 'format' | 'summarize', job: () => void) => {
    const running = aiActivity;
    if (!running) {
      job();
      return;
    }
    const interrupt = () => {
      markAiJobStopping();
      // Not awaited, for the same reason: the new job goes through queueLlama /
      // whisperQueue, so it starts the moment the old one actually lets go
      // rather than after a blocked UI.
      void stopWhisperWork();
      void stopLlamaWork();
      job();
    };
    if (settings.hideAiBusyWarning) {
      interrupt();
      return;
    }
    setBusyPrompt({ next: labelForAction(action), current: running, run: interrupt });
  };

  const ensureFormatterReady = async () => {
    if (!settings.preferredFormatterModel) {
      dialog.show({ title: t('dialog.noFormatterModel.title') || 'No formatter model', message: t('dialog.noFormatterModel.message') || 'Pick one on the Home tab.', icon: 'warning' });
      return null;
    }
    const modelPath = ModelManager.getModelPath(settings.preferredFormatterModel);
    const isDownloaded = await ModelManager.isModelDownloaded(settings.preferredFormatterModel);
    if (!isDownloaded) {
      dialog.show({ title: t('dialog.modelNotDownloaded.title') || 'Model not downloaded', message: t('dialog.modelNotDownloaded.message') || 'Go to Settings → Models to download it.', icon: 'download' });
      return null;
    }
    return { modelPath, modelFile: settings.preferredFormatterModel };
  };

  const handleReTranscribe = async () => {
    if (!item?.sourceFilePath) {
      dialog.show({ title: t('dialog.noAudio.title') || 'No audio file', message: t('dialog.noAudio.messageReTranscribe') || 'This transcript has no associated audio file to re-transcribe.', icon: 'warning' });
      return;
    }
    if (!settings.preferredWhisperModel) {
      dialog.show({ title: t('dialog.noWhisperModel.title') || 'No Whisper model', message: t('dialog.noWhisperModel.messagePickOne') || 'Pick one on the Home tab.', icon: 'warning' });
      return;
    }
    haptics.tap();
    const jobToken = startAiJob({ kind: 'retranscribe', label: labelForAction('retranscribe'), itemId: id });
    try {
      const fileInfo = await FileSystemLegacy.getInfoAsync(item.sourceFilePath);
      if (!fileInfo.exists) {
        dialog.show({ title: t('dialog.audioMissing.title') || 'Audio missing', message: t('dialog.audioMissing.message') || 'The original audio file is no longer on your device (it may have been cleared from the cache).', icon: 'warning', iconTone: 'danger' });
        return;
      }

      const isDownloaded = await ModelManager.isModelDownloaded(settings.preferredWhisperModel);
      if (!isDownloaded) {
        dialog.show({ title: t('dialog.modelNotDownloaded.title') || 'Model not downloaded', message: t('dialog.modelNotDownloaded.messageWhisper') || 'Go to Settings → Models to download the Whisper model.', icon: 'download' });
        return;
      }
      const whisperPath = ModelManager.getModelPath(settings.preferredWhisperModel);
      await loadWhisper(whisperPath);
      const langCode = toLanguageCode(settings.defaultLanguage);
      // transcribeAudio, not transcribeFile: sourceFilePath is whatever format
      // the recording is in, and handing that straight to whisper is what made
      // Re-transcribe fail with "Invalid WAV file" on anything recorded before
      // the converter was wired into the Record tab.
      const tracker = createProgressTracker();
      let lastPush = 0;
      const result = await transcribeAudio(item.sourceFilePath, langCode, {
        onProgress: (raw) => {
          const reading = tracker.update(raw);
          const now = Date.now();
          if (now - lastPush < 500 && reading.percent < 100) return;
          lastPush = now;
          updateAiJob({ progress: reading });
        },
        onPartialText: (text) => updateAiJob({ partial: text }),
      });
      // NOT cleared here: isProcessing is still true through the save below, and
      // an empty partial makes the render fall through to WaitingCard - so the
      // finished text would blink out and "While you're waiting..." would
      // appear AFTER the work was done. The finally clears it.
      await addOrUpdate({
        ...item,
        rawTranscript: result.text.trim(),
        detectedLanguage: result.language ?? item.detectedLanguage,
      });
      setTranscriptTab('raw');
      haptics.success();
    } catch (e) {
      console.error(e);
      haptics.error();
      dialog.show({ title: t('dialog.reTranscribeFailed.title') || 'Re-transcribe failed', message: errorToMessage(e), icon: 'warning', iconTone: 'danger' });
    } finally {
      endAiJob(jobToken);
    }
  };

  const handleFormat = async () => {
    if (!item?.rawTranscript) return;
    const ready = await ensureFormatterReady();
    if (!ready) return;
    haptics.tap();
    const jobToken = startAiJob({ kind: 'format', label: labelForAction('format'), itemId: id });
    try {
      // queueLlama: this screen used to call the engine directly, so leaving
      // mid-run let a recording's enrichment start on the same context and
      // wedge it. Every llama call from here goes through the shared queue.
      const formatted = await queueLlama(() =>
        formatTranscript(
          item.rawTranscript!,
          ready.modelPath,
          ready.modelFile,
          (text) => updateAiJob({ partial: text }),
          item.detectedLanguage
        )
      );
      // Save and release the UI HERE. What the user pressed the button for is
      // done; embedding, entity extraction and memories are three more passes
      // over the same long transcript, and on a CPU-only device that tail is
      // most of the wait. Holding the screen through it made Format feel far
      // slower than it is.
      await addOrUpdate({ ...item, formattedTranscript: formatted });
      setTranscriptTab('formatted');
      haptics.success();
      endAiJob(jobToken);

      const embedding = await generateEmbedding(formatted);
      // Against the raw text, so the quotes exist in the Raw tab too.
      const extractedDates = await queueLlama(() =>
        extractActionableEntities(item.rawTranscript!, ready.modelPath, ready.modelFile, item.detectedLanguage)
      );

      await addOrUpdate({
        ...item,
        formattedTranscript: formatted,
        embedding: embedding || item.embedding,
        extractedDates: extractedDates.length > 0 ? extractedDates : item.extractedDates,
      });

      // Extract memories sequentially so it doesn't freeze the CPU
      await queueLlama(() => extractMemories(item.rawTranscript!, ready.modelPath, ready.modelFile)).catch(
        console.warn
      );
    } catch (e) {
      console.error(e);
      haptics.error();
      dialog.show({ title: t('dialog.formattingFailed.title') || 'Improvement failed', message: errorToMessage(e), icon: 'warning', iconTone: 'danger' });
    } finally {
      endAiJob(jobToken);
    }
  };

  const handleSummarize = async () => {
    if (!item?.rawTranscript) return;
    const ready = await ensureFormatterReady();
    if (!ready) return;
    haptics.tap();
    const jobToken = startAiJob({ kind: 'summarize', label: labelForAction('summarize'), itemId: id });
    try {
      const summarized = await queueLlama(() =>
        summarizeTranscript(
          item.rawTranscript!,
          ready.modelPath,
          ready.modelFile,
          (text) => updateAiJob({ partial: text }),
          item.detectedLanguage
        )
      );
      // Release the UI as soon as the summary exists; memory extraction is
      // another whole pass over the transcript and the user didn't ask for it.
      await addOrUpdate({ ...item, summary: summarized });
      setTranscriptTab('summary');
      haptics.success();
      endAiJob(jobToken);

      // Extract memories sequentially so it doesn't freeze the CPU
      await queueLlama(() => extractMemories(item.rawTranscript!, ready.modelPath, ready.modelFile)).catch(
        console.warn
      );
    } catch (e) {
      console.error(e);
      haptics.error();
      dialog.show({ title: t('dialog.summarizationFailed.title') || 'Summarization failed', message: errorToMessage(e), icon: 'warning', iconTone: 'danger' });
    } finally {
      endAiJob(jobToken);
    }
  };

  // ---- editing the transcript ------------------------------------------
  // Whisper mishears names, jargon and numbers, and correcting one used to mean
  // copying the whole thing out into another app. A mode rather than an
  // always-on field, because the read view's entity highlights are tappable and
  // a TextInput cannot carry them.
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveDraft = useCallback(async (text: string) => {
    if (!item) return;
    // The variant being looked at, so fixing the raw text cannot quietly
    // overwrite an improved version sitting beside it.
    const patch =
      transcriptTab === 'summary'
        ? { summary: text }
        : transcriptTab === 'formatted'
        ? { formattedTranscript: text }
        : { rawTranscript: text };
    await updateHistoryItem(item.id, patch);
  }, [item, transcriptTab]);

  const onDraftChange = (text: string) => {
    setDraft(text);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // A second after typing stops, never per keystroke: a two hour transcript
    // would otherwise be rewritten to disk on every letter.
    saveTimer.current = setTimeout(() => { void saveDraft(text); }, 1000);
  };

  const toggleEdit = () => {
    haptics.tap();
    if (isEditing) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void saveDraft(draft);
      setIsEditing(false);
      return;
    }
    setDraft(transcript);
    setIsEditing(true);
  };

  // Leaving the screen mid-edit must not lose the last few characters.
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const handleCopy = async () => {
    if (!transcript) return;
    haptics.tap();
    await Clipboard.setStringAsync(transcript);
    haptics.success();
  };

  const handleEntityPress = (entity: any) => {
    setActiveEntity(entity);
  };

  const renderHighlightedText = () => {
    if (highlights.length === 0) {
      return <Text style={[styles.transcriptText, { color: theme.text }]}>{transcript}</Text>;
    }

    let parts = [{ text: transcript, isEntity: false, entity: null as any }];

    // Naive split for each entity quote
    for (const entity of highlights) {
      const nextParts: any[] = [];
      for (const part of parts) {
        if (part.isEntity) {
          nextParts.push(part);
          continue;
        }
        const split = part.text.split(entity.quote);
        for (let i = 0; i < split.length; i++) {
          nextParts.push({ text: split[i], isEntity: false, entity: null });
          if (i < split.length - 1) {
            nextParts.push({ text: entity.quote, isEntity: true, entity });
          }
        }
      }
      parts = nextParts.filter(p => p.text.length > 0);
    }

    return (
      <Text style={[styles.transcriptText, { color: theme.text }]}>
        {parts.map((part, i) => 
          part.isEntity ? (
            <Text 
              key={i} 
              style={{ color: theme.tint, textDecorationLine: 'underline', fontWeight: 'bold' }}
              onPress={() => handleEntityPress(part.entity)}
            >
              {part.text}
            </Text>
          ) : (
            <Text key={i}>{part.text}</Text>
          )
        )}
      </Text>
    );
  };

  return (
    <KeyboardScreen>
    {/* Capped: sceneStyle only covers tabs, and this is a pushed screen. */}
    <View style={[styles.root, { backgroundColor: theme.background }, { maxWidth: contentWidth, width: '100%', alignSelf: 'center' }]}>
      <Stack.Screen options={{ title: item?.sourceFileName?.replace(/\.[^/.]+$/, "") ?? (t('transcribe.transcriptTitle') || 'Transcript') }} />

      {/* ScrollView + flexGrow content + the ABSOLUTE transcript layer (below):
          fill the screen normally, scroll only when the fixed chrome genuinely
          doesn't fit (short or font-scaled screens - a ZTE Blade A76 pushed the
          transcript card clean off the bottom with no way to reach it). The
          absolute layer keeps a long transcript from growing the card and
          dragging the page into scrolling - the everything-scrolls bug that
          made this a plain View for a while. */}
      {/* paddingBottom clears the system nav bar: this is a pushed screen with no
          floating tab bar, so nothing else reserves the bottom inset, and on a
          3-button-nav device the transcript card was clipped underneath it. */}
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.container, { paddingBottom: SPACING.lg + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

      <Card index={0} style={{ marginBottom: isShort ? SPACING.md : SPACING.lg }}>
        <Text style={styles.title}>{item?.sourceFileName?.replace(/\.[^/.]+$/, "") || `${t('transcribe.noTitle') || 'Voice Memo'} ${id}`}</Text>
        <Text style={[styles.subtitle, { color: theme.textMuted }]}>{dateStr}</Text>

        <View style={styles.playerRow}>
          <IconButton
            variant="tint"
            size="md"
            icon={isPlaying ? 'pause' : 'play'}
            iconFilled
            onPress={togglePlayback}
            accessibilityLabel={isPlaying ? (t('historyDetail.pause') || 'Pause') : (t('historyDetail.play') || 'Play')}
          />
          <Text style={[styles.timeLabel, { color: theme.textMuted }]}>{formatDuration(currentTime)}</Text>
          <WaveformSeekBar
            progress={progress}
            seedId={id}
            onSeek={(f) => {
              if (duration > 0) {
                haptics.tap();
                player.seekTo(f * duration);
              }
            }}
          />
          <Text style={[styles.timeLabel, { color: theme.textMuted }]}>{formatDuration(duration)}</Text>
        </View>
      </Card>

      <Card index={1} style={{ marginBottom: isShort ? SPACING.md : SPACING.lg }}>
        <View style={styles.actionsRow}>
          <View style={styles.flex1}>
            {actionButton('retranscribe', 'mic', t('historyDetail.retranscribe') || 'Re-Transcribe', handleReTranscribe, !!item?.sourceFilePath)}
          </View>
          <View style={styles.gutterSm} />
          <View style={styles.flex1}>
            {actionButton('format', 'wand', t('historyDetail.format') || 'Improve', handleFormat, !!item?.rawTranscript)}
          </View>
          <View style={styles.gutterSm} />
          <View style={styles.flex1}>
            {actionButton('summarize', 'library', t('historyDetail.summarize') || 'Summarize', handleSummarize, !!item?.rawTranscript)}
          </View>
        </View>

        <View style={[styles.hr, isShort && { marginVertical: SPACING.md }, { backgroundColor: theme.divider }]} />

        <View style={styles.row}>
          <View style={styles.flex1}>
            <Text style={styles.label}>{t('historyDetail.whisperModelLabel') || 'Whisper Model'}</Text>
            <SelectDropdown
              options={whisperOptions}
              value={settings.preferredWhisperModel}
              onSelect={(val) => setSetting('preferredWhisperModel', val)}
              placeholder="Not Set"
            />
          </View>
          <View style={styles.gutter} />
          <View style={styles.flex1}>
            <Text style={styles.label}>{t('historyDetail.formatterModelLabel') || 'Formatter Model'}</Text>
            <SelectDropdown
              options={formatterOptions}
              value={settings.preferredFormatterModel}
              onSelect={(val) => setSetting('preferredFormatterModel', val)}
              placeholder="Not Set"
            />
          </View>
        </View>

        <View style={[styles.hr, isShort && { marginVertical: SPACING.md }, { backgroundColor: theme.divider }]} />

        {/* Opened by hand here. The transcribe screen opens it for you when
            Summarize goes on; in the library there is no such moment. */}
        <Collapsible
          label={t('historyDetail.customPromptLabel') || 'Be specific'}
          open={promptOpen}
          onToggle={setPromptOpen}
        >
          <TextInput
            style={[styles.customPromptInput, isShort && { height: 64 }, { color: theme.text, borderColor: theme.divider }]}
            value={customPrompt}
            onChangeText={setCustomPrompt}
            placeholder={t('historyDetail.customPromptPlaceholder') || 'Enter a prompt for AI formatting or summarization...'}
            placeholderTextColor={theme.textSubtle}
            multiline
            scrollEnabled
          />
        </Collapsible>
      </Card>

      {/* flex:1 so this card absorbs whatever the cards above leave, making the
          page exactly one screen tall. minHeight is the floor for a short
          screen: below it the page scrolls rather than crushing this to nothing. */}
      <Card index={2} style={{ flex: 1, minHeight: 200 }}>
        {/* No heading: the segmented control already names the card. The panel
            is the SHARED transcript body (also used by the Muffin! tab) -
            layout quirks get fixed there, once. */}
        <TranscriptPanel
          tab={transcriptTab}
          onTabChange={setTranscriptTab}
          streaming={showStreaming}
          revealed={revealed}
          progressPercent={
            isStreamingWhisper ? ((isTranscribingThis ? transcribeProgress : localProgress)?.percent ?? 0) : null
          }
          waiting={isProcessing || isTranscribingThis}
          waitingStatus={
            isTranscribingThis
              ? describeProgress(t('record.transcribing') || 'Transcribing...', transcribeProgress)
              : processingLabel === 'retranscribe'
              ? describeProgress(t('historyDetail.retranscribing') || 'Re-transcribing...', localProgress)
              : processingLabel === 'format'
              ? t('historyDetail.formatting') || 'Improving...'
              : t('historyDetail.summarizing') || 'Summarizing...'
          }
          renderStatic={() => (
            /* nestedScrollEnabled: on Android a nested same-axis scroller
               doesn't receive drags without it. */
            <View style={[styles.transcriptBox, { borderColor: isEditing ? theme.tint : theme.divider }]}>
              {isEditing ? (
                <TextInput
                  style={[styles.transcriptText, styles.transcriptInput, { color: theme.text }]}
                  value={draft}
                  onChangeText={onDraftChange}
                  onBlur={() => { void saveDraft(draft); }}
                  multiline
                  textAlignVertical="top"
                  autoFocus
                  scrollEnabled
                  // The OS spellchecker underlines most of a transcript in any
                  // language the phone is not set to, in a red nothing here can
                  // restyle.
                  spellCheck={false}
                  autoCorrect={false}
                />
              ) : (
                <ScrollView nestedScrollEnabled style={{ flex: 1 }}>
                  {renderHighlightedText()}
                </ScrollView>
              )}
            </View>
          )}
          onCopy={handleCopy}
          copyDisabled={!transcript}
          editing={isEditing}
          onToggleEdit={toggleEdit}
          // Nothing to edit while the text is still being produced, and no
          // point offering it on an empty tab.
          editDisabled={!transcript || isProcessing || isTranscribingThis}
          onFullscreen={() => {
            haptics.tap();
            setFullscreen(true);
          }}
          fullscreenDisabled={!transcript && !streamingText}
        />
      </Card>
      </ScrollView>

      <TranscriptFullscreen
        visible={fullscreen}
        onClose={() => setFullscreen(false)}
        // Only prefer the reveal while streaming: afterwards `revealed` keeps
        // the last streamed text, so a stale (even aborted) run's words showed
        // fullscreen instead of this item's saved transcript - which is how a
        // stopped re-transcribe's Chinese hallucination ended up on screen.
        text={showStreaming ? revealed : transcript}
        streaming={showStreaming}
        percent={
          isStreamingWhisper ? (isTranscribingThis ? transcribeProgress : localProgress)?.percent ?? 0 : undefined
        }
        onCopy={transcript ? handleCopy : undefined}
      />

      <AiBusyDialog
        visible={busyPrompt !== null}
        nextLabel={busyPrompt?.next ?? ''}
        currentLabel={busyPrompt?.current ?? ''}
        onCancel={() => setBusyPrompt(null)}
        onConfirm={(dontAsk) => {
          if (dontAsk) setSetting('hideAiBusyWarning', true);
          const run = busyPrompt?.run;
          setBusyPrompt(null);
          run?.();
        }}
      />

      {/* Shared with the Chat screen - the calendar/alarm flow lives in one place. */}
      <EntityActionDialog entity={activeEntity} onClose={() => setActiveEntity(null)} />
    </View>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  // Content container: flexGrow (not flex) so it fills a tall screen but may
  // exceed a short one and scroll.
  container: {
    flexGrow: 1,
    padding: SPACING.lg,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: SPACING.lg,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  timeLabel: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    minWidth: 40,
    textAlign: 'center',
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  actionsRow: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
  },
  row: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
  },
  flex1: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  gutter: {
    width: SPACING.md,
  },
  gutterSm: {
    width: SPACING.sm,
  },
  hr: {
    height: 1,
    marginVertical: SPACING.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: SPACING.xs + 2,
    opacity: 0.8,
  },
  customPromptInput: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    height: 80,
    textAlignVertical: 'top',
    fontSize: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: SPACING.md,
  },
  transcriptBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
  },
  transcriptInput: {
    flex: 1,
    padding: 0,
    margin: 0,
  },
  transcriptText: {
    fontSize: 16,
    lineHeight: 24,
  },
});
