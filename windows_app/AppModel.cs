using System.Diagnostics;
using System.Security.Cryptography;
using System.IO;
using System.Threading.Tasks;

namespace MuffinTranscriber;

// NameKey/DescKey are shared i18n keys (models.*), the SAME ones the mobile app
// shows. Users pick a speed/quality TIER, not a model - "Qwen 2.5 1.5B" means
// nothing to them, "Balanced" does. Render through DisplayName/DisplayDesc, not
// the raw Name, or the pickers stay English while the rest is translated.
public sealed record ModelInfo(string File, string Name, string Url, string Size, string NameKey = "", string DescKey = "");

public static class AppModel
{
    public const long MinModelBytes = 1024 * 1024;

    // Ordered fastest -> best, so the list itself is the quality ladder, as on mobile.
    public static readonly ModelInfo[] WhisperModels =
    [
        new("ggml-tiny.bin", "Whisper [tiny]", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin", "74 MB", "models.tierFastest", "models.descWhisperFastest"),
        new("ggml-base.bin", "Whisper [base]", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin", "142 MB", "models.tierFast", ""),
        new("ggml-small.bin", "Whisper [small]", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin", "466 MB", "models.tierBalanced", "models.descWhisperBalanced"),
        new("ggml-large-v3.bin", "Whisper [high]", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin", "2.9 GB", "models.tierAccurate", "models.descWhisperAccurate"),
    ];

    public static readonly ModelInfo[] FormatterModels =
    [
        new("qwen2.5-1.5b-instruct-q4_k_m.gguf", "Qwen 2.5 [1.5B]", "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf", "1.1 GB", "models.tierFast", "models.descFmtFast"),
        new("Phi-3-mini-4k-instruct-q4.gguf", "Phi-3 Mini [3.8B]", "https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf", "2.4 GB", "models.tierBalanced", "models.descFmtBalanced"),
        new("Llama-3.2-3B-Instruct-Q4_K_M.gguf", "Llama 3.2 [3B]", "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf", "2.0 GB", "models.tierBest", "models.descFmtBest"),
    ];

    public static readonly ModelInfo[] EmbeddingModels =
    [
        new("all-MiniLM-L6-v2-q4_k_m.gguf", "MiniLM-L6-v2", "https://huggingface.co/Mungert/all-MiniLM-L6-v2-GGUF/resolve/main/all-MiniLM-L6-v2-q4_k_m.gguf", "14 MB", "models.tierSmartSearch", "models.descEmbed"),
    ];

    public static readonly HashSet<string> MediaExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".mp3", ".wav", ".ogg", ".opus", ".mp4", ".mkv", ".m4a", ".aac", ".flac", ".webm", ".mov", ".avi",
    };

    public static string AppInstallDir { get; } = AppContext.BaseDirectory;
    public static string AppDataDir
    {
        get
        {
            string path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MuffinTranscriber");
            Directory.CreateDirectory(path);
            return path;
        }
    }

    public static string ModelsDir => Path.Combine(AppDataDir, "models");
    public static string UserMemoryFile => Path.Combine(AppDataDir, "user_memory.txt");

    public static string AudioCacheDir
    {
        get
        {
            string path = Path.Combine(AppDataDir, "Cache", "Audio");
            Directory.CreateDirectory(path);
            return path;
        }
    }
    
    public static string VideoCacheDir
    {
        get
        {
            string path = Path.Combine(AppDataDir, "Cache", "Video");
            Directory.CreateDirectory(path);
            return path;
        }
    }

    public static async Task<string> ComputeFileHashAsync(string filePath)
    {
        if (!File.Exists(filePath)) return string.Empty;
        try
        {
            using var stream = File.OpenRead(filePath);
            using var sha256 = SHA256.Create();
            var hashBytes = await sha256.ComputeHashAsync(stream);
            return BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
        }
        catch
        {
            return string.Empty;
        }
    }

    public static void CleanCache()
    {
        var settings = UserSettings.Load();
        if (settings.AutoDeleteCacheDuration == "Never") return;
        
        TimeSpan maxAge = settings.AutoDeleteCacheDuration == "1 Week" ? TimeSpan.FromDays(7) : TimeSpan.FromDays(30);
        
        try
        {
            var audioFiles = Directory.GetFiles(AudioCacheDir);
            foreach (var file in audioFiles)
            {
                if (DateTime.Now - File.GetCreationTime(file) > maxAge)
                {
                    File.Delete(file);
                }
            }
            
            var videoFiles = Directory.GetFiles(VideoCacheDir);
            foreach (var file in videoFiles)
            {
                if (DateTime.Now - File.GetCreationTime(file) > maxAge)
                {
                    File.Delete(file);
                }
            }

            // Drop history references to any cached media we just deleted.
            TranscriptionHistory.PurgeMissingSourceFiles();
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"CleanCache failed: {ex.Message}");
        }
    }
    public static string WhisperExe => FindExecutable(Path.Combine(AppInstallDir, "whisper_bin"), "whisper-cli.exe");
    public static string FfmpegExe => FindExecutable(Path.Combine(AppInstallDir, "ffmpeg_bin"), "ffmpeg.exe");
    public static string LlamaExe => FindExecutable(Path.Combine(AppInstallDir, "llama_bin"), "llama-cli.exe");
    public static string LlamaServerExe => FindExecutable(Path.Combine(AppInstallDir, "llama_bin"), "llama-server.exe");
    public static string LlamaCompletionExe => FindExecutable(Path.Combine(AppInstallDir, "llama_bin"), "llama-completion.exe");

    public static string ModelPath(string file) => Path.Combine(ModelsDir, file);

    public static bool IsValidModelFile(string path)
    {
        return File.Exists(path) && new FileInfo(path).Length >= MinModelBytes;
    }

    public static string CompactName(ModelInfo info)
    {
        return info.Name.Split(" - ")[0];
    }

    /// <summary>The translated tier label shown to the user (mobile's modelName).</summary>
    public static string DisplayName(ModelInfo info) =>
        string.IsNullOrEmpty(info.NameKey) ? CompactName(info) : LocalizationManager.GetString(info.NameKey, CompactName(info));

    /// <summary>The translated one-line blurb (mobile's modelDesc); size if none.</summary>
    public static string DisplayDesc(ModelInfo info) =>
        string.IsNullOrEmpty(info.DescKey) ? info.Size : LocalizationManager.GetString(info.DescKey, info.Size);

    public static ModelInfo? ActiveWhisperModel()
    {
        string[] qualityOrder = ["ggml-large-v3.bin", "ggml-small.bin", "ggml-base.bin", "ggml-tiny.bin"];
        foreach (string file in qualityOrder)
        {
            ModelInfo? info = WhisperModels.FirstOrDefault(model => model.File == file);
            if (info is not null && IsValidModelFile(ModelPath(info.File)))
            {
                return info;
            }
        }

        return null;
    }

    public static string LanguageCode(string display) => WhisperLanguages.LanguageCode(display);

    public static string FindExecutable(string baseDir, string name)
    {
        if (!Directory.Exists(baseDir))
        {
            return string.Empty;
        }

        return Directory.EnumerateFiles(baseDir, name, SearchOption.AllDirectories).FirstOrDefault() ?? string.Empty;
    }
}
