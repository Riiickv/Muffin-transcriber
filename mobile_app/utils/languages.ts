// The UI stores a display name (e.g. "Italian"); Whisper wants the ISO 639-1
// code (e.g. "it"), or "auto" to detect the language itself.

import { t } from '@/utils/i18n';

// `name` is the stored identity (English, used to look up the Whisper code and
// saved in settings). `endonym` is what the user SEES: the language written in
// itself - "Italiano", "Deutsch", "日本語". Endonyms don't change with the app
// language and need no per-language translation table, and crucially they don't
// depend on the phone's Intl engine (Intl.DisplayNames isn't reliably present on
// Hermes, which left the whole list in English before).
type Language = { name: string; code: string; endonym: string };

// Every language Whisper's multilingual models can transcribe.
const LANGUAGES: Language[] = [
  { name: 'Afrikaans', code: 'af', endonym: 'Afrikaans' },
  { name: 'Albanian', code: 'sq', endonym: 'Shqip' },
  { name: 'Amharic', code: 'am', endonym: 'አማርኛ' },
  { name: 'Arabic', code: 'ar', endonym: 'العربية' },
  { name: 'Armenian', code: 'hy', endonym: 'Հայերեն' },
  { name: 'Assamese', code: 'as', endonym: 'অসমীয়া' },
  { name: 'Azerbaijani', code: 'az', endonym: 'Azərbaycanca' },
  { name: 'Bashkir', code: 'ba', endonym: 'Башҡортса' },
  { name: 'Basque', code: 'eu', endonym: 'Euskara' },
  { name: 'Belarusian', code: 'be', endonym: 'Беларуская' },
  { name: 'Bengali', code: 'bn', endonym: 'বাংলা' },
  { name: 'Bosnian', code: 'bs', endonym: 'Bosanski' },
  { name: 'Breton', code: 'br', endonym: 'Brezhoneg' },
  { name: 'Bulgarian', code: 'bg', endonym: 'Български' },
  { name: 'Cantonese', code: 'yue', endonym: '粵語' },
  { name: 'Catalan', code: 'ca', endonym: 'Català' },
  { name: 'Chinese', code: 'zh', endonym: '中文' },
  { name: 'Croatian', code: 'hr', endonym: 'Hrvatski' },
  { name: 'Czech', code: 'cs', endonym: 'Čeština' },
  { name: 'Danish', code: 'da', endonym: 'Dansk' },
  { name: 'Dutch', code: 'nl', endonym: 'Nederlands' },
  { name: 'English', code: 'en', endonym: 'English' },
  { name: 'Estonian', code: 'et', endonym: 'Eesti' },
  { name: 'Faroese', code: 'fo', endonym: 'Føroyskt' },
  { name: 'Finnish', code: 'fi', endonym: 'Suomi' },
  { name: 'French', code: 'fr', endonym: 'Français' },
  { name: 'Galician', code: 'gl', endonym: 'Galego' },
  { name: 'Georgian', code: 'ka', endonym: 'ქართული' },
  { name: 'German', code: 'de', endonym: 'Deutsch' },
  { name: 'Greek', code: 'el', endonym: 'Ελληνικά' },
  { name: 'Gujarati', code: 'gu', endonym: 'ગુજરાતી' },
  { name: 'Haitian Creole', code: 'ht', endonym: 'Kreyòl ayisyen' },
  { name: 'Hausa', code: 'ha', endonym: 'Hausa' },
  { name: 'Hawaiian', code: 'haw', endonym: 'ʻŌlelo Hawaiʻi' },
  { name: 'Hebrew', code: 'he', endonym: 'עברית' },
  { name: 'Hindi', code: 'hi', endonym: 'हिन्दी' },
  { name: 'Hungarian', code: 'hu', endonym: 'Magyar' },
  { name: 'Icelandic', code: 'is', endonym: 'Íslenska' },
  { name: 'Indonesian', code: 'id', endonym: 'Bahasa Indonesia' },
  { name: 'Italian', code: 'it', endonym: 'Italiano' },
  { name: 'Japanese', code: 'ja', endonym: '日本語' },
  { name: 'Javanese', code: 'jw', endonym: 'Basa Jawa' },
  { name: 'Kannada', code: 'kn', endonym: 'ಕನ್ನಡ' },
  { name: 'Kazakh', code: 'kk', endonym: 'Қазақша' },
  { name: 'Khmer', code: 'km', endonym: 'ខ្មែរ' },
  { name: 'Korean', code: 'ko', endonym: '한국어' },
  { name: 'Lao', code: 'lo', endonym: 'ລາວ' },
  { name: 'Latin', code: 'la', endonym: 'Latina' },
  { name: 'Latvian', code: 'lv', endonym: 'Latviešu' },
  { name: 'Lingala', code: 'ln', endonym: 'Lingála' },
  { name: 'Lithuanian', code: 'lt', endonym: 'Lietuvių' },
  { name: 'Luxembourgish', code: 'lb', endonym: 'Lëtzebuergesch' },
  { name: 'Macedonian', code: 'mk', endonym: 'Македонски' },
  { name: 'Malagasy', code: 'mg', endonym: 'Malagasy' },
  { name: 'Malay', code: 'ms', endonym: 'Bahasa Melayu' },
  { name: 'Malayalam', code: 'ml', endonym: 'മലയാളം' },
  { name: 'Maltese', code: 'mt', endonym: 'Malti' },
  { name: 'Maori', code: 'mi', endonym: 'Māori' },
  { name: 'Marathi', code: 'mr', endonym: 'मराठी' },
  { name: 'Mongolian', code: 'mn', endonym: 'Монгол' },
  { name: 'Myanmar', code: 'my', endonym: 'မြန်မာ' },
  { name: 'Nepali', code: 'ne', endonym: 'नेपाली' },
  { name: 'Norwegian', code: 'no', endonym: 'Norsk' },
  { name: 'Nynorsk', code: 'nn', endonym: 'Nynorsk' },
  { name: 'Occitan', code: 'oc', endonym: 'Occitan' },
  { name: 'Pashto', code: 'ps', endonym: 'پښتو' },
  { name: 'Persian', code: 'fa', endonym: 'فارسی' },
  { name: 'Polish', code: 'pl', endonym: 'Polski' },
  { name: 'Portuguese', code: 'pt', endonym: 'Português' },
  { name: 'Punjabi', code: 'pa', endonym: 'ਪੰਜਾਬੀ' },
  { name: 'Romanian', code: 'ro', endonym: 'Română' },
  { name: 'Russian', code: 'ru', endonym: 'Русский' },
  { name: 'Sanskrit', code: 'sa', endonym: 'संस्कृतम्' },
  { name: 'Serbian', code: 'sr', endonym: 'Српски' },
  { name: 'Shona', code: 'sn', endonym: 'ChiShona' },
  { name: 'Sindhi', code: 'sd', endonym: 'سنڌي' },
  { name: 'Sinhala', code: 'si', endonym: 'සිංහල' },
  { name: 'Slovak', code: 'sk', endonym: 'Slovenčina' },
  { name: 'Slovenian', code: 'sl', endonym: 'Slovenščina' },
  { name: 'Somali', code: 'so', endonym: 'Soomaali' },
  { name: 'Spanish', code: 'es', endonym: 'Español' },
  { name: 'Sundanese', code: 'su', endonym: 'Basa Sunda' },
  { name: 'Swahili', code: 'sw', endonym: 'Kiswahili' },
  { name: 'Swedish', code: 'sv', endonym: 'Svenska' },
  { name: 'Tagalog', code: 'tl', endonym: 'Tagalog' },
  { name: 'Tajik', code: 'tg', endonym: 'Тоҷикӣ' },
  { name: 'Tamil', code: 'ta', endonym: 'தமிழ்' },
  { name: 'Tatar', code: 'tt', endonym: 'Татарча' },
  { name: 'Telugu', code: 'te', endonym: 'తెలుగు' },
  { name: 'Thai', code: 'th', endonym: 'ไทย' },
  { name: 'Tibetan', code: 'bo', endonym: 'བོད་སྐད་' },
  { name: 'Turkish', code: 'tr', endonym: 'Türkçe' },
  { name: 'Turkmen', code: 'tk', endonym: 'Türkmençe' },
  { name: 'Ukrainian', code: 'uk', endonym: 'Українська' },
  { name: 'Urdu', code: 'ur', endonym: 'اردو' },
  { name: 'Uzbek', code: 'uz', endonym: 'Oʻzbekcha' },
  { name: 'Vietnamese', code: 'vi', endonym: 'Tiếng Việt' },
  { name: 'Welsh', code: 'cy', endonym: 'Cymraeg' },
  { name: 'Yiddish', code: 'yi', endonym: 'ייִדיש' },
  { name: 'Yoruba', code: 'yo', endonym: 'Yorùbá' },
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

// Output language for the LLM formatter/summarizer. "Original" keeps whatever
// language the transcript is in; any other choice asks the model to write in it.
export function getFormatLanguageOptions() {
  return [
    { label: t('languages.original') || 'Original', value: 'Auto-Detect / Original' },
    ...LANGUAGES.map((l) => ({ label: l.endonym, value: l.name })),
  ];
}
