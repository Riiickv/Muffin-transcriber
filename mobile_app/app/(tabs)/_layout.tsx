import { Tabs } from 'expo-router';
import { Animated, ColorValue, Pressable } from 'react-native';
import React, { useEffect, useRef } from 'react';

import { useTheme } from '@/components/ThemeProvider';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { Icon, IconName } from '@/components/Icon';
import { MOTION } from '@/constants/tokens';
import { haptics } from '@/utils/haptics';
import { useDialog } from '@/components/Dialog';

const toStringColor = (c: ColorValue) => (typeof c === 'string' ? c : String(c));

// Focused = filled (Material 3 tab-bar convention) with a subtle spring pop.
const TabBarIcon = ({ name, color, focused }: { name: IconName; color: ColorValue; focused: boolean }) => {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (focused) {
      scale.setValue(0.85);
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, ...MOTION.springStandard }).start();
    }
  }, [focused, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Icon name={name} filled={focused} color={toStringColor(color)} size={24} />
    </Animated.View>
  );
};

const tabIcon = (name: IconName) =>
  ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <TabBarIcon name={name} color={color} focused={focused} />
  );

export default function TabLayout() {
  const { theme } = useTheme();
  const dialog = useDialog();

  return (
    <Tabs
      screenListeners={{
        tabPress: () => haptics.tap(),
      }}
      screenOptions={{
        tabBarActiveTintColor: theme.tintString,
        headerShown: useClientOnlyValue(false, true),
        headerShadowVisible: false,
        headerStyle: { borderBottomWidth: 0, backgroundColor: theme.background },
        tabBarStyle: { backgroundColor: theme.background, borderTopColor: theme.divider },
        tabBarLabelStyle: { fontFamily: 'Nunito_600SemiBold', fontSize: 12 },
        tabBarHideOnKeyboard: true,
        headerRight: () => (
          <Pressable
            onPress={() => {
              haptics.tap();
              dialog.show({
                title: 'Buy me a coffee! ☕',
                message: 'Support the development of Muffin Transcriber! (This would open a link or ad in production)',
                icon: 'favorite',
                iconTone: 'primary',
                primaryAction: { label: 'Support', onPress: () => {} }
              });
            }}
            style={({ pressed }) => ({
              opacity: pressed ? 0.5 : 1,
              marginRight: 16,
            })}
          >
            <Icon name="favorite" size={24} color={theme.danger} />
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Muffin!', tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="record" options={{ title: 'Record', tabBarIcon: tabIcon('mic') }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: tabIcon('history') }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat', tabBarIcon: tabIcon('chat') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: tabIcon('settings') }} />
    </Tabs>
  );
}
