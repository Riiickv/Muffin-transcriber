using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Diagnostics;
using System.Reflection;

namespace MuffinTranscriber;

public static class LocalizationManager
{
    private static Dictionary<string, string> _strings = new();
    private static bool _fallbackMode = true;

    public static void LoadLanguage(string languageCode)
    {
        string filePath = Path.Combine(AppModel.AppDataDir, "Strings", $"{languageCode}.json");
        if (File.Exists(filePath))
        {
            try
            {
                var json = File.ReadAllText(filePath);
                var loaded = JsonSerializer.Deserialize<Dictionary<string, string>>(json);
                if (loaded != null)
                {
                    _strings = loaded;
                    _fallbackMode = false;
                    return;
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Error loading localization {languageCode}: {ex.Message}");
            }
        }
        
        _strings = new Dictionary<string, string>();
        _fallbackMode = true;
    }

    public static void CreateDefaultLanguageFile()
    {
        try
        {
            string stringsDir = Path.Combine(AppModel.AppDataDir, "Strings");
            Directory.CreateDirectory(stringsDir);
            string filePath = Path.Combine(stringsDir, "en.json");

            // Always regenerate en.json from the code. English is the source
            // language, so it must mirror the current AppStrings defaults — an
            // older cached copy would otherwise mask code changes (e.g. a
            // renamed title). Collect defaults with fallback mode forced on.
            _fallbackMode = true;
            var defaults = new Dictionary<string, string>();
            foreach (var prop in typeof(AppStrings).GetProperties(BindingFlags.Public | BindingFlags.Static))
            {
                if (prop.PropertyType == typeof(string))
                {
                    string? value = prop.GetValue(null) as string;
                    if (value != null) defaults[prop.Name] = value;
                }
            }

            var options = new JsonSerializerOptions { WriteIndented = true };
            File.WriteAllText(filePath, JsonSerializer.Serialize(defaults, options));
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Error creating default en.json: {ex.Message}");
        }
    }

    public static string GetString(string key, string fallback)
    {
        if (!_fallbackMode && _strings.TryGetValue(key, out string? value) && value is not null)
        {
            return value;
        }

        return fallback;
    }
}
