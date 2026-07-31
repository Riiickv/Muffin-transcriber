using Microsoft.UI.Xaml;
using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Windows.ApplicationModel.DataTransfer;
using Windows.Storage;

namespace MuffinTranscriber;

public sealed partial class MiniWindow : Window
{
    private Windows.ApplicationModel.DataTransfer.ShareTarget.ShareOperation? _shareOperation;
    private string _rawTranscript = "";

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

        int width = 400;
        int height = 500;

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
            StatusText.Text = AppStrings.Mini_Status_Loading;

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

            StatusText.Text = AppStrings.Home_Status_CheckingDuplicate;
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
                    TranscriptBox.Text = _rawTranscript;
                    StatusText.Text = AppStrings.Home_Status_LoadedFromHistory;

                    CopyButton.IsEnabled = true;
                    FormatButton.IsEnabled = true;
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

            StatusText.Text = AppStrings.Mini_Status_Transcribing;

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
                StatusText.Text = AppStrings.Mini_Status_NoWhisper;
                error = AppStrings.Mini_Status_NoWhisper;
                return;
            }

            string lang = settings.DefaultLanguage;
            string languageArg = AppModel.LanguageCode(lang);
            string modelPath = AppModel.ModelPath(whisperModel.File);
            string args = languageArg == "auto"
                ? $"-m \"{modelPath}\" -f \"{wavPath}\" -nt -osrt"
                : $"-m \"{modelPath}\" -f \"{wavPath}\" -l {languageArg} -nt -osrt";

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
                TranscriptBox.Text = "";
                StatusText.Text = AppStrings.Mini_Status_NoSpeech;
                success = true; // the share itself succeeded; there was just nothing to transcribe
                return;
            }

            TranscriptBox.Text = _rawTranscript;
            StatusText.Text = AppStrings.Mini_Status_Done;

            CopyButton.IsEnabled = true;
            FormatButton.IsEnabled = true;
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
                Path.GetFileName(cachedPath),
                lang,
                _rawTranscript,
                null,
                null,
                cachedPath,
                fileHash,
                srtTranscript
            ));

            _ = LLMFormatter.ExtractContextAsync(_rawTranscript, settings.PreferredFormatterModel);
            success = true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            if (!_isClosed) StatusText.Text = AppStrings.Mini_Status_Error + ex.Message;
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
        package.SetText(TranscriptBox.Text);
        Clipboard.SetContent(package);
    }

    private void CopyButton_Click(object sender, RoutedEventArgs e)
    {
        CopyTranscriptToClipboard();
        StatusText.Text = AppStrings.Mini_Status_Copied;
    }

    private async void FormatButton_Click(object sender, RoutedEventArgs e)
    {
        _isProcessing = true;
        FormatButton.IsEnabled = false;
        StatusText.Text = AppStrings.Mini_Status_Formatting;
        var settings = UserSettings.Load();

        try
        {
            string? formatted = await LLMFormatter.FormatTranscriptAsync(_rawTranscript, settings.PreferredFormatterModel, settings.FormatLanguage);
            if (_isClosed) return;

            if (!string.IsNullOrWhiteSpace(formatted))
            {
                TranscriptBox.Text = formatted;
                StatusText.Text = AppStrings.Mini_Status_Formatted;
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
                StatusText.Text = AppStrings.Mini_Status_FormatFailed;
            }
        }
        finally
        {
            _isProcessing = false;
            if (!_isClosed) FormatButton.IsEnabled = true;
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
