using Microsoft.UI.Xaml;
using System;
using System.Collections.Generic;
using MuffinTranscriber.Web;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Windows.ApplicationModel.DataTransfer;
using Windows.Storage;

namespace MuffinTranscriber;

public sealed partial class MiniWindow : Window, IShellWindow
{
    private Windows.ApplicationModel.DataTransfer.ShareTarget.ShareOperation? _shareOperation;
    private string _rawTranscript = "";

    // The page's state, pushed over the bridge. These replace StatusText,
    // TranscriptBox and the two IsEnabled flags: the window no longer owns
    // controls, it owns facts and mini.html renders them.
    private WebBridge? _bridge;
    private string _status = "";
    private string _text = "";
    private bool _canCopy;
    private bool _canImprove;
    private bool _busy;
    private bool _pageReady;

    private void PushState() => DispatcherQueue.TryEnqueue(() =>
    {
        if (!_pageReady) return;
        _bridge?.Emit("mini.state", new Dictionary<string, object?>
        {
            ["status"] = _status,
            ["text"] = _text,
            ["canCopy"] = _canCopy,
            ["canImprove"] = _canImprove,
            ["busy"] = _busy,
        });
    });

    private void SetStatus(string value) { _status = value; PushState(); }
    private void SetText(string value) { _text = value; PushState(); }

    // Lifecycle guards: don't tear down the dispatcher mid-processing, and settle the share op exactly once so the share sheet never hangs.
    private bool _isProcessing;
    private bool _closeRequested;
    private bool _isClosed;
    private bool _reported;
    private string? _historyItemId;

    /// <summary>Path handed over by Explorer, when there is no ShareOperation.</summary>
    private string? _filePath;

    /// <summary>
    /// Opened from Explorer's "Transcribe with Muffin" verb.
    ///
    /// Same window and same work as a share; only the way the file arrives
    /// differs, so everything below treats them as one path.
    /// </summary>
    public MiniWindow(string filePath) : this(null, filePath) { }

    public MiniWindow(Windows.ApplicationModel.DataTransfer.ShareTarget.ShareOperation? shareOperation, string? filePath = null)
    {
        InitializeComponent();

        var presenter = AppWindow.Presenter as Microsoft.UI.Windowing.OverlappedPresenter;
        if (presenter != null)
        {
            presenter.SetBorderAndTitleBar(true, false);
            presenter.IsMaximizable = false;
            presenter.IsMinimizable = false;
            presenter.IsResizable = false;
        }

        // Smaller: it holds a status line, a transcript and two buttons, and it
        // appears under the pointer - a big panel there is in the way.
        int width = 340;
        int height = 400;

        // Read HERE, in the constructor, which is the first moment this process
        // gets after the click that shared or right-clicked the file. Anything
        // later and the pointer has already moved on.
        if (GetCursorPos(out POINT pt))
        {
            AppWindow.MoveAndResize(new Windows.Graphics.RectInt32(pt.X - width / 2, pt.Y - height / 2, width, height));
        }
        else
        {
            AppWindow.Resize(new Windows.Graphics.SizeInt32(width, height));
        }

        _shareOperation = shareOperation;
        _filePath = filePath;

        // Rounded like the main window, since this one draws its own corners
        // too now that Windows is not drawing a caption for it.
        RoundCorners();

        _bridge = new WebBridge(WebHost, this);
        _bridge.MiniHost = this;
        _ = _bridge.InitializeAsync("mini.html");

        this.Activated += MiniWindow_Activated;
        this.Closed += (s, e) => _isClosed = true;

        _ = ProcessShareOperation();
    }

    private bool _hasBeenActivated = false;

    private void MiniWindow_Activated(object sender, WindowActivatedEventArgs args)
    {
        if (args.WindowActivationState != WindowActivationState.Deactivated)
        {
            _hasBeenActivated = true;
        }
        else if (_hasBeenActivated)
        {
            // Close on click-away, but never mid-processing or the dispatcher tears down mid-await and the result is lost. Defer until done.
            if (_isProcessing)
            {
                _closeRequested = true;
            }
            else
            {
                this.Close();
            }
        }
    }

    private void SettleShare(bool success, string? error = null)
    {
        if (_reported) return;
        _reported = true;
        try
        {
            if (success) _shareOperation?.ReportCompleted();
            else _shareOperation?.ReportError(error ?? AppStrings.Mini_Error_Generic);
        }
        catch { }
    }

