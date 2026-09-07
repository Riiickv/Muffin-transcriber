import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { preloadWhisper } from '@/utils/WhisperEngine';
import { ModelManager, WHISPER_MODELS } from '@/utils/ModelManager';
import { useSettings, loadSettings } from '@/utils/settingsStore';
import { relativeCost } from '@/utils/modelTimeEstimate';
import { pickDraftModel } from '@/utils/progressiveDraft';
import { toLanguageCode } from '@/utils/languages';

/**
 * Warm the model that will ACTUALLY run first.
 *
 * Not always the chosen one. With progressive transcription on, the first pass
 * belongs to a smaller draft model, and warming the chosen one instead is worse
 * than warming nothing: loadWhisper unloads before it loads, so the draft pass
 * throws away the 850MB context this just paid for and the accurate pass then
 * loads it a second time. A shared voice message went from one large load to
 * two, which is how a 1:20 message took three minutes.
 *
 * preloadWhisper is a no-op once something is loaded or loading, so calling
 * this repeatedly is free.
 */
export async function warmWhisperIfReady(
  modelId: string,
  /**
   * Does the caller go through transcribeProgressive?
   *
   * It MATTERS, and getting it wrong is worse than not warming at all. Only
   * the Muffin! tab runs a draft pass; Record and History Re-transcribe call
   * loadWhisper with the chosen model directly. Warming a draft model for
   * those meant loadWhisper found the wrong context resident, and because it
   * coalesces with any load in flight, the user's tap first WAITED for a model
   * it did not want to finish loading, then unloaded it, then loaded the right
   * one. Reported as "it takes ages to mount the model, and even if it's
   * mounted already, sometimes it stops and resumes ages later", which is
   * exactly what that looks like from the outside.
   */
  opts: { progressive?: boolean } = {},
): Promise<void> {
  if (!modelId) return;
  try {
    if (!(await ModelManager.isModelDownloaded(modelId))) return;

    let first = modelId;
    const settings = await loadSettings();
    if (opts.progressive && settings.progressiveTranscription) {
      const downloaded: string[] = [];
      for (const m of WHISPER_MODELS) {
        if (await ModelManager.isModelDownloaded(m.id)) downloaded.push(m.id);
      }
      // The FOURTH argument is the whole point and it was missing.
      //
      // pickDraftModel skips Tiny when the language is Auto-Detect, because
      // Tiny's language ID is weak enough to call Italian English. Omitting the
      // flag defaults it to false, so this warmed Tiny while the real run,
      // which does pass it, went on to pick something else and unloaded Tiny to
      // get there. Auto-Detect is the DEFAULT setting, so the common case was
      // warming one model and then paying for a second: exactly the double load
      // that warming the first-to-run model was written to prevent.
      const draft = pickDraftModel(
        modelId,
        downloaded,
        WHISPER_MODELS.map((m) => m.id),
        toLanguageCode(settings.defaultLanguage) === 'auto',
        relativeCost,
      );
      if (draft) first = draft;
    }

    preloadWhisper(ModelManager.getModelPath(first));
  } catch {
    // A failed warm costs latency, never correctness: the transcription path
    // loads whatever it needs anyway.
  }
}

// Screen hook: warm on focus, but only where a transcription is clearly
// imminent (gate with `active`) - a resident large model is ~600MB of native
// RAM, so mere tab visits shouldn't commit it.
export function useWhisperPreload(
  active: boolean = true,
  opts: { progressive?: boolean } = {},
) {
  const { settings } = useSettings();
  const modelId = settings.preferredWhisperModel;
  const progressive = !!opts.progressive;

  useFocusEffect(
    useCallback(() => {
      if (active) void warmWhisperIfReady(modelId, { progressive });
    }, [active, modelId, progressive])
  );
}
