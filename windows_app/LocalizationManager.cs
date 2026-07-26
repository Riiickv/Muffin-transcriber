using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Diagnostics;

namespace MuffinTranscriber;

/// <summary>
/// String lookup with the SAME fallback model as the mobile app's i18n:
/// selected language -> English -> the literal in code, PER KEY. A missing
/// translation shows English for that one string instead of blanking out or
/// dragging the whole app back to English.
///
/// Two files per language, both in the install dir's Strings folder:
///   {lang}.json     GENERATED from the mobile app's strings (shared catalog)
///   pc.{lang}.json  hand-maintained PC-only strings (updater, engines, ...)
/// </summary>
public static class LocalizationManager
{
    private static Dictionary<string, string> _strings = new();
    private static Dictionary<string, string> _english = new();
    private static bool _englishLoaded;

    /// <summary>
    /// Raised after the language changes at runtime. Windows and pages listen
    /// and re-evaluate their x:Bind bindings (Bindings.Update()), which is what
    /// makes a language change apply live instead of needing a restart.
    /// </summary>
    public static event Action? LanguageChanged;

    /// <summary>Switches language at runtime and tells every listener to repaint.</summary>
    public static void ChangeLanguage(string languageCode)
    {
        LoadLanguage(languageCode);
        LanguageChanged?.Invoke();
    }

    /// <summary>The six languages both apps ship.</summary>
    public static readonly string[] Supported = ["en", "it", "es", "fr", "de", "pt"];

    /// <summary>
    /// "auto" follows Windows, the way the mobile app follows the phone. An
    /// unsupported system language lands on English rather than on nothing.
    /// </summary>
    public static string Resolve(string languageCode)
    {
        if (!string.IsNullOrEmpty(languageCode) && languageCode != "auto") return languageCode;

        string system = System.Globalization.CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
        return Array.IndexOf(Supported, system) >= 0 ? system : "en";
    }

    public static void LoadLanguage(string languageCode)
    {
        if (!_englishLoaded)
        {
            _english = LoadPair("en");
            _englishLoaded = true;
        }

        string resolved = Resolve(languageCode);
        _strings = resolved == "en" ? _english : LoadPair(resolved);
    }

    private static Dictionary<string, string> LoadPair(string languageCode)
    {
        var merged = new Dictionary<string, string>();
        string dir = Path.Combine(AppModel.AppInstallDir, "Strings");
        MergeFile(merged, Path.Combine(dir, $"{languageCode}.json"));
        MergeFile(merged, Path.Combine(dir, $"pc.{languageCode}.json"));
        return merged;
    }

    private static void MergeFile(Dictionary<string, string> into, string filePath)
    {
        if (!File.Exists(filePath)) return;
        try
        {
            var loaded = JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(filePath));
            if (loaded is null) return;
            foreach ((string key, string value) in loaded)
            {
                into[key] = value;
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Error loading localization {filePath}: {ex.Message}");
        }
    }

    public static string GetString(string key, string fallback)
    {
        if (_strings.TryGetValue(key, out string? value) && !string.IsNullOrEmpty(value)) return value;
        if (_english.TryGetValue(key, out string? english) && !string.IsNullOrEmpty(english)) return english;
        return fallback;
    }

    /// <summary>
    /// The whole catalog with the fallback already resolved per key, handed to
    /// the web UI in one go. The screens carry their English text in the markup
    /// and swap it for these, which is the same fallback model as GetString.
    /// </summary>
    public static Dictionary<string, string> Snapshot()
    {
        var merged = new Dictionary<string, string>(_english);
        foreach ((string key, string value) in _strings)
        {
            if (!string.IsNullOrEmpty(value)) merged[key] = value;
        }
        return merged;
    }
}
