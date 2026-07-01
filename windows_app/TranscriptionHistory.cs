using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;

namespace AITranscriber_WinUI;

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
    string? SrtTranscript = null
)
{
    public string TimestampString => Timestamp.ToString("g");
}

public static class TranscriptionHistory
{
    private static readonly string HistoryFile = Path.Combine(AppModel.AppDataDir, "history.json");
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public static List<TranscriptionHistoryItem> Load()
    {
        try
        {
            if (File.Exists(HistoryFile))
            {
                string json = File.ReadAllText(HistoryFile);
                return JsonSerializer.Deserialize<List<TranscriptionHistoryItem>>(json, JsonOptions) ?? new();
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
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Failed to save history: {ex.Message}");
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
            items.Insert(0, newItem); // Add to the top
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
