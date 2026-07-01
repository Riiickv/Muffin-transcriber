using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace AITranscriber_WinUI.Pages;

public sealed partial class ModelsPage : Page
{
    // One shared HttpClient — creating per-request churns sockets and per-chunk
    // creation (8x at once) used to blow the connection pool on every download.
    private static readonly HttpClient SharedHttpClient = new() { Timeout = Timeout.InfiniteTimeSpan };

    private readonly Dictionary<string, (TextBlock Status, Button Button)> _controls;
    private bool _busy;

    private DispatcherTimer _statusTimer;

    public ModelsPage()
    {
        InitializeComponent();
        _statusTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(3) };
        _statusTimer.Tick += (s, e) => { StatusBar.IsOpen = false; _statusTimer.Stop(); };

        _controls = new()
        {
            ["ggml-tiny.bin"] = (TinyStatus, TinyButton),
            ["ggml-base.bin"] = (BaseStatus, BaseButton),
            ["ggml-small.bin"] = (SmallStatus, SmallButton),
            ["ggml-large-v3.bin"] = (HighStatus, HighButton),
            ["Llama-3.2-3B-Instruct-Q4_K_M.gguf"] = (LlamaStatus, LlamaButton),
            ["qwen2.5-1.5b-instruct-q4_k_m.gguf"] = (QwenStatus, QwenButton),
            ["Phi-3-mini-4k-instruct-q4.gguf"] = (PhiStatus, PhiButton),
        };

