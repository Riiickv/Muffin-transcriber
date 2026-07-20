import React, { useEffect, useRef } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
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
  /** Live transcription: types the text out and shows the progress hairline. */
  streaming?: boolean;
  percent?: number;
  onCopy?: () => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const dialog = useDialog();

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
      <View style={[styles.root, { backgroundColor: theme.background, paddingTop: insets.top }]}>
        <View style={styles.bar}>
          <IconButton
            icon="close-fullscreen"
            onPress={() => {
              haptics.tap();
              onClose();
            }}
          />
          {!!onCopy && (
            <Button variant="ghost" size="sm" icon="copy" onPress={onCopy}>
              {t('historyDetail.copyButton') || 'Copy'}
            </Button>
          )}
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
            {streaming ? (
              <StreamingText text={text} style={[styles.text, { color: theme.text }]} />
            ) : (
              <Text style={[styles.text, { color: theme.text }]}>{text}</Text>
            )}
          </ScrollView>

          {streaming && <ProgressBar percent={percent ?? 0} />}
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
