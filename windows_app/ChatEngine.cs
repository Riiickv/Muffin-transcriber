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
            throw new InvalidOperationException("The local LLM engine is missing. Try reinstalling the app.");
        }

        ModelInfo? model = AppModel.Resolve(AppModel.FormatterModels, selectedFormatter)
                           ?? AppModel.FormatterModels.FirstOrDefault(m => AppModel.IsValidModelFile(AppModel.ModelPath(m.File)));
        if (model is null || !AppModel.IsValidModelFile(AppModel.ModelPath(model.File)))
        {
            throw new InvalidOperationException("No usable LLM model was found. Download one from the Models tab.");
        }

        var history = TranscriptionHistory.Load()
            .OrderByDescending(h => h.Timestamp)
            .ToList();

        string lastUserMessage = messages.LastOrDefault(m => m.Role == "user")?.Content ?? "";
        List<TranscriptionHistoryItem> relevant = await SearchTranscriptsAsync(history, lastUserMessage);

        string systemContent = BuildSystemPrompt(history, relevant);
        string prompt = BuildChatPrompt(model.File, systemContent, messages);

        string promptPath = Path.Combine(Path.GetTempPath(), $"ai_transcriber_chat_{Guid.NewGuid():N}.txt");
        await File.WriteAllTextAsync(promptPath, prompt, Encoding.UTF8);

        try
        {
            string modelPath = AppModel.ModelPath(model.File);
            // llama-cli, NOT llama-completion, and no --no-display-prompt.
            //
            // llama-completion writes nothing at all when its stdout is a
            // redirected pipe under a windowless parent, which a GUI app always
            // is: it exits 0 with empty stdout and empty stderr, so the chat
            // silently never answered. llama-cli streams fine through the very
            // same redirection, which is why formatting always worked.
            //
            // The cost is that llama-cli prints a banner, a command list and the
            // prompt back; the reply begins after the prompt's last turn marker,
            // and everything before it is skipped below.
            string marker = AssistantMarker(model.File);

            // Low temperature on purpose. This assistant's job is mostly to
            // follow instructions and emit the right tool call; at 0.3 a small
            // model would sometimes narrate ("I'll switch to Light mode") and
            // emit nothing, leaving the app unchanged.
            string Args(int layers) =>
                $"-m \"{modelPath}\" -f \"{promptPath}\" -n 768 --temp 0.1 -ngl {layers} -c 4096 --log-disable --no-display-prompt -st";

            // The GPU is shared with whatever else the user is running. When it
            // is full the engine does not fall back, it refuses to load at all,
            // so the answer never comes. Ask for the GPU, and if it will not
            // load, run on the CPU: slower beats silent.
            (string reply, bool loaded) = await RunStreamingAsync(AppModel.LlamaExe, Args(33), onToken, marker);
            if (loaded) return reply;

            CrashLog.Note("Chat: the GPU would not take the model, retrying on the CPU.");
            (reply, loaded) = await RunStreamingAsync(AppModel.LlamaExe, Args(0), onToken, marker);
            if (loaded) return reply;

            throw new InvalidOperationException(
                "The chat model could not be loaded. It may be too large for this PC, or another program is using the graphics card.");
        }
        finally
        {
            try { if (File.Exists(promptPath)) File.Delete(promptPath); } catch { }
        }
    }

    // Semantic search when the embedding model is installed, else keyword.
    private static async Task<List<TranscriptionHistoryItem>> SearchTranscriptsAsync(List<TranscriptionHistoryItem> history, string query)
    {
        if (history.Count == 0) return [];

        double[]? queryEmbedding = await EmbeddingService.EmbedAsync(query);
        if (queryEmbedding is not null)
        {
            var semantic = await SemanticSearch(history, queryEmbedding);
            if (semantic.Count > 0) return semantic;
        }

        return KeywordSearch(history, query);
    }

    private static async Task<List<TranscriptionHistoryItem>> SemanticSearch(List<TranscriptionHistoryItem> history, double[] queryEmbedding)
    {
        // Embed any transcript missing a vector, and persist it so it's a one-time cost.
        var stored = TranscriptionHistory.Load();
        bool changed = false;
        for (int i = 0; i < history.Count; i++)
        {
            TranscriptionHistoryItem item = history[i];
            if (item.Embedding is { Length: > 0 }) continue;

            string text = FirstNonEmpty(item.Summary, item.FormattedTranscript, item.RawTranscript);
            if (text.Length > 1200) text = text[..1200];
            double[]? emb = await EmbeddingService.EmbedAsync(text);
            if (emb is null) continue;

            history[i] = item with { Embedding = emb };
            int idx = stored.FindIndex(h => h.Id == item.Id);
            if (idx >= 0) { stored[idx] = stored[idx] with { Embedding = emb }; changed = true; }
        }
        if (changed) TranscriptionHistory.Save(stored);

        return history
            .Where(h => h.Embedding is { Length: > 0 })
            .Select(h => (item: h, score: EmbeddingService.CosineSimilarity(queryEmbedding, h.Embedding!)))
            .Where(s => s.score > 0.2)
            .OrderByDescending(s => s.score)
            .Take(3)
            .Select(s => s.item)
            .ToList();
    }

    private static string FirstNonEmpty(params string?[] candidates) =>
        candidates.FirstOrDefault(c => !string.IsNullOrWhiteSpace(c)) ?? "";

    // Keyword scoring; always keeps the newest transcript as a fallback.
    private static List<TranscriptionHistoryItem> KeywordSearch(List<TranscriptionHistoryItem> history, string query)
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

    /// <summary>
    /// Where the reply starts in the echoed output: the last turn marker of the
    /// prompt. Matched without its trailing newline, because the echo collapses
    /// the prompt's line breaks into spaces.
    /// </summary>
    private static string AssistantMarker(string modelFile)
    {
        string lower = modelFile.ToLowerInvariant();
        if (lower.Contains("llama-3")) return "<|start_header_id|>assistant<|end_header_id|>";
        if (lower.Contains("phi-3")) return "<|assistant|>";
        return "<|im_start|>assistant";
    }

    /// <summary>Returns the reply and whether the model actually loaded.</summary>
    private static async Task<(string Reply, bool Loaded)> RunStreamingAsync(string fileName, string arguments, Action<string> onToken, string replyStartsAfter)
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
        bool ended = false;
        bool trimmedStart = false;

        // The prompt is echoed before the reply, so nothing is shown until the
        // marker that ends it has gone past. Held in a buffer rather than
        // streamed, or the user would watch their own prompt being typed back.
        var echo = new StringBuilder();
        bool replyStarted = string.IsNullOrEmpty(replyStartsAfter);

        while (!ended && (read = await process.StandardOutput.ReadAsync(buffer, 0, buffer.Length)) > 0)
        {
            string chunk = StripAnsi(new string(buffer, 0, read));

            if (!replyStarted)
            {
                echo.Append(chunk);
                int start = ReplyStart(echo.ToString(), replyStartsAfter);
                if (start < 0) continue;

                replyStarted = true;
                chunk = echo.ToString()[start..];
                echo.Clear();
            }

            int endIdx = IndexOfEnd(chunk);
            if (endIdx >= 0)
            {
                chunk = chunk[..endIdx];
                ended = true;
            }

            // llama-completion emits a leading space before the reply.
            if (!trimmedStart)
            {
                chunk = chunk.TrimStart('\r', '\n', ' ');
                if (chunk.Length > 0) trimmedStart = true;
            }

            if (chunk.Length > 0)
            {
                sb.Append(chunk);
                onToken(chunk);
            }
        }

        try { _ = process.StandardOutput.ReadToEnd(); } catch { } // drain so the process exits
        await process.WaitForExitAsync();
        string stderrText = await stderrTask;

        // The engine spoke but no boundary was recognised. Showing nothing at
        // all is the worst possible answer, and is exactly how this failure hid
        // for so long, so fall back to what came through.
        if (!replyStarted && echo.Length > 0)
        {
            string leftover = echo.ToString();

            // Now that nothing more is coming, the weaker boundaries are safe:
            // whatever follows the LAST of them is the reply.
            int start = -1;
            foreach (string boundary in new[] { "> ", "globbing pattern" })
            {
                int idx = leftover.LastIndexOf(boundary, StringComparison.Ordinal);
                if (idx >= 0 && idx + boundary.Length > start) start = idx + boundary.Length;
            }
            if (start >= 0) leftover = leftover[start..];

            int stop = IndexOfEnd(leftover);
            if (stop >= 0) leftover = leftover[..stop];

            sb.Append(leftover.Trim());
        }

        // The engine prints this and exits non-zero when it cannot fit the
        // model; the caller retries on the CPU rather than surfacing it.
        bool loadFailed = process.ExitCode != 0
            || sb.ToString().Contains("Failed to load the model", StringComparison.OrdinalIgnoreCase);

        string output = sb.ToString();

        // Last line of defence. If a turn marker is still in there, the echoed
        // prompt leaked through and the real reply is whatever follows the last
        // one; showing the user their own system prompt is never right.
        foreach (string opener in new[] { "<|end_header_id|>", "<|assistant|>", "<|im_start|>assistant" })
        {
            int idx = output.LastIndexOf(opener, StringComparison.Ordinal);
            if (idx >= 0) output = output[(idx + opener.Length)..];
        }

        foreach (string marker in new[] { "<|im_end|>", "<|eot_id|>", "<|end|>", "<|endoftext|>", "[end of text]" })
        {
            int idx = output.IndexOf(marker, StringComparison.Ordinal);
            if (idx >= 0) output = output[..idx];
        }
        return (output.Trim(), !loadFailed);
    }

    /// <summary>
    /// Where the reply begins in llama-cli's output, or -1 if not there yet.
    ///
    /// It prints a banner and a command list first, then a "> " turn indicator,
    /// and echoes the prompt when it is not suppressed. Both boundaries are
    /// accepted because either can be the last thing before the reply.
    /// </summary>
    private static int ReplyStart(string sofar, string assistantMarker)
    {
        // ONLY the strong boundaries, and only the last of them.
        //
        // The banner prints a "> " turn indicator BEFORE the echoed prompt, so
        // treating that as the start meant the whole system prompt streamed out
        // as the answer. It is still useful once the output is complete, but it
        // must never win the race against boundaries that come later.
        //
        // "(truncated)" is the one that matters for a real prompt: a long one is
        // not echoed in full, it is cut short and ends with that word, taking
        // the closing turn marker with it.
        int best = -1;

        void Consider(string needle)
        {
            if (string.IsNullOrEmpty(needle)) return;
            int idx = sofar.LastIndexOf(needle, StringComparison.Ordinal);
            if (idx >= 0 && idx + needle.Length > best) best = idx + needle.Length;
        }

        Consider(assistantMarker);
        Consider("(truncated)");

        return best;
    }

    // Where the reply stops: the end-of-text token, or llama-cli's own trailing
    // timing line and goodbye.
    private static int IndexOfEnd(string chunk)
    {
        int best = -1;
        foreach (string marker in new[] { "[end of text]", "[ Prompt:", "Exiting..." })
        {
            int idx = chunk.IndexOf(marker, StringComparison.Ordinal);
            if (idx >= 0 && (best < 0 || idx < best)) best = idx;
        }
        return best;
    }

    // Removes ANSI colour escape sequences (ESC[...m) that the engine emits.
    private static string StripAnsi(string s)
    {
        if (s.IndexOf('\x1b') < 0) return s;
        var sb = new StringBuilder(s.Length);
        for (int i = 0; i < s.Length; i++)
        {
            if (s[i] == '\x1b' && i + 1 < s.Length && s[i + 1] == '[')
            {
                i += 2;
                while (i < s.Length && !char.IsLetter(s[i])) i++;
            }
            else
            {
                sb.Append(s[i]);
            }
        }
        return sb.ToString();
    }
}
