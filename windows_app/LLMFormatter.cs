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
    public static async Task<string?> FormatTranscriptAsync(string transcript, string? selectedFormatter, string formatLanguage = "Auto-Detect / Original", string? customPromptOverride = null)
    {
        if (string.IsNullOrWhiteSpace(AppModel.LlamaExe))
        {
            return null;
        }

        ModelInfo? model = AppModel.FormatterModels.FirstOrDefault(item => item.Name == selectedFormatter);
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
            ProcessResult result = await RunProcessAsync(AppModel.LlamaExe, args, TimeSpan.FromMinutes(15), [0, 130]);
            string formatted = ExtractFormatterOutput(result.Output);
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

    public static async Task<string?> SummarizeTranscriptAsync(string transcript, string? selectedFormatter, string formatLanguage = "Auto-Detect / Original", string? customPromptOverride = null)
    {
        if (string.IsNullOrWhiteSpace(AppModel.LlamaExe))
        {
            return null;
        }

        int wordCount = transcript.Split(new char[] { ' ', '\r', '\n', '\t' }, StringSplitOptions.RemoveEmptyEntries).Length;
        if (wordCount < 15)
        {
            return "Text is too short or lacks content to summarize.";
        }

        ModelInfo? model = AppModel.FormatterModels.FirstOrDefault(item => item.Name == selectedFormatter);
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
            ProcessResult result = await RunProcessAsync(AppModel.LlamaExe, args, TimeSpan.FromMinutes(15), [0, 130]);
            string formatted = ExtractFormatterOutput(result.Output);

            try
            {
                var bullets = System.Text.Json.JsonSerializer.Deserialize<string[]>(formatted);
                if (bullets != null && bullets.Length > 0)
                {
                    formatted = string.Join("\n", bullets.Select(b => $"- {b}"));
                }
            }
            catch { } // fallback to raw string if JSON fails

            return string.IsNullOrWhiteSpace(formatted) ? null : formatted;
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

    public static async Task ExtractContextAsync(string transcript, string? selectedFormatter)
    {
        var settings = UserSettings.Load();
        if (!settings.EnableContextLearning || string.IsNullOrWhiteSpace(AppModel.LlamaExe))
        {
            return;
        }

        ModelInfo? model = AppModel.FormatterModels.FirstOrDefault(item => item.Name == selectedFormatter);
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

    // Returns the prompt body using whichever chat template the given model expects.
    // Why: llama.cpp's -st flag interprets these tokens literally, so Qwen-only ChatML
    // produced garbage on Llama 3 (uses <|start_header_id|>) and Phi-3 (uses <|system|>).
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
        string text;
        if (output.Contains("[START_FORMAT]", StringComparison.Ordinal))
        {
            text = output.Split("[START_FORMAT]").Last();
        }
        else if (output.Contains("... (truncated)", StringComparison.Ordinal))
        {
            text = output.Split("... (truncated)").Last();
        }
        else if (output.Contains("<|im_start|>assistant", StringComparison.Ordinal))
        {
            text = output.Split("<|im_start|>assistant").Last();
        }
        else if (output.Contains("<|start_header_id|>assistant<|end_header_id|>", StringComparison.Ordinal))
        {
            text = output.Split("<|start_header_id|>assistant<|end_header_id|>").Last();
        }
        else if (output.Contains("<|assistant|>", StringComparison.Ordinal))
        {
            text = output.Split("<|assistant|>").Last();
        }
        else
        {
            text = output;
        }

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
        IReadOnlyCollection<int>? allowedExitCodes = null)
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
        Task<string> stdoutTask = process.StandardOutput.ReadToEndAsync();
        Task<string> stderrTask = process.StandardError.ReadToEndAsync();
        Task waitTask = process.WaitForExitAsync();
        if (timeout is not null && await Task.WhenAny(waitTask, Task.Delay(timeout.Value)) != waitTask)
        {
            try { process.Kill(entireProcessTree: true); } catch { }
            throw new TimeoutException($"{Path.GetFileName(fileName)} timed out.");
        }

        await waitTask;

        string stdout = await stdoutTask;
        string stderr = await stderrTask;
        string combined = $"{stdout}\n{stderr}".Trim();
        allowedExitCodes ??= [0];
        if (!allowedExitCodes.Contains(process.ExitCode))
        {
            throw new InvalidOperationException($"Process failed with code {process.ExitCode}.\n{combined}");
        }

        return new ProcessResult(process.ExitCode, combined, stdout, stderr);
    }
}

public sealed record ProcessResult(int ExitCode, string Output, string Stdout, string Stderr);
