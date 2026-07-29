using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace MuffinTranscriber.Web;

/// <summary>
/// The model library: what is installed, downloading one, removing one.
/// A download reports progress as an event so the page can show it without
/// polling, and cancelling deletes the partial file.
/// </summary>
public sealed partial class WebBridge
{
    private readonly Dictionary<string, CancellationTokenSource> _downloads = new(StringComparer.Ordinal);

    /// <summary>
    /// How far each running download has got. Progress is pushed to whatever
    /// page is open, and a page that loads mid-download has missed all of it,
    /// so the last percentage is kept here for the next screen to ask for.
    /// </summary>
    private readonly Dictionary<string, int> _downloadPercent = new(StringComparer.Ordinal);

    /// <summary>Downloads the user paused, and how far each had got.</summary>
    private readonly Dictionary<string, int> _pausedPercent = new(StringComparer.Ordinal);

    /// <summary>
    /// Everything in flight, running or paused, keyed by file: the percentage
    /// and the name to show for it. The rail draws one ring per entry, so it
    /// needs the name here rather than looking the catalogue up itself.
    /// </summary>
    public Dictionary<string, object?> ActiveDownloads()
    {
        var all = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach ((string file, int percent) in _downloadPercent)
        {
            all[file] = Entry(file, percent, paused: false);
        }
        foreach ((string file, int percent) in _pausedPercent)
        {
            if (!all.ContainsKey(file)) all[file] = Entry(file, percent, paused: true);
        }
        return all;

        Dictionary<string, object?> Entry(string file, int percent, bool paused) => new()
        {
            ["percent"] = percent,
            ["paused"] = paused,
            ["name"] = FindModel(file) is ModelInfo m ? AppModel.DisplayName(m) : file,
        };
    }

    private void RegisterModelHandlers()
    {
        Register("models.list", _ => (object?)new Dictionary<string, object?>
        {
            ["whisper"] = Group(AppModel.WhisperModels, DeviceTier.Group.Whisper),
            ["formatter"] = Group(AppModel.FormatterModels, DeviceTier.Group.Formatter),
            ["embedding"] = Group(AppModel.EmbeddingModels, DeviceTier.Group.Embedding),
            ["installedCount"] = InstalledCount(),
            // So a screen opened mid-download draws the bars rather than a
            // Download button that silently does nothing when pressed.
            ["downloading"] = ActiveDownloads(),
        });

        Register("models.download", async args => await StartDownloadAsync(Str(args, "file")));

        Register("models.cancel", args =>
        {
            string file = Str(args, "file");
            _pausedPercent.Remove(file);
            // A paused download is not running, so there is no token to cancel;
            // its bytes still have to go.
            if (FindModel(file) is ModelInfo m) ModelDownloader.DiscardAll(AppModel.ModelPath(m.File));
            if (_downloads.TryGetValue(file, out CancellationTokenSource? cts)) cts.Cancel();
            return (object?)null;
        });

        // Pause keeps the bytes; cancel throws them away. Two different words
        // for what used to be one button, because on an 18 GB model they are
        // very different outcomes.
        Register("models.pause", args =>
        {
            string file = Str(args, "file");
            if (!_downloads.TryGetValue(file, out CancellationTokenSource? cts)) return (object?)null;
            _pausing.Add(file);
            _pausedPercent[file] = _downloadPercent.TryGetValue(file, out int p) ? p : 0;
            cts.Cancel();
            return (object?)null;
        });

        Register("models.resume", async args =>
        {
            string file = Str(args, "file");
            _pausedPercent.Remove(file);
            return await StartDownloadAsync(file);
        });

        Register("models.delete", args =>
        {
            string file = Str(args, "file");
            if (FindModel(file) is null) return null;
            TryDelete(AppModel.ModelPath(file));
            return (object?)new Dictionary<string, object?> { ["installedCount"] = InstalledCount() };
        });
    }

    /// <summary>Files whose cancellation means "pause", not "throw it away".</summary>
    private readonly HashSet<string> _pausing = new(StringComparer.Ordinal);

