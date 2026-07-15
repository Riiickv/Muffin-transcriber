import { Tabs } from 'expo-router';
import { Pressable } from 'react-native';
import React from 'react';

import { useTheme } from '@/components/ThemeProvider';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { Icon } from '@/components/Icon';
import { FloatingTabBar } from '@/components/FloatingTabBar';
import { useResponsive } from '@/hooks/useResponsive';
import { haptics } from '@/utils/haptics';
import { openSupportPage } from '@/utils/support';
import { useDialog } from '@/components/Dialog';
import { t } from '@/utils/i18n';

export default function TabLayout() {
  const { theme } = useTheme();
  const dialog = useDialog();
  const { contentWidth } = useResponsive();

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: useClientOnlyValue(false, true),
        headerShadowVisible: false,
        headerStyle: { borderBottomWidth: 0, backgroundColor: theme.background },
        // No paddingBottom here: it would shrink every scene, so scrollable
        // content would stop above the floating bar and clip. Screens reserve
        // TAB_BAR_SPACE in their own content instead, which lets lists scroll
        // *under* the bar the way they should.
        //
        // maxWidth centres every tab in a phone-width column on tablets and
        // unfolded foldables. On a phone `contentWidth` === the screen width,
        // so this is a no-op — the layout you've been checking is untouched.
        sceneStyle: {
          backgroundColor: theme.background,
          maxWidth: contentWidth,
          width: '100%',
          alignSelf: 'center',
        },
        headerRight: () => (
          <Pressable
            onPress={() => {
              haptics.tap();
              // Confirm before leaving: the heart sits in the header of every
              // tab, so it's easy to hit by accident, and this opens an
              // external page that asks for money.
              dialog.show({
                title: t('settings.supportTitle'),
                message: t('settings.supportMessage'),
                icon: 'favorite',
                iconTone: 'primary',
                secondaryAction: { label: t('settings.supportCancel'), onPress: () => {} },
                primaryAction: { label: t('settings.supportButton'), onPress: openSupportPage },
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
      {/* Icons come from FloatingTabBar's own route→icon map. */}
      <Tabs.Screen name="index" options={{ title: t('tabs.transcribe'), tabBarLabel: t('tabs.transcribe') }} />
      <Tabs.Screen name="record" options={{ title: t('tabs.record'), tabBarLabel: t('tabs.record') }} />
      <Tabs.Screen name="history" options={{ title: t('tabs.history'), tabBarLabel: t('tabs.history') }} />
      <Tabs.Screen name="chat" options={{ title: t('tabs.chat'), tabBarLabel: t('tabs.chat') }} />
      <Tabs.Screen name="settings" options={{ title: t('tabs.settings'), tabBarLabel: t('tabs.settings') }} />
    </Tabs>
  );
}
