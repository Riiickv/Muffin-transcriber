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
    public const string MediaHost = "media.muffin.example";

    private CancellationTokenSource? _historyCts;

    // What is running, so a screen that was not on the page while it started
    // can pick it up. Every screen is its own document here, so anything held
    // only in a page's JS is gone the moment you switch tabs.
    private string _busyId = "";
    private string _busyAction = "";
    private int _busyPercent;

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

        // Saves an edit the user typed into the transcript itself.
        //
        // Whisper mishears names, jargon and numbers, and until now the only way
        // to correct one was to copy the whole thing out into something else.
        // The variant is named explicitly so fixing the raw text cannot quietly
        // overwrite an improved version sitting beside it.
        Register("history.saveText", args =>
        {
            TranscriptionHistoryItem? item = Find(Str(args, "id"));
            if (item is null) return null;

            string variant = Str(args, "variant");
            string text = args.TryGetProperty("text", out JsonElement t) ? (t.GetString() ?? "") : "";

            TranscriptionHistoryItem updated = variant switch
            {
                "formatted" => item with { FormattedTranscript = text },
                "summary" => item with { Summary = text },
                _ => item with { RawTranscript = text },
            };
            TranscriptionHistory.AddOrUpdate(updated);
            return (object?)true;
        });

        // Asked for on load. Without it, coming back to a transcript mid-Improve
        // showed enabled buttons and no progress, and pressing one again just
        // cancelled the job that was already running.
        Register("history.state", _ => (object?)new Dictionary<string, object?>
        {
            ["busy"] = _historyCts is not null,
            ["id"] = _busyId,
            ["action"] = _busyAction,
            ["percent"] = _busyPercent,
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
                var progress = new Progress<int>(pct =>
                {
                    _busyPercent = pct;
                    Emit("history.progress", new Dictionary<string, object?>
                    {
                        ["id"] = item.Id,
                        ["action"] = "retranscribe",
                        ["percent"] = pct,
                    });
                });

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

                if (string.IsNullOrWhiteSpace(summary))
                {
                    // A handful of words has nothing to summarize, which is a
                    // different thing from the model failing.
                    int words = input.Split([' ', '\r', '\n', '\t'], StringSplitOptions.RemoveEmptyEntries).Length;
                    return Fail(words < 15
                        ? AppStrings.History_Status_SummaryTooShort
                        : AppStrings.History_Status_SummaryFailed);
                }

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
        _busyId = id;
        _busyAction = action;
        _busyPercent = 0;
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
            _busyId = "";
            _busyAction = "";
            _busyPercent = 0;
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
        string body = Meaningful(item.FormattedTranscript) is { Length: > 0 } formatted ? formatted : item.RawTranscript;
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

    /// <summary>
    /// Text with nothing in it is not text. A summary of "[ ]" got saved before
    /// empty results were rejected, and it still occupies the Summary tab of
    /// every old transcript; anything without a letter or a digit reads as
    /// absent so those records heal themselves.
    /// </summary>
    private static string Meaningful(string? text) =>
        !string.IsNullOrWhiteSpace(text) && text.Any(char.IsLetterOrDigit) ? text : "";

    private Dictionary<string, object?> DetailMap(TranscriptionHistoryItem item) => new()
    {
        // Whether THIS row is the one being transcribed right now, so the
        // library can show the work instead of an empty transcript that looks
        // like a recording nothing ever happened to.
        ["transcribing"] = item.Id == TranscribingEntryId,
        ["id"] = item.Id,
        ["title"] = item.SourceFileName,
        ["timestamp"] = item.Timestamp.ToString("o"),
        ["language"] = item.Language,
        ["raw"] = item.RawTranscript,
        ["formatted"] = Meaningful(item.FormattedTranscript),
        ["summary"] = Meaningful(item.Summary),
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
