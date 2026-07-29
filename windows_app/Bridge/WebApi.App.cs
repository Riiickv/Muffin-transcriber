using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.UI.Xaml;
using Windows.UI;

namespace MuffinTranscriber.Web;

/// <summary>
/// App-wide handlers: the one bootstrap call every screen makes, live settings,
/// language and accent, and the few shell actions the pages need.
/// </summary>
public sealed partial class WebBridge
{
    private const string PrivacyPolicyUrl = "https://github.com/Riiickv/Muffin-transcriber/blob/main/PRIVACY.md";

    // The only other link the app ever opens, and only when asked. A plain
    // page load: no identifiers, no query string, nothing about the user.
    private const string SupportUrl = "https://buymeacoffee.com/riiickv";

    private void RegisterAppHandlers()
    {
        // One round trip per page load: language, theme and settings arrive
        // together so nothing renders in English or in the wrong accent first.
        Register("app.bootstrap", _ =>
        {
            // Proof that a screen is alive: this call only happens once the
            // HTML has parsed and its scripts have run. The blank-start
            // watchdog waits for exactly this, because NavigationCompleted
            // reported success for the very load that drew nothing.
            PageRendered = true;

            return (object?)new Dictionary<string, object?>
            {
                ["strings"] = LocalizationManager.Snapshot(),
                ["settings"] = SettingsMap(),
                ["theme"] = ThemeMap(),
                ["version"] = AppStrings.AppVersion,
                ["hasMicrophone"] = RecordingController.HasMicrophone,
                ["isRecording"] = RecordingController.IsRecording,
                ["banner"] = _pendingBanner,
                // So a screen opened mid-download shows the ring straight away.
                ["downloads"] = ActiveDownloads(),
            };
        });

        Register("settings.set", args =>
        {
            string key = Str(args, "key");
            if (key.Length == 0) return null;
            ApplySetting(key, args.TryGetProperty("value", out JsonElement v) ? v : default);
            return (object?)SettingsMap();
        });

        Register("app.openUrl", args =>
        {
            string url = Str(args, "url");
            if (url.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("ms-settings:", StringComparison.OrdinalIgnoreCase))
            {
                Launch(url);
            }
            return (object?)null;
        });

        Register("app.privacyPolicy", args =>
        {
            Launch(PrivacyPolicyUrl);
            return (object?)null;
        });

        Register("app.support", args =>
        {
            Launch(SupportUrl);
            return (object?)null;
        });

        Register("app.openLogs", args =>
        {
            CrashLog.OpenLogFolder();
            return (object?)null;
        });

        Register("app.copy", args =>
        {
            var package = new Windows.ApplicationModel.DataTransfer.DataPackage();
            package.SetText(Str(args, "text"));
            Windows.ApplicationModel.DataTransfer.Clipboard.SetContent(package);
            return (object?)null;
        });

        Register("app.checkUpdates", async _ =>
        {
            (bool available, string latest, string url, long size) = await AutoUpdater.CheckForUpdatesAsync();

            // Telling the user an update exists without offering it leaves them
            // with no way to take it. Raise the same banner the startup check
            // raises, with its Update button.
            if (available) UpdateAvailable?.Invoke(latest, url, size);

            return new Dictionary<string, object?>
            {
                ["available"] = available,
                ["latest"] = latest,
                ["url"] = url,
                ["current"] = AppStrings.AppVersion,
            };
        });

        // Leaving the wizard is one call, not a write followed by a navigation:
        // the page used to save the flag and immediately navigate away, and a
        // navigation can drop a message still in flight. Then the wizard came
        // back on the next launch and there was no way out of it.
        Register("setup.finish", args =>
        {
            _settings.SetupCompleted = true;
            _settings.Save();
            Navigate("home");
            return (object?)null;
        });

        // A banner's button lives in the page; the work behind it lives here.
        // The banner is pushed, and a push can be dropped: the window may be
        // mid-navigation, or have no page attached yet. So the screen can also
        // ASK what the banner should say, and does while one is in progress.
        Register("app.currentBanner", _ => (object?)_pendingBanner);

        // Asked by every screen as it boots. Returns an error nobody has seen
        // yet, exactly once.
        Register("app.unseenError", _ =>
        {
            Dictionary<string, object?>? unseen = _unseenError;
            _unseenError = null;
            return (object?)unseen;
        });

        // The title bar is drawn by the page now, so the window controls have
        // to come back through here.
        Register("window.minimize", _ => { (_window as MainWindow)?.MinimizeWindow(); return (object?)null; });
        Register("window.close", _ => { (_window as MainWindow)?.CloseWindow(); return (object?)null; });
        Register("window.toggleMaximize", _ => (object?)new Dictionary<string, object?>
        {
            ["maximized"] = (_window as MainWindow)?.ToggleMaximizeWindow() ?? false,
        });
        Register("window.state", _ => (object?)new Dictionary<string, object?>
        {
            ["maximized"] = (_window as MainWindow)?.IsMaximized ?? false,
        });

        // The strip minus its buttons: which pixels drag the window.
        Register("window.dragRegions", args =>
        {
            var rects = new List<(double, double, double, double)>();
            if (args.ValueKind == JsonValueKind.Object && args.TryGetProperty("rects", out JsonElement list)
                && list.ValueKind == JsonValueKind.Array)
            {
                foreach (JsonElement r in list.EnumerateArray())
                {
                    rects.Add((
                        r.TryGetProperty("x", out var x) ? x.GetDouble() : 0,
                        r.TryGetProperty("y", out var y) ? y.GetDouble() : 0,
                        r.TryGetProperty("w", out var w) ? w.GetDouble() : 0,
                        r.TryGetProperty("h", out var h) ? h.GetDouble() : 0));
                }
            }
            (_window as MainWindow)?.SetDragRegions(rects);
            return (object?)null;
        });

        Register("app.bannerAction", args =>
        {
            Action? action = _bannerAction;
            action?.Invoke();
            return (object?)null;
        });

        // ---- memory (mobile's Memory Context group) ------------------------

        Register("memory.get", _ => (object?)new Dictionary<string, object?>
        {
            ["text"] = File.Exists(AppModel.UserMemoryFile) ? File.ReadAllText(AppModel.UserMemoryFile) : "",
        });

        Register("memory.set", args =>
        {
            File.WriteAllText(AppModel.UserMemoryFile, Str(args, "text"));
            return (object?)null;
        });

        Register("memory.clear", _ =>
        {
            if (File.Exists(AppModel.UserMemoryFile)) File.Delete(AppModel.UserMemoryFile);
            return (object?)null;
        });

        // ---- recording (the mic button lives on every screen) --------------

        Register("record.state", _ => (object?)RecordStateMap());

        Register("record.toggle", _ =>
        {
            if (RecordingController.IsRecording)
            {
                RecordingController.Stop();
                return (object?)RecordStateMap();
            }

            if (!RecordingController.Start(out string error))
            {
                return new Dictionary<string, object?> { ["recording"] = false, ["error"] = error };
            }
            return (object?)RecordStateMap();
        });
    }

