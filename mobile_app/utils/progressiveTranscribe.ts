import { ModelManager, WHISPER_MODELS } from './ModelManager';
import { loadWhisper, transcribeFile, isWhisperLoaded, TranscribeCallbacks } from './WhisperEngine';
import { pickDraftModel, shouldDraft } from './progressiveDraft';

export type TranscribeResult = { text: string; segments: any[]; language?: string };

export type ProgressiveCallbacks = TranscribeCallbacks & {
  /**
   * The rough pass has landed. Show it. It WILL be replaced, so nothing
   * irreversible should hang off it: no history write, no formatting, no
   * summary. Just words on screen so the reader can start reading.
   */
  onDraft?: (result: TranscribeResult, modelId: string) => void;
  /** The accurate pass is starting, so the UI can say the draft is provisional. */
  onRefineStart?: (modelId: string) => void;
};

/**
 * Transcribe twice: fast then accurate, showing the fast one immediately.
 *
 * Whisper's encoder always processes a full 30 second window, so a short voice
 * message costs about what a long one does, and the accurate model spends most
 * of a wait just being loaded. Meanwhile a tiny model loads in a fraction of
 * the time and reads a voice note well enough to answer "what did they say",
 * which is the actual question. So: answer it in two seconds with the small
 * model, then replace the answer with the good one.
 *
 * This costs MORE total compute, not less. It is a latency trade, and it is
 * only worth making where the wait is the complaint: a shared voice message,
 * or a long recording. `shouldDraft` and `pickDraftModel` decide, and both are
 * pure and tested.
 *
 * The audio is already a 16 kHz mono WAV by the time it gets here, so both
 * passes share one conversion. Doing it twice would eat most of the gain.
 */
export async function transcribeProgressive(
  wavPath: string,
  languageCode: string,
  chosenModelId: string,
  audioMs: number | undefined,
  callbacks?: ProgressiveCallbacks,
  enabled: boolean = true,
): Promise<TranscribeResult> {
  const chosenPath = ModelManager.getModelPath(chosenModelId);

  let draftId: string | null = null;
  // If the accurate model is ALREADY resident, drafting is a net loss and a
  // large one: loadWhisper unloads before it loads, so a draft would throw away
  // a warm 850MB context, load a small one, then pay for the large one a second
  // time. That is exactly what the share-intent warm-up caused - it loaded the
  // chosen model, and this function immediately discarded it. A draft is only
  // worth it when the accurate model has not been paid for yet.
  const chosenAlreadyWarm = isWhisperLoaded(chosenPath);
  if (enabled && !chosenAlreadyWarm && shouldDraft(audioMs)) {
    const downloaded: string[] = [];
    for (const m of WHISPER_MODELS) {
      if (await ModelManager.isModelDownloaded(m.id)) downloaded.push(m.id);
    }
    draftId = pickDraftModel(
      chosenModelId,
      downloaded,
      WHISPER_MODELS.map((m) => m.id),
    );
  }

  if (!draftId) {
    await loadWhisper(chosenPath);
    return transcribeFile(wavPath, languageCode, callbacks);
  }

  // ---- the rough pass --------------------------------------------------
  // Its failure is not the user's problem: if the small model throws, the
  // accurate one still runs and nobody ever learns there was meant to be a
  // draft. A draft that breaks the real transcription would be worse than no
  // draft at all.
  try {
    await loadWhisper(ModelManager.getModelPath(draftId));
    const draft = await transcribeFile(wavPath, languageCode, {
      // No onProgress: two passes reporting into one bar would run it to 100%
      // and then start again, which reads as a stall or a bug.
      onPartialText: callbacks?.onPartialText,
    });
    if (draft.text.trim()) callbacks?.onDraft?.(draft, draftId);
  } catch {
    // Fall through to the accurate pass.
  }

  // ---- the accurate pass -----------------------------------------------
  // loadWhisper swaps the context, so the small model is released before the
  // large one is loaded rather than both being resident. Two sets of weights
  // at once is how the PC got frozen.
  callbacks?.onRefineStart?.(chosenModelId);
  await loadWhisper(chosenPath);
  return transcribeFile(wavPath, languageCode, callbacks);
}
