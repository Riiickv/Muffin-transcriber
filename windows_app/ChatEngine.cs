using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace MuffinTranscriber;

public sealed record ChatMessage(string Role, string Content);

// Windows counterpart of the mobile ChatEngine: RAG + app-capability prompt, streamed local LLM reply.
public static class ChatEngine
{
    public static async Task<string> ChatAsync(IReadOnlyList<ChatMessage> messages, string? selectedFormatter, Action<string> onToken)
    {
        if (string.IsNullOrWhiteSpace(AppModel.LlamaExe))
        {
            throw new InvalidOperationException("No local LLM is installed. Download a formatter model from the Models tab.");
        }

        ModelInfo? model = AppModel.FormatterModels.FirstOrDefault(m => m.Name == selectedFormatter)
                           ?? AppModel.FormatterModels.FirstOrDefault(m => AppModel.IsValidModelFile(AppModel.ModelPath(m.File)));
        if (model is null || !AppModel.IsValidModelFile(AppModel.ModelPath(model.File)))
        {
            throw new InvalidOperationException("No usable LLM model was found. Download one from the Models tab.");
        }

        var history = TranscriptionHistory.Load()
            .OrderByDescending(h => h.Timestamp)
            .ToList();

        string lastUserMessage = messages.LastOrDefault(m => m.Role == "user")?.Content ?? "";
        List<TranscriptionHistoryItem> relevant = SearchTranscripts(history, lastUserMessage);

        string systemContent = BuildSystemPrompt(history, relevant);
        string prompt = BuildChatPrompt(model.File, systemContent, messages);

        string promptPath = Path.Combine(Path.GetTempPath(), $"ai_transcriber_chat_{Guid.NewGuid():N}.txt");
        await File.WriteAllTextAsync(promptPath, prompt, Encoding.UTF8);

        try
        {
            string modelPath = AppModel.ModelPath(model.File);
            string args = $"-m \"{modelPath}\" -f \"{promptPath}\" -n 768 --temp 0.3 -ngl 999 -c 4096 --log-disable --no-display-prompt -st";
            return await RunStreamingAsync(AppModel.LlamaExe, args, onToken);
        }
        finally
        {
            try { if (File.Exists(promptPath)) File.Delete(promptPath); } catch { }
        }
    }

    // Keyword scoring; always keeps the newest transcript as a fallback. (Embeddings can slot in later.)
    private static List<TranscriptionHistoryItem> SearchTranscripts(List<TranscriptionHistoryItem> history, string query)
    {
        if (history.Count == 0) return [];

        string[] stop = ["and", "the", "what", "see", "this", "that", "with", "from", "about", "where", "how", "can", "you"];
        var words = query.ToLowerInvariant()
            .Split([' ', ',', '.', '?', '!', '\n', '\t'], StringSplitOptions.RemoveEmptyEntries)
            .Where(w => w.Length > 2 && !stop.Contains(w))
            .Distinct()
            .ToList();

        var scored = history.Select(item =>
        {
            string text = string.Join(" ", new[] { item.SourceFileName, item.RawTranscript, item.FormattedTranscript, item.Summary }
                .Where(s => !string.IsNullOrEmpty(s))).ToLowerInvariant();
            int score = 0;
            foreach (string w in words)
            {
                if (item.SourceFileName.ToLowerInvariant().Contains(w)) score += 5;
                int idx = text.IndexOf(w, StringComparison.Ordinal);
                while (idx != -1) { score++; idx = text.IndexOf(w, idx + 1, StringComparison.Ordinal); }
            }
            return (item, score);
        }).ToList();

        var results = scored.Where(s => s.score > 0).OrderByDescending(s => s.score).Take(3).Select(s => s.item).ToList();
        if (results.Count == 0) results.Add(history[0]);
        else if (!results.Any(r => r.Id == history[0].Id)) { results.Insert(0, history[0]); if (results.Count > 3) results.RemoveAt(results.Count - 1); }
        return results;
    }

