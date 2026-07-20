import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './Themed';
import { useTheme } from './ThemeProvider';
import { DialogCard } from './Dialog';
import { Icon } from './Icon';
import { RADIUS, SPACING } from '@/constants/tokens';
import { haptics } from '@/utils/haptics';
import { t } from '@/utils/i18n';

/**
 * "Starting X will stop Y."
 *
 * Shown when an AI action is tapped while another is running. The warning is
 * honest: confirming really does abort the running job (stopLlamaWork /
 * stopWhisperWork) rather than queueing behind it. Queueing was the old
 * behaviour and it read as the app ignoring the tap, since on a CPU-only
 * device the wait can be minutes.
 */
export function AiBusyDialog({
  visible,
  nextLabel,
  currentLabel,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  /** What they just tapped. */
  nextLabel: string;
  /** What's already running. */
  currentLabel: string;
  onCancel: () => void;
  /** `dontAsk` true when the box was ticked, so the caller can save it. */
  onConfirm: (dontAsk: boolean) => void;
}) {
  const { theme } = useTheme();
  const [dontAsk, setDontAsk] = useState(false);

  const message = (t('historyDetail.busyMessage') || 'Starting {next} will stop {current}.')
    .replace('{next}', nextLabel)
    .replace('{current}', currentLabel);

  return (
    <DialogCard
      visible={visible}
      onRequestClose={onCancel}
      icon="warning"
      title={t('historyDetail.busyTitle') || 'One at a time!'}
      message={message}
      buttons={[
        {
          label: t('historyDetail.busyConfirm') || 'Ok!',
          variant: 'primary',
          onPress: () => onConfirm(dontAsk),
        },
      ]}
    >
      <Pressable
        onPress={() => {
          haptics.tap();
          setDontAsk((v) => !v);
        }}
        style={styles.row}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: dontAsk }}
      >
        <View
          style={[
            styles.box,
            {
              borderColor: dontAsk ? theme.tint : theme.divider,
              backgroundColor: dontAsk ? theme.tint : 'transparent',
            },
          ]}
        >
          {dontAsk && <Icon name="check" size={14} color={theme.tintForeground} />}
        </View>
        <Text style={[styles.label, { color: theme.textMuted }]}>
          {t('historyDetail.busyDontAsk') || "Don't show this again"}
        </Text>
      </Pressable>
    </DialogCard>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: SPACING.xs,
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: RADIUS.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  label: { fontSize: 14 },
});
