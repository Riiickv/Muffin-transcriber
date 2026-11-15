import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { Text } from '@/components/Themed';
import { useTheme } from '@/components/ThemeProvider';
import { Icon } from '@/components/Icon';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { useDialog } from '@/components/Dialog';
import { ModelManager, ModelDef, modelName, modelDesc } from '@/utils/ModelManager';
import { useDownloads, startModelDownload, pauseDownload, resumeDownload, cancelDownload } from '@/utils/downloadManager';
import { formatEta } from '@/utils/format';
import { estimateFor, formatEstimateSeconds } from '@/utils/modelTimeEstimate';
import { getDeviceTier } from '@/utils/deviceTier';
import { averageSecondsByModel } from '@/utils/perfLog';
import { useSettings } from '@/utils/settingsStore';
import { RADIUS, SPACING, TYPE } from '@/constants/tokens';
import { haptics } from '@/utils/haptics';
import { t } from '@/utils/i18n';

/**
 * A downloadable list of models, with progress, speed and ETA.
 *
 * Extracted so the Models screen and the first-run setup are the SAME list. The
 * download logic here is fiddly - throttled speed sampling, ETA, delete-vs-get,
 * cleanup on failure - and a second copy of it in the setup would drift from
 * this one the first time either changed. That drift is what made the chat's
 * "Done" chip lie about work the executor never did.
 *
 * `highlightId` draws the glow: the setup marks the model suggested for the
 * device. Optional, because the Models screen shows the same list without one.
 */

interface DownloadInfo {
  progress: number;
  written: number;
  total: number;
  speed: number;
  eta: number;
  status?: 'downloading' | 'paused';
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export function ModelDownloadList({
  models,
  highlightId,
}: {
  models: readonly ModelDef[];
  /** Model to mark as suggested for this device. */
  highlightId?: string | null;
}) {
  // Progress comes from the module-level manager, not local state, so a download
  // started here keeps running (and keeps reporting) after you leave the screen.
  const dialog = useDialog();
  const { theme } = useTheme();
  const downloads = useDownloads();
  const [downloadedModels, setDownloadedModels] = useState<Record<string, boolean>>({});
  // Which models were downloading on the previous render. When one leaves the
  // active set we re-check the disk and flip its row - see the effect below.
  const activeIds = useRef<Set<string>>(new Set());

  // The time line, off unless asked for. The device tier and this phone's own
  // recorded averages are read once for the whole list rather than per row.
  const { settings } = useSettings();
  const showEstimate = settings.showModelTimeEstimate;
  const [measured, setMeasured] = useState<Record<string, number>>({});
  useFocusEffect(
    useCallback(() => {
      if (!showEstimate) return;
      let active = true;
      // The running average, not the capped run list: it folds in every run
      // ever, so this number gets better each time you use the model.
      averageSecondsByModel().then((avgs) => {
        if (active) setMeasured(avgs);
      });
      return () => {
        active = false;
      };
    }, [showEstimate])
  );

  /**
   * One line, or nothing at all.
   *
   * Nothing is the right answer for a model the estimator does not know: a
   * confident guess about a model nobody has characterised is worse than
   * silence. When this phone has its own average, it says so and drops the
   * "about", because it is no longer an estimate.
   */
  const estimateLine = (modelId: string, ownAverage?: number): string | null => {
    const e = estimateFor(modelId, getDeviceTier(), ownAverage);
    if (!e) return null;
    const time = formatEstimateSeconds(e.seconds);
    const key = e.measured
      ? e.per === 'recording'
        ? 'models.measuredPerRecording'
        : 'models.measuredPerMinute'
      : e.per === 'recording'
        ? 'models.estimatePerRecording'
        : 'models.estimatePerMinute';
    const fallback = e.measured
      ? e.per === 'recording'
        ? '{t} per recording on this phone'
        : '{t} per minute of recording on this phone'
      : e.per === 'recording'
        ? 'about {t} per recording'
        : 'about {t} per minute of recording';
    return (t(key) || fallback).replace('{t}', time);
  };

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const check = async () => {
        await ModelManager.init();
        const status: Record<string, boolean> = {};
        for (const m of models) {
          status[m.id] = await ModelManager.isModelDownloaded(m.id);
        }
        if (active) setDownloadedModels(status);
      };
      check();
      return () => {
        active = false;
      };
    }, [models])
  );

  // A download leaving the active set means it finished or failed. Ask the disk
  // which: installed -> the row becomes "Delete" and we buzz success; missing ->
  // it failed and the row goes back to "Get". This is also what catches a
  // download that completed while you were watching (the focus check covers ones
  // that finished while you were away).
  useEffect(() => {
    const nowActive = new Set(Object.keys(downloads));
    activeIds.current.forEach((id) => {
      if (!nowActive.has(id)) {
        ModelManager.isModelDownloaded(id).then((done) => {
          setDownloadedModels((prev) => ({ ...prev, [id]: done }));
          if (done) haptics.success();
        });
      }
    });
    activeIds.current = nowActive;
  }, [downloads]);

  const handleDownload = (model: ModelDef) => {
    haptics.tap();
    if (!downloadedModels[model.id]) {
      startModelDownload(model.id, model.url);
      return;
    }
    // Ask first. One stray tap used to delete the file on the spot, and for
    // the largest model that is close to a gigabyte to download again.
    dialog.show({
      title: modelName(model),
      message: (t('chat.deleteMessage') || 'Delete "{name}"?').replace('{name}', modelName(model)),
      icon: 'delete',
      iconTone: 'danger',
      buttons: [
        { label: t('common.cancel') || 'Cancel', variant: 'secondary' },
        {
          label: t('common.delete') || 'Delete',
          variant: 'danger',
          onPress: async () => {
            await ModelManager.deleteModel(model.id);
            setDownloadedModels((prev) => ({ ...prev, [model.id]: false }));
          },
        },
      ],
    });
  };

  return (
    <>
      {models.map((model, i) => (
        <View key={model.id}>
          {i > 0 && <View style={[styles.rule, { backgroundColor: theme.divider }]} />}
          <ModelRow
            model={model}
            highlighted={model.id === highlightId}
            downloaded={!!downloadedModels[model.id]}
            info={downloads[model.id]}
            estimate={showEstimate ? estimateLine(model.id, measured[model.id]) : null}
            onPress={() => handleDownload(model)}
          />
        </View>
      ))}
    </>
  );
}

