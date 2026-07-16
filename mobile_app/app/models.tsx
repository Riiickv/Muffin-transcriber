import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';

import { useTheme } from '@/components/ThemeProvider';
import { SettingsGroup } from '@/components/SettingsGroup';
import { ModelDownloadList } from '@/components/ModelDownloadList';
import { WHISPER_MODELS, FORMATTER_MODELS, CHAT_MODELS, EMBEDDING_MODELS, ModelDef } from '@/utils/ModelManager';
import { withRecommendedFirst, recommendedModelId, ModelGroup } from '@/utils/deviceTier';
import { SPACING } from '@/constants/tokens';
import { useResponsive } from '@/hooks/useResponsive';
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
 *
 * The list is ModelDownloadList, shared with the first-run setup — the same
 * list, not two that resemble each other.
 */
export default function ModelsScreen() {
  const { theme } = useTheme();
  const { contentWidth } = useResponsive();

  // Suggested first, and glowing. Here you're choosing what to run on YOUR
  // phone, not browsing a catalog, so the one that fits should be the one you
  // reach first.
  const group = (title: string, models: readonly ModelDef[], groupKey: ModelGroup, index: number) => (
    <SettingsGroup title={title} index={index}>
      <ModelDownloadList
        models={withRecommendedFirst(models, groupKey)}
        highlightId={recommendedModelId(groupKey)}
      />
    </SettingsGroup>
  );

  // Capped: sceneStyle only covers tabs, and this is a pushed screen.
  return (
    <View style={{ flex: 1, backgroundColor: theme.background, maxWidth: contentWidth, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: t('settings.segmentModels') }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {group(t('settings.whisperModelsHeader'), WHISPER_MODELS, 'whisper', 0)}
        {group(t('settings.formatterModelsHeader'), FORMATTER_MODELS, 'formatter', 1)}
        {group(t('settings.chatModelsHeader'), CHAT_MODELS, 'chat', 2)}
        {group(t('settings.embeddingModelsHeader'), EMBEDDING_MODELS, 'embedding', 3)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },
});
