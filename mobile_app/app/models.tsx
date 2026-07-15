import { ScrollView, StyleSheet, View } from 'react-native';
import { useCallback, useRef, useState } from 'react';
import { Stack, useFocusEffect } from 'expo-router';

import { Text } from '@/components/Themed';
import { useTheme } from '@/components/ThemeProvider';
import { Icon } from '@/components/Icon';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { SettingsGroup } from '@/components/SettingsGroup';
import { ModelManager, WHISPER_MODELS, FORMATTER_MODELS, CHAT_MODELS, EMBEDDING_MODELS, ModelDef } from '@/utils/ModelManager';
import { formatEta } from '@/utils/format';
import { RADIUS, SPACING } from '@/constants/tokens';
import { useResponsive } from '@/hooks/useResponsive';
import { haptics } from '@/utils/haptics';
import { t } from '@/utils/i18n';

/**
 * Model downloads — its own screen, pushed from Settings.
 *
 * Was a segmented control inside Settings, which made two unrelated things
 * share one scroll: Preferences is a list of small choices you tweak, Models is
 * a download manager with progress bars and multi-GB transfers. The switcher
 * also had to live pinned above the floating tab bar, where it clipped the last
 * card. Android's own guidance is to push a subscreen once a settings page runs
 * long, rather than tab within it.
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

export default function ModelsScreen() {
  const { theme } = useTheme();
  const { contentWidth } = useResponsive();
  const [downloadProgress, setDownloadProgress] = useState<Record<string, DownloadInfo>>({});
  const [downloadedModels, setDownloadedModels] = useState<Record<string, boolean>>({});
  const lastDownloadUpdate = useRef<Record<string, { time: number; written: number }>>({});

  useFocusEffect(
    useCallback(() => {
      const check = async () => {
        await ModelManager.init();
        const status: Record<string, boolean> = {};
        for (const m of [...WHISPER_MODELS, ...FORMATTER_MODELS, ...CHAT_MODELS, ...EMBEDDING_MODELS]) {
          status[m.id] = await ModelManager.isModelDownloaded(m.id);
        }
        setDownloadedModels(status);
      };
      check();
    }, [])
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
      setDownloadProgress((prev) => ({ ...prev, [modelId]: { progress: 0.01, written: 0, total: 1, speed: 0, eta: 0 } }));
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

  const group = (title: string, models: readonly ModelDef[], index: number) => (
    <SettingsGroup title={title} index={index}>
      {models.map((model) => (
        <ModelRow
          key={model.id}
          model={model}
          downloaded={!!downloadedModels[model.id]}
          info={downloadProgress[model.id]}
          onPress={() => handleDownload(model.id, model.url)}
        />
      ))}
    </SettingsGroup>
  );

  // Capped: sceneStyle only covers tabs, and this is a pushed screen.
  return (
    <View style={{ flex: 1, backgroundColor: theme.background, maxWidth: contentWidth, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: t('settings.segmentModels') }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {group(t('settings.whisperModelsHeader'), WHISPER_MODELS, 0)}
        {group(t('settings.formatterModelsHeader'), FORMATTER_MODELS, 1)}
        {group(t('settings.chatModelsHeader'), CHAT_MODELS, 2)}
        {group(t('settings.embeddingModelsHeader'), EMBEDDING_MODELS, 3)}
      </ScrollView>
    </View>
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
            <Text style={[styles.actionText, { color: '#000000' }]}>{t('settings.get')}</Text>
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
