import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from './ThemeProvider';
import { Icon } from './Icon';
import { AnimatedPressable } from './AnimatedPressable';
import { useRecording } from './RecordingProvider';
import { FLOATING_CHROME, floatingChromeColors } from '@/constants/tokens';

// Matches the tab-bar pill height (item 40 + padding 5*2 + border 1*2), so the
// circle lines up as a sibling of the bar, not a button hovering next to it.
const SIZE = 52;
// A distinctly darker red than the danger accent, so "recording" reads as a
// deliberate state.
const RECORDING_RED = '#B3261E';
const BAR_COUNT = 3;
const MID = (BAR_COUNT - 1) / 2;

/**
 * The record button at the right of the tab bar. Idle, it wears the same frosted
 * chrome as the pill (so it reads as a detached piece of the same bar); while
 * recording it fills a darker red, pulses faintly, and the mic icon becomes
 * three bars whose height follows the live mic level.
 */
export function RecordFab() {
  const { theme } = useTheme();
  const { isRecording, toggle, level } = useRecording();

  const pulse = useSharedValue(1);
  useEffect(() => {
    if (isRecording) {
      pulse.value = withRepeat(withTiming(1.04, { duration: 750, easing: Easing.inOut(Easing.quad) }), -1, true);
    } else {
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [isRecording]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const idleChrome = { ...FLOATING_CHROME, ...floatingChromeColors(theme.isDark) };

  return (
    <Animated.View style={pulseStyle}>
      <AnimatedPressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
        accessibilityState={{ selected: isRecording }}
        style={[
          styles.fab,
          isRecording
            ? { backgroundColor: RECORDING_RED, borderColor: RECORDING_RED }
            : idleChrome,
        ]}
      >
        {isRecording ? <Waveform level={level} /> : <Icon name="mic" filled size={24} color={theme.tint} />}
      </AnimatedPressable>
    </Animated.View>
  );
}

function Waveform({ level }: { level: SharedValue<number> }) {
  return (
    <View style={styles.waveRow}>
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <WaveBar key={i} index={i} level={level} />
      ))}
    </View>
  );
}

// Height tracks the mic level. The middle bar swings widest, so louder speech
// makes the group bloom from the centre.
function WaveBar({ index, level }: { index: number; level: SharedValue<number> }) {
  const minH = 6;
  const maxH = index === MID ? 22 : 13;
  const style = useAnimatedStyle(() => ({ height: minH + level.value * (maxH - minH) }));
  return <Animated.View style={[styles.bar, style]} />;
}

const styles = StyleSheet.create({
  fab: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
  },
  bar: {
    width: 4,
    marginHorizontal: 2,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
});
