using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace MuffinTranscriber;

public static class LLMFormatter
{
    public static async Task<string?> FormatTranscriptAsync(string transcript, string? selectedFormatter, string formatLanguage = "Auto-Detect / Original", string? customPromptOverride = null, System.Threading.CancellationToken ct = default, Action<string>? onPartial = null)
    {
        if (string.IsNullOrWhiteSpace(AppModel.LlamaExe))
        {
            return null;
        }

        ModelInfo? model = AppModel.Resolve(AppModel.FormatterModels, selectedFormatter);
        if (model is null)
        {
            return null;
        }

        string modelPath = AppModel.ModelPath(model.File);
        if (!AppModel.IsValidModelFile(modelPath))
        {
            return null;
        }

        string languageInstruction = formatLanguage == "Auto-Detect / Original"
            ? "in the original language of the text"
            : $"strictly in {formatLanguage} (DO NOT translate to English)";

        var settings = UserSettings.Load();
        string customFormat = !string.IsNullOrWhiteSpace(customPromptOverride) ? customPromptOverride : settings.CustomFormatSystemPrompt;
        string taskInstruction = string.IsNullOrWhiteSpace(customFormat)
            ? "Add only punctuation, capitalization, and paragraph breaks to the transcript. Do not translate, summarize, add facts, remove details, or continue beyond the transcript."
            : customFormat;

        string systemPrompt = $"You are a specialized text processing assistant. Your task is to process the following transcript according to these instructions:\n\n{taskInstruction}\n\nCRITICAL RULES:\n1. You must reply {languageInstruction}.\n2. Reply ONLY with the final output. Start exactly with '[START_FORMAT]' and do not add any conversational text, pleasantries, or formatting tags at the end.";

        systemPrompt += GetContextPrompt();
        string userPrompt = $"Clean this transcript {languageInstruction}:\n\n{transcript}";
        string promptPath = Path.Combine(Path.GetTempPath(), "ai_transcriber_prompt_winui.txt");
        await File.WriteAllTextAsync(promptPath, BuildChatPrompt(model.File, systemPrompt, userPrompt), Encoding.UTF8);

        try
        {
            int maxTokens = Math.Max(512, Math.Min(2048, transcript.Length / 3 + 256));
            string args = $"-m \"{modelPath}\" -f \"{promptPath}\" -n {maxTokens} --temp 0.0 -ngl 33 -c 4096 --log-disable --no-display-prompt -st";

            string output;
            if (onPartial is null)
            {
                ProcessResult result = await RunProcessAsync(AppModel.LlamaExe, args, TimeSpan.FromMinutes(15), [0, 130], ct);
                output = result.Output;
            }
            else
            {
                // Stream: re-extract the clean visible text from everything seen
                // so far on each chunk, so the caller can show it typing out
                // live. ExtractFormatterOutput handles the [START_FORMAT] marker
                // and end tokens, so partial junk before the marker stays hidden.
                output = await RunStreamingProcessAsync(AppModel.LlamaExe, args, TimeSpan.FromMinutes(15), [0, 130], ct,
                    accumulated => onPartial(ExtractFormatterOutput(accumulated)));
            }

            string formatted = ExtractFormatterOutput(output);
            return LooksUnstableFormatOutput(formatted, transcript) ? null : formatted;
        }
        finally
        {
            if (File.Exists(promptPath))
            {
                File.Delete(promptPath);
            }
        }
    }

    public static async Task<string?> SummarizeTranscriptAsync(string transcript, string? selectedFormatter, string formatLanguage = "Auto-Detect / Original", string? customPromptOverride = null, System.Threading.CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(AppModel.LlamaExe))
        {
            return null;
        }

        // Too short is not a summary. Returning that sentence stored it AS the
        // summary; the caller reports it instead.
        int wordCount = transcript.Split(new char[] { ' ', '\r', '\n', '\t' }, StringSplitOptions.RemoveEmptyEntries).Length;
        if (wordCount < 15) return null;

        ModelInfo? model = AppModel.Resolve(AppModel.FormatterModels, selectedFormatter);
        if (model is null)
        {
            return null;
        }

        string modelPath = AppModel.ModelPath(model.File);
        if (!AppModel.IsValidModelFile(modelPath))
        {
            return null;
        }

