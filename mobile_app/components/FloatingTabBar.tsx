import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs/types';

import { CHAT_SHIPPED } from '@/utils/features';
import { Text } from './Themed';
import { useTheme } from './ThemeProvider';
import { Icon, IconName } from './Icon';
import { AnimatedPressable } from './AnimatedPressable';
import { MOTION, RADIUS, SPACING, FLOATING_CHROME, floatingChromeColors } from '@/constants/tokens';
import { useResponsive } from '@/hooks/useResponsive';
import { haptics } from '@/utils/haptics';
import { useIsFirstRun } from '@/utils/modelPresence';
import { useSettings } from '@/utils/settingsStore';
import { useHeroMicOnScreen } from '@/utils/heroMic';
import { RecordFab, recordFabSize } from './RecordFab';

const ICONS: Record<string, IconName> = {
  index: 'home',
  history: 'history',
  chat: 'chat',
  settings: 'settings',
};

/** How much wider than its neighbours the selected tab is, minus one. */
const GROW = 1.3;
// Slightly under-damped (ratio about 0.8): the pill arrives, goes a hair past
// and settles, in about a third of a second.
const SPRING = MOTION.glide;
// Looser than the pill's: the mic leaves the bar like a drop, so it overshoots
// and wobbles back (ratio about 0.6).
const DROP_SPRING = MOTION.drop;
/** Tabs the bar can ever show. One shared value each, see below. */
const MAX_TABS = 4;