        RefreshModelStates();
    }

    private void RefreshModelStates()
    {
        Directory.CreateDirectory(AppModel.ModelsDir);

        foreach (ModelInfo model in AppModel.WhisperModels.Concat(AppModel.FormatterModels))
        {
            (TextBlock status, Button button) = _controls[model.File];
            string path = AppModel.ModelPath(model.File);
            bool installed = AppModel.IsValidModelFile(path);
            bool broken = File.Exists(path) && !installed;

            status.Text = installed ? AppStrings.Models_Status_Installed : broken ? AppStrings.Models_Status_Broken : AppStrings.Models_Status_NotInstalled;
            status.Foreground = new SolidColorBrush(installed ? Colors.LightGreen : broken ? Colors.IndianRed : Colors.Gray);
            button.Content = installed || broken ? AppStrings.Models_BtnDelete : AppStrings.Models_BtnDownload;
            button.IsEnabled = !_busy;
        }
    }

    private async void ModelButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button button || button.Tag is not string file)
        {
            return;
        }

        ModelInfo? model = AppModel.WhisperModels.Concat(AppModel.FormatterModels).FirstOrDefault(item => item.File == file);
        if (model is null)
        {
            return;
        }

        string path = AppModel.ModelPath(model.File);
        if (File.Exists(path))
        {
            File.Delete(path);
            ShowStatus(string.Format(AppStrings.Models_Status_DeletedFormat, model.Name), InfoBarSeverity.Success);
            RefreshModelStates();
            return;
        }

        _busy = true;
        RefreshModelStates();
        DownloadProgress.Visibility = Visibility.Visible;
        DownloadProgress.IsIndeterminate = false;
        DownloadProgress.Value = 0;
        
        string plainName = AppModel.CompactName(model);
        ShowStatus(string.Format(AppStrings.Models_Status_DownloadingFormat, plainName), InfoBarSeverity.Informational);

        var progress = new Progress<(long downloaded, long total, double speed, TimeSpan? eta)>(p =>
        {
            string totalStr = (p.total / 1024.0 / 1024.0 / 1024.0).ToString("0.00");
            string downStr = (p.downloaded / 1024.0 / 1024.0 / 1024.0).ToString("0.00");
            string speedStr = p.speed.ToString("0.0");
            string timeStr = p.eta?.ToString(@"hh\:mm\:ss") ?? "--:--:--";
            
            ShowStatus(string.Format(AppStrings.Models_Status_DownloadingProgressFormat, plainName, downStr, totalStr, speedStr, timeStr), InfoBarSeverity.Informational);
            DownloadProgress.Value = Math.Min(100, p.downloaded * 100d / p.total);
        });

        try
        {
            await DownloadModelAsync(model, path, progress);
            ShowStatus(string.Format(AppStrings.Models_Status_InstalledFormat, model.Name), InfoBarSeverity.Success);
        }
        catch (Exception ex)
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }

            ShowStatus(ex.Message, InfoBarSeverity.Error);
        }
        finally
        {
            _busy = false;
            DownloadProgress.Visibility = Visibility.Collapsed;
            RefreshModelStates();
        }
    }

    private async Task DownloadModelAsync(ModelInfo model, string destination, IProgress<(long downloaded, long total, double speed, TimeSpan? eta)> progress)
    {
        using HttpResponseMessage headResponse = await SharedHttpClient.GetAsync(model.Url, HttpCompletionOption.ResponseHeadersRead);
        headResponse.EnsureSuccessStatusCode();

        long? totalHeader = headResponse.Content.Headers.ContentLength;
        long totalBytes = totalHeader ?? 0;
        long downloaded = 0;

        using var cts = new CancellationTokenSource();
        var reportTask = Task.Run(async () =>
        {
            long lastDownloaded = 0;
            while (!cts.IsCancellationRequested)
            {
                try { await Task.Delay(500, cts.Token); } catch { break; }
                long currentDownloaded = Interlocked.Read(ref downloaded);
                long bytesSinceLast = currentDownloaded - lastDownloaded;
                lastDownloaded = currentDownloaded;
                
                double speed = bytesSinceLast / 1024.0 / 1024.0 / 0.5; // MB/s
                TimeSpan? eta = speed > 0 && totalBytes > 0 ? TimeSpan.FromSeconds((totalBytes - currentDownloaded) / 1024.0 / 1024.0 / speed) : null;
                
                progress.Report((currentDownloaded, totalBytes, speed, eta));
            }
        });

        // Check if server supports range requests
        if (totalHeader is null or <= 0 || headResponse.Headers.AcceptRanges?.Contains("bytes") != true)
        {
            await using Stream source = await headResponse.Content.ReadAsStreamAsync();
            await using FileStream targetSeq = File.Create(destination);

            byte[] bufferSeq = new byte[1024 * 1024];
            int readSeq;
            while ((readSeq = await source.ReadAsync(bufferSeq)) > 0)
            {
                await targetSeq.WriteAsync(bufferSeq.AsMemory(0, readSeq));
                Interlocked.Add(ref downloaded, readSeq);
            }
            
            cts.Cancel();
            return;
        }

        // Parallel chunk download
        int maxConnections = 8;
        long chunkSize = totalBytes / maxConnections;
        
        await using FileStream target = new(destination, FileMode.Create, FileAccess.Write, FileShare.None);
        target.SetLength(totalBytes);
        
        var tasks = new List<Task>();

        for (int i = 0; i < maxConnections; i++)
        {
            long start = i * chunkSize;
            long end = (i == maxConnections - 1) ? totalBytes - 1 : (start + chunkSize - 1);
            
            tasks.Add(Task.Run(async () =>
            {
                using var request = new HttpRequestMessage(HttpMethod.Get, model.Url);
                request.Headers.Range = new System.Net.Http.Headers.RangeHeaderValue(start, end);
                using HttpResponseMessage response = await SharedHttpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
                response.EnsureSuccessStatusCode();
                
                await using Stream source = await response.Content.ReadAsStreamAsync();
                byte[] buffer = new byte[1024 * 64];
                long currentOffset = start;
                int read;
                
                while ((read = await source.ReadAsync(buffer)) > 0)
                {
                    RandomAccess.Write(target.SafeFileHandle, buffer.AsSpan(0, read), currentOffset);
                    currentOffset += read;
                    Interlocked.Add(ref downloaded, read);
                }
            }));
        }
        
        await Task.WhenAll(tasks);
        cts.Cancel();
    }

    private void ShowStatus(string message, InfoBarSeverity severity)
    {
        StatusBar.Message = message;
        StatusBar.Severity = severity;
        StatusBar.IsOpen = true;
        
        if (severity == InfoBarSeverity.Success || severity == InfoBarSeverity.Error)
        {
            _statusTimer.Stop();
            _statusTimer.Start();
        }
        else
        {
            _statusTimer.Stop();
        }
    }
}
