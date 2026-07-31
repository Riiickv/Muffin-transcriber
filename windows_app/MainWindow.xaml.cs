using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using MuffinTranscriber.Web;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace MuffinTranscriber;

/// <summary>
/// The desktop shell: a title bar and the app.
///
/// The app itself is HTML in the WebView2 below, built from the mobile app's
/// tokens, fonts and icons so both platforms are one product. Everything it
/// does goes through <see cref="WebBridge"/> to the same C# services the native
/// pages used to call directly.
/// </summary>
public sealed partial class MainWindow : Window, IShellWindow
{
    private readonly UserSettings _settings = UserSettings.Load();
    private WebBridge? _bridge;
    private string _updateDownloadUrl = "";
    private string _installerPath = "";

    public MainWindow(
        Windows.ApplicationModel.DataTransfer.ShareTarget.ShareOperation? shareOperation = null,
        List<string>? openFiles = null)
    {
        InitializeComponent();
        _ = Task.Run(AppModel.CleanCache);
        if (_settings.EnableAutoUpdateCheck)
        {
            _ = CheckForUpdatesAsync();
        }
        _ = CheckEngineHealthAsync();

        // No SetTitleBar and no ExtendsContentIntoTitleBar. Extending only moves
        // the page UNDER a title bar that WinUI still draws, which is why the
        // minimise, maximise and close glyphs appeared twice: the system's
        // underneath and the page's on top of them. SetBorderAndTitleBar below
        // removes the caption outright, so there is exactly one set left.
        //
        // Losing the caption also loses the Win7-looking system menu that used
        // to open on right-clicking the strip, and the page puts its own there.
        AppWindow.SetIcon("Assets/AppIcon.ico");
        ThemeHelper.Apply(this, _settings.ThemeMode);

        int startWidth = _settings.WindowWidth > 800 ? _settings.WindowWidth : 1100;
        int startHeight = _settings.WindowHeight > 600 ? _settings.WindowHeight : 720;
        AppWindow.Resize(new Windows.Graphics.SizeInt32(startWidth, startHeight));

        if (AppWindow.Presenter is OverlappedPresenter presenter)
        {
            presenter.PreferredMinimumWidth = 760;
            presenter.PreferredMinimumHeight = 560;
            // Border yes, title bar no: the resize frame is worth keeping, the
            // caption is not. The corners have to be asked for separately once
            // the caption is gone.
            presenter.SetBorderAndTitleBar(true, false);
            RoundCorners();
            SuppressSystemMenu();
        }

        // The caption inset is only known once there is a window and a scale to
        // measure against, and it changes with both.
        Closed += MainWindow_Closed;
        RecordingController.RecordingFinished += OnRecordingFinished;
        RecordingController.StateChanged += OnRecordingStateChanged;
        RecordingController.Progress += OnRecordingProgress;
        LocalizationManager.LanguageChanged += OnLanguageChanged;

        // First run with no usable model lands on the setup wizard instead of a
        // transcribe screen whose only button is disabled. A share brought the
        // user here with a file in hand, so that still goes straight in.
        bool needsSetup = shareOperation is null
            && !_settings.SetupCompleted
            && AppModel.ActiveWhisperModel() is null;

        _ = StartAsync(needsSetup ? "setup.html" : "index.html", shareOperation, openFiles);
    }

    private async Task StartAsync(
        string startPage,
        Windows.ApplicationModel.DataTransfer.ShareTarget.ShareOperation? shareOperation,
        List<string>? openFiles = null)
    {
        _bridge = new WebBridge(WebHost, this);
        _bridge.ThemeApplied += mode => DispatcherQueue.TryEnqueue(() => PaintShell(mode));
        _bridge.UpdateAvailable += ShowUpdateBanner;

        try
        {
            await _bridge.InitializeAsync(startPage);
        }
        catch (Exception ex)
        {
            // No WebView2 runtime means no UI at all, so say so plainly rather
            // than showing an empty window.
            // Every other banner is drawn by the page. This one cannot be:
            // there IS no page, which is the whole problem. It has to be told
            // natively or it is never seen at all.
            CrashLog.Write("WebView2 initialization", ex);
            if (ShowNativeError(AppStrings.Health_BannerTitle, AppStrings.Health_WebViewMissingBody))
            {
                await Windows.System.Launcher.LaunchUriAsync(new Uri(WebView2RuntimeUrl));
            }
            return;
        }

        PaintShell(_bridge.ThemeMode);
        _ = WatchForABlankStartAsync();

        if (openFiles is { Count: > 0 })
        {
            OpenFiles(openFiles);
        }

        if (shareOperation is not null)
        {
            await ProcessShareAsync(shareOperation);
        }
    }

