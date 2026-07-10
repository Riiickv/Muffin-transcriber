using System.Collections.Generic;
using System.Linq;

namespace MuffinTranscriber;

// UI shows display names (e.g. "Italian"); whisper-cli wants the ISO 639-1 code
// (e.g. "it"), or "auto" to self-detect. Auto-Detect is the default.
public static class WhisperLanguages
{
    public const string AutoDetect = "Auto-Detect";
    public const string FormatOriginal = "Auto-Detect / Original";

    // Every language Whisper's multilingual models can transcribe.
    private static readonly (string Name, string Code)[] All =
    [
        ("Afrikaans", "af"), ("Albanian", "sq"), ("Amharic", "am"), ("Arabic", "ar"),
        ("Armenian", "hy"), ("Assamese", "as"), ("Azerbaijani", "az"), ("Bashkir", "ba"),
        ("Basque", "eu"), ("Belarusian", "be"), ("Bengali", "bn"), ("Bosnian", "bs"),
        ("Breton", "br"), ("Bulgarian", "bg"), ("Cantonese", "yue"), ("Catalan", "ca"),
        ("Chinese", "zh"), ("Croatian", "hr"), ("Czech", "cs"), ("Danish", "da"),
        ("Dutch", "nl"), ("English", "en"), ("Estonian", "et"), ("Faroese", "fo"),
        ("Finnish", "fi"), ("French", "fr"), ("Galician", "gl"), ("Georgian", "ka"),
        ("German", "de"), ("Greek", "el"), ("Gujarati", "gu"), ("Haitian Creole", "ht"),
        ("Hausa", "ha"), ("Hawaiian", "haw"), ("Hebrew", "he"), ("Hindi", "hi"),
        ("Hungarian", "hu"), ("Icelandic", "is"), ("Indonesian", "id"), ("Italian", "it"),
        ("Japanese", "ja"), ("Javanese", "jw"), ("Kannada", "kn"), ("Kazakh", "kk"),
        ("Khmer", "km"), ("Korean", "ko"), ("Lao", "lo"), ("Latin", "la"),
        ("Latvian", "lv"), ("Lingala", "ln"), ("Lithuanian", "lt"), ("Luxembourgish", "lb"),
        ("Macedonian", "mk"), ("Malagasy", "mg"), ("Malay", "ms"), ("Malayalam", "ml"),
        ("Maltese", "mt"), ("Maori", "mi"), ("Marathi", "mr"), ("Mongolian", "mn"),
        ("Myanmar", "my"), ("Nepali", "ne"), ("Norwegian", "no"), ("Nynorsk", "nn"),
        ("Occitan", "oc"), ("Pashto", "ps"), ("Persian", "fa"), ("Polish", "pl"),
        ("Portuguese", "pt"), ("Punjabi", "pa"), ("Romanian", "ro"), ("Russian", "ru"),
        ("Sanskrit", "sa"), ("Serbian", "sr"), ("Shona", "sn"), ("Sindhi", "sd"),
        ("Sinhala", "si"), ("Slovak", "sk"), ("Slovenian", "sl"), ("Somali", "so"),
        ("Spanish", "es"), ("Sundanese", "su"), ("Swahili", "sw"), ("Swedish", "sv"),
        ("Tagalog", "tl"), ("Tajik", "tg"), ("Tamil", "ta"), ("Tatar", "tt"),
        ("Telugu", "te"), ("Thai", "th"), ("Tibetan", "bo"), ("Turkish", "tr"),
        ("Turkmen", "tk"), ("Ukrainian", "uk"), ("Urdu", "ur"), ("Uzbek", "uz"),
        ("Vietnamese", "vi"), ("Welsh", "cy"), ("Yiddish", "yi"), ("Yoruba", "yo"),
    ];

    private static readonly Dictionary<string, string> NameToCode =
        All.ToDictionary(l => l.Name, l => l.Code);

    // Auto-Detect first, then every language, for the transcription pickers.
    public static readonly IReadOnlyList<string> TranscriptionNames =
        new[] { AutoDetect }.Concat(All.Select(l => l.Name)).ToList();

    // "Original" first, then every language, for the formatter output picker.
    public static readonly IReadOnlyList<string> FormatNames =
        new[] { FormatOriginal }.Concat(All.Select(l => l.Name)).ToList();

    public static string LanguageCode(string display) =>
        NameToCode.TryGetValue(display, out string? code) ? code : "auto";
}
