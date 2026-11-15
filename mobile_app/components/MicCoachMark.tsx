import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';

import { CoachMark } from './CoachMark';
import { useCoachDone } from '@/utils/coachMarks';
import { useIsFirstRun } from '@/utils/modelPresence';
import { SPACING } from '@/constants/tokens';
import { t } from '@/utils/i18n';

/**
 * The coach mark that teaches the mic button. Appears a moment after the app
 * settles, points down at the mic circle, auto-dismisses after a few seconds,
 * and comes back on later launches until the user records or opens the options -
 * at which point RecordFab marks it done and it never shows again.
 */
export function MicCoachMark() {
  const insets = useSafeAreaInsets();
  const done = useCoachDone('mic');
  const isFirstRun = useIsFirstRun();
  const [show, setShow] = useState(false);
  // The hint points at the mic in the tab bar, so it only makes sense where
  // the tab bar is. It used to float over a transcript on the detail screen,
  // pointing at a button that was not there. Home is left out too: it has its
  // own record button with a label and an Options row, which say both halves
  // of this hint already.
  const pathname = usePathname();
  const onTabs = pathname === '/history' || pathname === '/chat' || pathname === '/settings';

  useEffect(() => {
    if (done || isFirstRun) {
      setShow(false);
      return;
    }
    const appear = setTimeout(() => setShow(true), 1400); // let the screen settle
    const dismiss = setTimeout(() => setShow(false), 7500); // auto-dismiss
    return () => {
      clearTimeout(appear);
      clearTimeout(dismiss);
    };
  }, [done, isFirstRun]);

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <CoachMark
        text={t('coach.micHint') || 'Click to record/stop, hold for options!'}
        visible={show && !done && !isFirstRun && onTabs}
        onDismiss={() => setShow(false)}
        arrowRight={18}
        containerStyle={{ position: 'absolute', right: SPACING.lg, bottom: insets.bottom + 76 }}
      />
    </View>
  );
}
