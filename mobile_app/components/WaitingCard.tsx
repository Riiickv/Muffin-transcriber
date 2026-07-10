import { ActivityIndicator, ScrollView } from 'react-native';

import { Text } from './Themed';
import { useTheme } from './ThemeProvider';
import { Button } from './Button';
import { useDialog } from './Dialog';
import { SPACING } from '@/constants/tokens';
import { haptics } from '@/utils/haptics';
import { t } from '@/utils/i18n';

// Shown inside the transcript box while transcription/formatting runs:
// spinner, "While you're waiting...", the current status, and the ad button.
// A ScrollView so it can never paint outside a short container (RN views
// don't clip overflowing children).
export function WaitingCard({ status }: { status?: string }) {
  const { theme } = useTheme();
  const dialog = useDialog();

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg }}
      showsVerticalScrollIndicator={false}
    >
      <ActivityIndicator size="large" color={theme.tint} />
      <Text style={{ fontSize: 17, fontWeight: 'bold', marginTop: SPACING.lg, textAlign: 'center' }}>
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
        style={{ marginTop: SPACING.xl }}
        onPress={() => {
          haptics.tap();
          dialog.show({
            title: t('transcribe.watchAd') || 'Watch a quick Ad',
            message: t('transcribe.supportDesc') || 'This would play a short ad to support development.',
          });
        }}
      >
        {t('transcribe.watchAd') || 'Watch a quick Ad'}
      </Button>
    </ScrollView>
  );
}
