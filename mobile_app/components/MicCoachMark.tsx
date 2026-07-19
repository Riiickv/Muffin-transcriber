import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
        visible={show && !done && !isFirstRun}
        onDismiss={() => setShow(false)}
        arrowRight={18}
        containerStyle={{ position: 'absolute', right: SPACING.lg, bottom: insets.bottom + 76 }}
      />
    </View>
  );
}
