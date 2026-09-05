/**
 * Whether running Silero is worth it for a given whisper model.
 *
 * PURE, so the arithmetic below is testable without a phone.
 *
 * ---------------------------------------------------------------------------
 * MEASURED on a Pixel 9 Pro XL (Tensor G4, 4 threads, i8mm), 2026-09-05, six
 * consecutive runs of the same 107s voice message on Fastest:
 *
 *   with VAD:     13.3  13.4  13.5  13.6  14.8  15.5   (mean 14.0s)
 *   without VAD:   9.1  12.1  18.8                     (build 100, noisier)
 *
 *   every run: "97.5s of speech kept in 25 speech spans"
 *
 * So the trim removed 9.5s of a 107s recording, under 9%. Silero itself costs
 * roughly 4 to 5 seconds on that length, and it costs that whatever model runs
 * afterwards, because it is a fixed pass over the audio.
 *
 * The SAVING, though, is 9.5 seconds of audio priced at the model's own speed:
 *
 *   Fastest, ~36x realtime  ->  9.5s of audio is ~0.3s saved. Net loss ~4.5s.
 *   Balanced, ~3x realtime  ->  ~3s saved. Roughly break-even.
 *   Most accurate, <1x      ->  ~12s saved. Clear win.
 *
 * That is why Fastest got SLOWER when the VAD was fixed, which looked like a
 * contradiction until the kept-audio number existed to explain it.
 * ---------------------------------------------------------------------------
 *
 * WHAT THIS TRADES AWAY. Silence is where whisper hallucinates: with nothing to
 * transcribe it emits whatever its language model finds likely. Skipping the
 * trim on the fast tier accepts that risk in exchange for landing inside the
 * ten second target the app is being tuned for. It is a defensible trade only
 * because it is confined to the tier whose whole promise is speed, and because
 * this particular recording turned out to be near-continuous speech: 25 spans
 * with only 9.5s between them.
 *
 * NOT MEASURED, and worth doing before trusting this further: whether a
 * recording with real silence in it (a lecture, a meeting, a voice note with a
 * long pause) changes the balance. A clip that is half silence would save half
 * its length, and then VAD pays for itself even on Fastest.
 */

/**
 * Models fast enough that the fixed cost of Silero outruns anything it saves.
 *
 * Matched on the filename rather than listed by id so a re-quantised Tiny does
 * not silently fall back into paying for a trim it cannot afford.
 */
const TOO_FAST_TO_BENEFIT = /tiny|base/i;

export function shouldRunVad(modelId: string): boolean {
  if (!modelId) return false;
  return !TOO_FAST_TO_BENEFIT.test(modelId);
}
