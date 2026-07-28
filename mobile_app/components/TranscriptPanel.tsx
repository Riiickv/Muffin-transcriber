import React, { useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useTheme } from './ThemeProvider';
import { SegmentedControl } from './SegmentedControl';
import { IconButton } from './IconButton';
import { StreamingText } from './StreamingText';
import { ProgressBar } from './ProgressBar';
import { WaitingCard } from './WaitingCard';
import { SPACING, RADIUS } from '@/constants/tokens';
import { t } from '@/utils/i18n';

export type TranscriptTab = 'raw' | 'formatted' | 'summary';

// A function, not a const: built at module scope these labels would be
// evaluated once at import and keep the language the app started in, so
// switching language left Raw/Formatted/Summary in the old one.
export const getTranscriptTabs = (): readonly { key: TranscriptTab; label: string }[] => [
  { key: 'raw', label: t('transcribe.rawTab') || 'Raw' },
  { key: 'formatted', label: t('transcribe.formattedTab') || 'Improved' },
  { key: 'summary', label: t('transcribe.summaryTab') || 'Summary' },
];

type Props = {
  tab: TranscriptTab;
  onTabChange: (tab: TranscriptTab) => void;
  /** Something is generating for the visible tab: type `revealed` out. */
  streaming: boolean;
  revealed: string;
  /** Show the hairline under the stream when this is a number (whisper only). */
  progressPercent?: number | null;
  /** Work is running but there's nothing to stream yet: the waiting card. */
  waiting: boolean;
  waitingStatus?: string;
  /** The finished, idle content - each screen renders its own flavour
   *  (read-only input on Home, highlighted text on History). */
  renderStatic: () => React.ReactNode;
  onCopy: () => void;
  copyDisabled: boolean;
  onFullscreen: () => void;
  fullscreenDisabled: boolean;
};

/**
 * The shared transcript-card body: the Raw/Formatted/Summary tabs, the copy and
 * fullscreen buttons, and the bounded transcript area with its three states
 * (streaming, waiting, static).
 *
 * Extracted from the Muffin! tab and the History detail, which each carried a
 * near-identical copy - and every hard layout bug of this project had to be
 * found and fixed TWICE because of it (bottom insets, the scroll-on-overflow
 * net, the stale-fullscreen fix...). One implementation, one fix.
 *
 * The absolute layer inside `transcriptArea` is load-bearing: absolute children
 * don't contribute to layout size, so the transcript's content can never grow
 * the card - which is what lets the page ScrollView around this scroll ONLY
 * when the fixed chrome genuinely doesn't fit the screen.
 */
export function TranscriptPanel({
  tab,
  onTabChange,
  streaming,
  revealed,
  progressPercent,
  waiting,
  waitingStatus,
  renderStatic,
  onCopy,
  copyDisabled,
  onFullscreen,
  fullscreenDisabled,
}: Props) {
  const { theme } = useTheme();
  const streamScrollRef = useRef<ScrollView>(null);
  /** False once the user scrolls up, so auto-follow doesn't fight them. */
  const stickToBottom = useRef(true);

  return (
    <>
      <View style={styles.tabRow}>
        <SegmentedControl
          style={{ flex: 1, marginRight: SPACING.md }}
          segments={getTranscriptTabs()}
          value={tab}
          onChange={onTabChange}
        />
        {/* ghost-tint + sm: same look as the ghost Button they replaced, so
            they read as part of the row rather than a new kind of control. */}
        <IconButton icon="copy" variant="ghost-tint" size="sm" onPress={onCopy} disabled={copyDisabled} />
        <IconButton
          icon="open-in-full"
          variant="ghost-tint"
          size="sm"
          style={{ marginLeft: SPACING.xs }}
          onPress={onFullscreen}
          disabled={fullscreenDisabled}
        />
      </View>

      <View style={styles.transcriptArea}>
        <View style={StyleSheet.absoluteFill}>
          {streaming ? (
            <View style={[styles.transcriptBox, { borderColor: theme.divider }]}>
              <ScrollView
                ref={streamScrollRef}
                nestedScrollEnabled
                style={{ flex: 1 }}
                onScroll={(e) => {
                  // Stop yanking them back down if they've scrolled up to
                  // re-read something.
                  const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
                  stickToBottom.current =
                    layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
                }}
                scrollEventThrottle={100}
                onContentSizeChange={() => {
                  if (stickToBottom.current) streamScrollRef.current?.scrollToEnd({ animated: true });
                }}
              >
                <StreamingText text={revealed} style={[styles.streamingText, { color: theme.text }]} />
              </ScrollView>
              {typeof progressPercent === 'number' && (
                <ProgressBar percent={progressPercent} style={{ marginTop: SPACING.sm }} />
              )}
            </View>
          ) : waiting ? (
            <View style={[styles.transcriptBox, { borderColor: theme.divider }]}>
              <WaitingCard status={waitingStatus} />
            </View>
          ) : (
            renderStatic()
          )}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  /** The transcript's bounded home: flex height inside the card, with a floor so
   *  it stays usable when a short screen forces the page to scroll. Its only
   *  child is absolute, so nothing inside can inflate it. */
  transcriptArea: {
    flex: 1,
    minHeight: 180,
  },
  transcriptBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
  },
  /** Live transcript: matches the finished one so nothing shifts when it lands. */
  streamingText: {
    fontSize: 16,
    lineHeight: 24,
  },
});
