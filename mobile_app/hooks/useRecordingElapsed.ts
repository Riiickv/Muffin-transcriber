import { useEffect, useState } from 'react';

// One clock for every place that shows how long the recording has run (the
// small mic in the tab bar, the big one on the home screen). It lives outside
// the components so a timer that appears part-way through a recording shows
// the real time, not zero.
let startedAt: number | null = null;

/** Whole seconds since recording started; 0 when not recording. */
export function useRecordingElapsed(isRecording: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isRecording) {
      startedAt = null;
      setElapsed(0);
      return;
    }
    if (startedAt === null) startedAt = Date.now();
    const tick = () => setElapsed(Math.floor((Date.now() - (startedAt ?? Date.now())) / 1000));
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [isRecording]);
  return elapsed;
}

export const formatElapsed = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
