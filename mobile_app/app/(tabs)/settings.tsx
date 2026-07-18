import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useCallback } from 'react';
import { useFocusEffect, router } from 'expo-router';

import { Text } from '@/components/Themed';
import { useTheme, ThemeMode, AccentColor } from '@/components/ThemeProvider';
import { FadeInView } from '@/components/FadeInView';
import ExpressiveSwitch from '@/components/ExpressiveSwitch';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { SelectDropdown } from '@/components/SelectDropdown';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Icon } from '@/components/Icon';
import { SettingsGroup, SettingsRow } from '@/components/SettingsGroup';
import { haptics } from '@/utils/haptics';
import { ModelManager, WHISPER_MODELS, FORMATTER_MODELS, CHAT_MODELS, EMBEDDING_MODELS } from '@/utils/ModelManager';
import { rollupMemories } from '@/utils/LLMEngine';
import { clearAllChats } from '@/utils/chatStore';
import { useSettings, useDebouncedSetting } from '@/utils/settingsStore';
import { LANGUAGE_OPTIONS } from '@/utils/languages';
import { RADIUS, SPACING, TAB_BAR_SPACE } from '@/constants/tokens';
import { useDialog } from '@/components/Dialog';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { t, APP_LANGUAGE_OPTIONS, AppLanguage } from '@/utils/i18n';
import { openPrivacyPolicy } from '@/utils/support';
const THEME_SEGMENTS = [
  { key: 'system' as const, label: 'Auto' },
  { key: 'light' as const, label: 'Light' },
  { key: 'dark' as const, label: 'Dark' },
  { key: 'amoled' as const, label: 'Black' },
] as const satisfies readonly { key: ThemeMode; label: string }[];

// Mirrors ACCENT_COLORS in ThemeProvider. 'system' has no fixed colour - it's
// pulled from the wallpaper at runtime - so it renders as an outlined dot.
const ACCENT_SWATCHES: { key: AccentColor; color: string | null; label: string }[] = [
  { key: 'system', color: null, label: 'System' },
  { key: 'muffin', color: '#FF9EBB', label: 'Muffin' },
  { key: 'green', color: '#65D28A', label: 'Green' },
  { key: 'purple', color: '#A975C2', label: 'Purple' },
  { key: 'red', color: '#ED6F62', label: 'Red' },
];

const APP_VERSION = '1.2.1';
const AUTO_DELETE_OPTIONS = [
  { label: t('settings.autoDeleteNever') || 'Never', value: 'Never' },
  { label: t('settings.autoDelete1Week') || '1 Week', value: '1 Week' },
  { label: t('settings.autoDelete1Month') || '1 Month', value: '1 Month' },
];

