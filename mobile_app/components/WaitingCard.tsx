import { useEffect, useRef } from 'react';
import { Animated, ScrollView } from 'react-native';

import { Text } from './Themed';
import { useTheme } from './ThemeProvider';
import { Button } from './Button';
import { MuffinSpinner } from './MuffinSpinner';
import { useDialog } from './Dialog';
import { MOTION, SPACING } from '@/constants/tokens';
import { haptics } from '@/utils/haptics';
import { openSupportPage } from '@/utils/support';
import { t } from '@/utils/i18n';

// Shown inside the transcript box while transcription/formatting runs:
// spinner, "While you're waiting...", the current status, and the support
// button. Transcription is minutes of dead time, which is the one moment
// someone is genuinely idle and looking at the screen.
// A ScrollView so it can never paint outside a short container (RN views
// don't clip overflowing children).
export function WaitingCard({ status }: { status?: string }) {
  const { theme } = useTheme();
  const dialog = useDialog();

  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, useNativeDriver: true, ...MOTION.timingBase }).start();
  }, [fade]);

  return (
    <Animated.View style={{ flex: 1, opacity: fade }}>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.md }}
      showsVerticalScrollIndicator={false}
    >
      <MuffinSpinner size={40} />
      <Text style={{ fontSize: 16, fontWeight: 'bold', marginTop: SPACING.sm, textAlign: 'center' }}>
        {t('transcribe.whileWaiting') || "While you're waiting..."}
      </Text>
      {!!status && (
        <Text style={{ fontSize: 14, color: theme.textMuted, textAlign: 'center', marginTop: SPACING.xs }}>
          {status}
        </Text>
      )}
      <Button
        variant="primary"
        size="md"
        // Explicit height: an unsized Button inside this centered container
        // balloons to fill it (AnimatedPressable's inner surface uses flexGrow).
        style={{ marginTop: SPACING.lg, height: 44 }}
        onPress={() => {
          haptics.tap();
          // Confirm before leaving: transcription is still running behind this
          // card, so the tap shouldn't yank them out of the app unannounced.
          dialog.show({
            title: t('transcribe.supportMe') || 'Support me!',
            message: t('transcribe.supportDesc'),
            icon: 'favorite',
            iconTone: 'primary',
            secondaryAction: { label: t('transcribe.supportCancel') || 'Maybe later', onPress: () => {} },
            primaryAction: { label: t('settings.supportButton') || 'Buy a coffee', onPress: openSupportPage },
          });
        }}
      >
        {t('transcribe.supportMe') || 'Support me!'}
      </Button>
    </ScrollView>
    </Animated.View>
  );
}