    private static string BuildSystemPrompt(List<TranscriptionHistoryItem> history, List<TranscriptionHistoryItem> relevant)
    {
        string Truncate(string? s, int limit) => string.IsNullOrEmpty(s) ? "None" : (s.Length > limit ? s[..limit] + "... (truncated)" : s);

        string contextText = relevant.Count == 0
            ? "No relevant transcripts found."
            : string.Join("\n", relevant.Select(item => $@"<transcript>
  <name>{Path.GetFileNameWithoutExtension(item.SourceFileName)}</name>
  <id>{item.Id}</id>
  <created_at>{item.Timestamp:g}</created_at>
  <variant_summary>{Truncate(item.Summary, 1000)}</variant_summary>
  <variant_formatted>{Truncate(item.FormattedTranscript, 2000)}</variant_formatted>
  <variant_raw>{Truncate(item.RawTranscript, 2000)}</variant_raw>
</transcript>"));

        string historyIndex = string.Join("\n", history.Select(h =>
            $"- ID: {h.Id} | Name: {Path.GetFileNameWithoutExtension(h.SourceFileName)} | Date: {h.Timestamp:g}"));

        string memory = "";
        var settings = UserSettings.Load();
        if (settings.EnableContextLearning && File.Exists(AppModel.UserMemoryFile))
        {
            string m = File.ReadAllText(AppModel.UserMemoryFile).Trim();
            if (!string.IsNullOrWhiteSpace(m)) memory = $"\n<memory>\nThings you've learned about the user:\n{m}\n</memory>";
        }

        return $@"You are Muffin Chat, the built-in assistant for the Muffin transcription app. You help the user with their transcripts and you can operate the app for them — change settings, jump to a screen, or delete a transcript.

You can see the user's transcripts (<context> and <history_index>) and every app setting with its current value and location (<app_settings>). Use them to answer accurately, including ""where is setting X?"" and ""what is X set to right now?"".

Each transcript in <context> has three variants: <variant_raw> (exact words), <variant_formatted> (cleaned up), <variant_summary> (short summary).

CRITICAL RULES:
1. Be concise, friendly and direct.
2. Refer to a transcript by its exact <name> so the UI can link it.
3. Never make things up. If you don't know, say so.
4. Use the exact transcript ID from <history_index> when deleting.

{AppCapabilities.BuildCapabilitiesBlock()}

{AppCapabilities.ToolInstructions}

<global_state>
Current date and time: {DateTime.Now:g}
Total transcripts saved: {history.Count}

<history_index>
Every transcript you have, newest first:
{historyIndex}
</history_index>
</global_state>

<context>
{contextText}
</context>{memory}";
    }

    private static string BuildChatPrompt(string modelFile, string systemContent, IReadOnlyList<ChatMessage> messages)
    {
        string lower = modelFile.ToLowerInvariant();
        var sb = new StringBuilder();

        if (lower.Contains("llama-3"))
        {
            sb.Append($"<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n{systemContent}<|eot_id|>");
            foreach (var m in messages) sb.Append($"<|start_header_id|>{m.Role}<|end_header_id|>\n\n{m.Content}<|eot_id|>");
            sb.Append("<|start_header_id|>assistant<|end_header_id|>\n\n");
        }
        else if (lower.Contains("phi-3"))
        {
            sb.Append($"<|system|>\n{systemContent}<|end|>\n");
            foreach (var m in messages) sb.Append($"<|{m.Role}|>\n{m.Content}<|end|>\n");
            sb.Append("<|assistant|>\n");
        }
        else
        {
            sb.Append($"<|im_start|>system\n{systemContent}<|im_end|>\n");
            foreach (var m in messages) sb.Append($"<|im_start|>{m.Role}\n{m.Content}<|im_end|>\n");
            sb.Append("<|im_start|>assistant\n");
        }

        return sb.ToString();
    }

    private static async Task<string> RunStreamingAsync(string fileName, string arguments, Action<string> onToken)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };

        using Process process = Process.Start(startInfo) ?? throw new InvalidOperationException("Could not start the LLM process.");
        Task<string> stderrTask = process.StandardError.ReadToEndAsync();

        var sb = new StringBuilder();
        var buffer = new char[256];
        int read;
        while ((read = await process.StandardOutput.ReadAsync(buffer, 0, buffer.Length)) > 0)
        {
            string chunk = new string(buffer, 0, read);
            sb.Append(chunk);
            onToken(chunk);
        }

        await process.WaitForExitAsync();
        await stderrTask;

        // Trim llama-cli's end-of-text markers if they leak through.
        string output = sb.ToString();
        foreach (string marker in new[] { "<|im_end|>", "<|eot_id|>", "<|end|>", "<|endoftext|>", "[end of text]" })
        {
            int idx = output.IndexOf(marker, StringComparison.Ordinal);
            if (idx >= 0) output = output[..idx];
        }
        return output.Trim();
    }
}