    /// <summary>
    /// The old pickers stored the formatter by its display Name; every model is
    /// addressed by File now. Rewrite it once, so the picker shows the model the
    /// engine is actually going to use.
    /// </summary>
    private void NormalizeModelSettings()
    {
        bool changed = false;

        ModelInfo? formatter = SelectedFormatterModel();
        if (formatter is not null && _settings.PreferredFormatterModel != formatter.File)
        {
            _settings.PreferredFormatterModel = formatter.File;
            changed = true;
        }

        ModelInfo? whisper = SelectedWhisperModel();
        if (whisper is not null && _settings.PreferredWhisperModel != whisper.File)
        {
            _settings.PreferredWhisperModel = whisper.File;
            changed = true;
        }

        if (changed) _settings.Save();
    }

    /// <summary>Raised when a check finds a newer version, with (version, url).</summary>
    public event Action<string, string, long>? UpdateAvailable;

    private Action? _bannerAction;
    private Dictionary<string, object?>? _pendingBanner;

    /// <summary>
    /// The last error banner that no page has displayed yet. Cleared only once
    /// a page confirms it drew it, so an error raised before the first screen
    /// booted - or while one was navigating - is shown on the next one.
    /// </summary>
    private Dictionary<string, object?>? _unseenError;

    /// <summary>
    /// Shows a banner in the UI. It is drawn by the page, not by XAML, so it
    /// carries the app's own accent, type and corners instead of the stock
    /// system look sitting on top of a themed app.
    ///
    /// Held until a screen is listening: engine health and update checks finish
    /// before the first page has booted.
    /// </summary>
    public void ShowBanner(string kind, string title, string message, string? actionLabel, Action? action)
    {
        _bannerAction = action;
        var payload = new Dictionary<string, object?>
        {
            ["kind"] = kind,
            ["title"] = title,
            ["message"] = message,
            ["actionLabel"] = actionLabel,
        };

        _pendingBanner = payload;

        // An ERROR is kept in its own slot as well. _pendingBanner holds one
        // banner, so the next thing to raise one - an update check, a download
        // finishing - quietly replaced it, and if no page was listening when it
        // was first sent the message was simply gone. That is how "Muffin can't
        // start its engines" reached the log and never reached the user.
        //
        // Errors are the ones nobody may miss, so they survive until a page has
        // actually shown one.
        if (kind == "error") _unseenError = payload;

        Emit("app.banner", payload);
    }

