import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/Themed';
import { useTheme, ThemeMode, AccentColor } from '@/components/ThemeProvider';
import ExpressiveSwitch from '@/components/ExpressiveSwitch';
import { SelectDropdown } from '@/components/SelectDropdown';
import { useSettings } from '@/utils/settingsStore';
import { getSettingSpec } from '@/utils/appCapabilities';
import { getLanguageOptions, getFormatLanguageOptions } from '@/utils/languages';
import { t } from '@/utils/i18n';
import { SPACING, RADIUS } from '@/constants/tokens';

// The same words the Settings screen uses for these choices. Anything not
// listed here shows its stored value.
function optionLabels(key: string): Record<string, string> {
  if (key === 'defaultLanguage') return Object.fromEntries(getLanguageOptions().map((o) => [o.value, o.label]));
  if (key === 'formatLanguage') return Object.fromEntries(getFormatLanguageOptions().map((o) => [o.value, o.label]));
  if (key === 'autoDeleteCacheDuration') {
    return {
      Never: t('settings.autoDeleteNever') || 'Never',
      '1 Week': t('settings.autoDelete1Week') || '1 Week',
      '1 Month': t('settings.autoDelete1Month') || '1 Month',
    };
  }
  if (key === 'themeMode') {
    return {
      system: t('settings.themeAuto') || 'Auto',
      light: t('settings.themeLight') || 'Light',
      dark: t('settings.themeDark') || 'Dark',
      amoled: t('settings.themeBlack') || 'Black',
    };
  }
  if (key === 'accentColor') {
    return {
      system: t('settings.accentSystem') || 'System',
      muffin: t('settings.accentMuffin') || 'Muffin',
      green: t('settings.accentGreen') || 'Green',
      purple: t('settings.accentPurple') || 'Purple',
      red: t('settings.accentRed') || 'Red',
    };
  }
  return {};
}

// Live control for one setting; writes the same stores as the Settings screen, so edits apply everywhere.
export function InlineSettingControl({ settingKey }: { settingKey: string }) {
  const { theme, themeMode, accentColor, setThemeMode, setAccentColor } = useTheme();
  const { settings, setSetting } = useSettings();

  const spec = getSettingSpec(settingKey);
  if (!spec) return null;

  const value = spec.store === 'theme'
    ? (spec.key === 'themeMode' ? themeMode : accentColor)
    : (settings as any)[spec.key];

  const labels = optionLabels(spec.key);

  const apply = (v: any) => {
    if (spec.store === 'theme') {
      if (spec.key === 'themeMode') setThemeMode(v as ThemeMode);
      else setAccentColor(v as AccentColor);
    } else {
      setSetting(spec.key as any, v);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.divider }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{t(spec.labelKey) || spec.label}</Text>
        <Text style={[styles.location, { color: theme.textMuted }]}>{spec.where.map((k) => t(k)).join(' › ')}</Text>
      </View>
      {spec.type === 'boolean' ? (
        <ExpressiveSwitch value={!!value} onValueChange={apply} activeColor={theme.tint} thumbActiveColor={theme.tintForeground} />
      ) : (
        <View style={{ minWidth: 150 }}>
          <SelectDropdown
            options={(spec.options || []).map((o) => ({ label: labels[o] ?? o, value: o }))}
            value={String(value)}
            onSelect={apply}
            compact
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
    gap: SPACING.md,
    // The width FLOOR for the whole chat bubble. The label column is flex:1,
    // which demands no intrinsic width in Yoga - so inside a bubble sized to a
    // short sentence this card got crushed and the label wrapped letter by
    // letter. The card is the widest thing in an action bubble, so it sets the
    // size; 240 fits comfortably inside the bubble's 85% cap on a 320dp phone.
    minWidth: 240,
  },
  label: { fontSize: 15, fontWeight: '600' },
  location: { fontSize: 12, marginTop: 2 },
});
