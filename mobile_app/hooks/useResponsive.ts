import { useWindowDimensions } from 'react-native';

/**
 * Screen adaptation, deliberately conservative.
 *
 * The rule: on a normal phone this hook changes NOTHING. Every value below is
 * a clamp, not a scale - the layout was designed and eyeballed at phone width,
 * so phone width is the reference, not a starting point to interpolate from.
 * Only sizes outside the range react at all.
 *
 * Why not scale everything by width/390?
 *  - It would move the UI on the one device that's actually been checked,
 *    which is the only device we can check (there's no emulator here).
 *  - Proportional scaling shrinks tap targets below the 44dp minimum on small
 *    phones - technically "adaptive", practically worse.
 *  - Text that scales with width fights the user's own font-size setting.
 */

/**
 * Content stops widening here.
 *
 * Above it, a settings row stretched to 700px+ isn't generous, it's unreadable
 * - the eye loses the line, and a label on the far left with its switch on the
 * far right stops reading as one row. So on tablets/foldables the content
 * centres in a phone-width column instead. That's also the "unsupported
 * resolution doesn't change anything" case: we don't invent a tablet layout we
 * can't test, we just refuse to stretch.
 */
export const MAX_CONTENT_WIDTH = 560;

/** Below this a phone is genuinely cramped - the tab bar sheds its label. */
export const COMPACT_WIDTH = 340;

export function useResponsive() {
  const { width } = useWindowDimensions();

  return {
    /** Cap for a screen's content. A no-op on phones (all narrower than the cap). */
    contentWidth: Math.min(width, MAX_CONTENT_WIDTH),
    /** Tablet, foldable-unfolded, or anything wider than we design for. */
    isWide: width > MAX_CONTENT_WIDTH,
    /** Small/older phone: five tab items + a label won't fit honestly. */
    isCompact: width < COMPACT_WIDTH,
    width,
  };
}
