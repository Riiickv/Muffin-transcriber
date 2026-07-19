import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from './ThemeProvider';
import { SelectDropdown } from './SelectDropdown';
import ExpressiveSwitch from './ExpressiveSwitch';
import { useSettings } from '@/utils/settingsStore';
import { ModelManager, WHISPER_MODELS, FORMATTER_MODELS, modelName } from '@/utils/ModelManager';
import { useRecordSheetOpen, setRecordSheetOpen } from '@/utils/recordSheet';
import { RADIUS, SPACING } from '@/constants/tokens';
import { t } from '@/utils/i18n';

/**
 * The recording-options sheet: hold the mic to open it. Whisper + formatter model
 * pickers and the auto-format / auto-summarize toggles - the useful part of the
 * old Record screen, without a whole screen. An app-wide absolute overlay (not a
 * Modal) so the model pickers' own dropdowns still open above it. Tap the
 * backdrop, or make a choice, and it stays out of the way.
 */
export function RecordOptionsSheet() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const isOpen = useRecordSheetOpen();
  const { settings, setSetting } = useSettings();

  // Which models are on disk. Loaded with a plain effect (refreshed each time the
  // sheet opens) rather than useModelOptions, whose useFocusEffect needs a screen
  // navigation context this app-wide overlay doesn't have.
  const [downloadedIds, setDownloadedIds] = useState<string[]>([]);
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    ModelManager.getDownloadedModelIds().then((ids) => {
      if (active) setDownloadedIds(ids);
    });
    return () => {
      active = false;
    };
  }, [isOpen]);
  const whisperOptions = WHISPER_MODELS.filter((m) => downloadedIds.includes(m.id)).map((m) => ({
    label: modelName(m),
    value: m.id,
  }));
  const formatterOptions = FORMATTER_MODELS.filter((m) => downloadedIds.includes(m.id)).map((m) => ({
    label: modelName(m),
    value: m.id,
  }));

  const openV = useSharedValue(0);
  useEffect(() => {
    openV.value = withTiming(isOpen ? 1 : 0, { duration: 240 });
  }, [isOpen]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: openV.value * 0.5 }));
  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - openV.value) * 480 }] }));

  const close = () => setRecordSheetOpen(false);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={isOpen ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={t('common.close') || 'Close'} />
      </Animated.View>

      <Animated.View
        style={[
          styles.panel,
          panelStyle,
          { backgroundColor: theme.background, paddingBottom: insets.bottom + SPACING.lg },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: theme.divider }]} />
        <Text style={[styles.title, { color: theme.text }]}>{t('record.optionsTitle') || 'Recording options'}</Text>

        <SelectDropdown
          rowLabel={t('transcribe.whisperModelLabel') || 'Transcription quality'}
          options={whisperOptions}
          value={settings.preferredWhisperModel}
          onSelect={(v) => setSetting('preferredWhisperModel', v)}
          placeholder={t('common.notSet') || 'Not set'}
        />
        <SelectDropdown
          rowLabel={t('transcribe.formatterModelLabel') || 'Format quality'}
          options={formatterOptions}
          value={settings.preferredFormatterModel}
          onSelect={(v) => setSetting('preferredFormatterModel', v)}
          placeholder={t('common.notSet') || 'Not set'}
        />

        <ToggleRow
          label={t('transcribe.formatToggle') || 'Format'}
          value={settings.formatByDefault}
          onValueChange={(v) => setSetting('formatByDefault', v)}
        />
        <ToggleRow
          label={t('transcribe.summarizeToggle') || 'Summarize'}
          value={settings.summarizeByDefault}
          onValueChange={(v) => setSetting('summarizeByDefault', v)}
        />
      </Animated.View>
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.toggleRow, { borderTopColor: theme.divider }]}>
      <Text style={[styles.toggleLabel, { color: theme.text }]}>{label}</Text>
      <ExpressiveSwitch
        value={value}
        onValueChange={onValueChange}
        activeColor={theme.tint}
        thumbActiveColor={theme.tintForeground}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#000' },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: SPACING.md,
  },
  title: { fontSize: 18, fontWeight: '700', marginBottom: SPACING.md },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  toggleLabel: { fontSize: 15, fontWeight: '500' },
});
