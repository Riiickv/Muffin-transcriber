import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { preloadWhisper } from '@/utils/WhisperEngine';
import { ModelManager, WHISPER_MODELS } from '@/utils/ModelManager';
import { useSettings, loadSettings } from '@/utils/settingsStore';
import { pickDraftModel } from '@/utils/progressiveDraft';

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
export async function warmWhisperIfReady(modelId: string): Promise<void> {
  if (!modelId) return;
  try {
    if (!(await ModelManager.isModelDownloaded(modelId))) return;

    let first = modelId;
    const settings = await loadSettings();
    if (settings.progressiveTranscription) {
      const downloaded: string[] = [];
      for (const m of WHISPER_MODELS) {
        if (await ModelManager.isModelDownloaded(m.id)) downloaded.push(m.id);
      }
      const draft = pickDraftModel(
        modelId,
        downloaded,
        WHISPER_MODELS.map((m) => m.id),
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
export function useWhisperPreload(active: boolean = true) {
  const { settings } = useSettings();
  const modelId = settings.preferredWhisperModel;

  useFocusEffect(
    useCallback(() => {
      if (active) void warmWhisperIfReady(modelId);
    }, [active, modelId])
  );
}
