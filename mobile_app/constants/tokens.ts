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
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

/**
 * The type scale. Five steps, and nothing on screen smaller than `caption`.
 *
 * Sizes used to be picked per screen (12 to 24, eight different values), which
 * is how a description ended up at 12 in a muted colour: two readability cuts
 * stacked on the text that explains what a switch does.
 */
export const TYPE = {
  display: 28,
  title: 20,
  body: 16,
  label: 15,
  caption: 13,
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

  // The bottom bar's springs. Everything that moves in the app moves on one of
  // these, so a button, a switch and a dialog all feel like the bar does.
  // Stiffness, damping and mass rather than friction and tension: React
  // Native's Animated and Reanimated both take these numbers as they are.
  // Read them through utils/motion.ts, which hands back a spring with no
  // overshoot when the system asks for less motion.
  //
  // The pill: arrives, goes a hair past and settles (damping ratio about 0.8).
  glide: { stiffness: 260, damping: 26, mass: 1 },
  // The mic leaving the bar: overshoots and comes back once (about 0.6).
  drop: { stiffness: 210, damping: 17, mass: 1 },
  // The bar's nudge: several small swings (about 0.33).
  wobble: { stiffness: 230, damping: 10, mass: 1 },
  // A pressed thing let go. Width and height come back on different springs,
  // so for a moment it is wider than it is tall and then the reverse: that is
  // what reads as soft instead of as a rigid plate resizing. Tighter than the
  // nudge because a finger is waiting on it (ratios about 0.34 and 0.42).
  releaseWide: { stiffness: 420, damping: 14, mass: 1 },
  releaseTall: { stiffness: 520, damping: 19, mass: 1 },
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

/**
 * The colour of anything that sits ABOVE the page: dialogs, sheets, pickers.
 *
 * A raised surface is told apart from the page by being a step lighter, not by
 * an outline. Outlines were doing that job everywhere (cards, inputs, buttons,
 * dialogs, switches), and a screen made of outlines reads as a wireframe.
 */
export const raisedColor = (isDark: boolean, isAmoled: boolean) =>
  isAmoled ? '#101010' : isDark ? '#1E1C1E' : '#FFFFFF';
