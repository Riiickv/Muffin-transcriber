import { useEffect, useRef } from 'react';
import { View, StyleSheet, Pressable, ScrollView, PanResponder, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';

import { Text, TextInput } from './Themed';
import { useTheme } from './ThemeProvider';
import { SelectDropdown } from './SelectDropdown';
import { SegmentedControl } from './SegmentedControl';
import { SettingsRow } from './SettingsGroup';
import ExpressiveSwitch from './ExpressiveSwitch';
import { useSettings, useDebouncedSetting } from '@/utils/settingsStore';
import { WHISPER_MODELS } from '@/utils/ModelManager';
import { useModelOptions } from '@/hooks/useModelOptions';
import { useRecordSheetOpen, setRecordSheetOpen } from '@/utils/recordSheet';
import { getLanguageOptionsForModel, getFormatLanguageOptions } from '@/utils/languages';
import { MOTION, RADIUS, SPACING, TYPE, raisedColor } from '@/constants/tokens';
import { t } from '@/utils/i18n';

/**
 * Every per-transcription choice, in one sheet.
 *
 * These controls used to live on the home screen itself, as two cards ABOVE
 * the record and pick-file buttons, and again on the history detail screen,
 * and a third time in a smaller sheet behind a long press. The screen whose job
 * is "turn speech into text" opened on nine settings, with the transcript
 * squeezed underneath them.
 *
 * They are choices most people make once. So they live here, one tap away from
 * home (the Options row) and from the mic (long press), and the screens keep
 * their space for the words.
 */
export function RecordOptionsSheet() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const isOpen = useRecordSheetOpen();
  const { settings, setSetting } = useSettings();
  const [customPrompt, setCustomPrompt] = useDebouncedSetting('customFormatSystemPrompt');
  // This sheet is not a screen, so it says when to read the disk: on each open.
  const { whisperOptions, formatterOptions } = useModelOptions(isOpen);

  // An English-only model cannot be asked for Italian. Same filter the home
  // screen applied when this dropdown lived there.
  const englishOnly = WHISPER_MODELS.find((m) => m.id === settings.preferredWhisperModel)?.isEnglishOnly ?? false;
  const languageOptions = getLanguageOptionsForModel(settings.preferredWhisperModel, englishOnly);

  const aiOn = settings.formatByDefault || settings.summarizeByDefault;

  const openV = useSharedValue(0);
  /** How far the sheet has been pulled down by its handle, in px. */
  const drag = useSharedValue(0);
  useEffect(() => {
    if (isOpen) drag.set(0);
    // Up on the bottom bar's spring, so it arrives a hair past and settles.
    // Down on a plain timing: something leaving has nothing to settle into.
    openV.set(isOpen ? withSpring(1, MOTION.glide) : withTiming(0, { duration: 220 }));
  }, [isOpen, openV, drag]);

  // The handle and the title are the grip: pull down and the sheet follows the
  // finger; let go past a third of a hand's width, or with a flick, and it
  // closes from where it is. Anything less and it springs back.
  const grip = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_e, g) => {
        drag.set(Math.max(0, g.dy));
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 90 || g.vy > 0.8) setRecordSheetOpen(false);
        else drag.set(withSpring(0, MOTION.drop));
      },
      onPanResponderTerminate: () => {
        drag.set(withSpring(0, MOTION.drop));
      },
    })
  ).current;

  // The sheet has a text field, and a sheet pinned to the bottom of the screen
  // is exactly where the keyboard opens. `height` goes negative as the keyboard
  // rises (the library documents feeding it straight to translateY), so adding
  // it lifts the sheet by the height of the keyboard.
  const keyboard = useReanimatedKeyboardAnimation();

  // The backdrop clears as the sheet is pulled away, so it is plain the page
  // behind is coming back.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: openV.value * 0.5 * (1 - Math.min(1, drag.value / 360)),
  }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - openV.value) * windowH + openV.value * keyboard.height.value + drag.value }],
  }));

  const close = () => setRecordSheetOpen(false);

  const group = [styles.group, { backgroundColor: theme.surface }];
  const rule = <View style={[styles.rule, { backgroundColor: theme.divider }]} />;
  const toggle = (value: boolean, onValueChange: (v: boolean) => void) => (
    <ExpressiveSwitch
      value={value}
      onValueChange={onValueChange}
      activeColor={theme.tint}
      thumbActiveColor={theme.tintForeground}
    />
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={isOpen ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={t('common.close') || 'Close'} />
      </Animated.View>

      <Animated.View
        style={[
          styles.panel,
          panelStyle,
          {
            backgroundColor: raisedColor(theme.isDark, theme.isAmoled),
            // BLEED more of the same surface hangs below the screen's edge,
            // so when the spring carries the sheet past its place there is
            // sheet under it and not a strip of the page.
            bottom: -BLEED,
            maxHeight: windowH * 0.86 + BLEED,
            paddingBottom: insets.bottom + SPACING.lg + BLEED,
          },
        ]}
      >
        <View {...grip.panHandlers}>
          <View style={[styles.handle, { backgroundColor: theme.divider }]} />
          <Text style={[styles.title, { color: theme.text }]}>{t('record.optionsTitle') || 'Options'}</Text>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: SPACING.md }}
        >
          <View style={group}>
            <SelectDropdown
              rowLabel={t('transcribe.languageLabel') || 'Language'}
              options={languageOptions}
              value={settings.defaultLanguage}
              onSelect={(v) => setSetting('defaultLanguage', v)}
              placeholder="Auto-Detect"
            />
            {rule}
            <SelectDropdown
              rowLabel={t('transcribe.whisperModelLabel') || 'Transcription quality'}
              options={whisperOptions}
              value={settings.preferredWhisperModel}
              onSelect={(v) => setSetting('preferredWhisperModel', v)}
              placeholder={t('common.notSet') || 'Not set'}
            />
          </View>

          <View style={group}>
            <SettingsRow
              label={t('transcribe.formatToggle') || 'Improve'}
              right={toggle(settings.formatByDefault, (v) => setSetting('formatByDefault', v))}
            />
            {rule}
            <SettingsRow
              label={t('transcribe.summarizeToggle') || 'Summarize'}
              right={toggle(settings.summarizeByDefault, (v) => setSetting('summarizeByDefault', v))}
            />
            {/* Only when one of the two is on: these tune the rewrite, and with
                both switches off there is no rewrite to tune. */}
            {aiOn && (
              <>
                {rule}
                <SelectDropdown
                  rowLabel={t('transcribe.formatterModelLabel') || 'Improvement quality'}
                  options={formatterOptions}
                  value={settings.preferredFormatterModel}
                  onSelect={(v) => setSetting('preferredFormatterModel', v)}
                  placeholder={t('common.notSet') || 'Not set'}
                />
                {rule}
                <SelectDropdown
                  rowLabel={t('transcribe.formatLanguageLabel') || 'Improvement language'}
                  options={getFormatLanguageOptions()}
                  value={settings.formatLanguage}
                  onSelect={(v) => setSetting('formatLanguage', v)}
                  placeholder="Original"
                />
              </>
            )}
          </View>

          {aiOn && (
            <View style={[group, styles.padded]}>
              <Text style={styles.fieldLabel}>{t('transcribe.customPromptLabel') || 'Be specific'}</Text>
              <TextInput
                style={[styles.input, { color: theme.text, backgroundColor: theme.surface }]}
                value={customPrompt}
                onChangeText={setCustomPrompt}
                placeholder={t('transcribe.customPromptPlaceholder') || 'Use bullet points, max 100 words, etc.'}
                placeholderTextColor={theme.textSubtle}
                multiline
              />
              <Text style={[styles.fieldLabel, { marginTop: SPACING.lg }]}>
                {t('transcribe.outputShapeLabel') || 'Answer as'}
              </Text>
              <SegmentedControl
                segments={[
                  { key: 'auto', label: t('transcribe.shapeAuto') || 'Auto' },
                  { key: 'bullets', label: t('transcribe.shapeBullets') || 'Bullets' },
                  { key: 'paragraph', label: t('transcribe.shapeParagraph') || 'Paragraph' },
                ]}
                value={settings.outputShape}
                onChange={(v) => setSetting('outputShape', v as 'auto' | 'bullets' | 'paragraph')}
              />
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

/** How much of the sheet hangs below the screen, for the spring to bring up. */
const BLEED = 48;

const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#000' },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg,
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
    // The space above the handle is part of the grip, so it is padding on the
    // handle's wrapper rather than on the sheet.
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },
  title: { fontSize: TYPE.title, fontWeight: 'bold', marginBottom: SPACING.lg, marginLeft: SPACING.xs },
  group: { borderRadius: RADIUS.lg, overflow: 'hidden' },
  padded: { padding: SPACING.lg },
  rule: { height: StyleSheet.hairlineWidth, marginLeft: SPACING.lg },
  fieldLabel: { fontSize: TYPE.label, fontWeight: '600', marginBottom: SPACING.sm },
  input: {
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    minHeight: 64,
    maxHeight: 110,
    fontSize: TYPE.body,
    textAlignVertical: 'top',
  },
});