export default function SettingsScreen() {
  const { theme, themeMode, accentColor, setThemeMode, setAccentColor } = useTheme();

  const { settings, setSetting } = useSettings();
  const dialog = useDialog();
  const [formatPrompt, setFormatPrompt] = useDebouncedSetting('customFormatSystemPrompt');
  const [summaryPrompt, setSummaryPrompt] = useDebouncedSetting('customSummarySystemPrompt');

  const [downloadedModels, setDownloadedModels] = useState<Record<string, boolean>>({});
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

  const downloadedCount = Object.values(downloadedModels).filter(Boolean).length;

  const handleCompress = async () => {
    if (!settings.preferredChatModel) {
      dialog.show({ title: t('dialog.noChatModel.title'), message: t('dialog.noChatModel.message'), icon: 'warning' });
      return;
    }
    const modelPath = ModelManager.getModelPath(settings.preferredChatModel);
    dialog.show({ title: t('settings.compressing'), message: t('settings.compressingDesc') });
    const success = await rollupMemories(modelPath, settings.preferredChatModel);
    dialog.show(
      success
        ? { title: t('dialog.compressSuccess.title'), message: t('dialog.compressSuccess.message'), icon: 'check-circle' }
        : { title: t('dialog.compressFailed.title'), message: t('dialog.compressFailed.message'), icon: 'warning' }
    );
  };

  const handleClearChat = () => {
    dialog.show({
      title: t('dialog.clearChat.title'),
      message: t('dialog.clearChat.message'),
      icon: 'warning',
      iconTone: 'danger',
      buttons: [
        { label: t('dialog.confirmDelete.cancel'), variant: 'secondary' },
        {
          label: t('dialog.clearChat.clear'),
          variant: 'danger',
          onPress: async () => {
            await clearAllChats();
            dialog.show({ title: t('dialog.clearChat.clearedTitle'), message: t('dialog.clearChat.clearedMessage') });
          },
        },
      ],
    });
  };

  // Ordered by how often it's touched, not by how the code happens to be
  // organised: language and the two "do it automatically" switches are the
  // settings people actually change. Appearance and prompts are one-time.
  const renderPreferences = () => (
    <>
      {/* First, because nothing else in this screen works until a model is
          downloaded - and it's the one thing here that's a task rather than a
          preference. */}
      <SettingsGroup index={0}>
        <SettingsRow
          label={t('settings.modelManagement')}
          description={`${downloadedCount} ${t('settings.modelsInstalled')}`}
          icon="download"
          onPress={() => router.push('/models' as any)}
        />
      </SettingsGroup>

      <SettingsGroup title={t('settings.transcription')} index={1}>
        <SelectDropdown
          rowLabel={t('settings.defaultLanguage')}
          options={LANGUAGE_OPTIONS}
          value={settings.defaultLanguage}
          onSelect={(val) => setSetting('defaultLanguage', val)}
          placeholder="Auto-Detect"
        />
        <SettingsRow
          label={t('settings.normalizeAudio')}
          description={t('settings.normalizeAudioDesc')}
          right={<Switch value={settings.normalizeAudio} onChange={(v) => setSetting('normalizeAudio', v)} />}
        />
        <SettingsRow
          label={t('settings.autoCopy')}
          description={t('settings.autoCopyDesc')}
          right={<Switch value={settings.autoCopyTranscript} onChange={(v) => setSetting('autoCopyTranscript', v)} />}
        />
      </SettingsGroup>

      <SettingsGroup title={t('settings.formatSummarize')} index={2}>
        <SettingsRow
          label={t('settings.formatByDefault')}
          description={t('settings.formatByDefaultDesc')}
          right={<Switch value={settings.formatByDefault} onChange={(v) => setSetting('formatByDefault', v)} />}
        />
        <SettingsRow
          label={t('settings.summarizeByDefault')}
          description={t('settings.summarizeByDefaultDesc')}
          right={<Switch value={settings.summarizeByDefault} onChange={(v) => setSetting('summarizeByDefault', v)} />}
        />
        <SelectDropdown
          rowLabel={t('settings.preferredFormatter')}
          options={downloadedFormatterOptions}
          value={settings.preferredFormatterModel}
          onSelect={(val) => setSetting('preferredFormatterModel', val)}
          placeholder={t('common.notSet')}
        />
        <SelectDropdown
          rowLabel={t('settings.preferredChat')}
          options={[...downloadedFormatterOptions, ...downloadedChatOptions]}
          value={settings.preferredChatModel}
          onSelect={(val) => setSetting('preferredChatModel', val)}
          placeholder={t('common.notSet')}
        />
      </SettingsGroup>

      <SettingsGroup title={t('settings.memoryContext')} index={3} footer={t('settings.memoryDesc')}>
        <SettingsRow
          label={t('settings.contextLearning')}
          description={t('settings.contextLearningDesc')}
          right={<Switch value={settings.enableContextLearning} onChange={(v) => setSetting('enableContextLearning', v)} />}
        />
        {/* Only meaningful once there's something to remember - hide rather
            than disable, so the group stays short in the common case. */}
        {settings.enableContextLearning && (
          <SettingsRow label={t('settings.manageMemory')} icon="library" onPress={() => router.push('/memory' as any)} />
        )}
        {settings.enableContextLearning && (
          <SettingsRow
            label={t('settings.compressProfile')}
            description={t('settings.compressingDesc')}
            icon="compress"
            onPress={handleCompress}
            chevron={false}
          />
        )}
      </SettingsGroup>

      {/* Label above, control full-width below. Four/five options crammed into
          a row's right-hand slot wrapped raggedly - "Amoled" orphaned on its
          own line, colours split across two rows. A picker with more than two
          or three choices needs the whole width. */}
      <SettingsGroup title={t('settings.appearance')} index={4}>
        {/* Language sits in Appearance rather than in a group of its own: it's
            the same kind of choice as theme and accent - how the app looks to
            you, not what it does. */}
        <SelectDropdown
          rowLabel={t('settings.appLanguage')}
          rowDescription={t('settings.appLanguageDesc')}
          options={APP_LANGUAGE_OPTIONS}
          value={settings.appLanguage}
          onSelect={(val) => setSetting('appLanguage', val as AppLanguage)}
          placeholder="Automatic"
        />
        <View style={styles.pickerBlock}>
          <Text style={styles.pickerLabel}>{t('settings.themeMode')}</Text>
          <SegmentedControl
            segments={THEME_SEGMENTS}
            value={themeMode}
            onChange={(m: ThemeMode) => setThemeMode(m)}
          />
        </View>
        <View style={styles.pickerBlock}>
          <Text style={styles.pickerLabel}>{t('settings.accentColor')}</Text>
          <SwatchRow active={accentColor} onPick={(c) => setAccentColor(c as AccentColor)} />
        </View>
      </SettingsGroup>

      <SettingsGroup title={t('settings.customPrompts')} index={5} footer={t('settings.customPromptsFooter')}>
        <View style={styles.promptBlock}>
          <Text style={[styles.promptLabel, { color: theme.text }]}>{t('settings.formatSystemPrompt')}</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.divider, backgroundColor: theme.background }]}
            value={formatPrompt}
            onChangeText={setFormatPrompt}
            placeholder={t('settings.formatSystemPromptPlaceholder')}
            placeholderTextColor={theme.textSubtle}
            multiline
          />
        </View>
        <View style={styles.promptBlock}>
          <Text style={[styles.promptLabel, { color: theme.text }]}>{t('settings.summarySystemPrompt')}</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.divider, backgroundColor: theme.background }]}
            value={summaryPrompt}
            onChangeText={setSummaryPrompt}
            placeholder={t('settings.summarySystemPromptPlaceholder')}
            placeholderTextColor={theme.textSubtle}
            multiline
          />
        </View>
      </SettingsGroup>

      <SettingsGroup title={t('settings.storageHeader')} index={6}>
        <SelectDropdown
          rowLabel={t('settings.autoDeleteLabel')}
          options={AUTO_DELETE_OPTIONS}
          value={settings.autoDeleteCacheDuration}
          onSelect={(val) => setSetting('autoDeleteCacheDuration', val as 'Never' | '1 Week' | '1 Month')}
          placeholder={t('settings.autoDeleteNever')}
        />
        {/* Destructive, so it lives alone at the bottom instead of sitting a
            thumb's width from Normalize Audio. */}
        <SettingsRow
          label={t('settings.clearChat')}
          icon="delete"
          tone="danger"
          onPress={handleClearChat}
          chevron={false}
        />
      </SettingsGroup>

      <SettingsGroup title={t('settings.aboutHeader')} index={7}>
        <SettingsRow
          icon="library"
          label={t('settings.privacyPolicy')}
          onPress={() => { haptics.tap(); openPrivacyPolicy(); }}
        />
      </SettingsGroup>

      <Text style={[styles.versionText, { color: theme.textSubtle }]}>
        {t('settings.version').replace('{version}', APP_VERSION)}
      </Text>
    </>
  );

  return (
    <KeyboardScreen>
      {/* 4, not 3: Settings is the FIFTH tab. It kept index 3 from before Chat
          existed, so coming back from Settings slid the wrong way. */}
      <FadeInView index={4} style={[styles.container, { backgroundColor: theme.background }]}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {renderPreferences()}
        </ScrollView>
      </FadeInView>
    </KeyboardScreen>
  );
}

