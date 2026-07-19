// The UI stores a display name (e.g. "Italian"); Whisper wants the ISO 639-1
// code (e.g. "it"), or "auto" to detect the language itself.

import { t, getAppLanguage } from '@/utils/i18n';

type Language = { name: string; code: string };

// Every language Whisper's multilingual models can transcribe.
const LANGUAGES: Language[] = [
  { name: 'Afrikaans', code: 'af' },
  { name: 'Albanian', code: 'sq' },
  { name: 'Amharic', code: 'am' },
  { name: 'Arabic', code: 'ar' },
  { name: 'Armenian', code: 'hy' },
  { name: 'Assamese', code: 'as' },
  { name: 'Azerbaijani', code: 'az' },
  { name: 'Bashkir', code: 'ba' },
  { name: 'Basque', code: 'eu' },
  { name: 'Belarusian', code: 'be' },
  { name: 'Bengali', code: 'bn' },
  { name: 'Bosnian', code: 'bs' },
  { name: 'Breton', code: 'br' },
  { name: 'Bulgarian', code: 'bg' },
  { name: 'Cantonese', code: 'yue' },
  { name: 'Catalan', code: 'ca' },
  { name: 'Chinese', code: 'zh' },
  { name: 'Croatian', code: 'hr' },
  { name: 'Czech', code: 'cs' },
  { name: 'Danish', code: 'da' },
  { name: 'Dutch', code: 'nl' },
  { name: 'English', code: 'en' },
  { name: 'Estonian', code: 'et' },
  { name: 'Faroese', code: 'fo' },
  { name: 'Finnish', code: 'fi' },
  { name: 'French', code: 'fr' },
  { name: 'Galician', code: 'gl' },
  { name: 'Georgian', code: 'ka' },
  { name: 'German', code: 'de' },
  { name: 'Greek', code: 'el' },
  { name: 'Gujarati', code: 'gu' },
  { name: 'Haitian Creole', code: 'ht' },
  { name: 'Hausa', code: 'ha' },
  { name: 'Hawaiian', code: 'haw' },
  { name: 'Hebrew', code: 'he' },
  { name: 'Hindi', code: 'hi' },
  { name: 'Hungarian', code: 'hu' },
  { name: 'Icelandic', code: 'is' },
  { name: 'Indonesian', code: 'id' },
  { name: 'Italian', code: 'it' },
  { name: 'Japanese', code: 'ja' },
  { name: 'Javanese', code: 'jw' },
  { name: 'Kannada', code: 'kn' },
  { name: 'Kazakh', code: 'kk' },
  { name: 'Khmer', code: 'km' },
  { name: 'Korean', code: 'ko' },
  { name: 'Lao', code: 'lo' },
  { name: 'Latin', code: 'la' },
  { name: 'Latvian', code: 'lv' },
  { name: 'Lingala', code: 'ln' },
  { name: 'Lithuanian', code: 'lt' },
  { name: 'Luxembourgish', code: 'lb' },
  { name: 'Macedonian', code: 'mk' },
  { name: 'Malagasy', code: 'mg' },
  { name: 'Malay', code: 'ms' },
  { name: 'Malayalam', code: 'ml' },
  { name: 'Maltese', code: 'mt' },
  { name: 'Maori', code: 'mi' },
  { name: 'Marathi', code: 'mr' },
  { name: 'Mongolian', code: 'mn' },
  { name: 'Myanmar', code: 'my' },
  { name: 'Nepali', code: 'ne' },
  { name: 'Norwegian', code: 'no' },
  { name: 'Nynorsk', code: 'nn' },
  { name: 'Occitan', code: 'oc' },
  { name: 'Pashto', code: 'ps' },
  { name: 'Persian', code: 'fa' },
  { name: 'Polish', code: 'pl' },
  { name: 'Portuguese', code: 'pt' },
  { name: 'Punjabi', code: 'pa' },
  { name: 'Romanian', code: 'ro' },
  { name: 'Russian', code: 'ru' },
  { name: 'Sanskrit', code: 'sa' },
  { name: 'Serbian', code: 'sr' },
  { name: 'Shona', code: 'sn' },
  { name: 'Sindhi', code: 'sd' },
  { name: 'Sinhala', code: 'si' },
  { name: 'Slovak', code: 'sk' },
  { name: 'Slovenian', code: 'sl' },
  { name: 'Somali', code: 'so' },
  { name: 'Spanish', code: 'es' },
  { name: 'Sundanese', code: 'su' },
  { name: 'Swahili', code: 'sw' },
  { name: 'Swedish', code: 'sv' },
  { name: 'Tagalog', code: 'tl' },
  { name: 'Tajik', code: 'tg' },
  { name: 'Tamil', code: 'ta' },
  { name: 'Tatar', code: 'tt' },
  { name: 'Telugu', code: 'te' },
  { name: 'Thai', code: 'th' },
  { name: 'Tibetan', code: 'bo' },
  { name: 'Turkish', code: 'tr' },
  { name: 'Turkmen', code: 'tk' },
  { name: 'Ukrainian', code: 'uk' },
  { name: 'Urdu', code: 'ur' },
  { name: 'Uzbek', code: 'uz' },
  { name: 'Vietnamese', code: 'vi' },
  { name: 'Welsh', code: 'cy' },
  { name: 'Yiddish', code: 'yi' },
  { name: 'Yoruba', code: 'yo' },
];

