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

    private void RegisterModelHandlers()
    {
        Register("models.list", _ => (object?)new Dictionary<string, object?>
        {
            ["whisper"] = AppModel.WhisperModels.Select(ModelMap).ToList(),
            ["formatter"] = AppModel.FormatterModels.Select(ModelMap).ToList(),
            ["embedding"] = AppModel.EmbeddingModels.Select(ModelMap).ToList(),
            ["installedCount"] = InstalledCount(),
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

            var progress = new Progress<(long downloaded, long total, double speed, TimeSpan? eta)>(p =>
                Emit("models.progress", new Dictionary<string, object?>
                {
                    ["file"] = file,
                    ["downloaded"] = p.downloaded,
                    ["total"] = p.total,
                    ["percent"] = p.total > 0 ? (int)(p.downloaded * 100 / p.total) : 0,
                    ["speed"] = Math.Round(p.speed, 1),
                    ["etaSeconds"] = p.eta.HasValue ? (int)p.eta.Value.TotalSeconds : (int?)null,
                }));

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

    // Names come from the shared catalog, so the desktop picker reads exactly
    // like the mobile one: a tier, not a model number.
    private static Dictionary<string, object?> ModelMap(ModelInfo model) => new()
    {
        ["file"] = model.File,
        ["name"] = AppModel.DisplayName(model),
        ["desc"] = AppModel.DisplayDesc(model),
        ["size"] = model.Size,
        ["installed"] = AppModel.IsValidModelFile(AppModel.ModelPath(model.File)),
    };

    private static void TryDelete(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); } catch { }
    }
}
