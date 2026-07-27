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
public sealed partial class MainWindow : Window
{
    private readonly UserSettings _settings = UserSettings.Load();
    private WebBridge? _bridge;
    private string _updateDownloadUrl = "";
    private string _installerPath = "";

    public MainWindow(Windows.ApplicationModel.DataTransfer.ShareTarget.ShareOperation? shareOperation = null)
    {
        InitializeComponent();
        _ = Task.Run(AppModel.CleanCache);
        if (_settings.EnableAutoUpdateCheck)
        {
            _ = CheckForUpdatesAsync();
        }
        _ = CheckEngineHealthAsync();

        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);
        AppWindow.TitleBar.PreferredHeightOption = TitleBarHeightOption.Tall;
        AppWindow.SetIcon("Assets/AppIcon.ico");
        ThemeHelper.Apply(this, _settings.ThemeMode);

        int startWidth = _settings.WindowWidth > 800 ? _settings.WindowWidth : 1100;
        int startHeight = _settings.WindowHeight > 600 ? _settings.WindowHeight : 720;
        AppWindow.Resize(new Windows.Graphics.SizeInt32(startWidth, startHeight));

        if (AppWindow.Presenter is OverlappedPresenter presenter)
        {
            presenter.PreferredMinimumWidth = 760;
            presenter.PreferredMinimumHeight = 560;
        }

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

        _ = StartAsync(needsSetup ? "setup.html" : "index.html", shareOperation);
    }

    private async Task StartAsync(string startPage, Windows.ApplicationModel.DataTransfer.ShareTarget.ShareOperation? shareOperation)
    {
        _bridge = new WebBridge(WebHost, this);
        _bridge.ThemeApplied += mode => DispatcherQueue.TryEnqueue(() => PaintShell(mode));

        try
        {
            await _bridge.InitializeAsync(startPage);
        }
        catch (Exception ex)
        {
            // No WebView2 runtime means no UI at all, so say so plainly rather
            // than showing an empty window.
            CrashLog.Write("WebView2 initialization", ex);
            ShowAlert(InfoBarSeverity.Error, AppStrings.Health_BannerTitle, AppStrings.Health_WebViewMissingBody,
                AppStrings.Health_BtnInstallRuntime,
                () => _ = Windows.System.Launcher.LaunchUriAsync(new Uri(WebView2RuntimeUrl)));
            return;
        }

        PaintShell(_bridge.ThemeMode);

        if (shareOperation is not null)
        {
            await ProcessShareAsync(shareOperation);
        }
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
    private void OnRecordingFinished(object? sender, string wavPath)
    {
        DispatcherQueue.TryEnqueue(() =>
        {
            _bridge?.Navigate("home");
            _bridge?.TranscribeRecording(wavPath);
        });
    }

    private void OnRecordingStateChanged(object? sender, EventArgs e)
    {
        _lastTick = -1;
        _bridge?.Emit("record.changed", new Dictionary<string, object?>
        {
            ["recording"] = RecordingController.IsRecording,
        });
    }

    // The mic reports ~33 times a second, which is far more than a timer that
    // counts whole seconds needs; only whole-second changes cross the bridge.
    private int _lastTick = -1;

    private void OnRecordingProgress(object? sender, (TimeSpan Time, float PeakLevel) data)
    {
        int seconds = (int)data.Time.TotalSeconds;
        if (seconds == _lastTick) return;
        _lastTick = seconds;

        _bridge?.Emit("record.progress", new Dictionary<string, object?>
        {
            ["seconds"] = seconds,
            ["level"] = Math.Round(data.PeakLevel, 3),
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

    /// <summary>Called by the chat assistant's NAVIGATE_TO action.</summary>
    public void NavigateTo(string tag) => DispatcherQueue.TryEnqueue(() => _bridge?.Navigate(tag));

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
        var (available, latestVersion, url) = await AutoUpdater.CheckForUpdatesAsync();
        if (available)
        {
            ShowUpdateBanner(latestVersion, url);
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

    public void ShowUpdateBanner(string latestVersion, string url)
    {
        _updateDownloadUrl = url;
        DispatcherQueue.TryEnqueue(() => _bridge?.ShowBanner(
            "success",
            AppStrings.Update_BannerTitle,
            string.Format(AppStrings.Update_StatusAvailableFormat, latestVersion),
            AppStrings.Update_BtnUpdate,
            StartUpdate));
    }

    private bool _updateDownloaded;

    private async void StartUpdate()
    {
        if (_updateDownloaded)
        {
            if (!AutoUpdater.InstallAndRestart(_installerPath))
            {
                _bridge?.UpdateBanner(AppStrings.Update_StatusInstallCancelled, AppStrings.Update_BtnRestart, null);
            }
            return;
        }

        _bridge?.UpdateBanner(AppStrings.Update_BtnDownloading, null, 0);

        try
        {
            var progress = new Progress<int>(p => _bridge?.UpdateBanner(AppStrings.Update_BtnDownloading, null, p));
            _installerPath = await AutoUpdater.DownloadUpdateAsync(_updateDownloadUrl, progress);

            _updateDownloaded = true;
            _bridge?.UpdateBanner(AppStrings.Update_StatusReady, AppStrings.Update_BtnRestart, null);
        }
        catch (Exception ex)
        {
            _bridge?.UpdateBanner(string.Format(AppStrings.Update_StatusFailedFormat, ex.Message), AppStrings.Update_BtnUpdate, null);
        }
    }
}
