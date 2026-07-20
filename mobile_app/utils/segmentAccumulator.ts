/**
 * Stitches whisper's segment callbacks into the transcript so far - PURE, so
 * it's unit-testable in plain Node (WhisperEngine itself imports whisper.rn and
 * can't be).
 *
 * The native side hands back ONLY the segments it just finished, reading from
 * `totalNNew - nNew` onward (cpp/jsi/RNWhisperJSI.cpp). Treating `result` as
 * cumulative - which its name invites - would show the newest chunk alone, so
 * the box would appear to wipe itself every few seconds on a long recording.
 */
export function createSegmentAccumulator(onText: (text: string) => void) {
  let textSoFar = '';
  return (r: { result?: string } | null | undefined) => {
    if (!r?.result) return;
    textSoFar += r.result;
    const trimmed = textSoFar.trim();
    if (trimmed) onText(trimmed);
  };
}
