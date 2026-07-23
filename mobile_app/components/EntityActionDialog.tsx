import { useEffect, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';

import { Text } from './Themed';
import { useTheme } from './ThemeProvider';
import { useDialog, DialogCard } from './Dialog';
import { RADIUS, SPACING } from '@/constants/tokens';
import { t } from '@/utils/i18n';

export type ActionableEntityLike = { quote: string; name: string; type: 'date' | 'time' };

/**
 * "Add to Calendar / Add to Alarms" for a tapped date or time highlight.
 *
 * Extracted from the History detail and the Chat screen, which each carried
 * their own copy - and chat's was a hand-rolled overlay that didn't match the
 * app's dialogs (it now gets this one, so the two entry points finally look
 * the same). Owns the editable event name and the intent launching; a caller
 * only tracks WHICH entity is active.
 */
export function EntityActionDialog({
  entity,
  onClose,
}: {
  entity: ActionableEntityLike | null;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const dialog = useDialog();
  const [name, setName] = useState('');

  // A newly tapped entity starts from its own suggested name, never the
  // previous entity's edit.
  useEffect(() => setName(''), [entity]);

  const submit = async () => {
    if (!entity) return;
    const finalName = name.trim() || entity.name;
    try {
      if (entity.type === 'date') {
        await IntentLauncher.startActivityAsync('android.intent.action.INSERT', {
          data: 'content://com.android.calendar/events',
          extra: {
            title: finalName,
            description: `Quote: "${entity.quote}"`,
          },
        });
      } else {
        await IntentLauncher.startActivityAsync('android.intent.action.SET_ALARM', {
          extra: {
            'android.intent.extra.alarm.MESSAGE': finalName,
            'android.intent.extra.alarm.SKIP_UI': false,
          },
        });
      }
    } catch (e) {
      console.error(e);
      dialog.show({
        title: t('dialog.actionFailed.title') || 'Action failed',
        message: t('dialog.actionFailed.message') || 'Could not open the native app.',
        icon: 'warning',
        iconTone: 'danger',
      });
    }
    onClose();
  };

  return (
    <DialogCard
      visible={entity !== null}
      onRequestClose={onClose}
      icon={entity?.type === 'date' ? 'history' : 'warning'}
      title={`${t('chat.addTo') || 'Add to'} ${entity?.type === 'date' ? (t('chat.calendar') || 'Calendar') : (t('chat.alarms') || 'Alarms')}`}
      message={entity ? `"${entity.quote}"` : undefined}
      buttons={[
        { label: t('dialog.confirmDelete.cancel') || 'Cancel', variant: 'secondary', onPress: onClose },
        { label: t('chat.openNativeApp') || 'Open Native App', variant: 'primary', onPress: submit },
      ]}
    >
      <Text style={styles.label}>{t('chat.eventName') || 'Event Name'}</Text>
      <TextInput
        style={[styles.input, { color: theme.text, borderColor: theme.divider }]}
        value={name}
        onChangeText={setName}
        placeholder={entity?.name}
        placeholderTextColor={theme.textSubtle}
      />
    </DialogCard>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: SPACING.xs + 2,
    opacity: 0.8,
    alignSelf: 'flex-start',
  },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    fontSize: 16,
    marginTop: SPACING.sm,
    width: '100%',
  },
});
