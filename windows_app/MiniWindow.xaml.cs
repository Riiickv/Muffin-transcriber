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

    public MiniWindow(Windows.ApplicationModel.DataTransfer.ShareTarget.ShareOperation shareOperation)
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
            // Close on click-away, but never mid-processing or the dispatcher tears down mid-await and the result is lost — defer until done.
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
            else _shareOperation?.ReportError(error ?? "Transcription failed.");
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
        if (_shareOperation == null) return;

        _isProcessing = true;
        bool success = false;
        string? error = null;
        // Unique per run so two concurrently-shared files can't clobber each
        // other's intermediate WAV / SRT.
        string wavPath = Path.Combine(Path.GetTempPath(), $"ai_transcriber_mini_{Guid.NewGuid():N}.wav");

        try
        {
            _shareOperation.ReportStarted();
            StatusText.Text = "Loading file...";

            var items = await _shareOperation.Data.GetStorageItemsAsync();
            if (items.Count == 0 || items[0] is not StorageFile file)
            {
                error = "No file was shared.";
                return;
            }

            StatusText.Text = "Checking for duplicate...";
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
                    StatusText.Text = "Loaded from history";

                    CopyButton.IsEnabled = true;
                    FormatButton.IsEnabled = true;

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

            var whisperModel = AppModel.ActiveWhisperModel();
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
            if (!_isClosed) StatusText.Text = "Error: " + ex.Message;
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
        StatusText.Text = "Copied!";
    }

    private async void FormatButton_Click(object sender, RoutedEventArgs e)
    {
        _isProcessing = true;
        FormatButton.IsEnabled = false;
        StatusText.Text = "Formatting...";
        var settings = UserSettings.Load();

        try
        {
            string? formatted = await LLMFormatter.FormatTranscriptAsync(_rawTranscript, settings.PreferredFormatterModel, settings.FormatLanguage);
            if (_isClosed) return;

            if (!string.IsNullOrWhiteSpace(formatted))
            {
                TranscriptBox.Text = formatted;
                StatusText.Text = "Formatted";
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
                StatusText.Text = "Format Failed";
            }
        }
        finally
        {
            _isProcessing = false;
            if (!_isClosed) FormatButton.IsEnabled = true;
            CloseIfDeferred();
        }
    }

    private void OpenMainButton_Click(object sender, RoutedEventArgs e)
    {
        var mainWindow = new MainWindow();
        App.SetMainWindow(mainWindow);
        mainWindow.Activate();
        this.Close();
    }
}
