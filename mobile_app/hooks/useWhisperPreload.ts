import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { preloadWhisper } from '@/utils/WhisperEngine';
import { ModelManager } from '@/utils/ModelManager';
import { useSettings } from '@/utils/settingsStore';

// Warm the Whisper context if the chosen model is fully downloaded.
// preloadWhisper() is a no-op once anything is loaded or loading.
export function warmWhisperIfReady(modelId: string): void {
  if (!modelId) return;
  ModelManager.isModelDownloaded(modelId)
    .then((downloaded) => {
      if (downloaded) preloadWhisper(ModelManager.getModelPath(modelId));
    })
    .catch(() => {});
}

// Screen hook: warm the model on focus, but only where a transcription is
// clearly imminent (gate with `active`) - a resident large model is ~600MB of
// native RAM, so mere tab visits shouldn't commit it.
export function useWhisperPreload(active: boolean = true) {
  const { settings } = useSettings();
  const modelId = settings.preferredWhisperModel;

  useFocusEffect(
    useCallback(() => {
      if (active) warmWhisperIfReady(modelId);
    }, [active, modelId])
  );
}
