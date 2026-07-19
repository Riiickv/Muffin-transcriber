import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from './ThemeProvider';
import { Icon } from './Icon';
import { AnimatedPressable } from './AnimatedPressable';
import { useRecording } from './RecordingProvider';

const SIZE = 56;
// A distinctly darker red than the danger accent, so "recording" reads as a
// deliberate state, not just a colour tint.
const RECORDING_RED = '#B3261E';
const BAR_COUNT = 3;

/**
 * The standalone record button that lives at the right of the tab bar. Tap to
 * start/stop. While recording it goes a darker red, pulses very lightly, and the
 * mic icon is replaced by three bars pulsing from the middle. (The bars will
 * follow the mic level once metering is wired; for now they animate on their own.)
 */
export function RecordFab() {
  const { theme } = useTheme();
  const { isRecording, toggle } = useRecording();

  // Faint breathing pulse while recording.
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (isRecording) {
      pulse.value = withRepeat(withTiming(1.06, { duration: 700, easing: Easing.inOut(Easing.quad) }), -1, true);
    } else {
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [isRecording]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <Animated.View style={pulseStyle}>
      <AnimatedPressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
        accessibilityState={{ selected: isRecording }}
        style={[
          styles.fab,
          {
            backgroundColor: isRecording ? RECORDING_RED : theme.tint,
            shadowColor: isRecording ? RECORDING_RED : theme.tint,
          },
        ]}
      >
        {isRecording ? <Waveform /> : <Icon name="mic" filled size={26} color={theme.tintForeground} />}
      </AnimatedPressable>
    </Animated.View>
  );
}

function Waveform() {
  return (
    <View style={styles.waveRow}>
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <WaveBar key={i} index={i} />
      ))}
    </View>
  );
}

// Each bar breathes between a short and a tall height. The middle bar leads and
// is tallest, so the group reads as "pulsing from the middle".
function WaveBar({ index }: { index: number }) {
  const mid = (BAR_COUNT - 1) / 2;
  const distance = Math.abs(index - mid); // 0 for the middle bar
  const tall = 22 - distance * 6; // middle tallest
  const short = 8;
  const h = useSharedValue(short);

  useEffect(() => {
    h.value = withRepeat(
      withTiming(tall, { duration: 520 + distance * 90, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, []);

  const style = useAnimatedStyle(() => ({ height: h.value }));
  return <Animated.View style={[styles.bar, style]} />;
}

const styles = StyleSheet.create({
  fab: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
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
