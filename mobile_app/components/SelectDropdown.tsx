import React, { useState } from 'react';
import { Modal, View, StyleSheet, ScrollView } from 'react-native';
import { Text } from './Themed';
import { useTheme } from './ThemeProvider';
import { SPACING, RADIUS } from '@/constants/tokens';
import { IconButton } from './IconButton';
import { AnimatedPressable } from './AnimatedPressable';
import { haptics } from '@/utils/haptics';

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
};

export function SelectDropdown({
  options,
  value,
  onSelect,
  placeholder = 'Select...',
  disabled,
  compact = false,
}: SelectDropdownProps) {
  const { theme } = useTheme();
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
      >
        <Text style={{ fontSize: compact ? 12 : 14 }} numberOfLines={1}>{displayLabel}</Text>
      </AnimatedPressable>

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
              <Text style={styles.title}>Select Option</Text>
              <IconButton
                variant="ghost"
                icon="close"
                onPress={() => setVisible(false)}
              />
            </View>
            <ScrollView style={styles.list}>
              {options.map((option, index) => {
                const isLast = index === options.length - 1;
                const isActive = value === option.value;
                return (
                  <AnimatedPressable
                    key={option.value}
                    style={{
                      paddingVertical: SPACING.md,
                      borderBottomWidth: isLast ? 0 : 1,
                      borderBottomColor: theme.divider,
                    }}
                    onPress={() => handleSelect(option.value)}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isActive && { color: theme.tint, fontWeight: 'bold' },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
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
