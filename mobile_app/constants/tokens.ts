// Design tokens — single source of truth for spacing, radius, and motion.
// If a value isn't in here, it doesn't belong in a component style.

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

// Three spring presets covering every interaction.
// Pick by feel, not by fiddling with friction/tension per-call.
export const MOTION = {
  // Fast, tight — press feedback and quick toggles.
  springPress: { friction: 20, tension: 400 },
  // Balanced default — switches, focus rings, tab icon.
  springStandard: { friction: 16, tension: 200 },
  // Slower and softer — segment sliders, page transitions.
  springSettle: { friction: 18, tension: 150 },

  timingQuick: { duration: 180 },
  timingBase: { duration: 250 },
} as const;

export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;
