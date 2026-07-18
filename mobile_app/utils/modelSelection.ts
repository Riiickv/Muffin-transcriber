import { WHISPER_MODELS, FORMATTER_MODELS, CHAT_MODELS, ModelDef } from './ModelManager';
import { loadSettings, saveSettings } from './settingsStore';
import { recommendedModelId, ModelGroup } from './deviceTier';

/**
 * Point every "preferred model" setting at something that actually exists.
 *
 * Downloading a model and then being told "No model selected" is a baffling
 * thing to do to someone - they just downloaded it, on a screen that said it was
 * the one for their phone. The setup would have handed them straight into that.
 *
 * It also repairs a real hole: deleting the model you had selected left the
 * setting pointing at a file that's gone, and nothing noticed until whisper
 * failed to load.
 *
 * Deliberately conservative about the user's own choice:
 *  - a selection that's still installed is NEVER touched, even if we'd have
 *    suggested otherwise. They picked it; it's their phone.
 *  - empty, or pointing at something deleted, gets filled.
 *  - the suggested model wins when it's installed, otherwise the strongest thing
 *    they DO have. If they went out of their way to download the big one, that's
 *    the one they want, whatever the RAM says.
 */
function pickFor(
  models: readonly ModelDef[],
  group: ModelGroup,
  current: string,
  installed: Set<string>
): string {
  if (current && installed.has(current)) return current;

  const suggested = recommendedModelId(group);
  if (suggested && installed.has(suggested)) return suggested;

  // The catalog runs fastest -> most accurate, so the last installed entry is
  // the strongest one they have.
  for (let i = models.length - 1; i >= 0; i--) {
    if (installed.has(models[i].id)) return models[i].id;
  }
  return '';
}

/** Called whenever we've just read what's on disk. Safe to call often. */
export async function ensureModelSelections(installedIds: string[]): Promise<void> {
  const settings = await loadSettings();
  const installed = new Set(installedIds);

  const next = {
    ...settings,
    preferredWhisperModel: pickFor(WHISPER_MODELS, 'whisper', settings.preferredWhisperModel, installed),
    preferredFormatterModel: pickFor(FORMATTER_MODELS, 'formatter', settings.preferredFormatterModel, installed),
    preferredChatModel: pickFor(CHAT_MODELS, 'chat', settings.preferredChatModel, installed),
  };

  // This runs on every screen focus, so write only on a real change - otherwise
  // it's a disk write and a re-render of every subscriber, several times a
  // minute, for nothing.
  const changed =
    next.preferredWhisperModel !== settings.preferredWhisperModel ||
    next.preferredFormatterModel !== settings.preferredFormatterModel ||
    next.preferredChatModel !== settings.preferredChatModel;

  if (changed) await saveSettings(next);
}
