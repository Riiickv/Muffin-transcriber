import { Animated, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { IconName } from '@/components/Icon';

import { Text } from '@/components/Themed';
import { useTheme, ThemeMode, AccentColor } from '@/components/ThemeProvider';
import { FadeInView } from '@/components/FadeInView';
import ExpressiveSwitch from '@/components/ExpressiveSwitch';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SelectDropdown } from '@/components/SelectDropdown';
import { ModelManager, WHISPER_MODELS, FORMATTER_MODELS, CHAT_MODELS, EMBEDDING_MODELS, ModelDef } from '@/utils/ModelManager';
import { rollupMemories } from '@/utils/LLMEngine';
import { useSettings, useDebouncedSetting } from '@/utils/settingsStore';
import { LANGUAGE_OPTIONS } from '@/utils/languages';
import { MOTION, RADIUS, SPACING } from '@/constants/tokens';
import { useDialog } from '@/components/Dialog';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { t } from '@/utils/i18n';
// Hoist constants out of the render body — no reason to recreate on every render.
type SegmentKey = 'general' | 'models';

const PAGE_SEGMENTS = [
  { key: 'general' as const, label: t('settings.segmentPreferences') || 'Preferences' },
  { key: 'models' as const, label: t('settings.segmentModels') || 'Models' },
] as const satisfies readonly { key: SegmentKey; label: string }[];

const THEME_MODES: readonly ThemeMode[] = ['system', 'light', 'dark', 'amoled'];
const ACCENT_OPTIONS: readonly AccentColor[] = ['system', 'muffin', 'green', 'purple', 'red'];
const AUTO_DELETE_OPTIONS = [
  { label: t('settings.autoDeleteNever') || 'Never', value: 'Never' },
  { label: t('settings.autoDelete1Week') || '1 Week', value: '1 Week' },
  { label: t('settings.autoDelete1Month') || '1 Month', value: '1 Month' },
];