    /// <summary>
    /// Starts or resumes a download. Both go through here, because resuming is
    /// the same call: the downloader finds the partial file and the offsets it
    /// left behind and asks only for what is missing.
    /// </summary>
    private async Task<object?> StartDownloadAsync(string file)
    {
        ModelInfo? model = FindModel(file);
        if (model is null) return null;
        if (_downloads.ContainsKey(file)) return null;

        Directory.CreateDirectory(AppModel.ModelsDir);
        string destination = AppModel.ModelPath(model.File);
        var cts = new CancellationTokenSource();
        _downloads[file] = cts;
        _downloadPercent[file] = _pausedPercent.TryGetValue(file, out int resumeAt) ? resumeAt : 0;
        _pausing.Remove(file);

        var progress = new Progress<(long downloaded, long total, double speed, TimeSpan? eta)>(p =>
        {
            int percent = p.total > 0 ? (int)(p.downloaded * 100 / p.total) : 0;
            _downloadPercent[file] = percent;
            Emit("models.progress", new Dictionary<string, object?>
            {
                ["file"] = file,
                ["name"] = AppModel.DisplayName(model),
                ["downloaded"] = p.downloaded,
                ["total"] = p.total,
                ["percent"] = percent,
                ["speed"] = Math.Round(p.speed, 1),
                ["etaSeconds"] = p.eta.HasValue ? (int)p.eta.Value.TotalSeconds : (int?)null,
            });
        });

        bool pausing = false;
        try
        {
            // Always keep the partial on cancellation: whether this was a pause
            // or a real cancel is only known once it has stopped, and the catch
            // below deletes the bytes when it turns out to have been a cancel.
            await ModelDownloader.DownloadAsync(model, destination, progress, cts.Token, keepPartial: true);
            Emit("models.done", new Dictionary<string, object?> { ["file"] = file, ["ok"] = true });
            return ModelMap(model);
        }
        catch (OperationCanceledException)
        {
            pausing = _pausing.Contains(file);
            if (!pausing)
            {
                ModelDownloader.DiscardAll(destination);
                TryDelete(destination);
            }
            Emit("models.done", new Dictionary<string, object?>
            {
                ["file"] = file,
                ["ok"] = false,
                ["cancelled"] = !pausing,
                ["paused"] = pausing,
                ["percent"] = pausing && _pausedPercent.TryGetValue(file, out int at) ? at : 0,
            });
            return null;
        }
        catch (Exception ex)
        {
            // A failure is not a pause: the bytes are suspect, so they go.
            ModelDownloader.DiscardAll(destination);
            TryDelete(destination);
            Emit("models.done", new Dictionary<string, object?> { ["file"] = file, ["ok"] = false, ["error"] = ex.Message });
            return null;
        }
        finally
        {
            _downloads.Remove(file);
            _downloadPercent.Remove(file);
            _pausing.Remove(file);
            if (!pausing) _pausedPercent.Remove(file);
        }
    }

    private static ModelInfo? FindModel(string file) =>
        AppModel.WhisperModels.Concat(AppModel.FormatterModels).Concat(AppModel.EmbeddingModels)
            .FirstOrDefault(m => m.File == file);

    private static int InstalledCount() =>
        AppModel.WhisperModels.Concat(AppModel.FormatterModels).Concat(AppModel.EmbeddingModels)
            .Count(m => AppModel.IsValidModelFile(AppModel.ModelPath(m.File)));

    // A group with the model suggested for this machine FIRST and marked, which
    // is what the setup wizard glows around. The catalog's own order is
    // speed-ascending and stays the source of truth everywhere else.
    private static List<Dictionary<string, object?>> Group(ModelInfo[] models, DeviceTier.Group group)
    {
        string? recommended = DeviceTier.RecommendedFile(group);
        IEnumerable<ModelInfo> ordered = recommended is null
            ? models
            : models.Where(m => m.File == recommended).Concat(models.Where(m => m.File != recommended));

        return ordered.Select(m => ModelMap(m, m.File == recommended)).ToList();
    }

    // Names come from the shared catalog, so the desktop picker reads exactly
    // like the mobile one: a tier, not a model number.
    private static Dictionary<string, object?> ModelMap(ModelInfo model, bool recommended = false) => new()
    {
        ["file"] = model.File,
        ["name"] = AppModel.DisplayName(model),
        ["desc"] = AppModel.DisplayDesc(model),
        ["size"] = model.Size,
        ["installed"] = AppModel.IsValidModelFile(AppModel.ModelPath(model.File)),
        ["recommended"] = recommended,
    };

    private static void TryDelete(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); } catch { }
    }
}
