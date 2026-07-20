import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { Text } from '@/components/Themed';
import { useTheme } from '@/components/ThemeProvider';
import { Icon } from '@/components/Icon';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { SuggestedGlow } from '@/components/SuggestedGlow';
import { ModelManager, ModelDef, modelName, modelDesc } from '@/utils/ModelManager';
import { useDownloads, startModelDownload, pauseDownload, resumeDownload, cancelDownload } from '@/utils/downloadManager';
import { formatEta } from '@/utils/format';
import { RADIUS, SPACING } from '@/constants/tokens';
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
  const downloads = useDownloads();
  const [downloadedModels, setDownloadedModels] = useState<Record<string, boolean>>({});
  // Which models were downloading on the previous render. When one leaves the
  // active set we re-check the disk and flip its row - see the effect below.
  const activeIds = useRef<Set<string>>(new Set());

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

  const handleDownload = async (modelId: string, url: string) => {
    haptics.tap();
    if (downloadedModels[modelId]) {
      await ModelManager.deleteModel(modelId);
      setDownloadedModels((prev) => ({ ...prev, [modelId]: false }));
      return;
    }
    // Hand it to the manager and walk away. It owns the download from here, so
    // leaving this screen no longer stops it; progress flows back via useDownloads.
    startModelDownload(modelId, url);
  };

  return (
    <>
      {models.map((model) => {
        const row = (
          <ModelRow
            model={model}
            downloaded={!!downloadedModels[model.id]}
            info={downloads[model.id]}
            onPress={() => handleDownload(model.id, model.url)}
          />
        );
        return (
          <View key={model.id}>
            {model.id === highlightId ? <SuggestedGlow>{row}</SuggestedGlow> : row}
          </View>
        );
      })}
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
  downloaded,
  info,
  onPress,
}: {
  model: ModelDef;
  downloaded: boolean;
  info?: DownloadInfo;
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
    <View>
      <View style={styles.row}>
        <View style={{ flex: 1, paddingRight: SPACING.md }}>
          <Text style={styles.name}>{modelName(model)}</Text>
          <Text style={[styles.sub, { color: theme.textMuted }]} numberOfLines={2}>
            {subtitle}
          </Text>
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
            style={[
              styles.action,
              {
                backgroundColor: downloaded ? theme.dangerSurface : theme.tint,
                borderColor: downloaded ? theme.danger : 'transparent',
                borderWidth: downloaded ? 1 : 0,
              },
            ]}
          >
            {downloaded ? (
              <Icon name="delete" size={18} color={theme.danger} />
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
    fontSize: 15,
    fontWeight: '600',
  },
  sub: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  action: {
    width: 64,
    height: 32,
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
    fontSize: 13,
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
