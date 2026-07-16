import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/Themed';
import { useTheme } from '@/components/ThemeProvider';
import { Button } from '@/components/Button';
import { FadeInView } from '@/components/FadeInView';
import { ModelDownloadList } from '@/components/ModelDownloadList';
import { WHISPER_MODELS, FORMATTER_MODELS, CHAT_MODELS, EMBEDDING_MODELS } from '@/utils/ModelManager';
import { withRecommendedFirst, recommendedModelId } from '@/utils/deviceTier';
import { SPACING, RADIUS, TAB_BAR_SPACE } from '@/constants/tokens';
import { useResponsive } from '@/hooks/useResponsive';
import { haptics } from '@/utils/haptics';
import { t } from '@/utils/i18n';

/**
 * First-run setup: pick the models that make the app work.
 *
 * Three pages rather than one long list, because "download four AI models" is
 * the single most alien thing this app asks of anyone, and a wall of eleven
 * options with sizes in gigabytes is where a normal person closes the app. One
 * question per page, each with a suggestion already picked out for their phone.
 *
 * No Skip: the models ARE the app. Nothing here works without them, and a skip
 * button would only lead to a screen that can't do anything.
 *
 * Downloads keep running as you page through — they're hundreds of megabytes,
 * and a wizard that made you sit and watch each one would be slower than no
 * wizard at all.
 */
export default function SetupScreen() {
  const { theme } = useTheme();
  const { contentWidth } = useResponsive();
  // headerShown is false here, so nothing else is keeping content out of the
  // notch or off the gesture bar - the navigator's header normally does that.
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);

  const chatSuggestion = recommendedModelId('chat');

  const pages = [
    {
      title: t('setup.transcriberTitle'),
      body: t('setup.transcriberBody'),
      content: (
        <ModelDownloadList
          models={withRecommendedFirst(WHISPER_MODELS, 'whisper')}
          highlightId={recommendedModelId('whisper')}
        />
      ),
    },
    {
      title: t('setup.formatterTitle'),
      body: t('setup.formatterBody'),
      content: (
        <ModelDownloadList
          models={withRecommendedFirst(FORMATTER_MODELS, 'formatter')}
          highlightId={recommendedModelId('formatter')}
        />
      ),
    },
    {
      title: t('setup.optionalTitle'),
      body: t('setup.optionalBody'),
      content: (
        <>
          <Text style={styles.sectionTitle}>{t('setup.chatSectionTitle')}</Text>
          {/* Chat models are the heavy ones. On a phone that can't carry any,
              saying so plainly beats suggesting one that would crawl — and the
              list stays, because it's their phone and their call. */}
          {!chatSuggestion && (
            <View style={[styles.warning, { borderColor: theme.divider }]}>
              <Text style={[styles.warningText, { color: theme.textMuted }]}>
                {t('setup.chatNoneSuggested')}
              </Text>
            </View>
          )}
          <ModelDownloadList
            models={withRecommendedFirst(CHAT_MODELS, 'chat')}
            highlightId={chatSuggestion}
          />

          <Text style={[styles.sectionTitle, { marginTop: SPACING.xl }]}>
            {t('setup.butlerSectionTitle')}
          </Text>
          <Text style={[styles.body, { color: theme.textMuted, textAlign: 'left', marginBottom: SPACING.sm }]}>
            {t('setup.butlerBody')}
          </Text>
          <ModelDownloadList
            models={withRecommendedFirst(EMBEDDING_MODELS, 'embedding')}
            highlightId={recommendedModelId('embedding')}
          />
        </>
      ),
    },
  ];

  const isLast = page === pages.length - 1;
  const current = pages[page];

  const goNext = () => {
    haptics.tap();
    if (isLast) {
      // Done — into the app. replace(), not push(): setup is not somewhere you
      // should be able to land back on with the system Back button.
      router.replace('/(tabs)' as any);
      return;
    }
    setPage((p) => p + 1);
  };

  const goBack = () => {
    haptics.tap();
    if (page === 0) {
      router.back();
      return;
    }
    setPage((p) => p - 1);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.wrap, { maxWidth: contentWidth, width: '100%', alignSelf: 'center' }]}>
        {/* Keyed on the page so each one fades in as its own screen — without
            it, only the text swaps and it reads as a glitch rather than a step. */}
        <FadeInView key={page} index={page} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>{current.title}</Text>
            <Text style={[styles.body, { color: theme.textMuted }]}>{current.body}</Text>
            <View style={{ height: SPACING.lg }} />
            {current.content}
          </ScrollView>
        </FadeInView>

        {/* Pinned: on a small phone the model list scrolls for a while, and a
            Next button at the bottom of it would be a hunt. */}
        <View
          style={[
            styles.footer,
            {
              borderTopColor: theme.divider,
              // Clear the gesture bar. Math.max because a phone with hardware
              // keys reports 0 and would otherwise leave the buttons flush
              // against the bottom edge.
              paddingBottom: Math.max(insets.bottom, SPACING.sm) + SPACING.md,
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Button variant="secondary" size="lg" style={{ height: 48 }} onPress={goBack}>
              {t('setup.back')}
            </Button>
          </View>
          <View style={{ width: SPACING.md }} />
          <View style={{ flex: 1 }}>
            <Button variant="primary" size="lg" style={{ height: 48 }} onPress={goNext}>
              {isLast ? t('setup.finish') : t('setup.next')}
            </Button>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  scroll: {
    padding: SPACING.lg,
    paddingTop: SPACING.xxl,
    paddingBottom: SPACING.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: SPACING.md,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: SPACING.sm,
  },
  warning: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  warningText: {
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    padding: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
