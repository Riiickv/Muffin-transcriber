import { StyleProp, ViewStyle } from 'react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { Text } from './Themed';
import { useTheme } from './ThemeProvider';
import { Icon, IconName } from './Icon';
import { RADIUS, SPACING } from '@/constants/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  icon?: IconName;
  iconFilled?: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  // Puts the icon above the label instead of beside it. Use for tight quick-
  // action rows where a row layout would wrap ("Re-Transcribe" style).
  stacked?: boolean;
}

const SIZE_STYLES = {
  sm: { padV: SPACING.xs + 2, padH: SPACING.md, font: 13, icon: 16, stackIcon: 20, gap: SPACING.xs + 2 },
  md: { padV: SPACING.sm, padH: SPACING.lg, font: 14, icon: 20, stackIcon: 24, gap: SPACING.sm - 2 },
  lg: { padV: SPACING.md, padH: SPACING.xl, font: 16, icon: 22, stackIcon: 26, gap: SPACING.sm },
} as const;

export const Button = ({
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  icon,
  iconFilled = false,
  children,
  style,
  stacked = false,
}: ButtonProps) => {
  const { theme } = useTheme();
  const s = SIZE_STYLES[size];

  const palette: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: theme.tint, fg: theme.tintForeground },
    secondary: { bg: theme.surface, fg: theme.text, border: theme.divider },
    ghost: { bg: 'transparent', fg: theme.tint },
    danger: { bg: theme.danger, fg: '#FFFFFF' },
  };
  const v = palette[variant];

  const iconSize = stacked ? s.stackIcon : s.icon;
  const paddingVertical = stacked ? s.padV + SPACING.xs : s.padV;
  const gap = stacked ? SPACING.xs + 2 : s.gap;

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      style={[
        {
          flexDirection: stacked ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical,
          paddingHorizontal: s.padH,
          borderRadius: RADIUS.md,
          backgroundColor: v.bg,
          borderWidth: v.border ? 1 : 0,
          borderColor: v.border ?? 'transparent',
          gap,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {icon && <Icon name={icon} size={iconSize} color={v.fg} filled={iconFilled} />}
      <Text
        numberOfLines={1}
        style={{ fontSize: s.font, fontWeight: 'bold', color: v.fg }}
      >
        {children}
      </Text>
    </AnimatedPressable>
  );
};
