using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace MuffinTranscriber.Pages;

// First-run wizard. Shown instead of Home when no Whisper model is installed
// and setup was never completed: a fresh install used to land on a dead Home
// page with a disabled button and no explanation. Offers one recommended model
// per role; the full catalogue stays on the Models page.
public sealed partial class SetupPage : Page
{
    // Recommended defaults: small is the accuracy/speed sweet spot for CPUs and
    // modest GPUs; Qwen 1.5B is the lightest formatter that formats reliably.
    private const string RecommendedWhisperFile = "ggml-small.bin";
    private const string RecommendedLlmFile = "qwen2.5-1.5b-instruct-q4_k_m.gguf";

    private CancellationTokenSource? _whisperCts;
    private CancellationTokenSource? _llmCts;

    public SetupPage()
    {
        InitializeComponent();
        RefreshState();
        LiveStrings.Attach(this, () => { Bindings.Update(); RefreshState(); });
    }

    private void RefreshState()
    {
        bool whisperInstalled = IsInstalled(RecommendedWhisperFile);
        bool llmInstalled = IsInstalled(RecommendedLlmFile);

        if (_whisperCts is null)
        {
            WhisperButton.Content = whisperInstalled ? AppStrings.Setup_BtnDownloaded : AppStrings.Setup_BtnDownload;
            WhisperButton.IsEnabled = !whisperInstalled;
        }

        if (_llmCts is null)
        {
            LlmButton.Content = llmInstalled ? AppStrings.Setup_BtnDownloaded : AppStrings.Setup_BtnDownload;
            LlmButton.IsEnabled = !llmInstalled;
        }

        // Any valid Whisper model counts, not just the recommended one: the user
        // may have downloaded a different size from the Models tab mid-setup.
        FinishButton.Content = AppModel.ActiveWhisperModel() is not null
            ? AppStrings.Setup_BtnFinish
            : AppStrings.Setup_BtnSkip;
    }

    private static bool IsInstalled(string file) => AppModel.IsValidModelFile(AppModel.ModelPath(file));

    private async void WhisperButton_Click(object sender, RoutedEventArgs e)
    {
        if (_whisperCts is not null)
        {
            _whisperCts.Cancel();
            return;
        }

        ModelInfo? model = Array.Find(AppModel.WhisperModels, m => m.File == RecommendedWhisperFile);
        if (model is null)
        {
            return;
        }

        _whisperCts = new CancellationTokenSource();
        await RunDownloadAsync(model, WhisperButton, WhisperStatus, WhisperProgress, _whisperCts);
        _whisperCts = null;
        RefreshState();
    }

    private async void LlmButton_Click(object sender, RoutedEventArgs e)
    {
        if (_llmCts is not null)
        {
            _llmCts.Cancel();
            return;
        }

        ModelInfo? model = Array.Find(AppModel.FormatterModels, m => m.File == RecommendedLlmFile);
        if (model is null)
        {
            return;
        }

        _llmCts = new CancellationTokenSource();
        await RunDownloadAsync(model, LlmButton, LlmStatus, LlmProgress, _llmCts);
        _llmCts = null;
        RefreshState();
    }

    private async Task RunDownloadAsync(ModelInfo model, Button button, TextBlock status, ProgressBar bar, CancellationTokenSource cts)
    {
        Directory.CreateDirectory(AppModel.ModelsDir);
        string path = AppModel.ModelPath(model.File);

        button.Content = AppStrings.Models_BtnCancel;
        status.Visibility = Visibility.Visible;
        bar.Visibility = Visibility.Visible;
        bar.Value = 0;

        var progress = new Progress<(long downloaded, long total, double speed, TimeSpan? eta)>(p =>
        {
            double pct = p.total > 0 ? Math.Min(100, p.downloaded * 100d / p.total) : 0;
            string time = p.eta?.ToString(@"mm\:ss") ?? "--:--";
            bar.Value = pct;
            status.Text = $"{pct:0}%  ·  {p.speed:0.0} MB/s  ·  {time}";
        });

        try
        {
            await ModelDownloader.DownloadAsync(model, path, progress, cts.Token);
            status.Visibility = Visibility.Collapsed;
        }
        catch (OperationCanceledException)
        {
            if (File.Exists(path)) { try { File.Delete(path); } catch { } }
            status.Visibility = Visibility.Collapsed;
        }
        catch (Exception ex)
        {
            if (File.Exists(path)) { try { File.Delete(path); } catch { } }
            status.Text = string.Format(AppStrings.Setup_Status_DownloadFailedFormat, ex.Message);
        }
        finally
        {
            bar.Visibility = Visibility.Collapsed;
            cts.Dispose();
        }
    }

    private void FinishButton_Click(object sender, RoutedEventArgs e)
    {
        // Reload rather than reusing a cached instance so this save can't
        // clobber settings another page wrote in the meantime.
        UserSettings settings = UserSettings.Load();
        settings.SetupCompleted = true;
        settings.Save();

        (App.MainWindow as MainWindow)?.CompleteSetup();
    }
}
