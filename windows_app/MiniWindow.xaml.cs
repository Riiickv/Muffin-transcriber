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

        _ = ProcessShareOperation();
    }
    
    private void MiniWindow_Activated(object sender, WindowActivatedEventArgs args)
    {
        if (args.WindowActivationState == WindowActivationState.Deactivated)
        {
            // Close the mini window when the user clicks away
            this.Close();
        }
    }
    
    public void HandleShareOperation(Windows.ApplicationModel.DataTransfer.ShareTarget.ShareOperation shareOperation)
    {
        _shareOperation = shareOperation;
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
        
        try
        {
            _shareOperation.ReportStarted();
            StatusText.Text = "Loading file...";
            
            var items = await _shareOperation.Data.GetStorageItemsAsync();
            if (items.Count == 0 || items[0] is not StorageFile file) return;
            
            StatusText.Text = "Checking for duplicate...";
            string fileHash = await AppModel.ComputeFileHashAsync(file.Path);
            
            var settings = UserSettings.Load();
            
            if (!string.IsNullOrEmpty(fileHash))
            {
                var existingHistory = TranscriptionHistory.Load();
                var duplicate = existingHistory.FirstOrDefault(i => i.FileHash == fileHash);
                
                if (duplicate != null)
                {
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
                    _shareOperation.ReportCompleted();
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
            
            string wavPath = Path.Combine(Path.GetTempPath(), "ai_transcriber_mini.wav");
            string ffmpegArgs = settings.NormalizeAudio
                ? $"-y -i \"{cachedPath}\" -vn -af highpass=f=80,lowpass=f=7800,loudnorm=I=-16:TP=-1.5:LRA=11 -ar 16000 -ac 1 -c:a pcm_s16le \"{wavPath}\""
                : $"-y -i \"{cachedPath}\" -vn -ar 16000 -ac 1 -c:a pcm_s16le \"{wavPath}\"";
            
            await LLMFormatter.RunProcessAsync(AppModel.FfmpegExe, ffmpegArgs);
            
            var whisperModel = AppModel.ActiveWhisperModel();
            if (whisperModel == null)
            {
                StatusText.Text = AppStrings.Mini_Status_NoWhisper;
                return;
            }
            
            string lang = settings.DefaultLanguage;
            string languageArg = AppModel.LanguageCode(lang);
            string modelPath = AppModel.ModelPath(whisperModel.File);
            string args = languageArg == "auto"
                ? $"-m \"{modelPath}\" -f \"{wavPath}\" -nt -osrt -ngl 999"
                : $"-m \"{modelPath}\" -f \"{wavPath}\" -l {languageArg} -nt -osrt -ngl 999";
            
            ProcessResult result = await LLMFormatter.RunProcessAsync(AppModel.WhisperExe, args);
            _rawTranscript = result.Stdout.Trim();
            
            string? srtTranscript = null;
            string expectedSrtPath = wavPath + ".srt";
            if (File.Exists(expectedSrtPath))
            {
                srtTranscript = await File.ReadAllTextAsync(expectedSrtPath);
                File.Delete(expectedSrtPath);
            }
            
            TranscriptBox.Text = _rawTranscript;
            StatusText.Text = AppStrings.Mini_Status_Done;
            
            CopyButton.IsEnabled = true;
            FormatButton.IsEnabled = true;
            
            if (settings.AutoCopyTranscript)
            {
                CopyTranscriptToClipboard();
            }
            
            TranscriptionHistory.AddOrUpdate(new TranscriptionHistoryItem(
                Guid.NewGuid().ToString(),
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
            _shareOperation.ReportCompleted();
        }
        catch (Exception ex)
        {
            StatusText.Text = "Error: " + ex.Message;
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
        FormatButton.IsEnabled = false;
        StatusText.Text = "Formatting...";
        var settings = UserSettings.Load();
        
        string? formatted = await LLMFormatter.FormatTranscriptAsync(_rawTranscript, settings.PreferredFormatterModel, settings.FormatLanguage);
        if (!string.IsNullOrWhiteSpace(formatted))
        {
            TranscriptBox.Text = formatted;
            StatusText.Text = "Formatted";
            if (settings.AutoCopyTranscript)
            {
                CopyTranscriptToClipboard();
            }
            
            var items = TranscriptionHistory.Load();
            if (items.Count > 0)
            {
                var item = items[0] with { FormattedTranscript = formatted };
                TranscriptionHistory.AddOrUpdate(item);
            }
        }
        else
        {
            StatusText.Text = "Format Failed";
        }
        FormatButton.IsEnabled = true;
    }
    
    private void OpenMainButton_Click(object sender, RoutedEventArgs e)
    {
        var mainWindow = new MainWindow();
        App.SetMainWindow(mainWindow);
        mainWindow.Activate();
        this.Close();
    }
}
