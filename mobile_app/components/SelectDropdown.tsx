import React, { useState } from 'react';
import { Modal, View, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from './Themed';
import { useTheme } from './ThemeProvider';
import { SPACING, RADIUS } from '@/constants/tokens';
import { IconButton } from './IconButton';
import { Icon } from './Icon';
import { AnimatedPressable } from './AnimatedPressable';
import { Button } from './Button';
import { SettingsRow } from './SettingsGroup';
import { haptics } from '@/utils/haptics';
import { t } from '@/utils/i18n';

export type DropdownOption = {
  label: string;
  value: string;
};

type SelectDropdownProps = {
  options: DropdownOption[];
  value?: string;
  onSelect: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  compact?: boolean;
  // What this dropdown selects (e.g. "Language"), announced by screen readers.
  // Falls back to the placeholder when omitted.
  fieldLabel?: string;
  /**
   * Render as a SettingsGroup row (label left, current value + chevron right)
   * instead of a bordered box. Keeps pickers and switches on one layout inside
   * a settings list.
   */
  rowLabel?: string;
  rowDescription?: string;
};

export function SelectDropdown({
  options,
  value,
  onSelect,
  placeholder = 'Select...',
  disabled,
  compact = false,
  fieldLabel,
  rowLabel,
  rowDescription,
}: SelectDropdownProps) {
  const { theme } = useTheme();
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  const handleOpen = () => {
    if (disabled) return;
    haptics.tap();
    setVisible(true);
  };

  const handleSelect = (val: string) => {
    haptics.select();
    onSelect(val);
    setVisible(false);
  };

  return (
    <>
      {rowLabel ? (
        <SettingsRow
          label={rowLabel}
          description={rowDescription}
          value={displayLabel}
          chevron
          onPress={handleOpen}
          disabled={disabled}
        />
      ) : (
        <AnimatedPressable
          style={{
            borderWidth: 1,
            borderRadius: RADIUS.sm,
            borderColor: theme.divider,
            padding: compact ? SPACING.sm : SPACING.md,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: disabled ? theme.surface : 'transparent',
            opacity: disabled ? 0.5 : 1,
          }}
          onPress={handleOpen}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${fieldLabel ?? placeholder}: ${displayLabel}`}
          accessibilityState={{ expanded: visible, disabled: !!disabled }}
        >
          <Text style={{ fontSize: compact ? 12 : 14 }} numberOfLines={1}>{displayLabel}</Text>
        </AnimatedPressable>
      )}

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <AnimatedPressable
            style={StyleSheet.absoluteFill}
            onPress={() => setVisible(false)}
          />
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.background, borderColor: theme.divider },
            ]}
          >
            <View style={[styles.header, { borderBottomColor: theme.divider }]}>
              {/* Name the thing being picked. "Select Option" told the user
                  nothing they didn't already know from tapping it. */}
              <Text style={styles.title}>{rowLabel ?? fieldLabel ?? 'Select'}</Text>
              <IconButton
                variant="ghost"
                icon="close"
                onPress={() => setVisible(false)}
              />
            </View>
            {/* An empty picker used to render as a bare header over nothing,
                which reads as a broken screen rather than as "you have no
                models yet". The only way to get options here is to download
                one, so the empty state says that and goes straight there. */}
            {options.length === 0 ? (
              <View style={styles.empty}>
                <Icon name="download" size={40} color={theme.textSubtle} />
                <Text style={styles.emptyTitle}>
                  {t('models.noneInstalled') || 'No models installed yet'}
                </Text>
                <Text style={[styles.emptyDesc, { color: theme.textMuted }]}>
                  {t('models.noneInstalledDesc') ||
                    "Models are what let the app work offline. Download one and it'll show up here."}
                </Text>
                {/* Explicit height - an unsized Button balloons inside a
                    centered container (see WaitingCard). */}
                <Button
                  variant="primary"
                  size="md"
                  style={{ marginTop: SPACING.lg, height: 44 }}
                  onPress={() => {
                    setVisible(false);
                    router.push('/models' as any);
                  }}
                >
                  {t('models.goToModels') || 'Get a model'}
                </Button>
              </View>
            ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={{ paddingBottom: SPACING.sm }}
            >
              {options.map((option, index) => {
                const isLast = index === options.length - 1;
                const isActive = value === option.value;
                return (
                  <AnimatedPressable
                    key={option.value}
                    scaleTo={0.99}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: SPACING.md,
                      borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
                      borderBottomColor: theme.divider,
                    }}
                    onPress={() => handleSelect(option.value)}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        { flex: 1 },
                        isActive && { color: theme.tint, fontWeight: 'bold' },
                      ]}
                    >
                      {option.label}
                    </Text>
                    {/* A checkmark, not just coloured text: with 100+ languages
                        you're scanning a long list and colour alone is easy to
                        miss - and invisible to anyone colour-blind. */}
                    {isActive && <Icon name="check" size={20} color={theme.tint} />}
                  </AnimatedPressable>
                );
              })}
            </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xxl,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  list: {
    paddingHorizontal: SPACING.md,
  },
  optionText: {
    fontSize: 16,
  },
});
