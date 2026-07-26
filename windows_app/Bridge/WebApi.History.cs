using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace MuffinTranscriber.Web;

/// <summary>
/// The library: the saved transcripts, and the three things you can do to one
/// (transcribe it again, format it, summarize it), which are the same three
/// actions the mobile detail screen offers.
/// </summary>
public sealed partial class WebBridge
{
    public const string MediaHost = "media.muffin.app";

    private CancellationTokenSource? _historyCts;

    private void RegisterHistoryHandlers()
    {
        Register("history.list", _ => (object?)TranscriptionHistory.Load().Select(SummaryMap).ToList());

        Register("history.get", args =>
        {
            TranscriptionHistoryItem? item = Find(Str(args, "id"));
            return item is null ? null : (object?)DetailMap(item);
        });

        Register("history.delete", args =>
        {
            string id = Str(args, "id");
            TranscriptionHistoryItem? item = Find(id);
            if (item is not null && !string.IsNullOrEmpty(item.SourceFilePath))
            {
                TryDelete(item.SourceFilePath);
            }
            TranscriptionHistory.Delete(id);
            return (object?)TranscriptionHistory.Load().Select(SummaryMap).ToList();
        });

        Register("history.rename", args =>
        {
            TranscriptionHistoryItem? item = Find(Str(args, "id"));
            string title = Str(args, "title").Trim();
            if (item is null || title.Length == 0) return null;
            TranscriptionHistory.AddOrUpdate(item with { SourceFileName = title });
            return (object?)TranscriptionHistory.Load().Select(SummaryMap).ToList();
        });

        Register("history.cancel", _ =>
        {
            _historyCts?.Cancel();
            return (object?)null;
        });

        // ---- the three detail actions --------------------------------------

        Register("history.retranscribe", async args =>
        {
            TranscriptionHistoryItem? item = Find(Str(args, "id"));
            if (item is null) return null;

            if (string.IsNullOrEmpty(item.SourceFilePath) || !File.Exists(item.SourceFilePath))
            {
                return Fail(AppStrings.History_Status_SourceMissing);
            }

            ModelInfo? model = SelectedWhisperModel();
            if (model is null) return Fail(AppStrings.Common_NoModelInstalled);

            return await RunAction(item.Id, "retranscribe", async ct =>
            {
                string language = Str(args, "language", item.Language);
                var progress = new Progress<int>(pct => Emit("history.progress", new Dictionary<string, object?>
                {
                    ["id"] = item.Id,
                    ["action"] = "retranscribe",
                    ["percent"] = pct,
                }));

                TranscriptionResult tr = await TranscriptionService.TranscribeAsync(
                    item.SourceFilePath, model, language, _settings.NormalizeAudio, progress, ct);

                if (string.IsNullOrWhiteSpace(tr.RawTranscript))
                {
                    return Fail(string.Format(AppStrings.Home_Status_NoSpeechDetected, item.SourceFileName));
                }

                var updated = item with { RawTranscript = tr.RawTranscript, SrtTranscript = tr.Srt, Language = language };
                TranscriptionHistory.AddOrUpdate(updated);
                return DetailMap(updated);
            });
        });

        Register("history.format", async args =>
        {
            TranscriptionHistoryItem? item = Find(Str(args, "id"));
            if (item is null) return null;

            return await RunAction(item.Id, "format", async ct =>
            {
                string? formatted = await LLMFormatter.FormatTranscriptAsync(
                    item.RawTranscript,
                    FormatterKey(),
                    Str(args, "language", _settings.FormatLanguage),
                    Str(args, "prompt", _settings.CustomFormatSystemPrompt),
                    ct,
                    partial => Emit("history.partial", new Dictionary<string, object?>
                    {
                        ["id"] = item.Id,
                        ["tab"] = "formatted",
                        ["text"] = partial,
                    }));

                if (string.IsNullOrWhiteSpace(formatted)) return Fail(AppStrings.History_Status_FormatFailed);

                var updated = item with { FormattedTranscript = formatted };
                TranscriptionHistory.AddOrUpdate(updated);
                return DetailMap(updated);
            });
        });

        Register("history.summarize", async args =>
        {
            TranscriptionHistoryItem? item = Find(Str(args, "id"));
            if (item is null) return null;

            return await RunAction(item.Id, "summarize", async ct =>
            {
                string input = !string.IsNullOrWhiteSpace(item.FormattedTranscript)
                    ? item.FormattedTranscript!
                    : item.RawTranscript;

                string? summary = await LLMFormatter.SummarizeTranscriptAsync(
                    input,
                    FormatterKey(),
                    Str(args, "language", _settings.FormatLanguage),
                    Str(args, "prompt", _settings.CustomSummarySystemPrompt),
                    ct);

                if (string.IsNullOrWhiteSpace(summary)) return Fail(AppStrings.History_Status_SummaryFailed);

                var updated = item with { Summary = summary };
                TranscriptionHistory.AddOrUpdate(updated);
                return DetailMap(updated);
            });
        });
    }