interface DownloadInfo {
  progress: number;
  written: number;
  total: number;
  speed: number;
  eta: number;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const formatTime = (seconds: number) => {
  if (!isFinite(seconds) || seconds < 0) return '...';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
};

export default function SettingsScreen() {
  const { theme, themeMode, accentColor, setThemeMode, setAccentColor } = useTheme();

  const [activeSegment, setActiveSegment] = useState<SegmentKey>('general');
  const [displayedSegment, setDisplayedSegment] = useState<SegmentKey>('general');
  const contentFade = useRef(new Animated.Value(1)).current;

  // Panel state.
  const { settings, setSetting } = useSettings();
  const dialog = useDialog();
  const [formatPrompt, setFormatPrompt] = useDebouncedSetting('customFormatSystemPrompt');
  const [summaryPrompt, setSummaryPrompt] = useDebouncedSetting('customSummarySystemPrompt');

  const [downloadProgress, setDownloadProgress] = useState<Record<string, DownloadInfo>>({});
  const [downloadedModels, setDownloadedModels] = useState<Record<string, boolean>>({});
  const lastDownloadUpdate = useRef<Record<string, { time: number; written: number }>>({});

  useFocusEffect(
    useCallback(() => {
      const check = async () => {
        await ModelManager.init();
        const status: Record<string, boolean> = {};
        for (const m of [...WHISPER_MODELS, ...FORMATTER_MODELS, ...CHAT_MODELS, ...EMBEDDING_MODELS]) {
          status[m.id] = await ModelManager.isModelDownloaded(m.id);
        }
        setDownloadedModels(status);
      };
      check();
    }, [])
  );

  const downloadedWhisperOptions = WHISPER_MODELS.filter((m) => downloadedModels[m.id]).map((m) => ({
    label: m.name,
    value: m.id,
  }));

  const downloadedFormatterOptions = FORMATTER_MODELS.filter((m) => downloadedModels[m.id]).map((m) => ({
    label: m.name,
    value: m.id,
  }));

  const downloadedChatOptions = CHAT_MODELS.filter((m) => downloadedModels[m.id]).map((m) => ({
    label: m.name,
    value: m.id,
  }));

  // Crossfade the content when the segment changes, so it matches the sliding
  // pill instead of hard-cutting mid-animation.
  useEffect(() => {
    if (activeSegment === displayedSegment) return;
    Animated.timing(contentFade, { toValue: 0, duration: MOTION.timingQuick.duration, useNativeDriver: true }).start(() => {
      setDisplayedSegment(activeSegment);
      Animated.timing(contentFade, { toValue: 1, duration: MOTION.timingQuick.duration, useNativeDriver: true }).start();
    });
  }, [activeSegment, displayedSegment, contentFade]);

  const handleDownload = async (modelId: string, url: string) => {
    if (downloadedModels[modelId]) {
      await ModelManager.deleteModel(modelId);
      setDownloadedModels((prev) => ({ ...prev, [modelId]: false }));
      setDownloadProgress((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
      return;
    }

    try {
      setDownloadProgress((prev) => ({ ...prev, [modelId]: { progress: 0.01, written: 0, total: 1, speed: 0, eta: 0 } }));
      lastDownloadUpdate.current[modelId] = { time: Date.now(), written: 0 };

      await ModelManager.startDownload(url, modelId, (info) => {
        const now = Date.now();
        const last = lastDownloadUpdate.current[modelId];
        let speed = 0;
        let eta = 0;

        if (last && now - last.time > 500) {
          speed = (info.written - last.written) / ((now - last.time) / 1000);
          eta = speed > 0 ? (info.total - info.written) / speed : 0;
          lastDownloadUpdate.current[modelId] = { time: now, written: info.written };
        }

        setDownloadProgress((prev) => {
          const prevInfo = prev[modelId] ?? { speed: 0, eta: 0, progress: 0, written: 0, total: 0 };
          return {
            ...prev,
            [modelId]: {
              ...info,
              speed: speed > 0 ? speed : prevInfo.speed,
              eta: speed > 0 ? eta : prevInfo.eta,
            },
          };
        });
      });

      setDownloadedModels((prev) => ({ ...prev, [modelId]: true }));
      setDownloadProgress((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
    } catch (e) {
      console.error('Download failed', e);
      setDownloadProgress((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
    }
  };

  const renderPreferences = () => (
    <>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>{t('settings.general') || 'General'}</Text>

        <Text style={styles.settingLabel}>{t('settings.defaultLanguage') || 'Default Language'}</Text>
        <View style={{ marginBottom: SPACING.xl }}>
          <SelectDropdown
            options={LANGUAGE_OPTIONS}
            value={settings.defaultLanguage}
            onSelect={(val) => setSetting('defaultLanguage', val)}
            placeholder="Auto-Detect"
          />
        </View>

        <Text style={styles.settingLabel}>{t('settings.preferredFormatter') || 'Formatter Model'}</Text>
        <View style={{ marginBottom: SPACING.xl }}>
          <SelectDropdown
            options={downloadedFormatterOptions}
            value={settings.preferredFormatterModel}
            onSelect={(val) => setSetting('preferredFormatterModel', val)}
            placeholder="Not Set"
          />
        </View>

        <Text style={styles.settingLabel}>{t('settings.preferredChat') || 'Chat Model'}</Text>
        <View style={{ marginBottom: SPACING.xl }}>
          <SelectDropdown
            options={[...downloadedFormatterOptions, ...downloadedChatOptions]}
            value={settings.preferredChatModel}
            onSelect={(val) => setSetting('preferredChatModel', val)}
            placeholder="Not Set"
          />
        </View>

        <Text style={styles.settingLabel}>{t('settings.autoDeleteLabel') || 'Auto-Delete Audio Files'}</Text>
        <View style={{ marginBottom: SPACING.xl }}>
          <SelectDropdown
            options={AUTO_DELETE_OPTIONS}
            value={settings.autoDeleteCacheDuration}
            onSelect={(val) => setSetting('autoDeleteCacheDuration', val as 'Never' | '1 Week' | '1 Month')}
            placeholder="Never"
          />
        </View>

        <SettingRow label={t('settings.normalizeAudio') || 'Normalize Audio'} description={t('settings.normalizeAudioDesc') || 'Boosts low volume automatically'} value={settings.normalizeAudio} onChange={(v) => setSetting('normalizeAudio', v)} />
        <SettingRow label={t('settings.autoCopy') || 'Auto-Copy Transcript'} description={t('settings.autoCopyDesc') || 'Copies to clipboard when done'} value={settings.autoCopyTranscript} onChange={(v) => setSetting('autoCopyTranscript', v)} />
        <SettingRow label={t('settings.formatByDefault') || 'Format By Default'} description={t('settings.formatByDefaultDesc') || 'Automatically format after transcription'} value={settings.formatByDefault} onChange={(v) => setSetting('formatByDefault', v)} />
        <SettingRow label={t('settings.summarizeByDefault') || 'Summarize By Default'} description={t('settings.summarizeByDefaultDesc') || 'Automatically summarize after transcription'} value={settings.summarizeByDefault} onChange={(v) => setSetting('summarizeByDefault', v)} />
        <SettingRow
          label={t('settings.contextLearning') || 'Context Learning'}
          description={t('settings.contextLearningDesc') || 'Learn names, terms, and context automatically from your voice memos.'}
          value={settings.enableContextLearning}
          onChange={(v) => setSetting('enableContextLearning', v)}
        />
        
        {settings.enableContextLearning && (
          <View style={{ marginTop: SPACING.md }}>
            <Button variant="ghost" size="md" onPress={async () => {
              if (!settings.preferredChatModel) {
                dialog.show({ title: t('dialog.noChatModel.title') || 'No Chat Model', message: t('dialog.noChatModel.message') || 'Please select a Chat Model first to compress your profile.' });
                return;
              }
              const modelPath = ModelManager.getModelPath(settings.preferredChatModel);
              dialog.show({ title: t('settings.compressing') || 'Compressing...', message: t('settings.compressingDesc') || 'Merging and optimizing your memory profile...' });
              const success = await rollupMemories(modelPath, settings.preferredChatModel);
              if (success) {
                dialog.show({ title: t('dialog.compressSuccess.title') || 'Success', message: t('dialog.compressSuccess.message') || 'Profile compressed successfully!' });
              } else {
                dialog.show({ title: t('dialog.compressFailed.title') || 'Not enough data', message: t('dialog.compressFailed.message') || 'Your profile is already optimized or too small to compress.' });
              }
            }} icon="compress">
              {t('settings.compressProfile') || 'Compress Memory Profile'}
            </Button>
            <Button variant="secondary" size="md" onPress={() => router.push('/memory' as any)} icon="library" style={{ marginTop: SPACING.sm }}>
              {t('settings.manageMemory') || 'Manage Memory'}
            </Button>
          </View>
        )}

        <View style={{ marginTop: SPACING.md }}>
          <Button variant="danger" size="md" onPress={() => {
            dialog.show({
              title: t('dialog.clearChat.title') || 'Clear Chat History',
              message: t('dialog.clearChat.message') || 'Are you sure you want to permanently delete your AI conversation history?',
              icon: 'warning',
              iconTone: 'danger',
              buttons: [
                { label: t('dialog.confirmDelete.cancel') || 'Cancel', variant: 'secondary' },
                { label: t('dialog.clearChat.clear') || 'Clear', variant: 'danger', onPress: async () => {
                  await AsyncStorage.removeItem('chat_messages');
                  dialog.show({ title: t('dialog.clearChat.clearedTitle') || 'Cleared', message: t('dialog.clearChat.clearedMessage') || 'Your conversation history has been deleted.' });
                }},
              ],
            });
          }} icon="delete">
            {t('settings.clearChat') || 'Clear Chat History'}
          </Button>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>{t('settings.appearance') || 'Appearance'}</Text>

        <Text style={[styles.settingLabel, { marginTop: SPACING.sm }]}>{t('settings.themeMode') || 'Theme Mode'}</Text>
        <View style={styles.chipRow}>
          {THEME_MODES.map((mode) => (
            <Chip key={mode} label={mode} active={themeMode === mode} onPress={() => setThemeMode(mode)} />
          ))}
        </View>

        <Text style={[styles.settingLabel, { marginTop: SPACING.xxl }]}>{t('settings.accentColor') || 'Accent Color'}</Text>
        <View style={styles.chipRow}>
          {ACCENT_OPTIONS.map((color) => (
            <Chip key={color} label={color} active={accentColor === color} onPress={() => setAccentColor(color)} />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>{t('settings.customPrompts') || 'Custom Prompts'}</Text>

        <Text style={styles.settingLabel}>{t('settings.formatSystemPrompt') || 'Format System Prompt'}</Text>
        <TextInput
          style={[styles.input, { color: theme.text, borderColor: theme.divider }]}
          value={formatPrompt}
          onChangeText={setFormatPrompt}
          placeholder="You are an expert editor..."
          placeholderTextColor={theme.textSubtle}
          multiline
        />

        <Text style={styles.settingLabel}>{t('settings.summarySystemPrompt') || 'Summary System Prompt'}</Text>
        <TextInput
          style={[styles.input, { color: theme.text, borderColor: theme.divider }]}
          value={summaryPrompt}
          onChangeText={setSummaryPrompt}
          placeholder="Summarize the following text..."
          placeholderTextColor={theme.textSubtle}
          multiline
        />
      </View>

      <Text style={[styles.versionText, { color: theme.textSubtle }]}>Muffin Transcriber v1.0.0</Text>
    </>
  );

  const renderModels = () => (
    <View style={{ paddingBottom: 40 }}>
      <Text style={[styles.groupTitle, { color: theme.textMuted }]}>{t('settings.whisperModel') || 'Whisper Models'}</Text>
      {WHISPER_MODELS.map((model) => (
        <ModelCard
          key={model.id}
          model={model}
          downloaded={!!downloadedModels[model.id]}
          info={downloadProgress[model.id]}
          onPress={() => handleDownload(model.id, model.url)}
        />
      ))}
      <Text style={[styles.groupTitle, { color: theme.textMuted, marginTop: SPACING.lg }]}>{t('settings.preferredFormatter') || 'Formatter Models'}</Text>
      {FORMATTER_MODELS.map((model) => (
        <ModelCard
          key={model.id}
          model={model}
          downloaded={!!downloadedModels[model.id]}
          info={downloadProgress[model.id]}
          onPress={() => handleDownload(model.id, model.url)}
        />
      ))}
      <Text style={[styles.groupTitle, { color: theme.textMuted, marginTop: SPACING.lg }]}>{t('settings.preferredChat') || 'Chat Models'}</Text>
      {CHAT_MODELS.map((model) => (
        <ModelCard
          key={model.id}
          model={model}
          downloaded={!!downloadedModels[model.id]}
          info={downloadProgress[model.id]}
          onPress={() => handleDownload(model.id, model.url)}
        />
      ))}
      <Text style={[styles.groupTitle, { color: theme.textMuted, marginTop: SPACING.lg }]}>{t('settings.embeddingModels') || 'Embedding Models'}</Text>
      {EMBEDDING_MODELS.map((model) => (
        <ModelCard
          key={model.id}
          model={model}
          downloaded={!!downloadedModels[model.id]}
          info={downloadProgress[model.id]}
          onPress={() => handleDownload(model.id, model.url)}
        />
      ))}
    </View>
  );

  return (
    <KeyboardScreen>
    <FadeInView index={3} style={[styles.container, { backgroundColor: theme.background }]}>
      <Animated.View style={{ flex: 1, opacity: contentFade }}>
        <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: SPACING.lg }}>
          {displayedSegment === 'general' ? renderPreferences() : renderModels()}
        </ScrollView>
      </Animated.View>

      <View style={styles.segmentWrapper}>
        <SegmentedControl segments={PAGE_SEGMENTS} value={activeSegment} onChange={setActiveSegment} />
      </View>
    </FadeInView>
    </KeyboardScreen>
  );
}

// ---------------------------------------------------------------------------
// Local sub-components
// ---------------------------------------------------------------------------

const SettingRow = ({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) => {
  const { theme } = useTheme();
  return (
    <View style={styles.settingRow}>
      <View style={{ flex: 1, backgroundColor: 'transparent' }}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={[styles.settingDescription, { color: theme.textMuted }]}>{description}</Text>
      </View>
      <ExpressiveSwitch value={value} onValueChange={onChange} activeColor={theme.tint} thumbActiveColor="#000000" />
    </View>
  );
};

const Chip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => {
  const { theme } = useTheme();
  return (
    <AnimatedPressable
      onPress={onPress}
      style={{
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.xs + 2,
        borderRadius: RADIUS.pill,
        backgroundColor: active ? theme.tint : 'transparent',
        borderWidth: 1,
        borderColor: active ? theme.tint : theme.divider,
      }}
    >
      <Text
        style={{
          color: active ? '#000000' : theme.text,
          textTransform: 'capitalize',
          fontSize: 13,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
};

const ModelCard = ({
  model,
  downloaded,
  info,
  onPress,
}: {
  model: ModelDef;
  downloaded: boolean;
  info?: DownloadInfo;
  onPress: () => void;
}) => {
  const { theme } = useTheme();
  const isDownloading = info !== undefined;

  const buttonVariant = isDownloading ? 'secondary' : downloaded ? 'danger' : 'primary';
  const buttonLabel = isDownloading ? (t('settings.downloading') || 'Downloading') : downloaded ? (t('settings.delete') || 'Delete') : (t('settings.get') || 'Get');
  const buttonIcon: IconName = downloaded ? 'delete' : 'download';

  return (
    <Card style={{ marginBottom: SPACING.lg }}>
      <View style={styles.modelHeaderRow}>
        <View style={{ flex: 1, paddingRight: SPACING.lg, backgroundColor: 'transparent' }}>
          <Text style={styles.modelName}>{model.name}</Text>
          <Text style={[styles.modelDescription, { color: theme.textMuted }]}>{model.description}</Text>
          <Text style={[styles.modelSize, { color: theme.tint }]}>
            {model.size}
            {isDownloading && info!.total > 1 && ` • ${formatBytes(info!.written)} / ${formatBytes(info!.total)}`}
          </Text>
        </View>
        <Button variant={buttonVariant} size="sm" icon={buttonIcon} onPress={onPress} disabled={isDownloading}>
          {buttonLabel}
        </Button>
      </View>

      {isDownloading && info!.total > 1 && (
        <View style={{ marginTop: SPACING.lg, backgroundColor: 'transparent' }}>
          <View style={[styles.progressTrack, { backgroundColor: theme.surface }]}>
            <View style={{ width: `${info!.progress * 100}%`, height: '100%', backgroundColor: theme.tint }} />
          </View>
          <View style={styles.progressLabels}>
            <Text style={[styles.progressText, { color: theme.textMuted }]}>{formatBytes(info!.speed)}/s</Text>
            <Text style={[styles.progressText, { color: theme.textMuted }]}>{formatTime(info!.eta)} left</Text>
          </View>
        </View>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },
  segmentWrapper: {
    marginHorizontal: SPACING.xxxl + 8,
    marginBottom: SPACING.sm,
    marginTop: SPACING.sm,
  },
  section: {
    marginBottom: SPACING.xxxl,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: SPACING.lg,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  settingDescription: {
    fontSize: 14,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    minHeight: 100,
    textAlignVertical: 'top',
    marginTop: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  versionText: {
    textAlign: 'center',
    marginVertical: SPACING.xl,
    fontSize: 12,
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: SPACING.xs,
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modelHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modelName: {
    fontSize: 18,
    fontWeight: '600',
  },
  modelDescription: {
    fontSize: 14,
    marginTop: SPACING.xs,
    lineHeight: 20,
  },
  modelSize: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: SPACING.sm,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  progressText: {
    fontSize: 11,
  },
});