// Thin wrapper so every switch in Settings gets the same colours without each
// call site restating them.
const Switch = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => {
  const { theme } = useTheme();
  return (
    <ExpressiveSwitch value={value} onValueChange={onChange} activeColor={theme.tint} thumbActiveColor="#000000" />
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },
  scrollContent: {
    paddingTop: SPACING.md,
    paddingBottom: TAB_BAR_SPACE,
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
  pickerBlock: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  pickerLabel: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: SPACING.md,
  },
  swatchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  swatchRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptBlock: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  promptLabel: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    minHeight: 92,
    textAlignVertical: 'top',
    fontSize: 14,
    lineHeight: 20,
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
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    minHeight: 64,
  },
  modelName: {
    fontSize: 15,
    fontWeight: '600',
  },
  modelSub: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  // Fixed box so Get / trash / 42% all occupy the same space and the list's
  // right edge stays straight.
  modelAction: {
    width: 64,
    height: 32,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modelActionText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  progressTrack: {
    height: 3,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    borderRadius: 2,
    overflow: 'hidden',
  },
});
/**
 * Accent picker: five colour dots, evenly spaced across the full width.
 *
 * A colour is a better label for a colour than its name is - "Green" told the
 * user nothing the dot doesn't say instantly, and five word-chips wrapped onto
 * two ragged rows. Selected gets a ring rather than a fill, so the swatch keeps
 * showing its own colour truthfully.
 */
const SwatchRow = ({ active, onPick }: { active: string; onPick: (v: AccentColor) => void }) => {
  const { theme } = useTheme();
  return (
    <View style={styles.swatchRow}>
      {ACCENT_SWATCHES.map((s) => {
        const isActive = active === s.key;
        return (
          <AnimatedPressable
            key={s.key}
            onPress={() => {
              haptics.select();
              onPick(s.key);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={s.label}
            style={[
              styles.swatchRing,
              { borderColor: isActive ? theme.tint : 'transparent' },
            ]}
          >
            <View
              style={[
                styles.swatchDot,
                s.color
                  ? { backgroundColor: s.color }
                  : // 'system' follows the wallpaper, so there's no colour to
                    // show until runtime - outline it and let the icon say why.
                    { borderWidth: 1.5, borderColor: theme.textSubtle },
              ]}
            >
              {!s.color && <Icon name="settings" size={13} color={theme.textMuted} />}
            </View>
          </AnimatedPressable>
        );
      })}
    </View>
  );
};

