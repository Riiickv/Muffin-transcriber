/**
 * A stable, stylised waveform for the audio player - PURE and unit-testable.
 *
 * NOT the real audio amplitude: reading the PCM of a long recording into JS is a
 * memory hit we don't want on a low-end phone, so the bars are a deterministic
 * pattern seeded by the recording's id. Same recording, same shape, every render
 * and every session, with nothing stored. Swapping in true amplitude later is a
 * drop-in: return the measured buckets from here instead.
 *
 * Values are heights in 0..1.
 */
export function waveformBars(seed: string, count: number): number[] {
  // FNV-1a hash of the id -> a 32-bit state for a tiny deterministic PRNG
  // (mulberry32). No Math.random, so it's identical across devices and runs.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const rand = () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    // Bias to mid heights with the odd taller peak, so it reads as speech rather
    // than noise. Floored at 0.2 so no bar disappears.
    const base = 0.25 + rand() * 0.55;
    const peak = rand() > 0.85 ? 0.2 : 0;
    bars.push(Math.max(0.2, Math.min(1, base + peak)));
  }
  return bars;
}
