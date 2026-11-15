import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { TextInput } from './Themed';
import * as IntentLauncher from 'expo-intent-launcher';

import { Text } from './Themed';
import { useTheme } from './ThemeProvider';
import { useDialog, DialogCard } from './Dialog';
import { RADIUS, SPACING } from '@/constants/tokens';
import { t } from '@/utils/i18n';
import { intentFor, isAlarm } from '@/utils/entityExtraction';
import type { ActionableEntity } from '@/utils/entityExtraction';
import { formatWhen } from '@/utils/format';

export type ActionableEntityLike = ActionableEntity;

/**
 * "Add to Calendar / Add to Alarms" for a tapped date or time highlight.
 *
 * Extracted from the History detail and the Chat screen, which each carried
 * their own copy - and chat's was a hand-rolled overlay that didn't match the
 * app's dialogs (it now gets this one, so the two entry points finally look
 * the same). Owns the editable event name and the intent launching; a caller
 * only tracks WHICH entity is active.
 *
 * The dialog shows the day and hour the Butler worked out, and the calendar or
 * clock opens with them already filled in (utils/entityExtraction intentFor).
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

  const alarm = entity ? isAlarm(entity) : false;

  const submit = async () => {
    if (!entity) return;
    const finalName = name.trim() || entity.name;
    try {
      const intent = intentFor(entity, finalName);
      await IntentLauncher.startActivityAsync(intent.action, {
        ...(intent.data ? { data: intent.data } : {}),
        extra: intent.extra,
      });
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

  // The resolved value first, then the words it was read from.
  const message = entity
    ? entity.when
      ? `${formatWhen(entity.when)}\n"${entity.quote}"`
      : `"${entity.quote}"`
    : undefined;

  return (
    <DialogCard
      visible={entity !== null}
      onRequestClose={onClose}
      icon={alarm ? 'warning' : 'history'}
      title={`${t('chat.addTo') || 'Add to'} ${alarm ? (t('chat.alarms') || 'Alarms') : (t('chat.calendar') || 'Calendar')}`}
      message={message}
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
