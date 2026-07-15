import { getLocales } from 'expo-localization';

import { APP_STRINGS } from '@/constants/strings';
import { TRANSLATIONS } from '@/constants/translations';

/**
 * App language.
 *
 * English lives in constants/strings.ts and is the SOURCE OF TRUTH: it's the
 * only file with every key, and it's the one Ricky edits. Everything in
 * constants/translations/ is a translation OF that file, and may lag behind it.
 * So every lookup falls back to English per-key rather than per-language — add
 * a new English string and the app shows it in English everywhere until someone
 * translates it, instead of showing a blank or a raw key name.
 */

export type AppLanguage = 'auto' | 'en' | 'it' | 'es' | 'fr' | 'de' | 'pt';

/** Language names are shown in their OWN language — someone who's set their
 *  phone to Italian is looking for "Italiano", not "Italian". */
export const APP_LANGUAGE_OPTIONS: { label: string; value: AppLanguage }[] = [
  { label: 'Automatic', value: 'auto' },
  { label: 'English', value: 'en' },
  { label: 'Italiano', value: 'it' },
  { label: 'Español', value: 'es' },
  { label: 'Français', value: 'fr' },
  { label: 'Deutsch', value: 'de' },
  { label: 'Português', value: 'pt' },
];

/** Set by the root layout from the saved setting. Module-level rather than
 *  React state because t() is a plain function called from everywhere. */
let currentLanguage: Exclude<AppLanguage, 'auto'> = 'en';

/** What 'auto' resolves to: the phone's language, if we speak it. */
export function resolveDeviceLanguage(): Exclude<AppLanguage, 'auto'> {
  try {
    // Locales are ordered by the user's own preference, so the first one we
    // support is the best answer — someone with [it, en] wants Italian.
    for (const locale of getLocales()) {
      const code = locale.languageCode?.toLowerCase();
      if (code && code in TRANSLATIONS) {
        return code as Exclude<AppLanguage, 'auto'>;
      }
      if (code === 'en') return 'en';
    }
  } catch {
    // getLocales can throw on a misconfigured device; English is a safe answer.
  }
  return 'en';
}

export function setAppLanguage(lang: AppLanguage): void {
  currentLanguage = lang === 'auto' ? resolveDeviceLanguage() : lang;
}

export function getAppLanguage(): Exclude<AppLanguage, 'auto'> {
  return currentLanguage;
}

function lookup(source: any, keys: string[]): string | undefined {
  let value: any = source;
  for (const k of keys) {
    if (value == null || value[k] === undefined) return undefined;
    value = value[k];
  }
  return typeof value === 'string' ? value : undefined;
}

/**
 * Look up a dot-path key, e.g. t('transcribe.loadingModel').
 *
 * Returns '' if the key doesn't exist in ANY language, so a deleted string
 * can't crash the app.
 */
export function t(key: string): string {
  try {
    const keys = key.split('.');
    if (currentLanguage !== 'en') {
      const translated = lookup(TRANSLATIONS[currentLanguage], keys);
      // An empty string in a translation file means "not translated yet", so
      // fall through to English rather than rendering nothing.
      if (translated) return translated;
    }
    return lookup(APP_STRINGS, keys) ?? '';
  } catch {
    return '';
  }
}
