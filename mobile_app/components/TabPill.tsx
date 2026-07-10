import { View, StyleProp, ViewStyle } from 'react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { Text } from './Themed';
import { useTheme } from './ThemeProvider';
import { RADIUS, SPACING } from '@/constants/tokens';

export interface TabDefinition<T extends string> {
  key: T;
  label: string;
}

interface TabPillProps<T extends string> {
  tabs: readonly TabDefinition<T>[];
  value: T;
  onChange: (t: T) => void;
  style?: StyleProp<ViewStyle>;
}

// Row of tab chips; the active chip fills with tint.
export function TabPill<T extends string>({ tabs, value, onChange, style }: TabPillProps<T>) {
  const { theme } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', gap: SPACING.sm }, style]}>
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <AnimatedPressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={{
              paddingVertical: SPACING.xs + 2,
              paddingHorizontal: SPACING.md,
              borderRadius: RADIUS.pill,
              backgroundColor: active ? theme.tint : theme.surface,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: 'bold', color: active ? '#000000' : theme.textMuted }}>
              {tab.label}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}