    /// <summary>
    /// Catches the failure mode where WebView2 comes up without complaint and
    /// then draws nothing.
    ///
    /// It happens when the WebView2 runtime updates itself - which it does
    /// silently, on every Windows machine - while a profile written by the
    /// previous build is on disk. There is no exception and no log line; the
    /// window is simply a grey rectangle, and an app that looks dead gets
    /// uninstalled rather than reported.
    ///
    /// So if no page has loaded after a generous wait, the profile is marked
    /// for rebuilding and the app restarts itself once. The profile is only a
    /// cache, so nothing is lost by throwing it away. Once, because a restart
    /// loop would be worse than the blank window it is trying to fix.
    /// </summary>
    private async Task WatchForABlankStartAsync()
    {
        await Task.Delay(TimeSpan.FromSeconds(12));
        if (_bridge is null || _bridge.PageRendered) return;

        try
        {
            if (File.Exists(WebBridge.ResetMarkerPath))
            {
                // Already tried. Say so instead of restarting for ever.
                CrashLog.Note("blank start persisted after rebuilding the WebView2 profile");
                ShowNativeError(AppStrings.Health_BannerTitle, AppStrings.Health_WebViewMissingBody);
                return;
            }

            CrashLog.Note("blank start: no page rendered, rebuilding the WebView2 profile");
            File.WriteAllText(WebBridge.ResetMarkerPath, DateTime.Now.ToString("o"));

            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = Environment.ProcessPath ?? "",
                UseShellExecute = true,
            });
            Application.Current.Exit();
        }
        catch (Exception ex)
        {
            CrashLog.Write("Recovering from a blank start", ex);
        }
    }

    [System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
    private static extern int MessageBoxW(IntPtr hWnd, string text, string caption, uint type);

    /// <summary>OK/Cancel box. True when the user chose to fix it.</summary>
    private static bool ShowNativeError(string title, string message)
    {
        const uint MB_OKCANCEL = 0x00000001;
        const uint MB_ICONERROR = 0x00000010;
        return MessageBoxW(IntPtr.Zero, message, title, MB_OKCANCEL | MB_ICONERROR) == 1;
    }

    private const string WebView2RuntimeUrl = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

    // The title bar strip and the page have to be one surface. Mica would put a
    // translucent grey band above a #121212 page, which reads as two apps
    // stacked, so the shell is painted with the page's own background instead.
    private void PaintShell(string mode)
    {
        SystemBackdrop = null;
        RootGrid.Background = new SolidColorBrush(mode switch
        {
            "light" => Windows.UI.Color.FromArgb(255, 0xFF, 0xFF, 0xFF),
            "amoled" => Windows.UI.Color.FromArgb(255, 0x00, 0x00, 0x00),
            _ => Windows.UI.Color.FromArgb(255, 0x12, 0x12, 0x12),
        });
        RootGrid.RequestedTheme = mode == "light" ? ElementTheme.Light : ElementTheme.Dark;
    }

    /// <summary>Called by the setup wizard when it finishes or is skipped.</summary>
    public void CompleteSetup() => _bridge?.Navigate("home");

    // Wherever you were when you stopped recording, the audio lands on the
    // transcribe screen and starts processing itself.
    /// <summary>
    /// A finished recording is SAVED first, given a history row, and opened
    /// there - and only then transcribed into that row.
    ///
    /// The order is the point. It used to go straight to the transcribe screen
    /// with the audio still sitting in a temporary file, so every way the run
    /// could fail took the recording with it. Now the row and the playable
    /// audio exist before anything can go wrong, and History is where you land,
    /// the way the phone does it.
    /// </summary>
    private void OnRecordingFinished(object? sender, string wavPath)
    {
        DispatcherQueue.TryEnqueue(async () =>
        {
            if (_bridge is null) return;

            string? entryId = await _bridge.SaveRecordingAsync(wavPath);
            if (entryId is null)
            {
                // Could not keep a copy: fall back to the old path rather than
                // dropping the recording on the floor.
                _bridge.Navigate("home");
                _bridge.TranscribeRecording(wavPath);
                return;
            }

            _bridge.NavigateToTranscript(entryId);
            string? kept = _bridge.KeptPathFor(entryId);
            if (kept is not null) _bridge.TranscribeSavedRecording(kept);
        });
    }

    private void OnRecordingStateChanged(object? sender, EventArgs e)
    {
        _lastTick = -1;
        // Every recording gets a fresh verdict; one good session must not vouch
        // for the next one.
        _heardSomething = false;
        _warnedAboutSilence = false;
        _bridge?.Emit("record.changed", new Dictionary<string, object?>
        {
            ["recording"] = RecordingController.IsRecording,
        });
    }

    // The mic reports ~33 times a second, which is far more than a timer that
    // counts whole seconds needs; only whole-second changes cross the bridge.
    private int _lastTick = -1;

    // Silence watch. A microphone that is muted, unplugged, or set to the wrong
    // device records a perfectly flat signal, and nothing notices until the
    // transcript comes back empty - which for a lecture is two hours later and
    // far too late to do anything about it.
    //
    // The peak level already arrives ~33 times a second for the timer, so this
    // costs nothing: if nothing crosses the floor for the first stretch of a
    // recording, say so WHILE it can still be fixed.
    private const float SilenceFloor = 0.02f;
    private const int SilenceWarnAfterSeconds = 12;
    private bool _heardSomething;
    private bool _warnedAboutSilence;

    private void OnRecordingProgress(object? sender, (TimeSpan Time, float PeakLevel) data)
    {
        if (data.PeakLevel >= SilenceFloor) _heardSomething = true;

        int seconds = (int)data.Time.TotalSeconds;
        if (seconds == _lastTick) return;
        _lastTick = seconds;

        if (!_heardSomething && !_warnedAboutSilence && seconds >= SilenceWarnAfterSeconds)
        {
            _warnedAboutSilence = true;
            ShowAlert(InfoBarSeverity.Warning, AppStrings.Record_SilentTitle, AppStrings.Record_SilentBody,
                AppStrings.Record_BtnSoundSettings,
                () => _ = Windows.System.Launcher.LaunchUriAsync(new Uri("ms-settings:sound")));
        }

        _bridge?.Emit("record.progress", new Dictionary<string, object?>
        {
            ["seconds"] = seconds,
            ["level"] = Math.Round(data.PeakLevel, 3),
            ["silent"] = !_heardSomething,
        });
    }

    private void OnLanguageChanged()
    {
        DispatcherQueue.TryEnqueue(() => Bindings.Update());
    }

    public void HandleShareOperation(Windows.ApplicationModel.DataTransfer.ShareTarget.ShareOperation shareOperation) =>
        _ = ProcessShareAsync(shareOperation);

    private async Task ProcessShareAsync(Windows.ApplicationModel.DataTransfer.ShareTarget.ShareOperation shareOperation)
    {
        try
        {
            shareOperation.ReportStarted();
            if (!shareOperation.Data.Contains(Windows.ApplicationModel.DataTransfer.StandardDataFormats.StorageItems))
            {
                return;
            }

            IReadOnlyList<Windows.Storage.IStorageItem> items = await shareOperation.Data.GetStorageItemsAsync();
            var folder = await Windows.Storage.StorageFolder.GetFolderFromPathAsync(System.IO.Path.GetTempPath());

            var paths = new List<string>();
            foreach (Windows.Storage.StorageFile file in items.OfType<Windows.Storage.StorageFile>())
            {
                var copy = await file.CopyAsync(folder, file.Name, Windows.Storage.NameCollisionOption.GenerateUniqueName);
                paths.Add(copy.Path);
            }

            if (paths.Count > 0)
            {
                _bridge?.Navigate("home");
                _bridge?.AddFiles(paths);
            }
        }
        catch (Exception ex)
        {
            CrashLog.Write("Share operation", ex);
        }
    }

    /// <summary>
    /// Queue files handed over from outside the app: Explorer's context menu,
    /// Open with, or a second copy of the app redirecting its arguments here.
    ///
    /// Marshalled, because a redirected activation arrives on whatever thread
    /// the app-lifecycle callback runs on, and the bridge talks to a WebView.
    /// </summary>
    public void OpenFiles(List<string> paths)
    {
        var media = paths
            .Where(p => !string.IsNullOrWhiteSpace(p)
                     && System.IO.File.Exists(p)
                     && AppModel.MediaExtensions.Contains(System.IO.Path.GetExtension(p)))
            .ToList();
        if (media.Count == 0) return;

        DispatcherQueue.TryEnqueue(() =>
        {
            _bridge?.Navigate("home");
            _bridge?.AddFiles(media);
        });
    }

    /// <summary>
    /// Open a saved transcript, from outside this window.
    ///
    /// The mini window hands over the entry it just created, so pressing "open
    /// the app" lands on that transcript rather than on Muffin! with the thing
    /// you were reading a tab away. Queued on the dispatcher and after the page
    /// exists, because the caller is another window and may be ahead of the
    /// WebView.
    /// </summary>
    public void ShowTranscript(string entryId)
    {
        if (string.IsNullOrEmpty(entryId)) return;
        DispatcherQueue.TryEnqueue(() => _bridge?.NavigateToTranscript(entryId));
    }

    /// <summary>Called by the chat assistant's NAVIGATE_TO action.</summary>
    public void NavigateTo(string tag) => DispatcherQueue.TryEnqueue(() => _bridge?.Navigate(tag));

    /// <summary>
    /// The title bar's support button. The button is XAML because it lives in
    /// the caption area, but the asking happens in the web layer so it is the
    /// app's own dialog rather than a second, different-looking one.
    /// </summary>
    private void OnSupportClick(object sender, RoutedEventArgs e) => _bridge?.Emit("app.askSupport", null);

    // ---- window controls, driven by the page ------------------------------

    public void MinimizeWindow()
    {
        if (AppWindow.Presenter is OverlappedPresenter p) p.Minimize();
    }

    /// <summary>Toggles, and reports back so the page can swap the icon.</summary>
    public bool ToggleMaximizeWindow()
    {
        if (AppWindow.Presenter is not OverlappedPresenter p) return false;
        if (p.State == OverlappedPresenterState.Maximized) { p.Restore(); return false; }
        p.Maximize();
        return true;
    }

    public bool IsMaximized =>
        AppWindow.Presenter is OverlappedPresenter { State: OverlappedPresenterState.Maximized };

    public void CloseWindow() => Close();

    [System.Runtime.InteropServices.DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    private const int DWMWA_WINDOW_CORNER_PREFERENCE = 33;
    private const int DWMWCP_ROUND = 2;

    /// <summary>
    /// Windows 11 rounds a window's corners off the back of its caption, so
    /// taking the caption away squared them off. Asked for explicitly, they
    /// come back, and the app keeps the shape everything inside it has.
    /// </summary>
    private void RoundCorners()
    {
        try
        {
            IntPtr hwnd = WinRT.Interop.WindowNative.GetWindowHandle(this);
            int preference = DWMWCP_ROUND;
            DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, ref preference, sizeof(int));
        }
        catch (Exception ex)
        {
            // Square corners are ugly, not broken: worth a log, not a crash.
            CrashLog.Write("Rounding the window corners", ex);
        }
    }

    /// <summary>
    /// Which pixels drag the window.
    ///
    /// The page cannot start the drag itself. Doing it from a pointerdown meant
    /// a bridge round trip first, and by the time WM_NCLBUTTONDOWN arrived the
    /// button was often already up, which is how Windows is asked for its
    /// keyboard move: the window then follows the cursor with no button held
    /// and stops on the next click. ReleaseCapture cannot fix it either, since
    /// the capture belongs to the WebView2 browser process, not to this one.
    ///
    /// So Windows does the hit-testing. The page sends the strip MINUS its
    /// buttons, already split into rectangles: a button inside a caption region
    /// would drag the window instead of being clicked. Coordinates arrive in
    /// CSS pixels; Windows wants physical ones.
    ///
    /// Right-clicking a caption region is what opens the Restore / Move / Size
    /// menu, so <see cref="SuppressSystemMenu"/> takes that message away.
    /// </summary>
    public void SetDragRegions(IReadOnlyList<(double X, double Y, double W, double H)> rects)
    {
        try
        {
            var source = Microsoft.UI.Input.InputNonClientPointerSource.GetForWindowId(AppWindow.Id);
            double scale = RootGrid.XamlRoot?.RasterizationScale ?? 1.0;
            if (scale <= 0) scale = 1.0;

            var native = rects
                .Where(r => r.W > 0 && r.H > 0)
                .Select(r => new Windows.Graphics.RectInt32(
                    (int)Math.Round(r.X * scale),
                    (int)Math.Round(r.Y * scale),
                    (int)Math.Round(r.W * scale),
                    (int)Math.Round(r.H * scale)))
                .ToArray();

            source.SetRegionRects(Microsoft.UI.Input.NonClientRegionKind.Caption, native);
        }
        catch (Exception ex)
        {
            // Losing this makes the window immovable, which is worth a log
            // rather than silently living with.
            CrashLog.Write("Setting the drag region", ex);
        }
    }

    // ---- keeping Windows' own menu off the title bar ----------------------

    private delegate IntPtr SubclassProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam, IntPtr id, IntPtr data);

    [System.Runtime.InteropServices.DllImport("comctl32.dll", SetLastError = true)]
    private static extern bool SetWindowSubclass(IntPtr hWnd, SubclassProc proc, IntPtr id, IntPtr data);

    [System.Runtime.InteropServices.DllImport("comctl32.dll")]
    private static extern IntPtr DefSubclassProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern bool ScreenToClient(IntPtr hWnd, ref POINT point);

    private struct POINT { public int X; public int Y; }

    private const uint WM_NCRBUTTONDOWN = 0x00A4;
    private const uint WM_NCRBUTTONUP = 0x00A5;
    private const uint WM_SYSCOMMAND = 0x0112;
    private const int SC_MOUSEMENU = 0xF090;
    private const int SC_KEYMENU = 0xF100;

    // Held in a field on purpose: the delegate is the only reference Windows
    // has, and a collected one is a crash the moment the window gets a message.
    private SubclassProc? _subclassProc;

    /// <summary>
    /// The strip is a caption region so Windows will drag it, and a caption
    /// region answers a right-click with the Restore / Move / Size / Minimize /
    /// Maximize / Close box in the system's own grey. The three messages that
    /// raise it are swallowed here, and the right-click is handed to the page,
    /// which draws the menu in the app's shape with the commands that are real.
    /// </summary>
    private void SuppressSystemMenu()
    {
        try
        {
            IntPtr hwnd = WinRT.Interop.WindowNative.GetWindowHandle(this);
            _subclassProc = (h, msg, wParam, lParam, id, data) =>
            {
                switch (msg)
                {
                    case WM_NCRBUTTONDOWN:
                        return IntPtr.Zero;

                    case WM_NCRBUTTONUP:
                        ShowCaptionMenu(h, lParam);
                        return IntPtr.Zero;

                    // Alt+Space raises the same box without any mouse involved.
                    case WM_SYSCOMMAND:
                        int command = (int)(wParam.ToInt64() & 0xFFF0);
                        if (command == SC_MOUSEMENU || command == SC_KEYMENU) return IntPtr.Zero;
                        break;
                }
                return DefSubclassProc(h, msg, wParam, lParam);
            };
            SetWindowSubclass(hwnd, _subclassProc, IntPtr.Zero, IntPtr.Zero);
        }
        catch (Exception ex)
        {
            // Worst case the system menu comes back, which is ugly, not broken.
            CrashLog.Write("Suppressing the system menu", ex);
        }
    }

    private void ShowCaptionMenu(IntPtr hwnd, IntPtr lParam)
    {
        try
        {
            // lParam is the cursor in screen pixels; the page thinks in CSS
            // pixels from its own top left corner.
            var point = new POINT
            {
                X = (short)(lParam.ToInt64() & 0xFFFF),
                Y = (short)((lParam.ToInt64() >> 16) & 0xFFFF),
            };
            ScreenToClient(hwnd, ref point);
            double scale = RootGrid.XamlRoot?.RasterizationScale ?? 1.0;
            if (scale <= 0) scale = 1.0;

            _bridge?.Emit("window.captionMenu", new Dictionary<string, object?>
            {
                ["x"] = point.X / scale,
                ["y"] = point.Y / scale,
            });
        }
        catch (Exception ex)
        {
            CrashLog.Write("Opening the title bar menu", ex);
        }
    }


    private void MainWindow_Closed(object sender, WindowEventArgs args)
    {
        // Never leave the mic open behind a closed window.
        LocalizationManager.LanguageChanged -= OnLanguageChanged;
        RecordingController.RecordingFinished -= OnRecordingFinished;
        RecordingController.StateChanged -= OnRecordingStateChanged;
        RecordingController.Progress -= OnRecordingProgress;
        if (RecordingController.IsRecording) RecordingController.Stop();

        // Reload before saving: this window's cached copy predates anything the
        // screens wrote, and saving it as-is would roll those changes back.
        var settings = UserSettings.Load();
        settings.WindowWidth = AppWindow.Size.Width;
        settings.WindowHeight = AppWindow.Size.Height;
        settings.Save();
        EmbeddingService.Shutdown();
    }

    private async Task CheckForUpdatesAsync()
    {
        var (available, latestVersion, url, size) = await AutoUpdater.CheckForUpdatesAsync();
        if (available)
        {
            ShowUpdateBanner(latestVersion, url, size);
        }
    }

    private async Task CheckEngineHealthAsync()
    {
        var report = await EngineHealth.CheckAsync();
        switch (report.Problem)
        {
            case EngineProblem.RuntimeMissing:
                ShowAlert(InfoBarSeverity.Error, AppStrings.Health_BannerTitle, AppStrings.Health_RuntimeMissingBody,
                    AppStrings.Health_BtnInstallRuntime,
                    () => _ = Windows.System.Launcher.LaunchUriAsync(new Uri(EngineHealth.VcRedistUrl)));
                break;
            case EngineProblem.EnginesMissing:
                ShowAlert(InfoBarSeverity.Error, AppStrings.Health_BannerTitle, AppStrings.Health_EnginesMissingBody,
                    AppStrings.Health_BtnGetInstaller,
                    () => _ = Windows.System.Launcher.LaunchUriAsync(new Uri(EngineHealth.InstallerUrl)));
                break;
            case EngineProblem.Unknown:
                ShowAlert(InfoBarSeverity.Warning, AppStrings.Health_BannerTitle,
                    string.Format(AppStrings.Health_UnknownBodyFormat, report.Detail), null, null);
                break;
        }
    }

    /// <summary>Crash notice shown by the App-level handler after it logged.</summary>
    public void ShowCrashNotice()
    {
        ShowAlert(InfoBarSeverity.Warning, AppStrings.Crash_BannerTitle, AppStrings.Crash_BannerBody,
            AppStrings.Crash_BtnOpenLog, CrashLog.OpenLogFolder);
    }

    // Banners are drawn by the page now, so they carry the app's own accent,
    // type and corners instead of the stock system look on top of a themed app.
    private void ShowAlert(InfoBarSeverity severity, string title, string message, string? actionLabel, Action? action)
    {
        string kind = severity switch
        {
            InfoBarSeverity.Error => "error",
            InfoBarSeverity.Warning => "warning",
            InfoBarSeverity.Success => "success",
            _ => "info",
        };
        DispatcherQueue.TryEnqueue(() => _bridge?.ShowBanner(kind, title, message, actionLabel, action));
    }

    public void ShowUpdateBanner(string latestVersion, string url, long size)
    {
        _updateDownloadUrl = url;
        _updateSize = size;

        // The installer may already be here, whole, from an earlier attempt:
        // a restart, or a "ready" message that never reached the page. Offering
        // Restart beats fetching 77 MB again to arrive at the same file.
        _updateDownloaded = AutoUpdater.HasCompletedDownload(size);
        if (_updateDownloaded) _installerPath = AutoUpdater.InstallerPath;
        CrashLog.Note($"update: {latestVersion} available, already downloaded={_updateDownloaded}");

        DispatcherQueue.TryEnqueue(() => _bridge?.ShowBanner(
            "success",
            AppStrings.Update_BannerTitle,
            _updateDownloaded
                ? AppStrings.Update_StatusReady
                : string.Format(AppStrings.Update_StatusAvailableFormat, latestVersion),
            _updateDownloaded ? AppStrings.Update_BtnRestart : AppStrings.Update_BtnUpdate,
            StartUpdate));
    }

    private bool _updateDownloaded;
    private long _updateSize;
    private bool _updateRunning;

    private async void StartUpdate()
    {
        if (_updateDownloaded)
        {
            CrashLog.Note("update: launching the installer");
            if (!AutoUpdater.InstallAndRestart(_installerPath))
            {
                _bridge?.UpdateBanner(AppStrings.Update_StatusInstallCancelled, AppStrings.Update_BtnRestart, null);
            }
            return;
        }

        // The button stays live while the download runs, and pressing it twice
        // used to start a second one writing to the same file.
        if (_updateRunning) return;
        _updateRunning = true;

        CrashLog.Note("update: download started");
        _bridge?.UpdateBanner(AppStrings.Update_BtnDownloading, null, 0);

        try
        {
            // Second guard: a repeated percentage is not worth a message across
            // the bridge, and this runs on the UI thread.
            int shown = -1;
            var progress = new Progress<int>(p =>
            {
                if (p == shown) return;
                shown = p;
                _bridge?.UpdateBanner(AppStrings.Update_BtnDownloading, null, p);
            });
            _installerPath = await AutoUpdater.DownloadUpdateAsync(_updateDownloadUrl, progress);

            _updateDownloaded = true;
            CrashLog.Note("update: download finished, offering restart");
            ShowReadyToInstall();
        }
        catch (Exception ex)
        {
            CrashLog.Write("update download", ex);

            // "No such host is known. (github.com:443)" is a true sentence and
            // a useless one: it reads like the app broke rather than the
            // connection dropped, which is what it means. The Update button
            // comes back either way, because retrying is the answer.
            bool offline = ex is System.Net.Http.HttpRequestException
                        or System.Net.Sockets.SocketException
                        or TaskCanceledException
                        || ex.InnerException is System.Net.Sockets.SocketException;

            _bridge?.UpdateBanner(
                offline ? AppStrings.Update_StatusNoConnection
                        : string.Format(AppStrings.Update_StatusFailedFormat, ex.Message),
                AppStrings.Update_BtnUpdate,
                null);
        }
        finally
        {
            _updateRunning = false;
        }
    }

    /// <summary>
    /// Says the update is ready, and keeps saying it. A single pushed message is
    /// all this used to be, and a message posted while the page is navigating is
    /// dropped on the floor: the download was complete on disk while the banner
    /// still read "downloading" and offered no way forward. The banner the app
    /// replays on every page load now carries the finished state too, so the
    /// next screen is right even if the message itself never arrived.
    /// </summary>
    /// <summary>
    /// The banner that says the installer is on disk and waiting.
    ///
    /// Marshalled, like ShowUpdateBanner beside it. This one used to post
    /// straight from the continuation after the download await, which is the
    /// ONE difference between it and the manual Check for updates path - and
    /// the manual path is the one that reliably repainted the banner. Making
    /// the two identical costs nothing and removes the difference as a
    /// suspect. Forced, as well: this is a state change, so a banner the user
    /// waved away earlier must not swallow the news that the wait is over.
    /// </summary>
    private void ShowReadyToInstall()
    {
        DispatcherQueue.TryEnqueue(() => _bridge?.ShowBanner(
            "success",
            AppStrings.Update_BannerTitle,
            AppStrings.Update_StatusReady,
            AppStrings.Update_BtnRestart,
            StartUpdate,
            force: true));
    }
}
