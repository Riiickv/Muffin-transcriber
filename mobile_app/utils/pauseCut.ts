/**
 * Where to cut a long recording so each piece ends in a pause.
 *
 * Pure: no native imports, so it runs under node:test.
 *
 * Why pieces at all. Parakeet attends over the whole clip at once, so its cost
 * grows faster than the audio does. Measured on a PC (docs/speed-research.md):
 * a 181 s clip in one piece took 22.9 s, the same clip cut at pauses about
 * every 30 s took 11.0 s, with the same word error rate. Pieces are also the
 * only way to show progress and partial text, because the library reports
 * neither for this model.
 *
 * Why at a pause. Cutting wherever 30 s happens to land splits a word in two;
 * in the same measurement that cost about one extra error per cut. The quietest
 * moment in the last third of the window is a breath or the end of a sentence.
 */

/** A piece is never shorter than this unless it is the end of the recording. */
export const PIECE_MIN_SECONDS = 20;
/** And never longer than this. */
export const PIECE_MAX_SECONDS = 30;
/**
 * A tail shorter than this is not worth a piece of its own: it rides along
 * with the piece before it, which may then run a little past the maximum.
 */
export const TAIL_SECONDS = 5;

const FRAME_SECONDS = 0.1;

/**
 * The sample index to cut at: the middle of the quietest 100 ms between
 * `minSeconds` and `maxSeconds`. Among equally quiet moments the latest wins,
 * so digital silence gives the longest piece rather than the shortest.
 *
 * Returns the end of the search range when the buffer is too short to search.
 */
export function findQuietCut(
  samples: Int16Array,
  sampleRate: number,
  minSeconds: number = PIECE_MIN_SECONDS,
  maxSeconds: number = PIECE_MAX_SECONDS,
): number {
  const frame = Math.max(1, Math.round(sampleRate * FRAME_SECONDS));
  const from = Math.min(samples.length, Math.floor(minSeconds * sampleRate));
  const to = Math.min(samples.length, Math.floor(maxSeconds * sampleRate));
  if (to - from < frame) return to;

  let best = Infinity;
  let bestAt = to;
  for (let start = from; start + frame <= to; start += frame) {
    let sum = 0;
    for (let i = start; i < start + frame; i++) {
      const s = samples[i];
      sum += s < 0 ? -s : s;
    }
    if (sum <= best) {
      best = sum;
      bestAt = start + (frame >> 1);
    }
  }
  return bestAt;
}

/**
 * How many samples to read for the next piece, given how many are left.
 *
 * `whole` means this read is the rest of the recording and must not be cut.
 */
export function nextRead(
  remainingSamples: number,
  sampleRate: number,
): { samples: number; whole: boolean } {
  const limit = Math.floor((PIECE_MAX_SECONDS + TAIL_SECONDS) * sampleRate);
  if (remainingSamples <= limit) return { samples: Math.max(0, remainingSamples), whole: true };
  return { samples: Math.floor(PIECE_MAX_SECONDS * sampleRate), whole: false };
}

/** "6 pieces, median 2.1s, slowest 3.0s" for the Speed report. */
export function describePieces(ms: number[]): string {
  if (ms.length === 0) return 'no pieces';
  const sorted = [...ms].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const max = sorted[sorted.length - 1];
  return (
    `${ms.length} ${ms.length === 1 ? 'piece' : 'pieces'}, ` +
    `median ${(median / 1000).toFixed(1)}s, slowest ${(max / 1000).toFixed(1)}s`
  );
}
