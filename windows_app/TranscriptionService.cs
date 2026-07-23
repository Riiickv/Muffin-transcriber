using System;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace MuffinTranscriber;

public sealed record TranscriptionResult(string RawTranscript, string? Srt, int WhisperExitCode, string WhisperStderr);

// The ffmpeg -> whisper -> SRT pipeline that Home, Record and the share window
// each used to inline. Callers decide what to do with an empty transcript.
public static partial class TranscriptionService
{
    // whisper-cli -pp writes "whisper_print_progress_callback: progress =   5%"
    // to stderr in 5% steps.
    [GeneratedRegex(@"progress\s*=\s*(\d+)%")]
    private static partial Regex ProgressRegex();

    public static async Task<TranscriptionResult> TranscribeAsync(
        string inputPath,
        ModelInfo whisperModel,
        string languageDisplay,
        bool normalizeAudio,
        IProgress<int>? progress = null,
        CancellationToken ct = default)
    {
        // Unique per run so concurrent transcriptions can't clobber each other.
        string wavPath = Path.Combine(Path.GetTempPath(), $"ai_transcriber_{Guid.NewGuid():N}.wav");

        try
        {
            string ffmpegArgs = normalizeAudio
                ? $"-y -i \"{inputPath}\" -vn -af highpass=f=80,lowpass=f=7800,loudnorm=I=-16:TP=-1.5:LRA=11 -ar 16000 -ac 1 -c:a pcm_s16le \"{wavPath}\""
                : $"-y -i \"{inputPath}\" -vn -ar 16000 -ac 1 -c:a pcm_s16le \"{wavPath}\"";
            await LLMFormatter.RunProcessAsync(AppModel.FfmpegExe, ffmpegArgs, ct: ct);

            string languageArg = AppModel.LanguageCode(languageDisplay);
            string modelPath = AppModel.ModelPath(whisperModel.File);
            string args = languageArg == "auto"
                ? $"-m \"{modelPath}\" -f \"{wavPath}\" -nt -osrt -pp"
                : $"-m \"{modelPath}\" -f \"{wavPath}\" -l {languageArg} -nt -osrt -pp";

            Action<string>? onStderrLine = progress is null ? null : line =>
            {
                Match match = ProgressRegex().Match(line);
                if (match.Success && int.TryParse(match.Groups[1].Value, out int pct))
                {
                    progress.Report(Math.Clamp(pct, 0, 100));
                }
            };

            ProcessResult result = await LLMFormatter.RunProcessAsync(AppModel.WhisperExe, args, ct: ct, onStderrLine: onStderrLine);

            string? srt = null;
            string srtPath = wavPath + ".srt";
            if (File.Exists(srtPath))
            {
                srt = await File.ReadAllTextAsync(srtPath);
                try { File.Delete(srtPath); } catch { }
            }

            return new TranscriptionResult(result.Stdout.Trim(), srt, result.ExitCode, result.Stderr);
        }
        finally
        {
            try { if (File.Exists(wavPath)) File.Delete(wavPath); } catch { }
        }
    }
}
