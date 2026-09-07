/**
 * Which model, if any, should produce the FIRST draft of a transcription.
 *
 * The idea: show a rough transcript in a couple of seconds from a small model,
 * then quietly replace it with the chosen model's version when that lands. The
 * job of a voice-message reader is "what did they say", and the rough pass
 * usually answers it before the accurate one has finished loading.
 *
 * Pure on purpose. The orchestration needs whisper and the filesystem; the
 * DECISION is arithmetic over a list of ids, and that is the part worth having
 * tests for. Same reason modelTimeEstimate is split this way.
 */


/**
 * Models whose language identification is not to be trusted.
 *
 * Whisper detects the language from the first window using the encoder, and
 * Tiny's is weak enough to call Italian English. That is survivable when the
 * user has chosen a language, and not survivable on Auto-Detect: the draft
 * would appear in the wrong language and then be replaced, which reads as the
 * app being broken rather than as a draft being refined.
 */
function hasWeakLanguageId(modelId: string): boolean {
  return /tiny/i.test(modelId);
}

/**
 * @param chosenId      the model the user picked.
 * @param downloadedIds every whisper model actually on disk.
 * @param orderedIds    every whisper model, FASTEST FIRST. WHISPER_MODELS is
 *                      declared in that order, which is what makes an index
 *                      comparison meaningful.
 * @returns the id to draft with, or null when drafting is pointless or
 *          impossible.
 */
export function pickDraftModel(
  chosenId: string,
  downloadedIds: readonly string[],
  orderedIds: readonly string[],
  /** True when the user left Language on Auto-Detect and nothing is known. */
  languageIsAuto: boolean = false,
  /**
   * Measured per-window cost of a model relative to the fastest, or null when
   * unknown. Passed IN rather than imported, for the same reason orderedIds is:
   * this module stays pure and testable in plain Node, and the caller owns the
   * measurements. relativeCost in modelTimeEstimate is what production passes.
   *
   * Omitted, nothing drafts. That is deliberate. Without costs the only
   * available ranking is catalog position, and catalog position is exactly the
   * proxy that turned out to be wrong: Most accurate measures 5.7x Fastest
   * while Balanced measures 12.2x, so position would offer Balanced as the
   * draft for a Most accurate run and make it slower, not faster.
   */
  costOf?: (id: string) => number | null,
): string | null {
  const chosenIndex = orderedIds.indexOf(chosenId);
  // A model the catalog does not know about. Refuse rather than guess which
  // side of it is faster.
  if (chosenIndex < 0) return null;

  const downloaded = new Set(downloadedIds);

  // A draft has to be BOTH rougher and genuinely cheaper, and those two used to
  // be the same test.
  //
  // The catalog is ordered by quality, and that was taken as an order by speed
  // as well. Measured per-window costs say otherwise: Most accurate is 5.7x
  // Fastest while Balanced is 12.2x, because Balanced keeps tripping whisper's
  // temperature fallback and decoding the same window several times over.
  // Ranking by position alone would have offered Balanced as the "draft" for a
  // Most accurate run, putting a 165 second preview in front of a 76 second
  // job.
  const chosenCost = costOf ? costOf(chosenId) : null;

  for (let i = 0; i < chosenIndex; i++) {
    const id = orderedIds[i];
    if (!downloaded.has(id)) continue;
    // Cheaper by measurement, not by position. An unknown cost on either side
    // means no draft: a draft that might be slower than the real thing is
    // worse than no draft.
    const cost = costOf ? costOf(id) : null;
    if (chosenCost === null || cost === null || cost >= chosenCost) continue;
    // Skipped rather than returned: a faster model that guesses the language
    // wrong produces a draft in the wrong language, and showing that first is
    // worse than showing nothing.
    if (languageIsAuto && hasWeakLanguageId(id)) continue;
    return id;
  }
  return null;
}

/**
 * Is a draft worth it for this much audio?
 *
 * Below a few seconds the accurate model is already quick and a draft only
 * adds a load, a flash of worse text and a second pass. The gain is in the long
 * tail, where the wait is the complaint.
 *
 * Audio length is not always known before transcription starts, so an unknown
 * length is treated as worth drafting: the common unknown case is a shared
 * voice message, which is exactly the case this exists for.
 */
export function shouldDraft(audioMs: number | undefined, minMs: number = 8000): boolean {
  if (audioMs === undefined || audioMs <= 0) return true;
  return audioMs >= minMs;
}