        string languageInstruction = formatLanguage == "Auto-Detect / Original"
            ? "in the original language of the text"
            : $"strictly in {formatLanguage}";

        var settings = UserSettings.Load();
        string customSummary = !string.IsNullOrWhiteSpace(customPromptOverride) ? customPromptOverride : settings.CustomSummarySystemPrompt;
        string taskInstruction = string.IsNullOrWhiteSpace(customSummary)
            ? "Extract the main ideas, key bullet points, and actionable items from the transcript. Use clear markdown bullet points."
            : customSummary;

        string systemPrompt = $"You are a highly capable summarization assistant. Your task is to process the following transcript according to these instructions:\n\n{taskInstruction}\n\nCRITICAL RULES:\n1. You must reply {languageInstruction}.\n2. Reply ONLY with the final output. Start exactly with '[START_FORMAT]' and do not add any conversational text, pleasantries, or formatting tags at the end.";

        systemPrompt += GetContextPrompt();
        string userPrompt = $"Summarize this transcript {languageInstruction}:\n\n{transcript}";
        string promptPath = Path.Combine(Path.GetTempPath(), "ai_transcriber_prompt_winui_summary.txt");
        await File.WriteAllTextAsync(promptPath, BuildChatPrompt(model.File, systemPrompt, userPrompt), Encoding.UTF8);

        string schemaPath = Path.Combine(Path.GetTempPath(), "ai_transcriber_schema.json");
        string schema = "{ \"type\": \"array\", \"items\": { \"type\": \"string\" } }";
        await File.WriteAllTextAsync(schemaPath, schema, Encoding.UTF8);

