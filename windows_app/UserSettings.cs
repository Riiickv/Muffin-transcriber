using System.Text.Json;

namespace MuffinTranscriber;

public sealed class UserSettings
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public string DefaultLanguage { get; set; } = "Italian";
    public string AppLanguage { get; set; } = "en"; // en, it, etc.
    public string PreferredWhisperModel { get; set; } = string.Empty;
    public string PreferredFormatterModel { get; set; } = string.Empty;
    public double HistoryListWidth { get; set; } = 350;
    public bool FormatByDefault { get; set; }
    public bool SummarizeByDefault { get; set; }
    public string FormatLanguage { get; set; } = "Auto-Detect / Original";
    public bool NormalizeAudio { get; set; } = true;
    public bool AutoCopyTranscript { get; set; }
    public double SidebarWidth { get; set; } = 320;
    public int WindowWidth { get; set; } = 1000;
    public int WindowHeight { get; set; } = 650;
    public string AutoDeleteCacheDuration { get; set; } = "Never"; // Options: Never, 1 Week, 1 Month
    public string CustomFormatSystemPrompt { get; set; } = string.Empty;
    public string CustomSummarySystemPrompt { get; set; } = string.Empty;
    public bool EnableContextLearning { get; set; } = true;
    public bool EnableAutoUpdateCheck { get; set; } = true;

    public static string SettingsPath => Path.Combine(AppModel.AppDataDir, "winui_settings.json");

    public static UserSettings Load()
    {
        try
        {
            if (File.Exists(SettingsPath))
            {
                UserSettings? settings = JsonSerializer.Deserialize<UserSettings>(File.ReadAllText(SettingsPath));
                if (settings is not null)
                {
                    return settings;
                }
            }
        }
        catch
        {
            // A corrupt settings file should not stop the app from opening.
        }

        return new UserSettings();
    }

    public void Save()
    {
        File.WriteAllText(SettingsPath, JsonSerializer.Serialize(this, JsonOptions));
    }

    public static void Reset()
    {
        if (File.Exists(SettingsPath))
        {
            File.Delete(SettingsPath);
        }
    }
}
