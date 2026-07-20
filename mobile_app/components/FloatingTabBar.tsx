import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs/types';

import { Text } from './Themed';
import { useTheme } from './ThemeProvider';
import { Icon, IconName } from './Icon';
import { AnimatedPressable } from './AnimatedPressable';
import { RADIUS, SPACING, FLOATING_CHROME, floatingChromeColors } from '@/constants/tokens';
import { useResponsive } from '@/hooks/useResponsive';
import { haptics } from '@/utils/haptics';
import { useIsFirstRun } from '@/utils/modelPresence';
import { useSettings } from '@/utils/settingsStore';
import { RecordFab } from './RecordFab';

const ICONS: Record<string, IconName> = {
  index: 'home',
  history: 'history',
  chat: 'chat',
  settings: 'settings',
};

const DURATION = 260;

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
  const { contentWidth, isCompact } = useResponsive();
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
  const hasChatModel = settings.enableChatBeta && !!settings.preferredChatModel;
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

  if (kbVisible) return null;
  // Nothing to navigate to until there's a model: every other tab is as empty as
  // this one. The welcome should be the only thing on screen.
  if (isFirstRun) return null;

  return (
    <View
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, SPACING.md), paddingHorizontal: SPACING.lg }]}
      pointerEvents="box-none"
    >
      {/* Capped and centred: on a tablet a full-width row would stretch the
          items metres apart and put the reach target nowhere near a thumb. On a
          phone contentWidth is the screen width, so nothing moves. The record
          mic is a separate circle to the RIGHT of the pill - it's the primary
          action, not a peer of the nav tabs. */}
      <View style={[styles.row, { maxWidth: contentWidth - SPACING.lg * 2, width: '100%', alignSelf: 'center' }]}>
        <View style={[styles.pill, { flex: 1, ...floatingChromeColors(theme.isDark) }]}>
        {state.routes
          .filter((route) => route.name !== 'record' && (route.name !== 'chat' || hasChatModel))
          .map((route) => {
          const { options } = descriptors[route.key];
          // Compared by KEY, not by index: the list above is filtered, so a
          // positional check would mark the wrong tab focused the moment the
          // chat button is hidden.
          const focused = state.routes[state.index]?.key === route.key;
          // tabBarLabel first, NOT title: the Chat screen sets `title` to the
          // active chat's name for its header, and this bar was reading the
          // same option - so the tab itself was labelled "New Chat" instead of
          // "Chat", renaming a tab whenever you opened a conversation.
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
              compact={isCompact}
              onPress={() => {
                haptics.tap();
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
            />
          );
        })}
        </View>
        <RecordFab />
      </View>
    </View>
  );
}

const TabItem = ({
  icon,
  label,
  focused,
  onPress,
  compact,
}: {
  icon: IconName;
  label: string;
  focused: boolean;
  onPress: () => void;
  /** Small screen: drop the label rather than squeeze five items into 320dp. */
  compact?: boolean;
}) => {
  const { theme } = useTheme();
  const p = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    p.value = withTiming(focused ? 1 : 0, { duration: DURATION, easing: Easing.out(Easing.cubic) });
  }, [focused, p]);

  // Active tab claims ~2.3x a collapsed one - that's the room the label needs.
  // With no label to show there's nothing to make room for, so stay equal.
  const growStyle = useAnimatedStyle(() => ({
    flexGrow: compact ? 1 : interpolate(p.value, [0, 1], [1, 2.3]),
  }));

  // Static-coloured layer we fade in, rather than an animated backgroundColor.
  // With the 'system' accent on Android, theme.tint* are PlatformColor objects
  // and no animator can interpolate them ("platform colors are not supported").
  const pillStyle = useAnimatedStyle(() => ({ opacity: p.value }));

  // The label is laid out at all times so the width animation has something
  // real to resolve against; it just fades and slides in.
  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0.45, 1], [0, 1], 'clamp'),
    transform: [{ translateX: interpolate(p.value, [0, 1], [-6, 0]) }],
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
        <View style={styles.item}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: theme.tintFill, borderRadius: RADIUS.pill },
              pillStyle,
            ]}
          />
          <Icon name={icon} filled={focused} size={22} color={focused ? theme.tint : theme.textSubtle} />
          {focused && !compact && (
            <Animated.View style={[{ marginLeft: SPACING.xs + 2, flexShrink: 1 }, labelStyle]}>
              <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: theme.tint }}>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.xs + 1,
    ...FLOATING_CHROME,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: RADIUS.pill,
    overflow: 'hidden',
  },
});
