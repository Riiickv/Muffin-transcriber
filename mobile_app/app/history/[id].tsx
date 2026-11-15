import { StyleSheet, View, ScrollView, type ViewStyle } from 'react-native';
import { TextInput } from '@/components/Themed';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Clipboard from 'expo-clipboard';
import * as FileSystemLegacy from 'expo-file-system/legacy';

import { Text } from '@/components/Themed';
import { useTheme } from '@/components/ThemeProvider';
import { Card } from '@/components/Card';
import { IconButton } from '@/components/IconButton';
import type { IconName } from '@/components/Icon';
import { Button } from '@/components/Button';
import { WaveformSeekBar } from '@/components/WaveformSeekBar';
import { TranscriptFullscreen } from '@/components/TranscriptFullscreen';
import { TranscriptPanel, type TranscriptTab } from '@/components/TranscriptPanel';
import { setRecordSheetOpen } from '@/utils/recordSheet';
import { RADIUS, SPACING, TYPE } from '@/constants/tokens';
import { useHistory, updateHistoryItem } from '@/utils/historyStore';
import { useRecording } from '@/components/RecordingProvider';
import { useSettings } from '@/utils/settingsStore';
import { formatTranscript, summarizeTranscript, extractMemories, extractActionableEntities, findHighlights, stopLlamaWork, isStopped } from '@/utils/LLMEngine';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { loadWhisper, stopWhisperWork } from '@/utils/WhisperEngine';
import { transcribeAudio } from '@/utils/audioTranscription';
import { createProgressTracker, describeProgress } from '@/utils/transcribeProgress';
import { ModelManager } from '@/utils/ModelManager';
import { useWhisperPreload } from '@/hooks/useWhisperPreload';
import { toLanguageCode } from '@/utils/languages';
import { errorToMessage } from '@/utils/errors';
import { formatDuration, formatHistoryDate } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import { useDialog } from '@/components/Dialog';
import { EntityActionDialog } from '@/components/EntityActionDialog';
import { HighlightedText } from '@/components/HighlightedText';
import type { ActionableEntity } from '@/utils/entityExtraction';
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
  const { contentWidth } = useResponsive();
  const { items, addOrUpdate } = useHistory();
  const item = items.find((h) => h.id === id);
  const { settings, setSetting } = useSettings();
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
  /** Where the finger is on the audio line while it is being dragged (0 to 1). */
  const [scrub, setScrub] = useState<number | null>(null);
  const processingLabel = (myJob?.kind ?? null) as null | 'retranscribe' | 'format' | 'summarize';
  /** Pending confirmation when a second AI action is tapped mid-run. */
  const [busyPrompt, setBusyPrompt] = useState<{ next: string; current: string; run: () => void } | null>(null);
  // App-wide, so work started on another screen (or before this one was
  // re-entered) is still visible here.
  const aiActivity = job?.label ?? null;

  const [activeEntity, setActiveEntity] = useState<ActionableEntity | null>(null);

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
    // Resolved against the recording's own date: "domani" in a note from
    // Monday is Tuesday, whenever the note is opened.
    () => {
      const iso = item?.timestampISO;
      return findHighlights(transcript, item?.extractedDates ?? [], iso ? new Date(iso) : undefined);
    },
    [transcript, item?.extractedDates, item?.timestampISO]
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
    enabled: boolean,
    style: ViewStyle
  ) =>
    processingLabel === kind ? (
      <Button
        variant="danger"
        size="md"
        stacked
        style={style}
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
        style={style}
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
      // The OTHER two transcription paths hold the screen awake for the length
      // of the run and this one never did. A re-transcribe on the accurate
      // model is minutes long, so the display would sleep partway through,
      // Android would suspend the app, and the work stopped dead until the
      // phone was woken again. From the outside: "it just stops after a while,
      // waits, and then resumes", on every model, because it has nothing to do
      // with the model.
      await activateKeepAwakeAsync('history-retranscribe');
      const whisperPath = ModelManager.getModelPath(settings.preferredWhisperModel);
      await loadWhisper(whisperPath);
      // Reuse what a previous pass already worked out. On Auto-Detect this
      // used to ask the model to guess from scratch every time, which threw
      // away a correct answer the app had already stored: Turbo detects
      // Italian, and re-transcribing with a smaller model asks IT to guess,
      // and small models have weak language ID - so a Re-Transcribe on the
      // fast tier came back in English. An explicit choice still wins over a
      // remembered guess.
      const chosenLang = toLanguageCode(settings.defaultLanguage);
      const langCode =
        chosenLang === 'auto' && item.detectedLanguage ? item.detectedLanguage : chosenLang;
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
      deactivateKeepAwake('history-retranscribe');
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
      // done; entity extraction and memories are two more passes
      // over the same long transcript, and on a CPU-only device that tail is
      // most of the wait. Holding the screen through it made Format feel far
      // slower than it is.
      await addOrUpdate({ ...item, formattedTranscript: formatted });
      setTranscriptTab('formatted');
      haptics.success();
      endAiJob(jobToken);

      // Against the raw text, so the quotes exist in the Raw tab too.
      const extractedDates = await queueLlama(() =>
        extractActionableEntities(item.rawTranscript!, ready.modelPath, ready.modelFile, item.detectedLanguage)
      );

      await addOrUpdate({
        ...item,
        formattedTranscript: formatted,
        extractedDates: extractedDates.length > 0 ? extractedDates : item.extractedDates,
      });

      // Extract memories sequentially so it doesn't freeze the CPU
      await queueLlama(() => extractMemories(item.rawTranscript!, ready.modelPath, ready.modelFile)).catch(
        console.warn
      );
    } catch (e) {
      // The user pressed Stop. They know why it ended; an error box and a
      // buzz would be the app blaming them for its own obedience.
      if (isStopped(e)) return;
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
      if (isStopped(e)) return;
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

  const handleEntityPress = (entity: ActionableEntity) => {
    setActiveEntity(entity);
  };

  const renderHighlightedText = () => (
    <HighlightedText text={transcript} highlights={highlights} onPress={handleEntityPress} style={styles.transcriptText} />
  );

  return (
    <KeyboardScreen>
    {/* Capped: sceneStyle only covers tabs, and this is a pushed screen. */}
    <View style={[styles.root, { backgroundColor: theme.background }, { maxWidth: contentWidth, width: '100%', alignSelf: 'center' }]}>
      <Stack.Screen
        options={{
          title: item?.sourceFileName?.replace(/\.[^/.]+$/, "") ?? (t('transcribe.transcriptTitle') || 'Transcript'),
          headerRight: () => (
            <IconButton
              icon="tune"
              variant="ghost"
              onPress={() => {
                haptics.tap();
                setRecordSheetOpen(true);
              }}
              accessibilityLabel={t('record.optionsTitle') || 'Options'}
            />
          ),
        }}
      />

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
        {/* The name is the screen title, up in the header. It used to be
            printed again here, one line below itself. */}
        <Text style={[styles.subtitle, { color: theme.textMuted }]}>{dateStr}</Text>

        <View style={[styles.player, { backgroundColor: theme.surface }]}>
          <IconButton
            variant="tint"
            size="md"
            icon={isPlaying ? 'pause' : 'play'}
            iconFilled
            style={{ borderRadius: RADIUS.pill }}
            onPress={togglePlayback}
            accessibilityLabel={isPlaying ? (t('historyDetail.pause') || 'Pause') : (t('historyDetail.play') || 'Play')}
          />
          {/* While dragging, the time on the left is the time under the
              finger, so you can see where you will land before letting go. */}
          <Text style={[styles.timeLabel, { color: theme.textMuted }]}>
            {formatDuration(scrub !== null ? scrub * duration : currentTime)}
          </Text>
          <WaveformSeekBar
            progress={scrub ?? progress}
            seedId={id}
            disabled={duration <= 0}
            onScrub={setScrub}
            onSeek={(f) => {
              if (duration <= 0) return;
              haptics.tap();
              // Hold the line where it was dropped until the player has
              // actually moved, or it flicks back to the old spot for a frame.
              setScrub(f);
              Promise.resolve(player.seekTo(f * duration))
                .catch(() => {})
                .finally(() => setTimeout(() => setScrub(null), 120));
            }}
          />
          <Text style={[styles.timeLabel, { color: theme.textMuted }]}>{formatDuration(duration)}</Text>
        </View>

        {/* The transcript is what this screen is for, so it comes straight
            after the player and takes every pixel the rest does not need.
            It used to sit third, under a card of buttons and dropdowns, in a
            box about five lines tall. flex:1 absorbs the leftover height;
            minHeight is the floor on a short screen, below which the page
            scrolls rather than crushing the text. */}
        <Card style={{ flex: 1, minHeight: 260, marginBottom: SPACING.md }}>
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
                 does not receive drags without it. */
              <View style={[styles.transcriptBox, isEditing && [styles.editingBox, { borderColor: theme.tint }]]}>
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
            editDisabled={!transcript || isProcessing || isTranscribingThis}
            onFullscreen={() => {
              haptics.tap();
              setFullscreen(true);
            }}
            fullscreenDisabled={!transcript && !streamingText}
          />
        </Card>

        {/* Actions last, at the bottom of the screen where a thumb is. Which
            model they use and how the rewrite should read are in the Options
            sheet (the header button), not spread across this screen. */}
        <View style={styles.actionsRow}>
          {/* Sized by their labels, like the tabs above them: three equal
              thirds gave "Re-Transcribe" a third of the row and broke it at
              the hyphen. None of them is ever squeezed below its label; where
              the three do not fit side by side (German), the last one drops
              to a row of its own instead. */}
          {actionButton('retranscribe', 'replay', t('historyDetail.retranscribe') || 'Re-Transcribe', handleReTranscribe, !!item?.sourceFilePath, styles.action)}
          {actionButton('format', 'wand', t('historyDetail.format') || 'Improve', handleFormat, !!item?.rawTranscript, styles.action)}
          {actionButton('summarize', 'library', t('historyDetail.summarize') || 'Summarize', handleSummarize, !!item?.rawTranscript, styles.action)}
        </View>
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
  container: {
    flexGrow: 1,
    padding: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  subtitle: {
    fontSize: TYPE.caption,
    fontWeight: '600',
    marginBottom: SPACING.md,
    marginLeft: SPACING.xs,
  },
  player: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.sm,
    paddingRight: SPACING.lg,
    borderRadius: RADIUS.pill,
    marginBottom: SPACING.md,
  },
  timeLabel: {
    fontSize: TYPE.caption,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    minWidth: 40,
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  action: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 'auto',
  },
  transcriptBox: {
    flex: 1,
  },
  // Editing is a mode, so it gets a frame. Reading does not need one: the card
  // is already the box.
  editingBox: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  transcriptInput: {
    flex: 1,
    padding: 0,
    margin: 0,
  },
  transcriptText: {
    fontSize: 17,
    lineHeight: 27,
  },
});
