import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from './Themed';
import { useTheme } from './ThemeProvider';
import { Card } from './Card';
import { Icon, IconName } from './Icon';
import { AnimatedPressable } from './AnimatedPressable';
import { RADIUS, SPACING } from '@/constants/tokens';

/**
 * A titled card holding related settings, hairline-divided.
 *
 * This is the pattern both platforms converged on, and the reason is legibility
 * at a glance: a heading + a bounded surface says "these four things belong
 * together" without the user reading a word. A flat list of 15 controls under
 * one heading says nothing, however tidy the spacing.
 * (developer.android.com/design/ui/mobile/guides/patterns/settings)
 */
export const SettingsGroup = ({
  title,
  children,
  index,
  footer,
}: {
  title?: string;
  children: React.ReactNode;
  /** Stagger position — passed through to Card. */
  index?: number;
  /** Small explanatory line under the card. Use for caveats, not labels. */
  footer?: string;
}) => {
  const { theme } = useTheme();
  const rows = React.Children.toArray(children).filter(Boolean);

  return (
    <View style={{ marginBottom: SPACING.xl }}>
      {!!title && (
        <Text style={[styles.groupTitle, { color: theme.textMuted }]}>{title}</Text>
      )}
      <Card padded={false} index={index}>
        {rows.map((row, i) => (
          <React.Fragment key={i}>
            {i > 0 && <View style={[styles.divider, { backgroundColor: theme.divider }]} />}
            {row}
          </React.Fragment>
        ))}
      </Card>
      {!!footer && (
        <Text style={[styles.footer, { color: theme.textSubtle }]}>{footer}</Text>
      )}
    </View>
  );
};

type RowTone = 'default' | 'danger';

interface SettingsRowProps {
  label: string;
  description?: string;
  /** Leading icon. Optional — use sparingly, only where it aids scanning. */
  icon?: IconName;
  /** Control on the right: a switch, etc. */
  right?: React.ReactNode;
  /** Current value, shown greyed on the right. Pairs with `chevron`. */
  value?: string;
  /** Show a > affordance. Implied when `onPress` is set and there's no `right`. */
  chevron?: boolean;
  onPress?: () => void;
  tone?: RowTone;
  disabled?: boolean;
}

/**
 * One line in a SettingsGroup. Label (+ description) left, control right —
 * one layout for every kind of setting, so the eye can scan a single column
 * of labels instead of re-parsing each row.
 */
export const SettingsRow = ({
  label,
  description,
  icon,
  right,
  value,
  chevron,
  onPress,
  tone = 'default',
  disabled,
}: SettingsRowProps) => {
  const { theme } = useTheme();
  const fg = tone === 'danger' ? theme.danger : theme.text;
  const showChevron = chevron ?? (!!onPress && !right);

  const body = (
    <View style={[styles.row, { opacity: disabled ? 0.45 : 1 }]}>
      {!!icon && (
        <Icon
          name={icon}
          size={20}
          color={tone === 'danger' ? theme.danger : theme.textMuted}
          style={{ marginRight: SPACING.md }}
        />
      )}
      <View style={styles.labelWrap}>
        <Text style={[styles.label, { color: fg }]}>{label}</Text>
        {!!description && (
          <Text style={[styles.description, { color: theme.textMuted }]}>{description}</Text>
        )}
      </View>

      {!!value && (
        <Text numberOfLines={1} style={[styles.value, { color: theme.textMuted }]}>
          {value}
        </Text>
      )}
      {right}
      {showChevron && (
        <Icon name="chevron-right" size={18} color={theme.textSubtle} style={{ marginLeft: SPACING.xs }} />
      )}
    </View>
  );

  if (!onPress || disabled) return body;
  return (
    <AnimatedPressable onPress={onPress} scaleTo={0.99} style={{ borderRadius: RADIUS.sm }}>
      {body}
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  groupTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    // Inset so the rule reads as a separator between rows, not a cut across
    // the whole card.
    marginLeft: SPACING.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    minHeight: 56,
  },
  labelWrap: {
    flex: 1,
    paddingRight: SPACING.md,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
  },
  description: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  value: {
    fontSize: 14,
    maxWidth: 130,
  },
  footer: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: SPACING.sm,
    marginLeft: SPACING.xs,
  },
});
