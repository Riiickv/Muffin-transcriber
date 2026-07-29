using System.Text.Json;

namespace MuffinTranscriber;

public sealed class UserSettings
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public string DefaultLanguage { get; set; } = "Auto-Detect";
    public string AppLanguage { get; set; } = "en"; // en, it, etc.
    public string PreferredWhisperModel { get; set; } = string.Empty;
    public string PreferredFormatterModel { get; set; } = string.Empty;
    public double HistoryListWidth { get; set; } = 350;
    public bool FormatByDefault { get; set; }
    public bool SummarizeByDefault { get; set; }
    public string FormatLanguage { get; set; } = "Auto-Detect / Original";
    public bool NormalizeAudio { get; set; } = true;
    public bool AutoCopyTranscript { get; set; }

    /// <summary>
    /// Show models by their real names (Qwen 2.5 [14B]) rather than by what
    /// they do for you (Very powerful). Off by default: the tier is the useful
    /// answer to "which one do I want", and the model number only means
    /// something once you already know.
    /// </summary>
    public bool ShowModelNames { get; set; }

    /// <summary>
    /// Show which model transcribed a saved recording, on its own line under
    /// the date.
    ///
    /// Separate from ShowModelNames, which is about the model PICKER: there the
    /// question is "which one do I want", here it is "which one made this". A
    /// person who wants tier names while choosing may still want to know that
    /// the transcript they are squinting at came from Fastest.
    /// </summary>
    public bool ShowTranscriptModel { get; set; } = true;

    /// <summary>
    /// Show how long the work took, on its own line.
    ///
    /// Both of these are switches rather than always-on because a detail pane
    /// is not a dashboard: two more lines under every title is a real cost to
    /// pay on every visit, and most visits are to read the words.
    /// </summary>
    public bool ShowTranscriptTiming { get; set; } = true;

    /// <summary>
    /// Show an estimated time per model on the Models screen.
    ///
    /// Off by default, and for a reason particular to the desktop: the number is
    /// derived from this machine's own recorded runs, so on a fresh install
    /// there is nothing to derive it from and the line is absent. Defaulting it
    /// on would mean shipping a switch that appears to do nothing.
    /// </summary>
    public bool ShowModelTimeEstimate { get; set; }
    public double SidebarWidth { get; set; } = 320;
    public int WindowWidth { get; set; } = 1000;
    public int WindowHeight { get; set; } = 650;
    public string AutoDeleteCacheDuration { get; set; } = "Never"; // Options: Never, 1 Week, 1 Month
    public string CustomFormatSystemPrompt { get; set; } = string.Empty;
    public string CustomSummarySystemPrompt { get; set; } = string.Empty;
    public bool EnableContextLearning { get; set; } = true;
    public bool EnableAutoUpdateCheck { get; set; } = true;
    public string ThemeMode { get; set; } = "System"; // System, Light, Dark, AMOLED
    public bool SetupCompleted { get; set; }
    public bool TypewriterEffect { get; set; } = true;
    public string TypewriterSpeed { get; set; } = "Balanced"; // Slow, Balanced, Fast
    public string AccentColor { get; set; } = MuffinTheme.DefaultAccent; // Muffin, Green, Purple, Red

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