    private async Task<object?> RunAction(string id, string action, Func<CancellationToken, Task<object?>> body)
    {
        _historyCts?.Cancel();
        _historyCts = new CancellationTokenSource();
        Emit("history.busy", new Dictionary<string, object?> { ["id"] = id, ["action"] = action, ["busy"] = true });

        try
        {
            return await body(_historyCts.Token);
        }
        catch (OperationCanceledException)
        {
            return Fail(AppStrings.Home_Status_Cancelled);
        }
        catch (Exception ex)
        {
            CrashLog.Write($"history.{action}", ex);
            return Fail(EngineHealth.FriendlyMessage(ex) ?? ex.Message);
        }
        finally
        {
            _historyCts?.Dispose();
            _historyCts = null;
            Emit("history.busy", new Dictionary<string, object?> { ["id"] = id, ["action"] = action, ["busy"] = false });
        }
    }

    private static Dictionary<string, object?> Fail(string message) => new()
    {
        ["error"] = message,
    };

    private static TranscriptionHistoryItem? Find(string id) =>
        TranscriptionHistory.Load().FirstOrDefault(i => i.Id == id);

    private static Dictionary<string, object?> SummaryMap(TranscriptionHistoryItem item)
    {
        string body = !string.IsNullOrWhiteSpace(item.FormattedTranscript) ? item.FormattedTranscript! : item.RawTranscript;
        return new Dictionary<string, object?>
        {
            ["id"] = item.Id,
            ["title"] = item.SourceFileName,
            ["timestamp"] = item.Timestamp.ToString("o"),
            ["language"] = item.Language,
            ["snippet"] = body.Length > 220 ? body[..220] : body,
            ["hasAudio"] = !string.IsNullOrEmpty(item.SourceFilePath) && File.Exists(item.SourceFilePath),
        };
    }

    private static Dictionary<string, object?> DetailMap(TranscriptionHistoryItem item) => new()
    {
        ["id"] = item.Id,
        ["title"] = item.SourceFileName,
        ["timestamp"] = item.Timestamp.ToString("o"),
        ["language"] = item.Language,
        ["raw"] = item.RawTranscript,
        ["formatted"] = item.FormattedTranscript ?? "",
        ["summary"] = item.Summary ?? "",
        ["srt"] = item.SrtTranscript ?? "",
        ["audioUrl"] = MediaUrl(item.SourceFilePath),
    };

    // The cached media folder is mapped to its own virtual host so <audio> can
    // play a file straight from disk without copying it anywhere.
    private static string? MediaUrl(string? path)
    {
        if (string.IsNullOrEmpty(path) || !File.Exists(path)) return null;

        string cacheRoot = Path.Combine(AppModel.AppDataDir, "Cache");
        if (!path.StartsWith(cacheRoot, StringComparison.OrdinalIgnoreCase)) return null;

        string relative = path[(cacheRoot.Length + 1)..].Replace('\\', '/');
        return $"https://{MediaHost}/{Uri.EscapeDataString(relative).Replace("%2F", "/")}";
    }
}
