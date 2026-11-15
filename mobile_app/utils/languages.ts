// The language table and the pure Whisper-code mapping live in languageData.ts
// (no i18n import, so they're unit-testable). This file adds only the UI label
// builders, which need translation, and re-exports the data so every existing
// importer of '@/utils/languages' keeps working.

import { t } from '@/utils/i18n';
import { LANGUAGES, parakeetCoversLanguage } from './languageData';
import { isParakeetModel } from './modelCatalog';

export {
  LANGUAGES,
  LANGUAGE_CODE_MAP,
  LANGUAGE_VALUES,
  FORMAT_LANGUAGE_VALUES,
  toLanguageCode,
  languageNameFromCode,
  parakeetCoversCode,
  parakeetCoversLanguage,
} from './languageData';
export type { Language } from './languageData';

// Built at call time so the ONE translated row (Auto-Detect / Original) follows
// the app language; the language names themselves are fixed endonyms. The VALUE
// stays the English name - the identity the app stores and looks up the Whisper
// code by; only the label is what the user reads.

// Auto-Detect first, then the rest.
export function getLanguageOptions() {
  return [
    { label: t('languages.autoDetect') || 'Auto-Detect', value: 'Auto-Detect' },
    ...LANGUAGES.map((l) => ({ label: l.endonym, value: l.name })),
  ];
}

/**
 * The languages the chosen speech model can be asked for.
 *
 * Every picker of the transcription language goes through this, so a model is
 * never offered a language it cannot do. The Fast model gets its 25; an
 * English-only model gets English.
 */
export function getLanguageOptionsForModel(modelId: string, isEnglishOnly = false) {
  const all = getLanguageOptions();
  if (isEnglishOnly) return all.filter((o) => o.value === 'English' || o.value === 'Auto-Detect');
  if (isParakeetModel(modelId)) return all.filter((o) => parakeetCoversLanguage(o.value));
  return all;
}

// Output language for the LLM formatter/summarizer. "Original" keeps whatever
// language the transcript is in; any other choice asks the model to write in it.
export function getFormatLanguageOptions() {
  return [
    { label: t('languages.original') || 'Original', value: 'Auto-Detect / Original' },
    ...LANGUAGES.map((l) => ({ label: l.endonym, value: l.name })),
  ];
}