    public void UpdateBanner(string message, string? actionLabel, int? percent)
    {
        if (_pendingBanner is not null)
        {
            _pendingBanner["message"] = message;
            _pendingBanner["actionLabel"] = actionLabel;
            _pendingBanner["percent"] = percent;
        }

        Emit("app.bannerUpdate", new Dictionary<string, object?>
        {
            ["message"] = message,
            ["actionLabel"] = actionLabel,
            ["percent"] = percent,
        });
    }

    private static async void Launch(string url)
    {
        try { await Windows.System.Launcher.LaunchUriAsync(new Uri(url)); }
        catch (Exception ex) { CrashLog.Write("Launch " + url, ex); }
    }

    private static Dictionary<string, object?> RecordStateMap() => new()
    {
        ["recording"] = RecordingController.IsRecording,
        ["hasMicrophone"] = RecordingController.HasMicrophone,
        ["error"] = null,
    };

    // ---- settings ----------------------------------------------------------

    private Dictionary<string, object?> SettingsMap()
    {
        var map = new Dictionary<string, object?>();
        foreach (PropertyInfo property in typeof(UserSettings).GetProperties(BindingFlags.Public | BindingFlags.Instance))
        {
            if (!property.CanRead || !property.CanWrite) continue;
            map[property.Name] = property.GetValue(_settings);
        }
        return map;
    }

    /// <summary>
    /// Writes one setting and makes it visible immediately. Language, theme and
    /// accent are applied in place and broadcast, which is what the mobile app
    /// does and what the desktop app has to match: no restart, ever.
    /// </summary>
    private void ApplySetting(string key, JsonElement value)
    {
        PropertyInfo? property = typeof(UserSettings).GetProperty(key, BindingFlags.Public | BindingFlags.Instance);
        if (property is null || !property.CanWrite) return;

        object? converted = Convert(property.PropertyType, value);
        if (converted is null && property.PropertyType.IsValueType) return;

        property.SetValue(_settings, converted);
        _settings.Save();

        switch (key)
        {
            case nameof(UserSettings.AppLanguage):
                LocalizationManager.ChangeLanguage(_settings.AppLanguage);
                Emit("strings.changed", new Dictionary<string, object?> { ["strings"] = LocalizationManager.Snapshot() });
                break;

            case nameof(UserSettings.ThemeMode):
                ThemeHelper.Apply(_window, _settings.ThemeMode);
                Emit("theme.changed", ThemeMap());
                ThemeApplied?.Invoke(ResolveThemeMode());
                break;

            case nameof(UserSettings.AccentColor):
                MuffinTheme.Apply(_settings.AccentColor);
                Emit("theme.changed", ThemeMap());
                break;
        }

        Emit("settings.changed", SettingsMap());
    }

    private static object? Convert(Type target, JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Undefined || value.ValueKind == JsonValueKind.Null) return null;

        if (target == typeof(bool)) return value.ValueKind == JsonValueKind.True;
        if (target == typeof(string)) return value.ValueKind == JsonValueKind.String ? value.GetString() : value.ToString();
        if (target == typeof(int)) return value.TryGetInt32(out int i) ? i : 0;
        if (target == typeof(double)) return value.TryGetDouble(out double d) ? d : 0d;
        return null;
    }

    // ---- theme -------------------------------------------------------------

    private Dictionary<string, object?> ThemeMap()
    {
        Color accent = MuffinTheme.ColorFor(_settings.AccentColor);
        return new Dictionary<string, object?>
        {
            ["mode"] = ResolveThemeMode(),
            ["accent"] = Hex(accent),
            ["onAccent"] = Hex(MuffinTheme.Foreground(accent)),
            // The System swatch shows the real Windows accent, so picking it is
            // not a guess. Mobile does the same with the Material You colour.
            ["systemAccent"] = Hex(MuffinTheme.WindowsAccent),
        };
    }

    private string ResolveThemeMode() => _settings.ThemeMode switch
    {
        "Light" => "light",
        "Dark" => "dark",
        "AMOLED" => "amoled",
        // System follows Windows, the same way the mobile app follows Android.
        _ => _window.Content is FrameworkElement root && root.ActualTheme == ElementTheme.Light ? "light" : "dark",
    };

    private static string Hex(Color c) => $"#{c.R:X2}{c.G:X2}{c.B:X2}";
}
