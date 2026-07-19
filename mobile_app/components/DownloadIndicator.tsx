import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from './ThemeProvider';
import { ProgressCircle } from './ProgressCircle';
import { AnimatedPressable } from './AnimatedPressable';
import { useDownloads, DownloadState } from '@/utils/downloadManager';
import { useBannerExpanded, setBannerExpanded } from '@/utils/downloadBanner';
import { WHISPER_MODELS, FORMATTER_MODELS, CHAT_MODELS, EMBEDDING_MODELS, modelName } from '@/utils/ModelManager';
import { haptics } from '@/utils/haptics';
import { t } from '@/utils/i18n';
import { SPACING, RADIUS } from '@/constants/tokens';

const ALL_MODELS = [...WHISPER_MODELS, ...FORMATTER_MODELS, ...CHAT_MODELS, ...EMBEDDING_MODELS];

const labelFor = (id: string): string => {
  const def = ALL_MODELS.find((m) => m.id === id);
  return def ? modelName(def) : id;
};

// Collapse many downloads into one summary: average progress for the ring, the
// first one's name for the banner. Simultaneous downloads are rare; one readable
// number beats a stack of bars.
function aggregate(downloads: DownloadState) {
  const ids = Object.keys(downloads);
  if (ids.length === 0) return null;
  const avg = ids.reduce((s, id) => s + (downloads[id].progress || 0), 0) / ids.length;
  return { ids, avg, primaryId: ids[0] };
}

/**
 * The persistent progress RING, rendered in the tab header just left of the
 * support logo. Present whenever a download is running; tap it to bring the
 * banner back.
 */
export function HeaderDownloadRing() {
  const downloads = useDownloads();
  const agg = aggregate(downloads);
  if (!agg) return null;
  return (
    <AnimatedPressable
      onPress={() => {
        haptics.tap();
        setBannerExpanded(true);
      }}
      style={{ marginRight: 14 }}
      accessibilityRole="button"
      accessibilityLabel={`${t('downloads.downloading') || 'Downloading'} ${Math.round(agg.avg * 100)}%`}
    >
      <ProgressCircle progress={agg.avg} size={28} />
    </AnimatedPressable>
  );
}

/**
 * The app-wide BANNER. Slides in when a download starts (or when the ring is
 * tapped), then after a few seconds collapses toward the top-right, where the
 * header ring takes over. Hidden on the Models/Setup screens, which already show
 * inline progress.
 */
export function DownloadBanner() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const path = usePathname();
  const downloads = useDownloads();
  const expanded = useBannerExpanded();
  const agg = aggregate(downloads);

  const prevIds = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A newly-started download pops the banner open; the last one finishing closes it.
  useEffect(() => {
    const ids = agg ? agg.ids : [];
    const now = new Set(ids);
    let isNew = false;
    now.forEach((id) => {
      if (!prevIds.current.has(id)) isNew = true;
    });
    prevIds.current = now;
    if (isNew) setBannerExpanded(true);
    if (ids.length === 0) setBannerExpanded(false);
  }, [downloads]);

  // While open, arm the auto-collapse to the ring. Tapping the ring re-opens,
  // which re-arms this.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (expanded) timer.current = setTimeout(() => setBannerExpanded(false), 3500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [expanded]);

  const open = useSharedValue(0);
  useEffect(() => {
    open.value = withTiming(expanded ? 1 : 0, { duration: 240 });
  }, [expanded]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: open.value,
    transform: [
      { translateY: (1 - open.value) * -12 },
      // bias the shrink toward the top-right, where the ring sits
      { translateX: (1 - open.value) * 90 },
      { scale: 0.8 + open.value * 0.2 },
    ],
  }));

  const onModelsOrSetup = !!path && (path.includes('models') || path.includes('setup'));
  if (!agg || onModelsOrSetup) return null;

  const pct = Math.round(agg.avg * 100);
  const label = labelFor(agg.primaryId);
  const downloadingText = (t('downloads.downloadingModel') || 'Downloading {model}').replace('{model}', label);

  return (
    <View pointerEvents="box-none" style={[styles.overlay, { top: insets.top + 52 }]}>
      <Animated.View pointerEvents={expanded ? 'auto' : 'none'} style={animStyle}>
        <Pressable
          onPress={() => {
            haptics.tap();
            setBannerExpanded(false);
            router.push('/models' as any);
          }}
          style={[styles.card, { backgroundColor: theme.background, borderColor: theme.divider }]}
          accessibilityRole="button"
          accessibilityLabel={`${downloadingText} ${pct}%`}
        >
          <ProgressCircle progress={agg.avg} size={40} />
          <Text numberOfLines={1} style={[styles.title, { color: theme.text, flex: 1, marginLeft: SPACING.md }]}>
            {downloadingText}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: SPACING.md, right: SPACING.md, zIndex: 100 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  title: { fontSize: 15, fontWeight: '600' },
});
