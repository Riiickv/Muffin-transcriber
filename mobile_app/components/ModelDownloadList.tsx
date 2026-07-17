import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { Text } from '@/components/Themed';
import { useTheme } from '@/components/ThemeProvider';
import { Icon } from '@/components/Icon';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { SuggestedGlow } from '@/components/SuggestedGlow';
import { ModelManager, ModelDef } from '@/utils/ModelManager';
import { formatEta } from '@/utils/format';
import { RADIUS, SPACING } from '@/constants/tokens';
import { haptics } from '@/utils/haptics';
import { t } from '@/utils/i18n';
import { StyleSheet } from 'react-native';

/**
 * A downloadable list of models, with progress, speed and ETA.
 *
 * Extracted so the Models screen and the first-run setup are the SAME list. The
 * download logic here is fiddly — throttled speed sampling, ETA, delete-vs-get,
 * cleanup on failure — and a second copy of it in the setup would drift from
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
  const [downloadProgress, setDownloadProgress] = useState<Record<string, DownloadInfo>>({});
  const [downloadedModels, setDownloadedModels] = useState<Record<string, boolean>>({});
  const lastDownloadUpdate = useRef<Record<string, { time: number; written: number }>>({});

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

  const handleDownload = async (modelId: string, url: string) => {
    haptics.tap();
    if (downloadedModels[modelId]) {
      await ModelManager.deleteModel(modelId);
      setDownloadedModels((prev) => ({ ...prev, [modelId]: false }));
      setDownloadProgress((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
      return;
    }

    try {
      setDownloadProgress((prev) => ({
        ...prev,
        [modelId]: { progress: 0.01, written: 0, total: 1, speed: 0, eta: 0 },
      }));
      lastDownloadUpdate.current[modelId] = { time: Date.now(), written: 0 };

      await ModelManager.startDownload(url, modelId, (info) => {
        const now = Date.now();
        const last = lastDownloadUpdate.current[modelId];
        let speed = 0;
        let eta = 0;
        if (last && now - last.time > 500) {
          speed = (info.written - last.written) / ((now - last.time) / 1000);
          eta = speed > 0 ? (info.total - info.written) / speed : 0;
          lastDownloadUpdate.current[modelId] = { time: now, written: info.written };
        }
        setDownloadProgress((prev) => {
          const prevInfo = prev[modelId] ?? { speed: 0, eta: 0, progress: 0, written: 0, total: 0 };
          return {
            ...prev,
            [modelId]: { ...info, speed: speed > 0 ? speed : prevInfo.speed, eta: speed > 0 ? eta : prevInfo.eta },
          };
        });
      });

      setDownloadedModels((prev) => ({ ...prev, [modelId]: true }));
      setDownloadProgress((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
      haptics.success();
    } catch (e) {
      console.error('Download failed', e);
      haptics.error();
      setDownloadProgress((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
    }
  };

  return (
    <>
      {models.map((model) => {
        const row = (
          <ModelRow
            model={model}
            downloaded={!!downloadedModels[model.id]}
            info={downloadProgress[model.id]}
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
 * to its label — so "Get", "Delete" and "Downloading" each rendered a different
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
      : `${model.size} · ${model.description}`;

  return (
    <View>
      <View style={styles.row}>
        <View style={{ flex: 1, paddingRight: SPACING.md }}>
          <Text style={styles.name}>{model.name}</Text>
          <Text style={[styles.sub, { color: theme.textMuted }]} numberOfLines={2}>
            {subtitle}
          </Text>
        </View>

        <AnimatedPressable
          onPress={onPress}
          disabled={isDownloading}
          accessibilityRole="button"
          accessibilityLabel={`${downloaded ? t('settings.delete') : t('settings.get')} ${model.name}`}
          style={[
            styles.action,
            {
              backgroundColor: isDownloading ? theme.surface : downloaded ? theme.dangerSurface : theme.tint,
              borderColor: downloaded && !isDownloading ? theme.danger : 'transparent',
              borderWidth: downloaded && !isDownloading ? 1 : 0,
            },
          ]}
        >
          {isDownloading ? (
            <Text style={[styles.actionText, { color: theme.textMuted }]}>{pct}%</Text>
          ) : downloaded ? (
            <Icon name="delete" size={18} color={theme.danger} />
          ) : (
            <Text style={[styles.actionText, { color: theme.tintForeground }]}>{t('settings.get')}</Text>
          )}
        </AnimatedPressable>
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
