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

    public Dictionary<string, object?> ActiveDownloads() =>
        _downloadPercent.ToDictionary(kv => kv.Key, kv => (object?)kv.Value);

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

        Register("models.download", async args =>
        {
            string file = Str(args, "file");
            ModelInfo? model = FindModel(file);
            if (model is null) return null;
            if (_downloads.ContainsKey(file)) return null;

            Directory.CreateDirectory(AppModel.ModelsDir);
            string destination = AppModel.ModelPath(model.File);
            var cts = new CancellationTokenSource();
            _downloads[file] = cts;
            _downloadPercent[file] = 0;

            var progress = new Progress<(long downloaded, long total, double speed, TimeSpan? eta)>(p =>
            {
                int percent = p.total > 0 ? (int)(p.downloaded * 100 / p.total) : 0;
                _downloadPercent[file] = percent;
                Emit("models.progress", new Dictionary<string, object?>
                {
                    ["file"] = file,
                    ["downloaded"] = p.downloaded,
                    ["total"] = p.total,
                    ["percent"] = percent,
                    ["speed"] = Math.Round(p.speed, 1),
                    ["etaSeconds"] = p.eta.HasValue ? (int)p.eta.Value.TotalSeconds : (int?)null,
                });
            });

            try
            {
                await ModelDownloader.DownloadAsync(model, destination, progress, cts.Token);
                Emit("models.done", new Dictionary<string, object?> { ["file"] = file, ["ok"] = true });
                return ModelMap(model);
            }
            catch (OperationCanceledException)
            {
                TryDelete(destination);
                Emit("models.done", new Dictionary<string, object?> { ["file"] = file, ["ok"] = false, ["cancelled"] = true });
                return null;
            }
            catch (Exception ex)
            {
                TryDelete(destination);
                Emit("models.done", new Dictionary<string, object?> { ["file"] = file, ["ok"] = false, ["error"] = ex.Message });
                return null;
            }
            finally
            {
                _downloads.Remove(file);
                _downloadPercent.Remove(file);
            }
        });

        Register("models.cancel", args =>
        {
            if (_downloads.TryGetValue(Str(args, "file"), out CancellationTokenSource? cts)) cts.Cancel();
            return (object?)null;
        });

        Register("models.delete", args =>
        {
            string file = Str(args, "file");
            if (FindModel(file) is null) return null;
            TryDelete(AppModel.ModelPath(file));
            return (object?)new Dictionary<string, object?> { ["installedCount"] = InstalledCount() };
        });
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
