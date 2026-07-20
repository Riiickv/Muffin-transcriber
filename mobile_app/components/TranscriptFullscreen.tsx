import React, { useEffect, useRef } from 'react';
import { Modal, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from './Themed';
import { useTheme } from './ThemeProvider';
import { IconButton } from './IconButton';
import { Button } from './Button';
import { ProgressBar } from './ProgressBar';
import { StreamingText } from './StreamingText';
import { showSupportDialog } from './WaitingCard';
import { useDialog } from './Dialog';
import { MOTION, RADIUS, SPACING } from '@/constants/tokens';
import { haptics } from '@/utils/haptics';
import { t } from '@/utils/i18n';

/**
 * The transcript at full height.
 *
 * Deliberately the same frame as the inline panel - same border, radius and
 * text metrics - so it reads as that panel growing rather than a different
 * screen appearing. The collapse control sits where the expand control was.
 */
export function TranscriptFullscreen({
  visible,
  onClose,
  text,
  streaming,
  percent,
  onCopy,
}: {
  visible: boolean;
  onClose: () => void;
  text: string;
  /** Something is still generating: type it out as it arrives. */
  streaming?: boolean;
  /** Only whisper reports progress; omitted for the LLM steps. */
  percent?: number;
  onCopy?: () => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const dialog = useDialog();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();

  const scrollRef = useRef<ScrollView>(null);
  const stick = useRef(true);

  const scale = useSharedValue(0.96);
  const opacity = useSharedValue(0);
  useEffect(() => {
    scale.value = withTiming(visible ? 1 : 0.96, MOTION.timingBase);
    opacity.value = withTiming(visible ? 1 : 0, MOTION.timingBase);
  }, [visible, scale, opacity]);
  const grow = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* Explicit window height, not `flex: 1`. Inside a Modal there is no
          definite height to resolve flex against, so the frame's `flex: 1`
          collapsed to nothing and the whole panel rendered as a hairline.
          Measuring is the deterministic fix - the same lesson as the page
          layout, where flex inside a ScrollView bounded nothing either. */}
      <View
        style={[
          styles.root,
          { backgroundColor: theme.background, paddingTop: insets.top, height: windowHeight, width: windowWidth },
        ]}
      >
        <View style={styles.bar}>
          <IconButton
            icon="close-fullscreen"
            variant="ghost-tint"
            onPress={() => {
              haptics.tap();
              onClose();
            }}
          />
          {/* Icon-only here too - the label was the last one left. */}
          {!!onCopy && <IconButton icon="copy" variant="ghost-tint" onPress={onCopy} />}
        </View>

        <Animated.View
          style={[
            styles.frame,
            { borderColor: theme.divider, marginBottom: insets.bottom + SPACING.md },
            grow,
          ]}
        >
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: SPACING.md }}
            onScroll={(e) => {
              const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
              stick.current = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
            }}
            scrollEventThrottle={100}
            onContentSizeChange={() => {
              if (streaming && stick.current) scrollRef.current?.scrollToEnd({ animated: true });
            }}
          >
            {/* `text` is already revealed by the screen's shared usePacedReveal,
                so this shows exactly what the inline panel shows - the typing
                carries over on open instead of restarting or stalling. */}
            {streaming ? (
              <StreamingText text={text} style={[styles.text, { color: theme.text }]} />
            ) : (
              <Text style={[styles.text, { color: theme.text }]}>{text}</Text>
            )}
          </ScrollView>

          {streaming && percent !== undefined && <ProgressBar percent={percent} />}
        </Animated.View>

        {/* Room for it here, unlike the inline panel where every line counts. */}
        {streaming && (
          <Button
            variant="ghost"
            size="sm"
            style={{ alignSelf: 'center', marginBottom: insets.bottom + SPACING.sm }}
            onPress={() => showSupportDialog(dialog)}
          >
            {t('transcribe.supportMe') || 'Support me!'}
          </Button>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  frame: {
    flex: 1,
    marginHorizontal: SPACING.md,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  /** Same metrics as the inline panel so nothing reflows on open. */
  text: { fontSize: 16, lineHeight: 24 },
});
