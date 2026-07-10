import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ModelManager, WHISPER_MODELS, FORMATTER_MODELS, CHAT_MODELS, ModelDef } from '@/utils/ModelManager';

export interface DropdownOption {
  label: string;
  value: string;
}

const toOptions = (models: readonly ModelDef[], downloaded: string[]): DropdownOption[] =>
  models.filter((m) => downloaded.includes(m.id)).map((m) => ({ label: m.name, value: m.id }));

// Downloaded model ids -> {label,value} dropdown options for each model group,
// refreshed whenever the screen regains focus so a model just downloaded on the
// Models tab shows up without a manual reload. Replaces the copy-pasted
// useState + getDownloadedModelIds effect + filter/map block on every screen.
export function useModelOptions() {
  const [downloadedIds, setDownloadedIds] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      ModelManager.getDownloadedModelIds().then((ids) => {
        if (active) setDownloadedIds(ids);
      });
      return () => {
        active = false;
      };
    }, [])
  );

  return {
    downloadedIds,
    whisperOptions: toOptions(WHISPER_MODELS, downloadedIds),
    formatterOptions: toOptions(FORMATTER_MODELS, downloadedIds),
    chatOptions: toOptions(CHAT_MODELS, downloadedIds),
  };
}
