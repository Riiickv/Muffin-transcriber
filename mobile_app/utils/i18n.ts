import { APP_STRINGS } from '@/constants/strings';

/**
 * Safely looks up a string from the central APP_STRINGS dictionary.
 * If the key doesn't exist (e.g. if a user deletes the line from strings.ts),
 * it fails silently and returns an empty string to prevent the app from crashing.
 * 
 * @example t('transcribe.loadingModel')
 */
export function t(key: string): string {
  try {
    const keys = key.split('.');
    let value: any = APP_STRINGS;
    for (const k of keys) {
      if (value[k] === undefined) return '';
      value = value[k];
    }
    if (typeof value === 'string') {
      return value;
    }
    return '';
  } catch (e) {
    return '';
  }
}
