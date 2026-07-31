using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using System.Linq;
using System.Text.Json;

namespace MuffinTranscriber;

public sealed record TranscriptionHistoryItem(
    string Id,
    DateTime Timestamp,
    string SourceFileName,
    string Language,
    string RawTranscript,
    string? FormattedTranscript,
    string? Summary = null,
    string? SourceFilePath = null,
    string? FileHash = null,
    string? SrtTranscript = null,
    double[]? Embedding = null,
    // What produced this, and how long it took. Appended with defaults on
    // purpose: this is a positional record serialized straight to history.json,
    // so every transcript recorded before today deserializes with nulls and the
    // UI simply has nothing to show for it, rather than the file failing to
    // parse and a library disappearing.
    string? WhisperModel = null,
    long? TranscribeMs = null,
    string? FormatterModel = null,
    long? ImproveMs = null,
    long? SummarizeMs = null,
    /// <summary>
    /// Dates, times and places the model found, with the exact words they came
    /// from, so the page can highlight them where they were said. The mobile
    /// app has had this since its history screen existed; on the desktop
    /// ExtractActionableEntitiesAsync was written and then called from nowhere.
    /// </summary>
    List<ActionableEntity>? ExtractedDates = null
)
{
    public string TimestampString => Timestamp.ToString("g");
}

public static class TranscriptionHistory
{
    /// <summary>
    /// Replace a transcript's name with a short one the model writes.
    ///
    /// Lives here rather than on the bridge because BOTH windows need it: the
    /// main app renamed everything it transcribed, and the share window renamed
    /// nothing - so a file arriving from Explorer stayed
    /// "WhatsApp Ptt 2026-07-28 at 2.14.00 PM.ogg" for ever while the same file
    /// dropped into the app became three words.
    ///
    /// Never overwrites a name that changed while the model was thinking: if
    /// the row was renamed by hand in the meantime, that wins.
    /// </summary>
    public static async Task RenameFromTextAsync(TranscriptionHistoryItem item, string text, string? formatterModel)
    {
        try
        {
            string? title = await LLMFormatter.GenerateTitleAsync(text, formatterModel);
            if (string.IsNullOrWhiteSpace(title)) return;

            TranscriptionHistoryItem? current = Load().FirstOrDefault(h => h.Id == item.Id);
            if (current is null || current.SourceFileName != item.SourceFileName) return;

            AddOrUpdate(current with { SourceFileName = title });
        }
        catch (Exception ex)
        {
            // A transcript keeps its old name; nothing the user asked for failed.
            CrashLog.Write("Naming a transcript", ex);
        }
    }

    private static readonly string HistoryFile = Path.Combine(AppModel.AppDataDir, "history.json");
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    // Serializes file access so a read can't observe history.json mid-swap.
    // Without this, a Load() racing the File.Replace in Save() could throw,
    // fall through to an empty list, and a subsequent save would wipe history.
    private static readonly object _fileLock = new();

    public static List<TranscriptionHistoryItem> Load()
    {
        try
        {
            lock (_fileLock)
            {
                if (File.Exists(HistoryFile))
                {
                    string json = File.ReadAllText(HistoryFile);
                    return JsonSerializer.Deserialize<List<TranscriptionHistoryItem>>(json, JsonOptions) ?? new();
                }
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Failed to load history: {ex.Message}");
        }

        return new List<TranscriptionHistoryItem>();
    }

    public static void Save(List<TranscriptionHistoryItem> items)
    {
        // Atomic write: serialize to a sibling temp file then swap it in, so a crash
        // mid-write can't leave history.json half-written and unparseable.
        try
        {
            string json = JsonSerializer.Serialize(items, JsonOptions);
            lock (_fileLock)
            {
                string tmp = HistoryFile + ".tmp";
                File.WriteAllText(tmp, json);
                if (File.Exists(HistoryFile))
                {
                    File.Replace(tmp, HistoryFile, null);
                }
                else
                {
                    File.Move(tmp, HistoryFile);
                }
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Failed to save history: {ex.Message}");
        }
    }

    /// <summary>
    /// Clears SourceFilePath on any history item whose cached media file no longer
    /// exists (e.g. after the media cache was auto-deleted or cleared manually),
    /// so the UI never points re-transcription at a missing file.
    /// </summary>
    public static void PurgeMissingSourceFiles()
    {
        var items = Load();
        bool changed = false;
        for (int i = 0; i < items.Count; i++)
        {
            var item = items[i];
            if (!string.IsNullOrEmpty(item.SourceFilePath) && !File.Exists(item.SourceFilePath))
            {
                items[i] = item with { SourceFilePath = null };
                changed = true;
            }
        }

        if (changed)
        {
            Save(items);
        }
    }

    public static void AddOrUpdate(TranscriptionHistoryItem newItem)
    {
        var items = Load();
        int index = items.FindIndex(i => i.Id == newItem.Id);
        if (index >= 0)
        {
            items[index] = newItem;
        }
        else
        {
            items.Insert(0, newItem);
        }
        Save(items);
    }

    public static void Delete(string id)
    {
        var items = Load();
        int index = items.FindIndex(i => i.Id == id);
        if (index >= 0)
        {
            items.RemoveAt(index);
            Save(items);
        }
    }

    public static async System.Threading.Tasks.Task RunMigrationAsync()
    {
        var items = Load();
        bool changed = false;
        var uniqueHashes = new HashSet<string>();
        var itemsToRemove = new List<TranscriptionHistoryItem>();

        for (int i = 0; i < items.Count; i++)
        {
            var item = items[i];
            string? hash = item.FileHash;
            
            if (string.IsNullOrEmpty(hash) && !string.IsNullOrEmpty(item.SourceFilePath) && File.Exists(item.SourceFilePath))
            {
                hash = await AppModel.ComputeFileHashAsync(item.SourceFilePath);
                if (!string.IsNullOrEmpty(hash))
                {
                    item = item with { FileHash = hash };
                    items[i] = item;
                    changed = true;
                }
            }

            if (!string.IsNullOrEmpty(hash))
            {
                if (uniqueHashes.Contains(hash))
                {
                    itemsToRemove.Add(item);
                    changed = true;
                }
                else
                {
                    uniqueHashes.Add(hash);
                }
            }
        }

        foreach (var item in itemsToRemove)
        {
            items.Remove(item);
            if (!string.IsNullOrEmpty(item.SourceFilePath) && File.Exists(item.SourceFilePath))
            {
                try { File.Delete(item.SourceFilePath); } catch { }
            }
        }

        if (changed)
        {
            Save(items);
        }
    }
}
