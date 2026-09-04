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
): string | null {
  const chosenIndex = orderedIds.indexOf(chosenId);
  // A model the catalog does not know about. Refuse rather than guess which
  // side of it is faster.
  if (chosenIndex < 0) return null;

  const downloaded = new Set(downloadedIds);

  // Everything faster than what the user chose, fastest first. If the user
  // already picked the fastest model there is nothing to draft WITH, and
  // drafting with the same model would just do the work twice.
  for (let i = 0; i < chosenIndex; i++) {
    const id = orderedIds[i];
    if (!downloaded.has(id)) continue;
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
