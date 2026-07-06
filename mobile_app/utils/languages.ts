// Whisper expects ISO 639-1 codes (`it`, `en`, ...) or "auto" for detect.
// The UI stores display names ("Italian", "English", ...) — convert here.
export const LANGUAGE_CODE_MAP: Record<string, string> = {
  'Auto-Detect': 'auto',
  'English': 'en',
  'Italian': 'it',
  'Spanish': 'es',
  'French': 'fr',
  'German': 'de',
  'Portuguese': 'pt',
  'Dutch': 'nl',
  'Russian': 'ru',
  'Chinese': 'zh',
  'Japanese': 'ja',
  'Korean': 'ko',
};

export function toLanguageCode(displayName: string | undefined | null): string {
  if (!displayName) return 'auto';
  return LANGUAGE_CODE_MAP[displayName] ?? 'auto';
}

export const LANGUAGE_OPTIONS = Object.keys(LANGUAGE_CODE_MAP).map(key => ({
  label: key,
  value: key
}));
