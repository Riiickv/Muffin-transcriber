import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { setModelsPresent } from '@/utils/modelPresence';
import { ensureModelSelections } from '@/utils/modelSelection';
import { ModelManager, WHISPER_MODELS, FORMATTER_MODELS, CHAT_MODELS, ModelDef, modelName } from '@/utils/ModelManager';

export interface DropdownOption {
  label: string;
  value: string;
}

// label goes through modelName(), NOT the raw m.name: m.name is the English
// fallback, and using it directly here is exactly what left the Transcribe /
// Record / History model pickers in English while the rest of the app was
// translated. Every screen that shows a model MUST resolve the label the same
// way - see modelName() in utils/ModelManager.ts.
const toOptions = (models: readonly ModelDef[], downloaded: string[]): DropdownOption[] =>
  models.filter((m) => downloaded.includes(m.id)).map((m) => ({ label: modelName(m), value: m.id }));

// Downloaded model ids -> {label,value} dropdown options for each model group,
// refreshed whenever the screen regains focus so a model just downloaded on the
// Models tab shows up without a manual reload. Replaces the copy-pasted
// useState + getDownloadedModelIds effect + filter/map block on every screen.
export function useModelOptions() {
  const [downloadedIds, setDownloadedIds] = useState<string[]>([]);
  // downloadedIds is [] before the disk has been read, which is indistinguishable
  // from "you have no models" - and screens that key off emptiness would flash
  // their empty state at every existing user on every launch. `ready` says the
  // answer is real.
  const [ready, setReady] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      ModelManager.getDownloadedModelIds().then((ids) => {
        if (active) {
          setDownloadedIds(ids);
          setReady(true);
          // Publish for the header and tab bar, which can't ask for themselves.
          setModelsPresent(ids.length > 0);
          // Here, because this is the moment we know what's on disk. Fills in a
          // preference that's empty or points at a deleted model, so nobody
          // downloads a model and is then told "No model selected". Never
          // overrides a choice the user made, and only writes on a real change.
          ensureModelSelections(ids).catch(() => {});
        }
      });
      return () => {
        active = false;
      };
    }, [])
  );

  return {
    downloadedIds,
    ready,
    whisperOptions: toOptions(WHISPER_MODELS, downloadedIds),
    formatterOptions: toOptions(FORMATTER_MODELS, downloadedIds),
    chatOptions: toOptions(CHAT_MODELS, downloadedIds),
  };
}
