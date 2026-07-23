using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace MuffinTranscriber.Pages;

public sealed partial class ModelsPage : Page
{
    private readonly Dictionary<string, (TextBlock Status, Button Button)> _controls;
    private readonly StatusBarController _status;

    private string? _downloadingFile;
    private CancellationTokenSource? _cts;

    public ModelsPage()
    {
        InitializeComponent();
        _status = new StatusBarController(StatusBar);

        _controls = new()
        {
            ["ggml-tiny.bin"] = (TinyStatus, TinyButton),
            ["ggml-base.bin"] = (BaseStatus, BaseButton),
            ["ggml-small.bin"] = (SmallStatus, SmallButton),
            ["ggml-large-v3.bin"] = (HighStatus, HighButton),
            ["Llama-3.2-3B-Instruct-Q4_K_M.gguf"] = (LlamaStatus, LlamaButton),
            ["qwen2.5-1.5b-instruct-q4_k_m.gguf"] = (QwenStatus, QwenButton),
            ["Phi-3-mini-4k-instruct-q4.gguf"] = (PhiStatus, PhiButton),
            ["all-MiniLM-L6-v2-q4_k_m.gguf"] = (EmbedStatus, EmbedButton),
        };

        RefreshModelStates();
    }

    private static IEnumerable<ModelInfo> AllModels =>
        AppModel.WhisperModels.Concat(AppModel.FormatterModels).Concat(AppModel.EmbeddingModels);

    private void RefreshModelStates()
    {
        Directory.CreateDirectory(AppModel.ModelsDir);

        foreach (ModelInfo model in AllModels)
        {
            (TextBlock status, Button button) = _controls[model.File];

            // The active download drives its own status text; its button cancels.
            if (model.File == _downloadingFile)
            {
                button.Content = AppStrings.Models_BtnCancel;
                button.IsEnabled = true;
                continue;
            }

            string path = AppModel.ModelPath(model.File);
            bool installed = AppModel.IsValidModelFile(path);
            bool broken = File.Exists(path) && !installed;

            status.Text = installed ? AppStrings.Models_Status_Installed : broken ? AppStrings.Models_Status_Broken : AppStrings.Models_Status_NotInstalled;
            status.Foreground = new SolidColorBrush(installed ? Colors.LightGreen : broken ? Colors.IndianRed : Colors.Gray);
            button.Content = installed || broken ? AppStrings.Models_BtnDelete : AppStrings.Models_BtnDownload;
            button.IsEnabled = true;
        }
    }

    private async void ModelButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button button || button.Tag is not string file)
        {
            return;
        }

        // Clicking the in-progress download cancels it.
        if (file == _downloadingFile)
        {
            _cts?.Cancel();
            return;
        }

        // One download at a time, but every other button stays usable.
        if (_downloadingFile is not null)
        {
            _status.Show(AppStrings.Models_Status_OneAtATime, InfoBarSeverity.Informational);
            return;
        }

        ModelInfo? model = AllModels.FirstOrDefault(item => item.File == file);
        if (model is null)
        {
            return;
        }

        string path = AppModel.ModelPath(model.File);
        if (File.Exists(path))
        {
            // The embedding model is held open (mmap) by the llama-server; release it first.
            if (AppModel.EmbeddingModels.Any(m => m.File == model.File))
            {
                EmbeddingService.Shutdown();
            }

            try
            {
                File.Delete(path);
            }
            catch (Exception)
            {
                _status.Show(AppStrings.Models_Status_InUse, InfoBarSeverity.Error);
                return;
            }

            _status.Show(string.Format(AppStrings.Models_Status_DeletedFormat, model.Name), InfoBarSeverity.Success);
            RefreshModelStates();
            return;
        }

        _downloadingFile = file;
        _cts = new CancellationTokenSource();
        RefreshModelStates();

        (TextBlock rowStatus, _) = _controls[file];
        var progress = new Progress<(long downloaded, long total, double speed, TimeSpan? eta)>(p =>
        {
            double pct = p.total > 0 ? Math.Min(100, p.downloaded * 100d / p.total) : 0;
            string time = p.eta?.ToString(@"mm\:ss") ?? "--:--";
            rowStatus.Text = $"{pct:0}%  ·  {p.speed:0.0} MB/s  ·  {time} left";
            rowStatus.Foreground = new SolidColorBrush(Colors.DeepSkyBlue);
        });

        try
        {
            await ModelDownloader.DownloadAsync(model, path, progress, _cts.Token);
            _status.Show(string.Format(AppStrings.Models_Status_InstalledFormat, model.Name), InfoBarSeverity.Success);
        }
        catch (OperationCanceledException)
        {
            if (File.Exists(path)) { try { File.Delete(path); } catch { } }
            _status.Show(AppStrings.Models_Status_Cancelled, InfoBarSeverity.Informational);
        }
        catch (Exception ex)
        {
            if (File.Exists(path)) { try { File.Delete(path); } catch { } }
            _status.Show(ex.Message, InfoBarSeverity.Error);
        }
        finally
        {
            _cts?.Dispose();
            _cts = null;
            _downloadingFile = null;
            RefreshModelStates();
        }
    }

}