/**
 * The action is a FIXED-WIDTH pill. It used to be a plain <Button>, which sizes
 * to its label - so "Get", "Delete" and "Downloading" each rendered a different
 * width and the list's right edge zig-zagged. One control, three states, one box.
 */
const ModelRow = ({
  model,
  highlighted,
  downloaded,
  info,
  estimate,
  onPress,
}: {
  model: ModelDef;
  /** The one suggested for this device. */
  highlighted?: boolean;
  downloaded: boolean;
  info?: DownloadInfo;
  /** Pre-built time line, or null when the setting is off or unknown. */
  estimate?: string | null;
  onPress: () => void;
}) => {
  const { theme } = useTheme();
  const isDownloading = info !== undefined;
  const pct = isDownloading && info!.total > 1 ? Math.round(info!.progress * 100) : 0;

  const subtitle =
    isDownloading && info!.total > 1
      ? `${formatBytes(info!.written)} / ${formatBytes(info!.total)} · ${formatBytes(info!.speed)}/s · ${formatEta(info!.eta)}`
      : `${model.size} · ${modelDesc(model)}`;

  return (
    // The suggested model is a tinted block, not an outline. It was a pulsing
    // 2px ring drawn 3dp outside the row, which overlapped the card it sat in
    // and never stopped moving.
    <View style={highlighted ? [styles.highlight, { backgroundColor: theme.tintFill }] : null}>
      <View style={[styles.row, highlighted && styles.rowInset]}>
        <View style={{ flex: 1, paddingRight: SPACING.md }}>
          <Text style={[styles.name, highlighted && { color: theme.tintText }]}>{modelName(model)}</Text>
          <Text style={[styles.sub, { color: theme.textMuted }]} numberOfLines={2}>
            {subtitle}
          </Text>
          {/* Its own line, under the description, and only when asked for. It
              is not appended to the description because a timing claim and an
              accuracy claim are different claims and should be separable. Never
              while downloading: a progress line and a speed guess in the same
              place is two numbers competing to be read. */}
          {estimate && !isDownloading ? (
            <Text style={[styles.est, { color: theme.tintText }]} numberOfLines={1}>
              {estimate}
            </Text>
          ) : null}
        </View>

        {isDownloading ? (
          <View style={styles.controls}>
            <Text style={[styles.actionText, { color: theme.textMuted, marginRight: SPACING.xs }]}>{pct}%</Text>
            <AnimatedPressable
              onPress={() => {
                haptics.tap();
                if (info!.status === 'paused') resumeDownload(model.id);
                else pauseDownload(model.id);
              }}
              style={styles.ctrlBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={info!.status === 'paused' ? t('downloads.resume') || 'Resume' : t('downloads.pause') || 'Pause'}
            >
              <Icon name={info!.status === 'paused' ? 'play' : 'pause'} size={22} color={theme.text} />
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => {
                haptics.tap();
                cancelDownload(model.id);
              }}
              style={styles.ctrlBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('downloads.cancel') || 'Cancel'}
            >
              <Icon name="close" size={22} color={theme.textMuted} />
            </AnimatedPressable>
          </View>
        ) : (
          <AnimatedPressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`${downloaded ? t('settings.delete') : t('settings.get')} ${modelName(model)}`}
            style={downloaded ? styles.remove : [styles.action, { backgroundColor: theme.tint }]}
          >
            {/* Installed is the normal state, so it is quiet: a plain bin, no
                red pill. Red is kept for the confirmation, where it means
                something. */}
            {downloaded ? (
              <Icon name="delete" size={22} color={theme.textMuted} />
            ) : (
              <Text style={[styles.actionText, { color: theme.tintForeground }]}>{t('settings.get')}</Text>
            )}
          </AnimatedPressable>
        )}
      </View>

      {isDownloading && info!.total > 1 && (
        <View style={[styles.track, { backgroundColor: theme.surface }]}>
          <View style={{ width: `${info!.progress * 100}%`, height: '100%', backgroundColor: theme.tint }} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  // Accent-coloured, because it is the one number on the row that changes what
  // you would choose. Smaller than the description so it reads as an annotation.
  est: {
    fontSize: TYPE.caption,
    marginTop: 2,
  },
  scroll: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    minHeight: 64,
  },
  name: {
    fontSize: TYPE.body,
    fontWeight: '600',
  },
  sub: {
    fontSize: TYPE.caption,
    marginTop: 2,
    lineHeight: 18,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    marginLeft: SPACING.lg,
  },
  highlight: {
    margin: 6,
    borderRadius: RADIUS.md,
  },
  // Same text position as an ordinary row: the 6dp the block is inset by comes
  // off the padding.
  rowInset: {
    paddingVertical: SPACING.md - 6,
    paddingHorizontal: SPACING.lg - 6,
    minHeight: 52,
  },
  remove: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: {
    minWidth: 72,
    height: 40,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ctrlBtn: {
    padding: SPACING.xs,
    marginLeft: SPACING.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  track: {
    height: 3,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    borderRadius: 2,
    overflow: 'hidden',
  },
});
