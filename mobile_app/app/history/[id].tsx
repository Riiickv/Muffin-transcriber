import { StyleSheet, TextInput, View, ScrollView } from 'react-native';
import { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Clipboard from 'expo-clipboard';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

import { Text } from '@/components/Themed';
import { useTheme } from '@/components/ThemeProvider';
import { Card } from '@/components/Card';
import { SegmentedControl } from '@/components/SegmentedControl';
import { IconButton } from '@/components/IconButton';
import { Button } from '@/components/Button';
import { WaitingCard } from '@/components/WaitingCard';
import { SelectDropdown } from '@/components/SelectDropdown';
import { RADIUS, SPACING } from '@/constants/tokens';
import { useHistory } from '@/utils/historyStore';
import { useSettings, useDebouncedSetting } from '@/utils/settingsStore';
import { formatTranscript, summarizeTranscript, extractMemories, extractActionableEntities } from '@/utils/LLMEngine';
import { generateEmbedding } from '@/utils/EmbeddingEngine';
import { transcribeFile, loadWhisper } from '@/utils/WhisperEngine';
import { ModelManager } from '@/utils/ModelManager';
import { useModelOptions } from '@/hooks/useModelOptions';
import { toLanguageCode } from '@/utils/languages';
import { errorToMessage } from '@/utils/errors';
import { formatDuration, formatHistoryDate } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import { useDialog, DialogCard } from '@/components/Dialog';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { t } from '@/utils/i18n';

type TranscriptTab = 'raw' | 'formatted' | 'summary';

const TRANSCRIPT_TABS = [
  { key: 'raw', label: t('transcribe.rawTab') || 'Raw' },
  { key: 'formatted', label: t('transcribe.formattedTab') || 'Formatted' },
  { key: 'summary', label: t('transcribe.summaryTab') || 'Summary' },
] as const satisfies readonly { key: TranscriptTab; label: string }[];

export default function HistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const { items, addOrUpdate } = useHistory();
  const item = items.find((h) => h.id === id);
  const { settings, setSetting } = useSettings();
  const [customPrompt, setCustomPrompt] = useDebouncedSetting('customFormatSystemPrompt');
  const dialog = useDialog();

  const [transcriptTab, setTranscriptTab] = useState<TranscriptTab>('raw');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState<null | 'retranscribe' | 'format' | 'summarize'>(null);

  const [activeEntity, setActiveEntity] = useState<{ quote: string; name: string; type: 'date' | 'time' } | null>(null);
  const [actionName, setActionName] = useState('');

  const { whisperOptions, formatterOptions } = useModelOptions();

  const transcript =
    transcriptTab === 'summary'
      ? item?.summary || ''
      : transcriptTab === 'formatted'
      ? item?.formattedTranscript || ''
      : item?.rawTranscript || '';

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
      dialog.show({ title: t('dialog.noAudio.title') || 'No audio file', message: t('dialog.noAudioReTranscribe.message') || 'This transcript has no associated audio file to re-transcribe.', icon: 'warning' });
      return;
    }
    if (!settings.preferredWhisperModel) {
      dialog.show({ title: t('dialog.noWhisperModel.title') || 'No Whisper model', message: t('dialog.noFormatterModel.message') || 'Pick one on the Home tab.', icon: 'warning' });
      return;
    }
    haptics.tap();
    setIsProcessing(true);
    setProcessingLabel('retranscribe');
    try {
      const fileInfo = await FileSystemLegacy.getInfoAsync(item.sourceFilePath);
      if (!fileInfo.exists) {
        dialog.show({ title: t('dialog.audioMissing.title') || 'Audio missing', message: t('dialog.audioMissing.message') || 'The original audio file is no longer on your device (it may have been cleared from the cache).', icon: 'warning', iconTone: 'danger' });
        return;
      }

      const isDownloaded = await ModelManager.isModelDownloaded(settings.preferredWhisperModel);
      if (!isDownloaded) {
        dialog.show({ title: t('dialog.modelNotDownloaded.title') || 'Model not downloaded', message: t('dialog.modelNotDownloaded.message') || 'Go to Settings → Models to download the Whisper model.', icon: 'download' });
        return;
      }
      const whisperPath = ModelManager.getModelPath(settings.preferredWhisperModel);
      await loadWhisper(whisperPath);
      const langCode = toLanguageCode(settings.defaultLanguage);
      const result = await transcribeFile(item.sourceFilePath, langCode);
      await addOrUpdate({ ...item, rawTranscript: result.text.trim() });
      setTranscriptTab('raw');
      haptics.success();
    } catch (e) {
      console.error(e);
      haptics.error();
      dialog.show({ title: t('dialog.reTranscribeFailed.title') || 'Re-transcribe failed', message: errorToMessage(e), icon: 'warning', iconTone: 'danger' });
    } finally {
      setIsProcessing(false);
      setProcessingLabel(null);
    }
  };

  const handleFormat = async () => {
    if (!item?.rawTranscript) return;
    const ready = await ensureFormatterReady();
    if (!ready) return;
    haptics.tap();
    setIsProcessing(true);
    setProcessingLabel('format');
    try {
      const formatted = await formatTranscript(item.rawTranscript, ready.modelPath, ready.modelFile);
      
      const embedding = await generateEmbedding(formatted);
      const extractedDates = await extractActionableEntities(formatted, ready.modelPath, ready.modelFile);

      await addOrUpdate({ 
        ...item, 
        formattedTranscript: formatted,
        embedding: embedding || item.embedding,
        extractedDates: extractedDates.length > 0 ? extractedDates : item.extractedDates,
      });
      setTranscriptTab('formatted');
      haptics.success();
      
      // Extract memories sequentially so it doesn't freeze the CPU
      await extractMemories(item.rawTranscript, ready.modelPath, ready.modelFile).catch(console.warn);
    } catch (e) {
      console.error(e);
      haptics.error();
      dialog.show({ title: t('dialog.formattingFailed.title') || 'Formatting failed', message: errorToMessage(e), icon: 'warning', iconTone: 'danger' });
    } finally {
      setIsProcessing(false);
      setProcessingLabel(null);
    }
  };

  const handleSummarize = async () => {
    if (!item?.rawTranscript) return;
    const ready = await ensureFormatterReady();
    if (!ready) return;
    haptics.tap();
    setIsProcessing(true);
    setProcessingLabel('summarize');
    try {
      const summarized = await summarizeTranscript(item.rawTranscript, ready.modelPath, ready.modelFile);
      await addOrUpdate({ ...item, summary: summarized });
      setTranscriptTab('summary');
      haptics.success();

      // Extract memories sequentially so it doesn't freeze the CPU
      await extractMemories(item.rawTranscript, ready.modelPath, ready.modelFile).catch(console.warn);
    } catch (e) {
      console.error(e);
      haptics.error();
      dialog.show({ title: t('dialog.summarizationFailed.title') || 'Summarization failed', message: errorToMessage(e), icon: 'warning', iconTone: 'danger' });
    } finally {
      setIsProcessing(false);
      setProcessingLabel(null);
    }
  };

  const handleCopy = async () => {
    if (!transcript) return;
    haptics.tap();
    await Clipboard.setStringAsync(transcript);
    haptics.success();
  };

  const handleEntityPress = (entity: any) => {
    setActiveEntity(entity);
    setActionName('');
  };

  const submitAction = async () => {
    if (!activeEntity) return;
    const finalName = actionName.trim() || activeEntity.name;
    
    try {
      if (activeEntity.type === 'date') {
        await IntentLauncher.startActivityAsync('android.intent.action.INSERT', {
          data: 'content://com.android.calendar/events',
          extra: {
            title: finalName,
            description: `Quote: "${activeEntity.quote}"`,
          }
        });
      } else {
        await IntentLauncher.startActivityAsync('android.intent.action.SET_ALARM', {
          extra: {
            'android.intent.extra.alarm.MESSAGE': finalName,
            'android.intent.extra.alarm.SKIP_UI': false,
          }
        });
      }
    } catch (e) {
      console.error(e);
      dialog.show({ title: t('dialog.actionFailed.title') || 'Action failed', message: t('dialog.actionFailed.message') || 'Could not open the native app.', icon: 'warning', iconTone: 'danger' });
    }
    setActiveEntity(null);
  };

  const renderHighlightedText = () => {
    if (!item?.extractedDates || item.extractedDates.length === 0) {
      return <Text style={[styles.transcriptText, { color: theme.text }]}>{transcript}</Text>;
    }
    
    let parts = [{ text: transcript, isEntity: false, entity: null as any }];
    
    // Naive split for each entity quote
    for (const entity of item.extractedDates) {
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
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: item?.sourceFileName?.replace(/\.[^/.]+$/, "") ?? (t('transcribe.transcriptTitle') || 'Transcript') }} />

      <Card style={{ marginBottom: SPACING.lg }}>
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
          <View style={[styles.progressTrack, { backgroundColor: theme.surface }]}>
            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: theme.tint }]} />
          </View>
          <Text style={[styles.timeLabel, { color: theme.textMuted }]}>{formatDuration(duration)}</Text>
        </View>
      </Card>

      <Card style={{ marginBottom: SPACING.lg }}>
        <View style={styles.actionsRow}>
          <View style={styles.flex1}>
            <Button
              variant="secondary"
              size="md"
              stacked
              icon="mic"
              onPress={handleReTranscribe}
              disabled={isProcessing || !item?.sourceFilePath}
            >
              {t('historyDetail.retranscribe') || 'Re-Transcribe'}
            </Button>
          </View>
          <View style={styles.gutterSm} />
          <View style={styles.flex1}>
            <Button
              variant="secondary"
              size="md"
              stacked
              icon="wand"
              onPress={handleFormat}
              disabled={isProcessing || !item?.rawTranscript}
            >
              {t('historyDetail.format') || 'Format'}
            </Button>
          </View>
          <View style={styles.gutterSm} />
          <View style={styles.flex1}>
            <Button
              variant="secondary"
              size="md"
              stacked
              icon="library"
              onPress={handleSummarize}
              disabled={isProcessing || !item?.rawTranscript}
            >
              {t('historyDetail.summarize') || 'Summarize'}
            </Button>
          </View>
        </View>

        <View style={[styles.hr, { backgroundColor: theme.divider }]} />

        <View style={styles.row}>
          <View style={styles.flex1}>
            <Text style={styles.label}>{t('settings.whisperModel') || 'Whisper Model'}</Text>
            <SelectDropdown
              options={whisperOptions}
              value={settings.preferredWhisperModel}
              onSelect={(val) => setSetting('preferredWhisperModel', val)}
              placeholder="Not Set"
            />
          </View>
          <View style={styles.gutter} />
          <View style={styles.flex1}>
            <Text style={styles.label}>{t('settings.preferredFormatter') || 'Formatter Model'}</Text>
            <SelectDropdown
              options={formatterOptions}
              value={settings.preferredFormatterModel}
              onSelect={(val) => setSetting('preferredFormatterModel', val)}
              placeholder="Not Set"
            />
          </View>
        </View>

        <View style={[styles.hr, { backgroundColor: theme.divider }]} />

        <View>
          <Text style={styles.label}>{t('settings.customPrompt') || 'Custom Prompt'}</Text>
          <TextInput
            style={[styles.customPromptInput, { color: theme.text, borderColor: theme.divider }]}
            value={customPrompt}
            onChangeText={setCustomPrompt}
            placeholder={t('historyDetail.customPromptPlaceholder') || 'Enter a prompt for AI formatting or summarization...'}
            placeholderTextColor={theme.textSubtle}
            multiline
            scrollEnabled
          />
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
            disabled={!transcript}
          >
            {t('historyDetail.copyButton') || 'Copy'}
          </Button>
        </View>

        <View style={[styles.transcriptBox, { borderColor: theme.divider }]}>
          {isProcessing ? (
            <WaitingCard
              status={
                processingLabel === 'retranscribe'
                  ? t('historyDetail.retranscribing') || 'Re-transcribing...'
                  : processingLabel === 'format'
                  ? t('historyDetail.formatting') || 'Formatting...'
                  : t('historyDetail.summarizing') || 'Summarizing...'
              }
            />
          ) : (
            <ScrollView>
              {renderHighlightedText()}
            </ScrollView>
          )}
        </View>
      </Card>

      {/* Uses DialogCard directly, not dialog.show, because it needs a live TextInput. */}
      <DialogCard
        visible={activeEntity !== null}
        onRequestClose={() => setActiveEntity(null)}
        icon={activeEntity?.type === 'date' ? 'history' : 'warning'}
        title={`${t('chat.addTo') || 'Add to'} ${activeEntity?.type === 'date' ? (t('chat.calendar') || 'Calendar') : (t('chat.alarms') || 'Alarms')}`}
        message={activeEntity ? `"${activeEntity.quote}"` : undefined}
        buttons={[
          { label: t('dialog.confirmDelete.cancel') || 'Cancel', variant: 'secondary', onPress: () => setActiveEntity(null) },
          { label: t('chat.openNativeApp') || 'Open Native App', variant: 'primary', onPress: submitAction },
        ]}
      >
        <Text style={[styles.label, { alignSelf: 'flex-start' }]}>{t('chat.eventName') || 'Event Name'}</Text>
        <TextInput
          style={[styles.dialogInput, { color: theme.text, borderColor: theme.divider }]}
          value={actionName}
          onChangeText={setActionName}
          placeholder={activeEntity?.name}
          placeholderTextColor={theme.textSubtle}
        />
      </DialogCard>
    </View>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  transcriptBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
  },
  transcriptText: {
    fontSize: 16,
    lineHeight: 24,
  },
  dialogInput: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    fontSize: 16,
    marginTop: SPACING.sm,
    width: '100%',
  },
});