export const LANGUAGE_CODE_MAP: Record<string, string> = {
  'Auto-Detect': 'auto',
  ...Object.fromEntries(LANGUAGES.map((l) => [l.name, l.code])),
};

export function toLanguageCode(displayName: string | undefined | null): string {
  if (!displayName) return 'auto';
  return LANGUAGE_CODE_MAP[displayName] ?? 'auto';
}

// The valid stored values, for the chat capability layer that only needs to
// know what's allowed - never the labels, which are for humans and localized.
export const LANGUAGE_VALUES = ['Auto-Detect', ...LANGUAGES.map((l) => l.name)];
export const FORMAT_LANGUAGE_VALUES = [
  'Auto-Detect / Original',
  ...LANGUAGES.map((l) => l.name),
];

// A language's name written in the current app language: "en" -> "inglese" when
// the app is Italian. Intl.DisplayNames is driven by the platform's own language
// data, so the whole ~100-name list localizes with no table to hand-write. Where
// the engine lacks Intl.DisplayNames, or a non-standard code ('yue', 'jw') won't
// resolve, we fall back to the English name rather than showing a bare code.
//
// Built once per list (not per name): one DisplayNames instance handles them all.
function makeLocalizer(): (englishName: string, code: string) => string {
  let dn: { of: (code: string) => string | undefined } | null = null;
  try {
    const DisplayNames = (Intl as any).DisplayNames;
    if (DisplayNames) dn = new DisplayNames([getAppLanguage()], { type: 'language' });
  } catch {
    dn = null;
  }
  return (englishName, code) => {
    if (dn) {
      try {
        const label = dn.of(code);
        if (label && label.toLowerCase() !== code.toLowerCase()) {
          return label.charAt(0).toUpperCase() + label.slice(1);
        }
      } catch {
        // fall through to the English name
      }
    }
    return englishName;
  };
}

// Built at call time, NOT as a module constant: the labels depend on the app
// language, and a const would freeze them to whatever language was active when
// the file first loaded. Callers invoke these inside render, so they re-run on
// the language remount. The VALUE stays the English name - it's the identity the
// app stores and looks up the Whisper code by; only the LABEL is localized.

// Auto-Detect first, then the rest.
export function getLanguageOptions() {
  const loc = makeLocalizer();
  return [
    { label: t('languages.autoDetect') || 'Auto-Detect', value: 'Auto-Detect' },
    ...LANGUAGES.map((l) => ({ label: loc(l.name, l.code), value: l.name })),
  ];
}

// Output language for the LLM formatter/summarizer. "Original" keeps whatever
// language the transcript is in; any other choice asks the model to write in it.
export function getFormatLanguageOptions() {
  const loc = makeLocalizer();
  return [
    { label: t('languages.original') || 'Original', value: 'Auto-Detect / Original' },
    ...LANGUAGES.map((l) => ({ label: loc(l.name, l.code), value: l.name })),
  ];
}
