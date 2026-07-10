import { APP_STRINGS } from '@/constants/strings';

// Look up a dot-path key in APP_STRINGS; returns '' if the key is missing so a
// deleted string can't crash the app. e.g. t('transcribe.loadingModel')
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