        try
        {
            int maxTokens = 1024;
            string args = $"-m \"{modelPath}\" -f \"{promptPath}\" -n {maxTokens} --temp 0.3 -ngl 999 -c 4096 --log-disable --no-display-prompt -st -jf \"{schemaPath}\"";
            ProcessResult result = await RunProcessAsync(AppModel.LlamaExe, args, TimeSpan.FromMinutes(15), [0, 130], ct);
            string formatted = ExtractFormatterOutput(result.Output);

            string[]? bullets = null;
            try { bullets = System.Text.Json.JsonSerializer.Deserialize<string[]>(formatted); }
            catch { } // not JSON: fall through and treat it as plain text

            if (bullets is not null)
            {
                // The schema forces a JSON array, and the model can return an
                // EMPTY one. That used to fail the "any bullets?" check and fall
                // through with the raw string untouched, so the Summary tab
                // showed a literal "[ ]". Nothing to say means no summary.
                List<string> lines = bullets
                    .Where(b => !string.IsNullOrWhiteSpace(b))
                    .Select(b => $"- {b.Trim()}")
                    .ToList();

                if (lines.Count == 0) return null;
                formatted = string.Join("\n", lines);
            }

            return string.IsNullOrWhiteSpace(formatted) ? null : formatted;
        }
        finally
        {
            if (File.Exists(promptPath)) File.Delete(promptPath);
            if (File.Exists(schemaPath)) File.Delete(schemaPath);
        }
    }

    public static async Task<List<ActionableEntity>> ExtractActionableEntitiesAsync(string transcript, string? selectedFormatter)
    {
        if (string.IsNullOrWhiteSpace(AppModel.LlamaExe)) return new();

        ModelInfo? model = AppModel.Resolve(AppModel.FormatterModels, selectedFormatter)
                           ?? AppModel.FormatterModels.FirstOrDefault(item => AppModel.IsValidModelFile(AppModel.ModelPath(item.File)));
        if (model is null || !AppModel.IsValidModelFile(AppModel.ModelPath(model.File))) return new();

        string modelPath = AppModel.ModelPath(model.File);
        string systemPrompt = "You are a precise data-extraction engine. Find dates, times, and scheduled events in the text (e.g. \"tomorrow at 5pm\", \"September 12th\"). For each, give the exact quote from the text, a short 2-4 word event title, and a type: \"time\" if a specific hour is mentioned, otherwise \"date\". Return only the data; if there are none, return an empty list.";
        string userPrompt = $"Extract dates and events from:\n\n{transcript}";

        string promptPath = Path.Combine(Path.GetTempPath(), $"ai_transcriber_entities_{Guid.NewGuid():N}.txt");
        await File.WriteAllTextAsync(promptPath, BuildChatPrompt(model.File, systemPrompt, userPrompt), Encoding.UTF8);

        string schemaPath = Path.Combine(Path.GetTempPath(), $"ai_transcriber_entities_{Guid.NewGuid():N}.json");
        string schema = "{ \"type\": \"array\", \"items\": { \"type\": \"object\", \"properties\": { \"quote\": { \"type\": \"string\" }, \"name\": { \"type\": \"string\" }, \"type\": { \"type\": \"string\", \"enum\": [\"date\", \"time\"] } }, \"required\": [\"quote\", \"name\", \"type\"] } }";
        await File.WriteAllTextAsync(schemaPath, schema, Encoding.UTF8);

        try
        {
            string args = $"-m \"{modelPath}\" -f \"{promptPath}\" -n 512 --temp 0.0 -ngl 999 -c 4096 --log-disable --no-display-prompt -st -jf \"{schemaPath}\"";
            ProcessResult result = await RunProcessAsync(AppModel.LlamaExe, args, TimeSpan.FromMinutes(5), [0, 130]);
            string json = ExtractFormatterOutput(result.Output);

            var options = new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            List<ActionableEntity>? items = System.Text.Json.JsonSerializer.Deserialize<List<ActionableEntity>>(json, options);
            return items?.Where(e => !string.IsNullOrWhiteSpace(e.Name)).ToList() ?? new();
        }
        catch
        {
            return new();
        }
        finally
        {
            if (File.Exists(promptPath)) File.Delete(promptPath);
            if (File.Exists(schemaPath)) File.Delete(schemaPath);
        }
    }

    private static string GetContextPrompt()
    {
        var settings = UserSettings.Load();
        if (!settings.EnableContextLearning || !File.Exists(AppModel.UserMemoryFile))
        {
            return string.Empty;
        }

        string memory = File.ReadAllText(AppModel.UserMemoryFile).Trim();
        if (string.IsNullOrWhiteSpace(memory)) return string.Empty;

        return $"\n\nUSER CONTEXT (Use this to fix transcription holes/jargon):\n{memory}";
    }

    /// <summary>
    /// A name for a transcript or a chat: at most three words, so the list can
    /// be read at a glance. Returns null when there is no model, the text is too
    /// thin to name, or the model answered with a sentence instead of a title -
    /// the caller keeps whatever name it already had rather than showing junk.
    /// </summary>
    public static async Task<string?> GenerateTitleAsync(string text, string? selectedFormatter)
    {
        if (string.IsNullOrWhiteSpace(text) || text.Trim().Length < 24) return null;
        if (string.IsNullOrWhiteSpace(AppModel.LlamaExe)) return null;

        ModelInfo? model = AppModel.Resolve(AppModel.FormatterModels, selectedFormatter);
        if (model is null || !AppModel.IsValidModelFile(AppModel.ModelPath(model.File))) return null;

        // Only the opening matters: what something is about is settled in the
        // first paragraph, and a whole lecture here would cost more than the
        // three words are worth.
        string sample = text.Length > 1200 ? text[..1200] : text;

        string systemPrompt =
            "Give this text a title of AT MOST THREE WORDS, in the language the text is written in. "
            + "It must say what the text is ABOUT, so someone reading a list can tell at a glance. "
            + "No quotes, no punctuation at the end, no explanation, no full sentence. "
            + "Reply with the title ONLY, starting exactly with '[START_FORMAT]'.";

        string promptPath = Path.Combine(Path.GetTempPath(), "ai_transcriber_prompt_winui_title.txt");
        await File.WriteAllTextAsync(promptPath, BuildChatPrompt(model.File, systemPrompt, sample), Encoding.UTF8);

        try
        {
            string args = $"-m \"{modelPath(model)}\" -f \"{promptPath}\" -n 24 --temp 0.2 -ngl 33 -c 4096 --log-disable --no-display-prompt -st";
            ProcessResult result = await RunProcessAsync(AppModel.LlamaExe, args, TimeSpan.FromMinutes(2), [0, 130]);
            return CleanTitle(ExtractFormatterOutput(result.Output));
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"GenerateTitleAsync failed: {ex.Message}");
            return null;
        }
        finally
        {
            try { if (File.Exists(promptPath)) File.Delete(promptPath); } catch { }
        }

        static string modelPath(ModelInfo m) => AppModel.ModelPath(m.File);
    }

    /// <summary>
    /// Small models wrap a title in quotes, prefix it with "Title:", or answer
    /// with a whole sentence. Anything still longer than three words after
    /// tidying is a sentence, and a sentence is worse than the filename.
    /// </summary>
    private static string? CleanTitle(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;

        string title = raw.Trim().Split('\n')[0].Trim();
        title = title.Trim('"', '\'', '`', '*', '#', ' ');
        int colon = title.IndexOf(':');
        if (colon >= 0 && colon <= 12) title = title[(colon + 1)..].Trim();
        title = title.Trim('"', '\'', '`', '*', ' ').TrimEnd('.', ',', ';', '!');

        if (title.Length == 0 || title.Length > 60) return null;
        string[] words = title.Split(' ', StringSplitOptions.RemoveEmptyEntries);

        // Models pad a good title with a lead-in: "A conversation about large
        // balls", "Discussion of the budget". The words that matter are at the
        // end, so the padding comes off before the length is judged rather than
        // the whole thing being thrown away for being four words long.
        string[] filler =
        [
            "a", "an", "the", "about", "on", "of", "regarding", "concerning",
            "title", "topic", "subject", "summary",
            "conversation", "discussion", "talk", "chat", "transcript", "recording", "note",
        ];
        int start = 0;
        while (start < words.Length - 1 && filler.Contains(words[start].Trim(',', ':').ToLowerInvariant()))
        {
            start++;
        }
        words = words[start..];

        if (words.Length == 0 || words.Length > 3) return null;
        return string.Join(" ", words);
    }

    public static async Task ExtractContextAsync(string transcript, string? selectedFormatter)
    {
        var settings = UserSettings.Load();
        if (!settings.EnableContextLearning || string.IsNullOrWhiteSpace(AppModel.LlamaExe))
        {
            return;
        }

        ModelInfo? model = AppModel.Resolve(AppModel.FormatterModels, selectedFormatter);
        if (model is null || !AppModel.IsValidModelFile(AppModel.ModelPath(model.File)))
        {
            return;
        }

        string modelPath = AppModel.ModelPath(model.File);
        string systemPrompt = "Extract key domain-specific jargon, acronyms, important names, and the main subject matter from the text. Reply with a comma-separated list of terms. Do NOT include common words. Reply ONLY with the comma-separated terms, start exactly with '[START_FORMAT]'.";

        string promptPath = Path.Combine(Path.GetTempPath(), "ai_transcriber_prompt_winui_context.txt");
        await File.WriteAllTextAsync(promptPath, BuildChatPrompt(model.File, systemPrompt, transcript), Encoding.UTF8);

        try
        {
            string args = $"-m \"{modelPath}\" -f \"{promptPath}\" -n 256 --temp 0.1 -ngl 33 -c 4096 --log-disable --no-display-prompt -st";
            ProcessResult result = await RunProcessAsync(AppModel.LlamaExe, args, TimeSpan.FromMinutes(5), [0, 130]);
            string extracted = ExtractFormatterOutput(result.Output);
            if (!string.IsNullOrWhiteSpace(extracted) && !LooksUnstableFormatOutput(extracted, transcript))
            {
                string existing = File.Exists(AppModel.UserMemoryFile) ? File.ReadAllText(AppModel.UserMemoryFile) : "";
                var currentTerms = existing.Split(new[] { ',', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries).Select(t => t.Trim().ToLowerInvariant()).ToHashSet();
                var newTerms = extracted.Split(',').Select(t => t.Trim()).Where(t => !string.IsNullOrWhiteSpace(t) && t.Length > 2 && t.Length < 40).ToList();
                
                var toAdd = newTerms.Where(t => !currentTerms.Contains(t.ToLowerInvariant())).ToList();
                if (toAdd.Any())
                {
                    string appendStr = (string.IsNullOrWhiteSpace(existing) ? "" : ",\n") + string.Join(", ", toAdd);
                    File.AppendAllText(AppModel.UserMemoryFile, appendStr);
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"ExtractContextAsync failed: {ex.Message}");
        }
        finally
        {
            if (File.Exists(promptPath)) File.Delete(promptPath);
        }
    }

    // llama.cpp's -st flag reads template tokens literally, so Qwen's ChatML
    // produced garbage on Llama 3 (<|start_header_id|>) and Phi-3 (<|system|>).
    private static string BuildChatPrompt(string modelFile, string systemPrompt, string userPrompt)
    {
        string lower = modelFile.ToLowerInvariant();

        if (lower.Contains("llama-3"))
        {
            return $"<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n{systemPrompt}<|eot_id|>" +
                   $"<|start_header_id|>user<|end_header_id|>\n\n{userPrompt}<|eot_id|>" +
                   $"<|start_header_id|>assistant<|end_header_id|>\n\n";
        }

        if (lower.Contains("phi-3"))
        {
            return $"<|system|>\n{systemPrompt}<|end|>\n<|user|>\n{userPrompt}<|end|>\n<|assistant|>\n";
        }

        // Default: ChatML (Qwen 2.5, Hermes, etc.)
        return $"<|im_start|>system\n{systemPrompt}<|im_end|>\n<|im_start|>user\n{userPrompt}<|im_end|>\n<|im_start|>assistant\n";
    }

    private static string ExtractFormatterOutput(string output)
    {
        // The LAST boundary of ANY kind wins, rather than the first rule that
        // matches.
        //
        // The engine echoes the prompt back, and the prompt itself contains the
        // words "[START_FORMAT]" as an instruction. Preferring that marker meant
        // that when the model did NOT emit its own, the split landed inside the
        // echoed instructions and the summary came out as "' and do not add any
        // conversational text ... (truncated)". Whichever boundary sits closest
        // to the end is the one just before the real answer.
        int start = 0;
        foreach (string boundary in new[]
        {
            "[START_FORMAT]",
            "... (truncated)",
            "<|im_start|>assistant",
            "<|start_header_id|>assistant<|end_header_id|>",
            "<|assistant|>",
        })
        {
            int idx = output.LastIndexOf(boundary, StringComparison.Ordinal);
            if (idx >= 0 && idx + boundary.Length > start) start = idx + boundary.Length;
        }

        string text = output[start..];

        foreach (string marker in new[]
        {
            "[ Prompt:", "Exiting...",
            "<|im_end|>", "<|end|>", "<|eot_id|>", "<|endoftext|>",
            "<|start_header_id|>", "<|im_start|>",
            "ggml_cuda_init:",
            "[END_FORMAT]", "[END FORMAT]", "[/START_FORMAT]", "```",
        })
        {
            if (text.Contains(marker, StringComparison.Ordinal))
            {
                text = text.Split(marker)[0];
            }
        }

        return text.Trim();
    }

    private static bool LooksUnstableFormatOutput(string formatted, string raw)
    {
        if (string.IsNullOrWhiteSpace(formatted))
        {
            return true;
        }

        string lower = formatted.ToLowerInvariant();
        string[] suspiciousMarkers = ["fromnowformat", "reface", "takect", "obey obey", "ipsumudo"];
        return suspiciousMarkers.Any(lower.Contains) || formatted.Length > Math.Max(3000, raw.Length * 3);
    }

    public static async Task<ProcessResult> RunProcessAsync(
        string fileName,
        string arguments,
        TimeSpan? timeout = null,
        IReadOnlyCollection<int>? allowedExitCodes = null,
        System.Threading.CancellationToken ct = default,
        Action<string>? onStderrLine = null)
    {
        if (string.IsNullOrWhiteSpace(fileName) || !File.Exists(fileName))
        {
            throw new FileNotFoundException($"Required executable was not found: {fileName}");
        }

        ProcessStartInfo startInfo = new()
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

        using Process process = Process.Start(startInfo) ?? throw new InvalidOperationException($"Could not start {fileName}");

        // Cancellation kills the whole tree; the pipe reads below then drain and
        // complete, and the token check after the wait turns it into OCE.
        using var killRegistration = ct.Register(() =>
        {
            try { process.Kill(entireProcessTree: true); } catch { }
        });

        Task<string> stdoutTask = process.StandardOutput.ReadToEndAsync();
        Task<string> stderrTask = onStderrLine is null
            ? process.StandardError.ReadToEndAsync()
            : ReadLinesAsync(process.StandardError, onStderrLine);
        Task waitTask = process.WaitForExitAsync();
        if (timeout is not null && await Task.WhenAny(waitTask, Task.Delay(timeout.Value)) != waitTask)
        {
            try { process.Kill(entireProcessTree: true); } catch { }
            throw new TimeoutException($"{Path.GetFileName(fileName)} timed out.");
        }

        await waitTask;
        ct.ThrowIfCancellationRequested();

        string stdout = await stdoutTask;
        string stderr = await stderrTask;
        string combined = $"{stdout}\n{stderr}".Trim();
        allowedExitCodes ??= [0];
        if (!allowedExitCodes.Contains(process.ExitCode))
        {
            throw new EngineProcessException(process.ExitCode, combined);
        }

        return new ProcessResult(process.ExitCode, combined, stdout, stderr);
    }

    private static async Task<string> ReadLinesAsync(StreamReader reader, Action<string> onLine)
    {
        StringBuilder all = new();
        string? line;
        while ((line = await reader.ReadLineAsync()) is not null)
        {
            all.AppendLine(line);
            try { onLine(line); } catch { }
        }

        return all.ToString();
    }

    // Like RunProcessAsync but reports stdout as it arrives: onAccumulated is
    // called with the full stdout-so-far after each chunk (cheap because
    // transcripts are small and tokens arrive slowly). Returns stdout+stderr
    // combined, so the same ExtractFormatterOutput can parse the final text.
    private static async Task<string> RunStreamingProcessAsync(
        string fileName,
        string arguments,
        TimeSpan? timeout,
        IReadOnlyCollection<int>? allowedExitCodes,
        System.Threading.CancellationToken ct,
        Action<string> onAccumulated)
    {
        if (string.IsNullOrWhiteSpace(fileName) || !File.Exists(fileName))
        {
            throw new FileNotFoundException($"Required executable was not found: {fileName}");
        }

        ProcessStartInfo startInfo = new()
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

        using Process process = Process.Start(startInfo) ?? throw new InvalidOperationException($"Could not start {fileName}");
        using var killRegistration = ct.Register(() =>
        {
            try { process.Kill(entireProcessTree: true); } catch { }
        });

        Task<string> stderrTask = process.StandardError.ReadToEndAsync();

        var stdout = new StringBuilder();
        var buffer = new char[256];
        Task waitTask = process.WaitForExitAsync();

        while (true)
        {
            Task<int> readTask = process.StandardOutput.ReadAsync(buffer, 0, buffer.Length);
            if (timeout is not null && await Task.WhenAny(readTask, Task.Delay(timeout.Value, ct)) != readTask)
            {
                try { process.Kill(entireProcessTree: true); } catch { }
                ct.ThrowIfCancellationRequested();
                throw new TimeoutException($"{Path.GetFileName(fileName)} timed out.");
            }

            int read = await readTask;
            if (read == 0) break;

            stdout.Append(StripAnsi(new string(buffer, 0, read)));
            try { onAccumulated(stdout.ToString()); } catch { }
        }

        await waitTask;
        ct.ThrowIfCancellationRequested();

        string stderr = await stderrTask;
        string combined = $"{stdout}\n{stderr}".Trim();
        allowedExitCodes ??= [0];
        if (!allowedExitCodes.Contains(process.ExitCode))
        {
            throw new EngineProcessException(process.ExitCode, combined);
        }

        return combined;
    }

    // Strips ANSI colour escape sequences (ESC[...m) some engine builds emit.
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

public sealed record ProcessResult(int ExitCode, string Output, string Stdout, string Stderr);

// An engine exe ran but exited with a failure code. Typed (rather than a bare
// InvalidOperationException) so EngineHealth.FriendlyMessage can recognize
// specific codes, e.g. STATUS_DLL_NOT_FOUND from a missing VC++ runtime.
public sealed class EngineProcessException(int exitCode, string output)
    : Exception($"Process failed with code {exitCode}.\n{output}")
{
    public int ExitCode { get; } = exitCode;
}

public sealed record ActionableEntity(string Quote, string Name, string Type);
