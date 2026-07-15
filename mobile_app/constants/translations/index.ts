import { IT } from './it';
import { ES } from './es';
import { FR } from './fr';
import { DE } from './de';
import { PT } from './pt';

/**
 * Every language the app UI speaks, except English — English lives in
 * constants/strings.ts and is the fallback for any key missing here.
 *
 * Deliberately NOT typed as the full APP_STRINGS shape: a translation is
 * allowed to be incomplete, and t() falls back per-key. Requiring every key
 * would mean a new English string breaks the build in five files at once.
 *
 * Adding a language: write the file, import it here, add it to APP_LANGUAGE_OPTIONS
 * in utils/i18n.ts, and add its code to the AppLanguage type.
 */
export const TRANSLATIONS: Record<string, any> = {
  it: IT,
  es: ES,
  fr: FR,
  de: DE,
  pt: PT,
};
