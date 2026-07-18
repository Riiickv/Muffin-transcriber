// Design tokens - single source of truth for spacing, radius, and motion.

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

// Spring presets - pick by feel, not by tuning friction/tension per call.
export const MOTION = {
  // Fast, tight - press feedback and quick toggles.
  springPress: { friction: 20, tension: 400 },
  // Balanced default - switches, focus rings, tab icon.
  springStandard: { friction: 16, tension: 200 },
  // Slower and softer - segment sliders, page transitions.
  springSettle: { friction: 18, tension: 150 },

  timingQuick: { duration: 180 },
  timingBase: { duration: 250 },
} as const;

export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;

/**
 * Vertical space the floating tab bar occupies.
 *
 * Reserve this at the bottom of a screen's CONTENT (contentContainerStyle on a
 * ScrollView/FlatList, or padding on a fixed layout) - never on the scene
 * itself. Putting it on the scene shrinks the viewport, so scrollable content
 * stops dead above the bar and gets clipped instead of passing underneath it.
 */
export const TAB_BAR_SPACE = 84;

/**
 * The floating chrome: the tab bar pill and the chat composer.
 *
 * Both hover over the content at the bottom of the screen, so they have to read
 * as the same object. Defined once because "make them match" by copying values
 * is how they stop matching three commits later.
 */
export const FLOATING_CHROME = {
  borderRadius: RADIUS.pill,
  borderWidth: 1,
  shadowColor: '#000',
  shadowOpacity: 0.3,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 12,
} as const;

/** Its surface + hairline. Not theme.surface: this floats ABOVE content and
 *  needs to separate from it, which a matching surface colour cannot do. */
export const floatingChromeColors = (isDark: boolean) => ({
  backgroundColor: isDark ? '#2E282E' : '#FFFFFF',
  borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
});
