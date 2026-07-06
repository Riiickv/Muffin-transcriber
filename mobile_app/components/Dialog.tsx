import React, { createContext, useCallback, useContext, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { Text } from './Themed';
import { useTheme } from './ThemeProvider';
import { Button } from './Button';
import { Icon, IconName } from './Icon';
import { RADIUS, SPACING } from '@/constants/tokens';
import { t } from '@/utils/i18n';

export type DialogButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface DialogButton {
  label: string;
  variant?: DialogButtonVariant;
  onPress?: () => void;
}

interface DialogCardProps {
  visible: boolean;
  onRequestClose: () => void;
  title: string;
  message?: string;
  icon?: IconName;
  iconTone?: 'tint' | 'primary' | 'danger';
  buttons?: DialogButton[];
  /** Custom body rendered between the message and the buttons row. */
  children?: React.ReactNode;
  /** Called after the user taps a button (before the button's own onPress). */
  onDismiss?: () => void;
}

/**
 * The visual dialog surface — themed Modal card with icon / title / message /
 * optional body / buttons row. Used directly for dialogs that need custom
 * interactive content (like the entity add-to-calendar picker), and used
 * internally by DialogProvider for the imperative `dialog.show(...)` API.
 */
export const DialogCard = ({
  visible,
  onRequestClose,
  title,
  message,
  icon,
  iconTone,
  buttons,
  children,
  onDismiss,
}: DialogCardProps) => {
  const { theme } = useTheme();
  const iconColor = iconTone === 'danger' ? theme.danger : theme.tint;
  const resolvedButtons: DialogButton[] = buttons ?? [{ label: t('dialog.defaultOk') || 'OK', variant: 'primary' }];

  const dismiss = () => {
    onDismiss?.();
    onRequestClose();
  };

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.divider }]}>
          {icon && (
            <View style={styles.iconWrap}>
              <Icon name={icon} filled size={44} color={iconColor} />
            </View>
          )}
          <Text style={styles.title}>{title}</Text>
          {message && (
            <Text style={[styles.message, { color: theme.textMuted }]}>{message}</Text>
          )}
          {children && <View style={styles.body}>{children}</View>}
          <View style={styles.buttonsRow}>
            {resolvedButtons.map((btn, i) => (
              <View key={`${btn.label}-${i}`} style={{ flex: 1 }}>
                <Button
                  variant={btn.variant ?? (i === resolvedButtons.length - 1 ? 'primary' : 'secondary')}
                  size="lg"
                  onPress={() => {
                    onRequestClose();
                    btn.onPress?.();
                  }}
                >
                  {btn.label}
                </Button>
              </View>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Imperative API — use for stateless one-shots: alerts, confirms, error toasts.
// For dialogs that need a live input or other interactive body, use <DialogCard>
// directly and hold the visible state in the parent component.
// ---------------------------------------------------------------------------

export interface DialogConfig {
  title: string;
  message?: string;
  icon?: IconName;
  iconTone?: 'tint' | 'primary' | 'danger';
  buttons?: DialogButton[];
  /** Convenience: single primary action. Equivalent to `buttons: [primaryAction]`. */
  primaryAction?: DialogButton;
  /** Convenience: pairs with `primaryAction` to build a Cancel+Confirm layout. */
  secondaryAction?: DialogButton;
  onDismiss?: () => void;
}

interface DialogContextValue {
  show: (config: DialogConfig) => void;
  close: () => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export const DialogProvider = ({ children }: { children: React.ReactNode }) => {
  const [config, setConfig] = useState<DialogConfig | null>(null);

  const show = useCallback((next: DialogConfig) => setConfig(next), []);
  const close = useCallback(() => setConfig(null), []);

  // Merge the `buttons` array with the optional single-action props so callers
  // can use either API. `secondary` renders on the left, `primary` on the
  // right (last-button gets the accent color by DialogCard's default rule).
  const resolvedButtons: DialogButton[] | undefined = (() => {
    if (!config) return undefined;
    if (config.buttons && config.buttons.length > 0) return config.buttons;
    const list: DialogButton[] = [];
    if (config.secondaryAction) list.push({ variant: 'secondary', ...config.secondaryAction });
    if (config.primaryAction) list.push({ variant: 'primary', ...config.primaryAction });
    return list.length > 0 ? list : undefined;
  })();

  return (
    <DialogContext.Provider value={{ show, close }}>
      {children}
      <DialogCard
        visible={config !== null}
        onRequestClose={close}
        title={config?.title ?? ''}
        message={config?.message}
        icon={config?.icon}
        iconTone={config?.iconTone}
        buttons={resolvedButtons}
        onDismiss={config?.onDismiss}
      />
    </DialogContext.Provider>
  );
};

export const useDialog = () => {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within a DialogProvider');
  return ctx;
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.xxl,
    alignItems: 'center',
  },
  iconWrap: {
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 22,
  },
  body: {
    width: '100%',
    marginBottom: SPACING.xl,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    width: '100%',
  },
});
