using System;
using System.IO;
using System.Threading.Tasks;

namespace MuffinTranscriber;

public sealed record TranscriptionResult(string RawTranscript, string? Srt, int WhisperExitCode, string WhisperStderr);

// The ffmpeg -> whisper -> SRT pipeline that Home, Record and the share window
// each used to inline. Callers decide what to do with an empty transcript.
public static class TranscriptionService
{
    public static async Task<TranscriptionResult> TranscribeAsync(
        string inputPath,
        ModelInfo whisperModel,
        string languageDisplay,
        bool normalizeAudio)
    {
        // Unique per run so concurrent transcriptions can't clobber each other.
        string wavPath = Path.Combine(Path.GetTempPath(), $"ai_transcriber_{Guid.NewGuid():N}.wav");

        try
        {
            string ffmpegArgs = normalizeAudio
                ? $"-y -i \"{inputPath}\" -vn -af highpass=f=80,lowpass=f=7800,loudnorm=I=-16:TP=-1.5:LRA=11 -ar 16000 -ac 1 -c:a pcm_s16le \"{wavPath}\""
                : $"-y -i \"{inputPath}\" -vn -ar 16000 -ac 1 -c:a pcm_s16le \"{wavPath}\"";
            await LLMFormatter.RunProcessAsync(AppModel.FfmpegExe, ffmpegArgs);

            string languageArg = AppModel.LanguageCode(languageDisplay);
            string modelPath = AppModel.ModelPath(whisperModel.File);
            string args = languageArg == "auto"
                ? $"-m \"{modelPath}\" -f \"{wavPath}\" -nt -osrt"
                : $"-m \"{modelPath}\" -f \"{wavPath}\" -l {languageArg} -nt -osrt";

            ProcessResult result = await LLMFormatter.RunProcessAsync(AppModel.WhisperExe, args);

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