/**
 * Floating pill tab bar. Five labels won't fit side by side on a phone, so only
 * the ACTIVE tab shows its label and expands to make room.
 *
 * Built on Reanimated, not the RN Animated API. The width change is a LAYOUT
 * animation - with RN Animated it's driven from JS, so every frame round-trips
 * to the layout engine across the bridge and the bar visibly shakes. Reanimated
 * runs the same interpolation in a UI-thread worklet, so layout resolves in one
 * place at 60fps.
 */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { contentWidth, isCompact, isShort } = useResponsive();
  const isFirstRun = useIsFirstRun();
  const { settings } = useSettings();

  // Chat only exists if there's a chat model to run it with. Without one the
  // tab is dead weight - it can only show "No Chat Model Selected" and a button
  // pointing at Models - so it's a fifth of the bar spent on nothing, for the
  // many people who never wanted the heaviest download in the app.
  //
  // preferredChatModel rather than a fresh disk check: ensureModelSelections
  // already keeps it exactly in step with what's installed (filled on download,
  // cleared when the model is deleted), and it's persisted, so the answer is
  // there at launch without a file scan or a frame of flicker.
  //
  // The ROUTE stays registered - only the button is hidden. The assistant's
  // NAVIGATE_TO can still reach chat, and anyone who lands there gets the
  // "download a model" screen rather than a dead end.
  // Two gates now: the beta opt-in (Settings) AND a model to run it with. Chat
  // stays completely out of sight until someone deliberately turns it on.
  const hasChatModel = CHAT_SHIPPED && settings.enableChatBeta && !!settings.preferredChatModel;
  const [kbVisible, setKbVisible] = useState(false);

  // A floating bar sits ON the content, so unlike a docked bar it would cover
  // the text field being typed into.
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'android' ? 'keyboardDidShow' : 'keyboardWillShow',
      () => setKbVisible(true)
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'android' ? 'keyboardDidHide' : 'keyboardWillHide',
      () => setKbVisible(false)
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const routes = state.routes
    .filter((route) => route.name !== 'record' && (route.name !== 'chat' || hasChatModel))
    .slice(0, MAX_TABS);
  const focusedKey = state.routes[state.index]?.key;
  const focusedIdx = routes.findIndex((route) => route.key === focusedKey);
  const count = routes.length;

  // One number per tab, 0 = resting and 1 = selected, each on its own spring.
  // Everything that moves is drawn from these: how wide each tab is, where the
  // pill sits, which icon shows, how much of the label is out. Because they
  // are separate, tapping a third tab while two are still trading places just
  // bends the motion instead of restarting it.
  const p0 = useSharedValue(focusedIdx === 0 ? 1 : 0);
  const p1 = useSharedValue(focusedIdx === 1 ? 1 : 0);
  const p2 = useSharedValue(focusedIdx === 2 ? 1 : 0);
  const p3 = useSharedValue(focusedIdx === 3 ? 1 : 0);
  const progress = [p0, p1, p2, p3];
  useEffect(() => {
    p0.set(withSpring(focusedIdx === 0 ? 1 : 0, SPRING));
    p1.set(withSpring(focusedIdx === 1 ? 1 : 0, SPRING));
    p2.set(withSpring(focusedIdx === 2 ? 1 : 0, SPRING));
    p3.set(withSpring(focusedIdx === 3 ? 1 : 0, SPRING));
  }, [focusedIdx, p0, p1, p2, p3]);

  // The bar itself gets carried a few pixels the way the pill is going and
  // bounces back, so the pill seems to have some weight when it lands.
  const bump = useSharedValue(0);
  const lastIdx = useRef(focusedIdx);
  useEffect(() => {
    const from = lastIdx.current;
    lastIdx.current = focusedIdx;
    if (from < 0 || focusedIdx < 0 || from === focusedIdx) return;
    bump.set(withSequence(
      withTiming(Math.sign(focusedIdx - from) * 6, { duration: 150, easing: Easing.out(Easing.quad) }),
      withSpring(0, MOTION.wobble)
    ));
  }, [focusedIdx, bump]);
  const bumpStyle = useAnimatedStyle(() => ({ transform: [{ translateX: bump.value }] }));

  // The big mic on the home screen and the small one here are the same
  // button. While the big one is on screen this one is taken back into the
  // bar, and comes out again anywhere else.
  //
  // It is done as two blobs of the same colour joining, not as a fade: the bar
  // is drawn over the mic and grows to the right across it. Their ends are the
  // same half circle, so partway through they read as one shape with a bulge,
  // and at the end the bar's cap sits exactly on the mic. A neck bridges the
  // gap between them on the way, and the mic stretches a little while it is
  // being pulled in, which is what makes it look wet rather than mechanical.
  const heroOnScreen = useHeroMicOnScreen();
  const fabShown = !(heroOnScreen && routes[focusedIdx]?.name === 'index');
  const fab = useSharedValue(fabShown ? 1 : 0);
  const fabWas = useRef(fabShown);
  useEffect(() => {
    if (fabWas.current === fabShown) return;
    fabWas.current = fabShown;
    fab.set(withSpring(fabShown ? 1 : 0, DROP_SPRING));
    // The bar leans towards the mic as it swallows it, and away as it lets go.
    bump.set(withSequence(
      withTiming(fabShown ? -5 : 5, { duration: 160, easing: Easing.out(Easing.quad) }),
      withSpring(0, MOTION.wobble)
    ));
  }, [fabShown, fab, bump]);
  const fabSize = recordFabSize(isShort);
  const fabSlot = fabSize + SPACING.sm;
  const slotStyle = useAnimatedStyle(() => {
    const v = Math.max(0, fab.value);
    // Gone only at the very end: until then the bar is what hides it.
    return { width: fabSlot * v, opacity: Math.min(1, v / 0.1) };
  });
  const stretchStyle = useAnimatedStyle(() => {
    const pull = Math.sin(Math.PI * Math.min(1, Math.max(0, fab.value)));
    return { transform: [{ scaleX: 1 + 0.16 * pull }, { scaleY: 1 - 0.08 * pull }] };
  });
  // From the middle of the bar's end cap to just inside the mic's edge. Thin
  // when they are apart, as thick as the bar by the time they touch.
  const neckStyle = useAnimatedStyle(() => {
    const v = Math.min(1, Math.max(0, fab.value));
    return {
      width: Math.max(0, fabSlot * v + fabSize / 2 - (fabSize - 6)),
      height: fabSize * interpolate(v, [0.55, 0.85, 1], [1, 0.6, 0], 'clamp'),
      opacity: v > 0.02 && v < 0.999 ? 1 : 0,
    };
  });

  // ONE pill that travels, instead of a pill per tab fading in and out. A tab
  // is `1 + GROW * p` wide in flex units, so the pill can work out where every
  // tab is from the row's width alone: it sits at the average of the tabs'
  // places, weighted by how selected each one is. Between two tabs that is a
  // straight slide, and it narrows a little mid-way because both are
  // half-grown there.
  //
  // The row's width is measured once; what the tabs get of it is worked out
  // here (minus the mic's slot, the bar's padding and its 1px border) rather
  // than measured, because the slot is itself animating and a measurement
  // would arrive a frame late.
  const rowW = useSharedValue(0);
  const inset = (isShort ? SPACING.xs : SPACING.xs + 1) + FLOATING_CHROME.borderWidth;
  const pillStyle = useAnimatedStyle(() => {
    const p = [p0.value, p1.value, p2.value, p3.value];
    let units = 0;
    let weight = 0;
    for (let i = 0; i < count; i++) {
      units += isCompact ? 1 : 1 + GROW * p[i];
      weight += p[i];
    }
    const track = rowW.value - fabSlot * Math.max(0, fab.value) - inset * 2;
    if (track <= 0 || weight < 0.01) return { opacity: 0, width: 0, transform: [{ translateX: 0 }] };
    const unit = track / units;
    let x = 0;
    let centre = 0;
    let width = 0;
    for (let i = 0; i < count; i++) {
      const w = unit * (isCompact ? 1 : 1 + GROW * p[i]);
      centre += p[i] * (x + w / 2);
      width += p[i] * w;
      x += w;
    }
    centre /= weight;
    width /= weight;
    return { opacity: Math.min(1, weight), width, transform: [{ translateX: centre - width / 2 }] };
  });

  // The bar used to be removed outright when the keyboard came up and put back
  // when it left. It stays mounted now and fades down and back, which also
  // keeps the pill where it was.
  const shown = useSharedValue(1);
  useEffect(() => {
    shown.set(withTiming(kbVisible ? 0 : 1, { duration: 180 }));
  }, [kbVisible, shown]);
  const barStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * 24 }],
  }));

  // Nothing to navigate to until there's a model: every other tab is as empty as
  // this one. The welcome should be the only thing on screen.
  if (isFirstRun) return null;

  return (
    <Animated.View
      style={[
        styles.wrap,
        barStyle,
        // Compact preset on short windows: the bar hugs the bottom tighter and
        // the pill slims down, buying the content ~10dp of height.
        { paddingBottom: Math.max(insets.bottom, isShort ? SPACING.sm : SPACING.md), paddingHorizontal: SPACING.lg },
      ]}
      pointerEvents={kbVisible ? 'none' : 'box-none'}
    >
      {/* Capped and centred: on a tablet a full-width row would stretch the
          items metres apart and put the reach target nowhere near a thumb. On a
          phone contentWidth is the screen width, so nothing moves. The record
          mic is a separate circle to the RIGHT of the pill - it's the primary
          action, not a peer of the nav tabs. */}
      <View
        style={[styles.row, { maxWidth: contentWidth - SPACING.lg * 2, width: '100%', alignSelf: 'center' }]}
        onLayout={(e) => {
          rowW.set(e.nativeEvent.layout.width);
        }}
      >
        {/* Mic first and bar last, in a reversed row: the mic still sits on
            the right, but the bar is drawn over it. */}
        <Animated.View style={[styles.fabSlot, slotStyle]} pointerEvents={fabShown ? 'box-none' : 'none'}>
          <Animated.View style={stretchStyle}>
            <RecordFab />
          </Animated.View>
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.neck,
            { right: fabSize - 6, backgroundColor: floatingChromeColors(theme.isDark).backgroundColor },
            neckStyle,
          ]}
        />
        <Animated.View style={[styles.pill, isShort && { padding: SPACING.xs }, { flex: 1, ...floatingChromeColors(theme.isDark) }, bumpStyle]}>
          <View style={styles.track}>
            <Animated.View
              pointerEvents="none"
              style={[styles.travelPill, { height: isShort ? 36 : 40, backgroundColor: theme.tintFill }, pillStyle]}
            />
            {routes.map((route, i) => {
              const { options } = descriptors[route.key];
              const focused = i === focusedIdx;
              const label =
                typeof options.tabBarLabel === 'string'
                  ? options.tabBarLabel
                  : typeof options.title === 'string'
                  ? options.title
                  : route.name;
              return (
                <TabItem
                  key={route.key}
                  icon={ICONS[route.name] ?? 'home'}
                  label={label}
                  focused={focused}
                  progress={progress[i]}
                  compact={isCompact}
                  short={isShort}
                  onPress={() => {
                    haptics.tap();
                    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                    if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
                  }}
                />
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const TabItem = ({
  icon,
  label,
  focused,
  progress,
  onPress,
  compact,
  short,
}: {
  icon: IconName;
  label: string;
  focused: boolean;
  /** 0 resting, 1 selected. Owned by the bar, which also steers the pill by it. */
  progress: SharedValue<number>;
  onPress: () => void;
  compact?: boolean;
  short?: boolean;
}) => {
  const { theme } = useTheme();

  const growStyle = useAnimatedStyle(() => ({
    flexGrow: compact ? 1 : 1 + GROW * progress.value,
  }));

  // The outline icon and the solid one are both there, cross-fading, so the
  // change of shape and colour takes as long as the pill takes to arrive.
  const outlineStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, Math.max(0, progress.value)) }));
  const solidStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, progress.value)) }));

  // A small pop when the tab is picked, not when it is left and not on mount.
  const pop = useSharedValue(1);
  const wasFocused = useRef(focused);
  useEffect(() => {
    if (focused && !wasFocused.current) {
      pop.set(withSequence(withTiming(1.2, { duration: 110 }), withSpring(1, { stiffness: 320, damping: 14, mass: 1 })));
    }
    wasFocused.current = focused;
  }, [focused, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  // The label is always mounted and opens from zero width, so it slides out
  // from behind the icon and back in again. It used to exist only while the
  // tab was selected, which meant it vanished at once on the way out.
  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.35, 1], [0, 1], 'clamp'),
    maxWidth: interpolate(progress.value, [0, 1], [0, 160], 'clamp'),
    marginLeft: interpolate(progress.value, [0, 1], [0, SPACING.xs + 2], 'clamp'),
  }));

  return (
    <Animated.View style={[{ flexBasis: 0 }, growStyle]}>
      <AnimatedPressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        style={{ flex: 1 }}
      >
        <View style={[styles.item, short && { height: 36 }]}>
          <Animated.View style={[styles.iconBox, popStyle]}>
            <Animated.View style={[StyleSheet.absoluteFill, outlineStyle]}>
              <Icon name={icon} size={22} color={theme.textSubtle} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, solidStyle]}>
              <Icon name={icon} filled size={22} color={theme.tint} />
            </Animated.View>
          </Animated.View>
          {!compact && (
            <Animated.View style={[styles.label, labelStyle]}>
              {/* clip, not an ellipsis: a half-open label would otherwise read
                  "S...", "Se...", "Set..." on its way out. */}
              <Text numberOfLines={1} ellipsizeMode="clip" style={{ fontSize: 12, fontWeight: '600', color: theme.tint }}>
                {label}
              </Text>
            </Animated.View>
          )}
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  // Its width is the mic plus the gap to the bar. The mic is pinned to the
  // right edge, so as the slot closes the bar grows over the mic's place.
  fabSlot: {
    alignItems: 'flex-end',
  },
  neck: {
    position: 'absolute',
    borderRadius: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.xs + 1,
    ...FLOATING_CHROME,
  },
  track: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  travelPill: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderRadius: RADIUS.pill,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: RADIUS.pill,
    overflow: 'hidden',
  },
  iconBox: {
    width: 22,
    height: 22,
  },
  label: {
    flexShrink: 1,
    overflow: 'hidden',
  },
});
