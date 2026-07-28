using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.Web.WebView2.Core;

namespace MuffinTranscriber.Web;

/// <summary>
/// The transport between the web UI and the app.
///
/// The screens are HTML, the app is C#. Everything crosses here: the page posts
/// {id, method, args}, a handler runs, and {id, ok, result} goes back. The app
/// pushes state the other way with Emit(), which is what makes a setting change
/// repaint every open screen with no reload.
///
/// Handlers live in the WebApi.*.cs partials, one file per area.
/// </summary>
public sealed partial class WebBridge
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        // The web side addresses settings by their C# property names
        // (data-setting="NormalizeAudio"), the same casing UserSettings is
        // stored with, so nothing has to translate between two spellings.
        PropertyNamingPolicy = null,
    };

    private readonly Dictionary<string, Func<JsonElement, Task<object?>>> _handlers = new(StringComparer.Ordinal);
    private readonly Microsoft.UI.Xaml.Controls.WebView2 _view;
    private readonly DispatcherQueue _dispatcher;
    private readonly Window _window;

    private UserSettings _settings = UserSettings.Load();

    public WebBridge(Microsoft.UI.Xaml.Controls.WebView2 view, Window window)
    {
        _view = view;
        _window = window;
        _dispatcher = window.DispatcherQueue;

        NormalizeModelSettings();

        RegisterAppHandlers();
        RegisterModelHandlers();
        RegisterTranscribeHandlers();
        RegisterHistoryHandlers();
        RegisterChatHandlers();
    }

    public UserSettings Settings => _settings;

    /// <summary>Fires with "light", "dark" or "amoled" when the theme resolves.</summary>
    public event Action<string>? ThemeApplied;

    public string ThemeMode => ResolveThemeMode();

    /// <summary>
    /// Sends the UI to another screen. Each screen is its own document, so this
    /// is a navigation, and the state that outlives it lives here in C#.
    /// </summary>
    public void Navigate(string tag)
    {
        string page = tag switch
        {
            "home" or "transcribe" => "index.html",
            "history" or "library" => "history.html",
            "chat" => "chat.html",
            "settings" => "settings.html",
            "models" => "models.html",
            "setup" => "setup.html",
            _ => "index.html",
        };
        Emit("navigate", new Dictionary<string, object?> { ["page"] = page });
    }

    /// <summary>Boots WebView2 and shows the first screen.</summary>
    public async Task InitializeAsync(string startPage)
    {
        // WebView2 otherwise writes its whole browser profile into the folder
        // next to the exe. That is the install directory: it gets wiped by the
        // next update, it fails outright if anyone installs under Program
        // Files, and it ended up inside the installer itself. It belongs in
        // AppData with the rest of the app's data.
        string profileDir = System.IO.Path.Combine(AppModel.AppDataDir, "WebView2");
        System.IO.Directory.CreateDirectory(profileDir);
        CoreWebView2Environment environment =
            await CoreWebView2Environment.CreateWithOptionsAsync(string.Empty, profileDir, null);

        await _view.EnsureCoreWebView2Async(environment);
        CoreWebView2 core = _view.CoreWebView2;

        // The UI is served from the install dir under a virtual host name.
        // file:// would put every page in an opaque origin, which breaks fetch
        // and localStorage; this keeps them on one ordinary https origin, still
        // entirely local with no network involved.
        core.SetVirtualHostNameToFolderMapping(
            VirtualHost,
            System.IO.Path.Combine(AppModel.AppInstallDir, "web"),
            CoreWebView2HostResourceAccessKind.Allow);

        // The cached media folder gets its own host so the history player can
        // play a recording straight off disk, with nothing copied anywhere.
        string cacheRoot = System.IO.Path.Combine(AppModel.AppDataDir, "Cache");
        System.IO.Directory.CreateDirectory(cacheRoot);
        core.SetVirtualHostNameToFolderMapping(MediaHost, cacheRoot, CoreWebView2HostResourceAccessKind.Allow);

        CoreWebView2Settings s = core.Settings;
        s.AreDefaultContextMenusEnabled = false;
        s.IsStatusBarEnabled = false;
        s.IsZoomControlEnabled = false;
        s.AreBrowserAcceleratorKeysEnabled = false;
        s.IsSwipeNavigationEnabled = false;
#if DEBUG
        s.AreDevToolsEnabled = true;
#else
        s.AreDevToolsEnabled = false;
#endif

        core.WebMessageReceived += OnWebMessageReceived;

        // Dropping a file anywhere else must not turn the app into a file
        // viewer: nothing navigates away from our own pages.
        core.NavigationStarting += (_, e) =>
        {
            _navigationWatch.Restart();
            if (!e.Uri.StartsWith($"https://{VirtualHost}/", StringComparison.OrdinalIgnoreCase))
            {
                e.Cancel = true;
            }
        };

        core.NavigationCompleted += (_, _) =>
        {
            _navigationWatch.Stop();
            if (_navigationWatch.ElapsedMilliseconds >= SlowCallMs)
            {
                CrashLog.Note($"slow navigation: {_navigationWatch.ElapsedMilliseconds} ms");
            }
        };

        await ClearStaleAssetCacheAsync(core);

        _view.Source = new Uri($"https://{VirtualHost}/{startPage}");
    }

    public const string VirtualHost = "muffin.example";

    // Anything on the path of a screen switch that takes this long is a bug,
    // so it gets written down rather than merely felt.
    private const int SlowCallMs = 250;

    private readonly System.Diagnostics.Stopwatch _navigationWatch = new();

    /// <summary>
    /// WebView2 caches the UI files like any web page, keyed on their URL, and
    /// their URLs never change. Without this, an update installs new HTML and
    /// CSS that the user never sees: they keep getting the previous version's
    /// screens, and the fix "did not work".
    ///
    /// So the cache is dropped whenever the app version changes, and on every
    /// debug run, where the files change constantly.
    /// </summary>
    private static async Task ClearStaleAssetCacheAsync(CoreWebView2 core)
    {
        string marker = System.IO.Path.Combine(AppModel.AppDataDir, "web_assets_version");

        try
        {
#if DEBUG
            bool stale = true;
#else
            bool stale = !System.IO.File.Exists(marker)
                || System.IO.File.ReadAllText(marker).Trim() != AppStrings.AppVersion;
#endif
            if (!stale) return;

            await core.Profile.ClearBrowsingDataAsync(CoreWebView2BrowsingDataKinds.DiskCache);
            System.IO.File.WriteAllText(marker, AppStrings.AppVersion);
        }
        catch (Exception ex)
        {
            // A cache that refuses to clear is not a reason to fail to start.
            CrashLog.Write("Clearing the web asset cache", ex);
        }
    }

    private void Register(string method, Func<JsonElement, Task<object?>> handler) => _handlers[method] = handler;

    private void Register(string method, Func<JsonElement, object?> handler) =>
        _handlers[method] = args => Task.FromResult(handler(args));

    private async void OnWebMessageReceived(CoreWebView2 sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        string raw;
        try
        {
            raw = e.TryGetWebMessageAsString();
        }
        catch
        {
            return;
        }

        // A drop carries the File objects alongside the message, which is the
        // only way to learn a dropped file's real path: the DataTransfer API
        // hands JavaScript a sandboxed File with no path on it.
        if (raw == "files.dropped")
        {
            var paths = new List<string>();
            foreach (object item in e.AdditionalObjects)
            {
                if (item is CoreWebView2File file) paths.Add(file.Path);
            }
            if (paths.Count > 0) AddFiles(paths);
            return;
        }

        int id = 0;
        try
        {
            using JsonDocument doc = JsonDocument.Parse(raw);
            JsonElement root = doc.RootElement;
            id = root.GetProperty("id").GetInt32();
            string method = root.GetProperty("method").GetString() ?? "";
            JsonElement args = root.TryGetProperty("args", out JsonElement a) ? a.Clone() : default;

            if (!_handlers.TryGetValue(method, out Func<JsonElement, Task<object?>>? handler))
            {
                Reply(id, false, null, $"unknown method: {method}");
                return;
            }

            var watch = System.Diagnostics.Stopwatch.StartNew();
            object? result = await handler(args);
            watch.Stop();
            if (watch.ElapsedMilliseconds >= SlowCallMs)
            {
                CrashLog.Note($"slow bridge call: {method} took {watch.ElapsedMilliseconds} ms");
            }
            Reply(id, true, result, null);
        }
        catch (Exception ex)
        {
            CrashLog.Write("WebBridge handler", ex);
            if (id != 0) Reply(id, false, null, EngineHealth.FriendlyMessage(ex) ?? ex.Message);
        }
    }

    private void Reply(int id, bool ok, object? result, string? error)
    {
        Post(new Dictionary<string, object?>
        {
            ["id"] = id,
            ["ok"] = ok,
            ["result"] = result,
            ["error"] = error,
        });
    }

    /// <summary>Pushes an event to the page. Safe to call from any thread.</summary>
    public void Emit(string name, object? payload = null)
    {
        Post(new Dictionary<string, object?>
        {
            ["event"] = name,
            ["payload"] = payload,
        });
    }

    private void Post(object message)
    {
        string json = JsonSerializer.Serialize(message, JsonOptions);
        if (_dispatcher.HasThreadAccess)
        {
            Send(json);
        }
        else
        {
            _dispatcher.TryEnqueue(() => Send(json));
        }
    }

    private void Send(string json)
    {
        // Losing a progress tick is fine; the next tick corrects it. Losing a
        // terminal message is not, and this used to swallow both without a
        // word, which cost an evening working out why a finished update still
        // said "downloading".
        if (_view.CoreWebView2 is null)
        {
            CrashLog.Note("bridge: dropped a message, no CoreWebView2: " + Peek(json));
            return;
        }

        try
        {
            _view.CoreWebView2.PostWebMessageAsString(json);
        }
        catch (Exception ex)
        {
            CrashLog.Note($"bridge: dropped a message ({ex.GetType().Name}: {ex.Message}): {Peek(json)}");
        }
    }

    private static string Peek(string json) => json.Length <= 120 ? json : json[..120];

    // ---- small helpers used by the handler partials -------------------------

    private static string Str(JsonElement args, string name, string fallback = "")
    {
        if (args.ValueKind != JsonValueKind.Object) return fallback;
        return args.TryGetProperty(name, out JsonElement v) && v.ValueKind == JsonValueKind.String
            ? v.GetString() ?? fallback
            : fallback;
    }

    private static bool Bool(JsonElement args, string name, bool fallback = false)
    {
        if (args.ValueKind != JsonValueKind.Object) return fallback;
        if (!args.TryGetProperty(name, out JsonElement v)) return fallback;
        return v.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            _ => fallback,
        };
    }

    private static int Int(JsonElement args, string name, int fallback = 0)
    {
        if (args.ValueKind != JsonValueKind.Object) return fallback;
        return args.TryGetProperty(name, out JsonElement v) && v.TryGetInt32(out int n) ? n : fallback;
    }
}
