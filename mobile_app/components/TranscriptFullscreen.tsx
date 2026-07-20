import React, { useRef } from 'react';
import { Modal, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from './Themed';
import { useTheme } from './ThemeProvider';
import { IconButton } from './IconButton';
import { Button } from './Button';
import { ProgressBar } from './ProgressBar';
import { StreamingText } from './StreamingText';
import { showSupportDialog } from './WaitingCard';
import { useDialog } from './Dialog';
import { RADIUS, SPACING } from '@/constants/tokens';
import { haptics } from '@/utils/haptics';
import { t } from '@/utils/i18n';

/** Fixed chrome, so the frame's height can be arithmetic rather than a guess. */
const BAR_HEIGHT = 56;
const FOOTER_HEIGHT = 52;

/**
 * The transcript at full height.
 *
 * EVERY height here is computed, and there is no flex and no animated wrapper.
 * Three builds tried to fix this panel by adjusting flex, and each time it
 * still rendered as a hairline with the support link stranded below it: inside
 * a Modal, `flex: 1` had nothing definite to resolve against. Rather than keep
 * guessing which ancestor was at fault, the layout no longer depends on any of
 * them - the frame is told exactly how tall it is.
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
  /** Something is still generating: shows the progress hairline and support link. */
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

  const footer = streaming ? FOOTER_HEIGHT : 0;
  const frameHeight = Math.max(
    120,
    windowHeight - insets.top - insets.bottom - BAR_HEIGHT - footer - SPACING.md * 2
  );

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View
        style={{
          width: windowWidth,
          height: windowHeight,
          paddingTop: insets.top,
          backgroundColor: theme.background,
        }}
      >
        <View style={[styles.bar, { height: BAR_HEIGHT }]}>
          <IconButton
            icon="close-fullscreen"
            variant="ghost-tint"
            onPress={() => {
              haptics.tap();
              onClose();
            }}
          />
          {!!onCopy && <IconButton icon="copy" variant="ghost-tint" onPress={onCopy} />}
        </View>

        <View
          style={[
            styles.frame,
            { height: frameHeight, borderColor: theme.divider, marginHorizontal: SPACING.md },
          ]}
        >
          <ScrollView
            ref={scrollRef}
            style={{ height: frameHeight - 2 }}
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
                so this shows exactly what the inline panel shows. */}
            {streaming ? (
              <StreamingText text={text} style={[styles.text, { color: theme.text }]} />
            ) : (
              <Text style={[styles.text, { color: theme.text }]}>{text}</Text>
            )}
          </ScrollView>
        </View>

        {streaming && (
          <View style={[styles.footer, { height: FOOTER_HEIGHT, paddingHorizontal: SPACING.md }]}>
            {percent !== undefined && <ProgressBar percent={percent} />}
            <Button variant="ghost" size="sm" onPress={() => showSupportDialog(dialog)}>
              {t('transcribe.supportMe') || 'Support me!'}
            </Button>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
  },
  frame: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  footer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  /** Same metrics as the inline panel so nothing reflows on open. */
  text: { fontSize: 16, lineHeight: 24 },
});
