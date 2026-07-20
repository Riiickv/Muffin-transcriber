import { GestureResponderEvent, StyleProp, ViewStyle } from 'react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { useTheme } from './ThemeProvider';
import { Icon, IconName } from './Icon';
import { RADIUS } from '@/constants/tokens';

export type IconButtonVariant = 'tint' | 'ghost' | 'ghost-tint' | 'danger' | 'subtle';
export type IconButtonSize = 'sm' | 'md' | 'lg';

interface IconButtonProps {
  onPress: (e?: GestureResponderEvent) => void;
  icon: IconName;
  iconFilled?: boolean;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  disabled?: boolean;
}

const SIZE_STYLES = {
  sm: { box: 32, icon: 18 },
  md: { box: 40, icon: 22 },
  lg: { box: 48, icon: 26 },
} as const;

export const IconButton = ({
  onPress,
  icon,
  iconFilled = false,
  variant = 'subtle',
  size = 'md',
  style,
  accessibilityLabel,
  disabled = false,
}: IconButtonProps) => {
  const { theme } = useTheme();
  const s = SIZE_STYLES[size];

  const palette: Record<IconButtonVariant, { bg: string; fg: string }> = {
    tint: { bg: theme.tintFill, fg: theme.tint },
    ghost: { bg: 'transparent', fg: theme.text },
    // Matches a ghost Button (transparent, tint-coloured) so an icon-only
    // action sits in a row of ghost buttons without looking like a new control.
    'ghost-tint': { bg: 'transparent', fg: theme.tint },
    danger: { bg: theme.dangerSurface, fg: theme.danger },
    subtle: { bg: theme.surface, fg: theme.text },
  };
  const v = palette[variant];

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      style={[
        {
          width: s.box,
          height: s.box,
          borderRadius: RADIUS.sm,
          backgroundColor: v.bg,
          justifyContent: 'center',
          alignItems: 'center',
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <Icon name={icon} size={s.icon} color={v.fg} filled={iconFilled} />
    </AnimatedPressable>
  );
};
