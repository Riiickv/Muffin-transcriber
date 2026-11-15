import { ScrollView, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { CHAT_SHIPPED } from '@/utils/features';
import { loadRuns, clearRuns, formatRuns } from '@/utils/perfLog';
import { pickFolder, exportReadable, writeBackup } from '@/utils/transcriptBackup';
import { errorToMessage } from '@/utils/errors';
import { getDeviceProfile, describeProfile } from '@/utils/deviceProfile';
import { TextInput } from '@/components/Themed';
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
import { ModelManager, WHISPER_MODELS, FORMATTER_MODELS, CHAT_MODELS, EMBEDDING_MODELS, modelName, speechModels } from '@/utils/ModelManager';
import { rollupMemories } from '@/utils/LLMEngine';
import { clearAllChats } from '@/utils/chatStore';
import { useSettings, useDebouncedSetting } from '@/utils/settingsStore';
import { getLanguageOptionsForModel } from '@/utils/languages';
import { RADIUS, SPACING, TAB_BAR_SPACE } from '@/constants/tokens';
import { useDialog } from '@/components/Dialog';
// THROWAWAY, with utils/chunkSpike.ts. Remove both together.
import { runChunkSpike, formatSpike } from '@/utils/chunkSpike';
import { historyIsComplete, loadHistory } from '@/utils/historyStore';
import { unloadWhisper } from '@/utils/WhisperEngine';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { t, APP_LANGUAGE_OPTIONS, AppLanguage } from '@/utils/i18n';
import { openPrivacyPolicy } from '@/utils/support';
import Constants from 'expo-constants';
const THEME_SEGMENTS = [
  { key: 'system' as const, labelKey: 'settings.themeAuto', label: 'Auto' },
  { key: 'light' as const, labelKey: 'settings.themeLight', label: 'Light' },
  { key: 'dark' as const, labelKey: 'settings.themeDark', label: 'Dark' },
  { key: 'amoled' as const, labelKey: 'settings.themeBlack', label: 'Black' },
] as const satisfies readonly { key: ThemeMode; labelKey: string; label: string }[];

// Mirrors ACCENT_COLORS in ThemeProvider. 'system' has no fixed colour - it's
// pulled from the wallpaper at runtime - so it renders as an outlined dot.
const ACCENT_SWATCHES: { key: AccentColor; color: string | null; labelKey: string; label: string }[] = [
  { key: 'system', color: null, labelKey: 'settings.accentSystem', label: 'System' },
  { key: 'muffin', color: '#FF9EBB', labelKey: 'settings.accentMuffin', label: 'Muffin' },
  { key: 'green', color: '#65D28A', labelKey: 'settings.accentGreen', label: 'Green' },
  { key: 'purple', color: '#A975C2', labelKey: 'settings.accentPurple', label: 'Purple' },
  { key: 'red', color: '#ED6F62', labelKey: 'settings.accentRed', label: 'Red' },
];

// Read from the build, never hand-typed: a hardcoded string here silently rots
// - it sat at "1.2.1" through several version bumps and told the user (and me)
// the update hadn't installed when it had. expoConfig.version is app.json's
// version baked in at build time, so this always matches the real build.
const APP_VERSION = Constants.expoConfig?.version ?? '';
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
        for (const m of [...speechModels(true), ...FORMATTER_MODELS, ...CHAT_MODELS, ...EMBEDDING_MODELS]) {
          status[m.id] = await ModelManager.isModelDownloaded(m.id);
        }
        setDownloadedModels(status);
      };
      check();
    }, [])
  );

  const downloadedFormatterOptions = FORMATTER_MODELS.filter((m) => downloadedModels[m.id]).map((m) => ({
    label: modelName(m),
    value: m.id,
  }));

  const downloadedChatOptions = CHAT_MODELS.filter((m) => downloadedModels[m.id]).map((m) => ({
    label: modelName(m),
    value: m.id,
  }));

  const downloadedCount = Object.values(downloadedModels).filter(Boolean).length;

  // The numbers behind "is it fast?". Every transcription and every LLM task
  // records how long it took; this reads them back. Nothing is uploaded - it is
  // the same on-device storage as everything else in the app.
  // THROWAWAY, paired with utils/chunkSpike.ts. Hold "Speed report" to run it.
  // Answers one question before any chunking work starts: does splitting a file
  // across several whisper contexts beat one context on the whole file, or is
  // the phone memory-bandwidth bound and the whole idea worthless? Deliberately
  // picks the SMALLEST installed model, because three copies of large-v3-turbo
  // is roughly 2.5GB of native memory and would take the phone down the way
  // three llama processes took the PC down.
  const runChunkSpikeNow = async () => {
    haptics.tap();
    const history = await loadHistory();
    // The LONGEST recording, not the newest: chunking a ten second clip
    // measures nothing, because each slice would be shorter than whisper's own
    // 30s window and the parallel run would just be overhead.
    const item = history
      .filter((h) => h.sourceFilePath)
      .sort((a, b) => (b.audioDurationMs || 0) - (a.audioDurationMs || 0))[0];
    if (!item?.sourceFilePath) {
      dialog.show({ title: 'Spike', message: 'No history entry with audio to test on.', buttons: [{ label: 'Ok' }] });
      return;
    }
    const installed: string[] = [];
    for (const m of WHISPER_MODELS) {
      if (await ModelManager.isModelDownloaded(m.id)) installed.push(m.id);
    }
    const smallest = installed.find((id) => id.includes('tiny')) || installed[0];
    if (!smallest) {
      dialog.show({ title: 'Spike', message: 'No whisper model installed.', buttons: [{ label: 'Ok' }] });
      return;
    }
    dialog.show({
      title: 'Chunk spike',
      message:
        'Runs the same audio three ways and times each: whole file, sliced sequentially, sliced in parallel.\n\n' +
        'Audio: ' + item.sourceFileName + ' (' + Math.round((item.audioDurationMs || 0) / 1000) + 's)' + '\nModel: ' + smallest + '\n\n' +
        'Takes a few minutes and the phone will get warm.',
      buttons: [
        { label: 'Cancel', variant: 'secondary' },
        {
          label: 'Run',
          variant: 'primary',
          onPress: async () => {
            // The app's own context would double the resident memory.
            await unloadWhisper();
            const res = await runChunkSpike(item.sourceFilePath!, ModelManager.getModelPath(smallest), 2);
            const report = formatSpike(res);
            dialog.show({
              title: 'Chunk spike',
              message: report,
              messageAlign: 'left' as const,
              buttons: [
                { label: 'Copy', variant: 'secondary', onPress: () => { void Clipboard.setStringAsync(report); } },
                { label: 'Ok' },
              ],
            });
          },
        },
      ],
    });
  };

  /**
   * Write every transcription to a folder the user picks.
   *
   * Muffin keeps everything in app-private storage with allowBackup off, which
   * is what makes "it never leaves your phone" true and also means an uninstall
   * destroys the lot. Until this existed the only way out was copying
   * transcripts to the clipboard one at a time.
   */
  const exportTranscripts = async () => {
    haptics.tap();
    const items = await loadHistory();
    if (items.length === 0) {
      dialog.show({
        title: t('settings.exportTranscripts') || 'Export transcriptions',
        message: t('settings.exportEmpty') || 'There is nothing to export yet.',
        icon: 'warning',
      });
      return;
    }
    const dir = await pickFolder();
    if (!dir) return; // Backed out of the picker. Not an error, so say nothing.
    try {
      const { count } = await exportReadable(dir, items);
      haptics.success();
      dialog.show({
        title: t('settings.exportDone') || 'Exported',
        message: (t('settings.exportDoneDesc') || 'Saved {count} transcriptions.').replace(
          '{count}',
          String(count),
        ),
        icon: 'check',
        iconTone: 'primary',
      });
    } catch (e) {
      haptics.error();
      dialog.show({
        title: t('settings.exportFailed') || 'Export failed',
        message: errorToMessage(e),
        icon: 'warning',
        iconTone: 'danger',
      });
    }
  };

  /**
   * Turning the switch ON asks for a folder and writes immediately, so the
   * promise on the label is true from the moment it is made rather than at some
   * unspecified later point.
   *
   * Turning it OFF keeps the folder in settings and leaves the file where it
   * is. Deleting somebody's file because they flipped a switch is not ours to
   * do, and keeping the folder means turning it back on costs nothing.
   */
  const toggleKeepAfterUninstall = async (on: boolean) => {
    if (!on) {
      setSetting('keepTranscriptsAfterUninstall', false);
      return;
    }
    const dir = settings.backupFolderUri || (await pickFolder());
    if (!dir) return; // No folder, no promise. Leave the switch off.
    try {
      const items = await loadHistory();
      // The backup replaces the file already in that folder. A list that is
      // missing notes it could not read must not replace a whole one.
      if (!historyIsComplete()) throw new Error(t('history.unreadable') || 'Some transcripts could not be read.');
      await writeBackup(dir, items);
      setSetting('backupFolderUri', dir);
      setSetting('keepTranscriptsAfterUninstall', true);
      haptics.success();
    } catch (e) {
      haptics.error();
      dialog.show({
        title: t('settings.exportFailed') || 'Export failed',
        message: errorToMessage(e),
        icon: 'warning',
        iconTone: 'danger',
      });
    }
  };

  const showSpeedReport = async () => {
    haptics.tap();
    // The timings mean nothing without knowing which engine build produced
    // them, so the report leads with the CPU it ran on.
    const report =
      describeProfile(await getDeviceProfile()) + '\n\n' + formatRuns(await loadRuns());
    dialog.show({
      title: t('settings.speedReport') || 'Speed report',
      message: report,
      // Columns of numbers, not prose. Centred, every line started in a
      // different place and nothing lined up with anything.
      messageAlign: 'left' as const,
      buttons: [
        {
          label: t('settings.copyReport') || 'Copy',
          variant: 'secondary',
          onPress: () => { void Clipboard.setStringAsync(report); },
        },
        {
          label: t('settings.clearReport') || 'Clear',
          variant: 'danger',
          onPress: () => { void clearRuns(); },
        },
      ],
    });
  };

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
          rowDescription={t('settings.defaultLanguageDesc')}
          options={getLanguageOptionsForModel(settings.preferredWhisperModel)}
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
          label={t('settings.progressive')}
          description={t('settings.progressiveDesc')}
          right={<Switch value={settings.progressiveTranscription} onChange={(v) => setSetting('progressiveTranscription', v)} />}
        />
        <SettingsRow
          label={t('settings.autoCopy')}
          description={t('settings.autoCopyDesc')}
          right={<Switch value={settings.autoCopyTranscript} onChange={(v) => setSetting('autoCopyTranscript', v)} />}
        />
        <SettingsRow
          label={t('settings.typewriter')}
          description={t('settings.typewriterDesc')}
          right={
            <Switch
              value={settings.enableTypewriter}
              onChange={(v) => setSetting('enableTypewriter', v)}
            />
          }
        />
        {settings.enableTypewriter && (
          // Label above, control across the full width, like Theme below. NOT a
          // SettingsRow with the control on the right: see SegmentedControl.
          <View style={styles.pickerBlock}>
            <Text style={styles.pickerLabel}>{t('settings.typewriterSpeed')}</Text>
            <SegmentedControl
              segments={[
                { key: 'slow', label: t('settings.speedSlow') || 'Slow' },
                { key: 'balanced', label: t('settings.speedBalanced') || 'Balanced' },
                { key: 'fast', label: t('settings.speedFast') || 'Fast' },
              ]}
              value={settings.typewriterSpeed}
              onChange={(v) => setSetting('typewriterSpeed', v as 'slow' | 'balanced' | 'fast')}
            />
          </View>
        )}
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
          rowDescription={t('settings.preferredFormatterDesc')}
          options={downloadedFormatterOptions}
          value={settings.preferredFormatterModel}
          onSelect={(val) => setSetting('preferredFormatterModel', val)}
          placeholder={t('common.notSet')}
        />
        {/* Chat is opt-in while it's beta: the tab stays hidden until this is on,
            so nobody meets a half-finished feature without choosing to. Turning
            it ON explains exactly what does and doesn't work yet. */}
        {CHAT_SHIPPED && (
        <SettingsRow
          label={t('settings.chatBetaLabel')}
          description={t('settings.chatBetaDesc')}
          badge={
            <View style={[styles.betaPill, { backgroundColor: theme.tintFill }]}>
              <Text style={[styles.betaPillText, { color: theme.tint }]}>{t('chat.beta') || 'Beta'}</Text>
            </View>
          }
          right={
            <Switch
              value={settings.enableChatBeta}
              onChange={(v) => {
                setSetting('enableChatBeta', v);
                if (v) {
                  dialog.show({
                    title: t('chat.betaTitle'),
                    message: t('chat.betaEnableBody'),
                    buttons: [{ label: t('chat.betaOk') || 'Ok!', variant: 'primary' }],
                  });
                }
              }}
            />
          }
        />
        )}
        {CHAT_SHIPPED && settings.enableChatBeta && (
          <SelectDropdown
            rowLabel={t('settings.preferredChat')}
            rowDescription={t('settings.preferredChatDesc')}
            options={[...downloadedFormatterOptions, ...downloadedChatOptions]}
            value={settings.preferredChatModel}
            onSelect={(val) => setSetting('preferredChatModel', val)}
            placeholder={t('common.notSet')}
          />
        )}
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
            description={t('settings.compressProfileDesc')}
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
            segments={THEME_SEGMENTS.map((s) => ({ key: s.key, label: t(s.labelKey) || s.label }))}
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
            style={[styles.input, { color: theme.text, backgroundColor: theme.surfaceStrong }]}
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
            style={[styles.input, { color: theme.text, backgroundColor: theme.surfaceStrong }]}
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
          rowDescription={t('settings.autoDeleteDesc')}
          options={AUTO_DELETE_OPTIONS}
          value={settings.autoDeleteCacheDuration}
          onSelect={(val) => setSetting('autoDeleteCacheDuration', val as 'Never' | '1 Week' | '1 Month')}
          placeholder={t('settings.autoDeleteNever')}
        />
        {/* Export and keep-after-uninstall are about where your transcripts
            live, which is this group. They were filed under About, between the
            privacy policy and the speed report. */}
        <SettingsRow
          label={t('settings.exportTranscripts') || 'Export transcriptions'}
          description={t('settings.exportTranscriptsDesc')}
          onPress={exportTranscripts}
        />
        <SettingsRow
          label={t('settings.keepAfterUninstall') || 'Keep transcriptions after uninstalling'}
          description={t('settings.keepAfterUninstallDesc')}
          right={
            <Switch
              value={settings.keepTranscriptsAfterUninstall}
              onChange={(v) => { void toggleKeepAfterUninstall(v); }}
            />
          }
        />
        {/* Destructive, so it lives alone at the bottom instead of sitting a
            thumb's width from Normalize Audio. Only when Chat is on: with the
            beta off there is no chat, and a red row offering to clear one
            reads as if something were stored that the user never made. */}
        {CHAT_SHIPPED && settings.enableChatBeta && (
          <SettingsRow
            label={t('settings.clearChat')}
            icon="delete"
            tone="danger"
            onPress={handleClearChat}
            chevron={false}
          />
        )}
      </SettingsGroup>

      <SettingsGroup title={t('settings.aboutHeader')} index={7}>
        <SettingsRow
          icon="library"
          label={t('settings.privacyPolicy')}
          onPress={() => { haptics.tap(); openPrivacyPolicy(); }}
        />
        <SettingsRow
          icon="waveform"
          label={t('settings.speedReport') || 'Speed report'}
          description={t('settings.speedReportDesc')}
          onPress={showSpeedReport}
          onLongPress={runChunkSpikeNow}
        />
      </SettingsGroup>

      {/* Held, it turns the speech models under test on or off (they then
          show on the Models screen). The mark after the version is the
          only sign it is on. */}
      <Text
        style={[styles.versionText, { color: theme.textSubtle }]}
        suppressHighlighting
        onLongPress={() => {
          haptics.toggle(!settings.showTestModels);
          setSetting('showTestModels', !settings.showTestModels);
        }}
      >
        {t('settings.version').replace('{version}', APP_VERSION)}
        {settings.showTestModels ? ' +' : ''}
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
    <ExpressiveSwitch value={value} onValueChange={onChange} activeColor={theme.tint} thumbActiveColor={theme.tintForeground} />
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
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    minHeight: 92,
    textAlignVertical: 'top',
    fontSize: 15,
    lineHeight: 22,
  },
  betaPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
    marginLeft: SPACING.sm,
  },
  betaPillText: { fontSize: 11, fontWeight: '700' },
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
            accessibilityLabel={t(s.labelKey) || s.label}
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