    private void CloseIfDeferred()
    {
        if (_closeRequested && !_isClosed)
        {
            try { this.Close(); } catch { }
        }
    }

    public void HandleShareOperation(Windows.ApplicationModel.DataTransfer.ShareTarget.ShareOperation shareOperation)
    {
        _shareOperation = shareOperation;
        _reported = false;
        _ = ProcessShareOperation();
    }

    [System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Auto)]
    private static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern bool ReleaseCapture();

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    [return: System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.Bool)]
    private static extern bool GetCursorPos(out POINT lpPoint);

    [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
    public struct POINT
    {
        public int X;
        public int Y;
    }

    private const uint WM_NCLBUTTONDOWN = 0xA1;
    private const int HTCAPTION = 0x2;

    private void Grid_PointerPressed(object sender, Microsoft.UI.Xaml.Input.PointerRoutedEventArgs e)
    {
        var properties = e.GetCurrentPoint((UIElement)sender).Properties;
        if (properties.IsLeftButtonPressed)
        {
            var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(this);
            ReleaseCapture();
            SendMessage(hwnd, WM_NCLBUTTONDOWN, (IntPtr)HTCAPTION, IntPtr.Zero);
        }
    }

    private async Task ProcessShareOperation()
    {
        if (_shareOperation is null && string.IsNullOrEmpty(_filePath)) return;

        _isProcessing = true;
        bool success = false;
        string? error = null;
        // Unique per run so two concurrently-shared files can't clobber each
        // other's intermediate WAV / SRT.
        string wavPath = Path.Combine(Path.GetTempPath(), $"ai_transcriber_mini_{Guid.NewGuid():N}.wav");

        try
        {
            _shareOperation?.ReportStarted();
            SetStatus(AppStrings.Mini_Status_Loading);

            StorageFile? file;
            if (!string.IsNullOrEmpty(_filePath))
            {
                // Straight from Explorer: the path is already on disk and ours
                // to read, so there is nothing to unpack from a data package.
                file = await StorageFile.GetFileFromPathAsync(_filePath);
            }
            else
            {
                var items = await _shareOperation!.Data.GetStorageItemsAsync();
                file = items.Count > 0 ? items[0] as StorageFile : null;
            }

            if (file is null)
            {
                error = AppStrings.Mini_Status_NoFile;
                return;
            }

            SetStatus(AppStrings.Home_Status_CheckingDuplicate);
            string fileHash = await AppModel.ComputeFileHashAsync(file.Path);

            var settings = UserSettings.Load();

            if (!string.IsNullOrEmpty(fileHash))
            {
                var existingHistory = TranscriptionHistory.Load();
                var duplicate = existingHistory.FirstOrDefault(i => i.FileHash == fileHash);

                if (duplicate != null)
                {
                    _historyItemId = duplicate.Id;
                    _rawTranscript = duplicate.RawTranscript;
                    SetText(_rawTranscript);
                    SetStatus(AppStrings.Home_Status_LoadedFromHistory);

                    _canCopy = true;
                    _canImprove = true; PushState();
                    // Build the app now, while you are reading. Pressing the
                    // button then costs nothing; building it on the press cost
                    // seconds of staring at a window that had not appeared.
                    PreloadMainWindow();

                    if (settings.AutoCopyTranscript)
                    {
                        CopyTranscriptToClipboard();
                    }

                    TranscriptionHistory.AddOrUpdate(duplicate);
                    success = true;
                    return;
                }
            }

            SetStatus(AppStrings.Mini_Status_Transcribing);

            string cachedPath = file.Path;
            try
            {
                string ext = Path.GetExtension(file.Path).ToLowerInvariant();
                bool isVideo = ext == ".mp4" || ext == ".mkv" || ext == ".webm" || ext == ".mov" || ext == ".avi";
                cachedPath = Path.Combine(isVideo ? AppModel.VideoCacheDir : AppModel.AudioCacheDir, Guid.NewGuid().ToString() + ext);
                await Task.Run(() => File.Copy(file.Path, cachedPath, true));
            }
            catch { }

            string ffmpegArgs = settings.NormalizeAudio
                ? $"-y -i \"{cachedPath}\" -vn -af highpass=f=80,lowpass=f=7800,loudnorm=I=-16:TP=-1.5:LRA=11 -ar 16000 -ac 1 -c:a pcm_s16le \"{wavPath}\""
                : $"-y -i \"{cachedPath}\" -vn -ar 16000 -ac 1 -c:a pcm_s16le \"{wavPath}\"";

            await LLMFormatter.RunProcessAsync(AppModel.FfmpegExe, ffmpegArgs);

            var whisperModel = AppModel.PreferredOrActiveWhisperModel(settings);
            if (whisperModel == null)
            {
                SetStatus(AppStrings.Mini_Status_NoWhisper);
                error = AppStrings.Mini_Status_NoWhisper;
                return;
            }

            string lang = settings.DefaultLanguage;
            string languageArg = AppModel.LanguageCode(lang);
            string modelPath = AppModel.ModelPath(whisperModel.File);
            // ALWAYS pass -l, "auto" included. whisper-cli's default language is
            // "en", not detection, so dropping the flag for Auto-Detect made
            // Auto-Detect mean English - Italian speech came back in English.
            // TranscriptionService has carried this comment for a while; this
            // window still had the old conditional.
            string args = $"-m \"{modelPath}\" -f \"{wavPath}\" -l {languageArg} -nt -osrt";

            ProcessResult result = await LLMFormatter.RunProcessAsync(AppModel.WhisperExe, args);

            _rawTranscript = result.Stdout.Trim();

            string? srtTranscript = null;
            string expectedSrtPath = wavPath + ".srt";
            if (File.Exists(expectedSrtPath))
            {
                srtTranscript = await File.ReadAllTextAsync(expectedSrtPath);
                try { File.Delete(expectedSrtPath); } catch { }
            }

            if (string.IsNullOrWhiteSpace(_rawTranscript))
            {
                // No speech: surface a friendly message and don't persist an empty item.
                System.Diagnostics.Debug.WriteLine($"Mini whisper empty. ExitCode={result.ExitCode}. Stderr:\n{result.Stderr}");
                _rawTranscript = "";
                SetText("");
                SetStatus(AppStrings.Mini_Status_NoSpeech);
                success = true; // the share itself succeeded; there was just nothing to transcribe
                return;
            }

            SetText(_rawTranscript);
            SetStatus(AppStrings.Mini_Status_Done);

            _canCopy = true;
            _canImprove = true; PushState();
            PreloadMainWindow();

            if (settings.AutoCopyTranscript)
            {
                CopyTranscriptToClipboard();
            }

            string newId = Guid.NewGuid().ToString();
            _historyItemId = newId;
            TranscriptionHistory.AddOrUpdate(new TranscriptionHistoryItem(
                newId,
                DateTime.Now,
                // The file's REAL name. cachedPath is our own copy, named with
                // a Guid so two shares cannot collide, and using it made every
                // shared transcript show up in the library as
                // "56fa0989-8793-4a9f-874a-5c3d14d8be32.ogg".
                file.Name,
                lang,
                _rawTranscript,
                null,
                null,
                cachedPath,
                fileHash,
                srtTranscript
            ));

            // The same two passes the app runs on anything it transcribes.
            // Neither ran here, which is why a shared file kept its filename
            // for ever and never got its dates and places picked up.
            var saved = TranscriptionHistory.Load().FirstOrDefault(h => h.Id == newId);
            if (saved is not null)
            {
                _ = Task.Run(async () =>
                {
                    await TranscriptionHistory.RenameFromTextAsync(saved, _rawTranscript, settings.PreferredFormatterModel);
                    try
                    {
                        var found = await LLMFormatter.ExtractActionableEntitiesAsync(_rawTranscript, settings.PreferredFormatterModel);
                        if (found.Count > 0)
                        {
                            var row = TranscriptionHistory.Load().FirstOrDefault(h => h.Id == newId);
                            if (row is not null) TranscriptionHistory.AddOrUpdate(row with { ExtractedDates = found });
                        }
                    }
                    catch (Exception ex) { CrashLog.Write("Mini entity extraction", ex); }
                });
            }

            _ = LLMFormatter.ExtractContextAsync(_rawTranscript, settings.PreferredFormatterModel);
            success = true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            if (!_isClosed) SetStatus(AppStrings.Mini_Status_Error + ex.Message);
        }
        finally
        {
            _isProcessing = false;
            try { if (File.Exists(wavPath)) File.Delete(wavPath); } catch { }
            SettleShare(success, error);
            CloseIfDeferred();
        }
    }

    private void CopyTranscriptToClipboard()
    {
        var package = new DataPackage();
        package.SetText(_text);
        Clipboard.SetContent(package);
    }

    /// <summary>The page has loaded and is listening; send it what we have.</summary>
    public void PageReady()
    {
        _pageReady = true;
        PushState();
    }

    /// <summary>Text edited in the page, kept so Copy and Improve use it.</summary>
    public void SetTextFromPage(string text) => _text = text;

    public void MinimizeWindow() { }
    public bool ToggleMaximizeWindow() => false;
    public bool IsMaximized => false;
    public void CloseWindow() => Close();

    public void SetDragRegions(IReadOnlyList<(double X, double Y, double W, double H)> rects)
    {
        // The whole window drags: it is small, has no caption, and there is no
        // strip of chrome to aim at.
    }

    [System.Runtime.InteropServices.DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    private void RoundCorners()
    {
        try
        {
            IntPtr hwnd = WinRT.Interop.WindowNative.GetWindowHandle(this);
            int preference = 2; // DWMWCP_ROUND
            DwmSetWindowAttribute(hwnd, 33, ref preference, sizeof(int));
        }
        catch (Exception ex)
        {
            CrashLog.Write("Rounding the mini window", ex);
        }
    }

    public void CopyFromPage() => CopyButton_Click(this, new RoutedEventArgs());
    public void ImproveFromPage() => FormatButton_Click(this, new RoutedEventArgs());
    public void OpenAppFromPage() => OpenMainButton_Click(this, new RoutedEventArgs());

    private void CopyButton_Click(object sender, RoutedEventArgs e)
    {
        CopyTranscriptToClipboard();
        SetStatus(AppStrings.Mini_Status_Copied);
    }

    private async void FormatButton_Click(object sender, RoutedEventArgs e)
    {
        _isProcessing = true;
        _canImprove = false; _busy = true; PushState();
        SetStatus(AppStrings.Mini_Status_Formatting);
        var settings = UserSettings.Load();

        try
        {
            string? formatted = await LLMFormatter.FormatTranscriptAsync(_rawTranscript, settings.PreferredFormatterModel, settings.FormatLanguage);
            if (_isClosed) return;

            if (!string.IsNullOrWhiteSpace(formatted))
            {
                SetText(formatted);
                SetStatus(AppStrings.Mini_Status_Formatted);
                if (settings.AutoCopyTranscript)
                {
                    CopyTranscriptToClipboard();
                }

                // Update THIS share's history item, not whatever happens to be on top.
                var items = TranscriptionHistory.Load();
                var target = _historyItemId != null
                    ? items.FirstOrDefault(i => i.Id == _historyItemId)
                    : items.FirstOrDefault();
                if (target != null)
                {
                    TranscriptionHistory.AddOrUpdate(target with { FormattedTranscript = formatted });
                }
            }
            else
            {
                SetStatus(AppStrings.Mini_Status_FormatFailed);
            }
        }
        finally
        {
            _isProcessing = false;
            if (!_isClosed) { _canImprove = true; _busy = false; PushState(); }
            CloseIfDeferred();
        }
    }

    /// <summary>
    /// The main window, built the moment the transcript exists rather than when
    /// the button is pressed.
    ///
    /// Constructing it starts a WebView2, which is seconds of work - so pressing
    /// the button used to sit there doing nothing visible. Built ahead and kept
    /// hidden, the press is just an Activate.
    /// </summary>
    private MainWindow? _preloadedMain;

    private void PreloadMainWindow()
    {
        if (_preloadedMain is not null) return;
        try
        {
            _preloadedMain = new MainWindow();
            App.SetMainWindow(_preloadedMain);
        }
        catch (Exception ex)
        {
            // Losing the head start is not losing the button; it builds one on
            // demand below.
            CrashLog.Write("Preloading the main window", ex);
        }
    }

    private void OpenMainButton_Click(object sender, RoutedEventArgs e)
    {
        MainWindow main = _preloadedMain ?? new MainWindow();
        _preloadedMain = null;
        App.SetMainWindow(main);
        main.Activate();

        // Straight to the transcript that was just made. Landing on Muffin!
        // means hunting for the thing you were already looking at.
        if (!string.IsNullOrEmpty(_historyItemId))
        {
            main.ShowTranscript(_historyItemId!);
        }

        this.Close();
    }
}
