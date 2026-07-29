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
        new("ggml-base.bin", "Whisper [base]", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin", "142 MB", "models.tierFast", "pc.models.descWhisperFast"),
        new("ggml-small.bin", "Whisper [small]", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin", "466 MB", "models.tierBalanced", "models.descWhisperBalanced"),
        new("ggml-large-v3.bin", "Whisper [high]", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin", "2.9 GB", "models.tierAccurate", "models.descWhisperAccurate"),
        // Desktop-only. Turbo is large-v3's accuracy at a fraction of the time,
        // which a phone has no headroom for and a PC very much does.
        new("ggml-large-v3-turbo.bin", "Whisper [turbo]", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin", "1.5 GB", "pc.models.tierTurbo", "pc.models.descWhisperTurbo"),
    ];

    public static readonly ModelInfo[] FormatterModels =
    [
        new("qwen2.5-1.5b-instruct-q4_k_m.gguf", "Qwen 2.5 [1.5B]", "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf", "1.1 GB", "models.tierFast", "models.descFmtFast"),
        new("Phi-3-mini-4k-instruct-q4.gguf", "Phi-3 Mini [3.8B]", "https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf", "2.4 GB", "models.tierBalanced", "models.descFmtBalanced"),
        new("Llama-3.2-3B-Instruct-Q4_K_M.gguf", "Llama 3.2 [3B]", "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf", "2.0 GB", "models.tierBest", "models.descFmtBest"),

        // Desktop-only. Everything above is sized for a phone, which left a
        // machine with a real graphics card running a 3B model. Sizes are the
        // measured download, and each description says what it wants to run on
        // so nobody pulls 18 GB onto a laptop and wonders why it crawls.
        new("Qwen2.5-7B-Instruct-Q4_K_M.gguf", "Qwen 2.5 [7B]", "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf", "4.4 GB", "pc.models.tierPowerful", "pc.models.descFmtPowerful"),
        new("Qwen2.5-14B-Instruct-Q4_K_M.gguf", "Qwen 2.5 [14B]", "https://huggingface.co/bartowski/Qwen2.5-14B-Instruct-GGUF/resolve/main/Qwen2.5-14B-Instruct-Q4_K_M.gguf", "8.4 GB", "pc.models.tierVeryPowerful", "pc.models.descFmtVeryPowerful"),
        new("Qwen2.5-32B-Instruct-Q4_K_M.gguf", "Qwen 2.5 [32B]", "https://huggingface.co/bartowski/Qwen2.5-32B-Instruct-GGUF/resolve/main/Qwen2.5-32B-Instruct-Q4_K_M.gguf", "18.5 GB", "pc.models.tierMaximum", "pc.models.descFmtMaximum"),
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

    /// <summary>
    /// A model counts as installed only if it is actually a model.
    ///
    /// Size alone is not enough: the downloader pre-allocates the whole file and
    /// fills it in parallel, so an interrupted download leaves a full-size file
    /// of zeros. That passed as installed, and every engine call then failed
    /// with nothing the user could act on ("the chat just doesn't answer").
    /// Checking the format magic makes a broken file read as missing, which is
    /// what it is, and the UI offers to download it again.
    /// </summary>
    public static bool IsValidModelFile(string path)
    {
        if (!File.Exists(path) || new FileInfo(path).Length < MinModelBytes) return false;

        try
        {
            using FileStream stream = File.OpenRead(path);
            Span<byte> magic = stackalloc byte[4];
            if (stream.Read(magic) != 4) return false;

            // llama.cpp models are GGUF; whisper.cpp models are ggml, whose
            // magic is the little-endian word 0x67676d6c.
            bool gguf = magic[0] == 'G' && magic[1] == 'G' && magic[2] == 'U' && magic[3] == 'F';
            bool ggml = magic[0] == 0x6C && magic[1] == 0x6D && magic[2] == 0x67 && magic[3] == 0x67;
            return gguf || ggml;
        }
        catch
        {
            // Locked mid-download, or unreadable: not usable either way.
            return false;
        }
    }

    public static string CompactName(ModelInfo info)
    {
        return info.Name.Split(" - ")[0];
    }

    /// <summary>The translated tier label shown to the user (mobile's modelName).</summary>
    public static string DisplayName(ModelInfo info) =>
        // The real name when the user has asked for it. CompactName is what the
        // catalogue calls the model itself ("Qwen 2.5 [14B]"); the key resolves
        // to what it does for you ("Very powerful").
        UserSettings.Load().ShowModelNames || string.IsNullOrEmpty(info.NameKey)
            ? CompactName(info)
            : LocalizationManager.GetString(info.NameKey, CompactName(info));

    /// <summary>
    /// A saved model key ("ggml-large-v3-turbo-q8_0.bin") as something worth
    /// reading, searching both catalogues.
    ///
    /// Falls back to the key with its extension stripped rather than to nothing:
    /// a transcript made by a model since dropped from the catalogue should still
    /// say what made it, and a blank line under the date is worse than an ugly
    /// one.
    /// </summary>
    public static string DisplayModelName(string key)
    {
        ModelInfo? info = Resolve(WhisperModels, key) ?? Resolve(FormatterModels, key);
        return info is not null
            ? DisplayName(info)
            : Path.GetFileNameWithoutExtension(key);
    }

    /// <summary>The translated one-line blurb (mobile's modelDesc); size if none.</summary>
    public static string DisplayDesc(ModelInfo info) =>
        string.IsNullOrEmpty(info.DescKey) ? info.Size : LocalizationManager.GetString(info.DescKey, info.Size);

    /// <summary>
    /// Finds a model from whatever the setting happens to hold. The pickers used
    /// to store a model's Name and now store its File, and both spellings are
    /// still out there in saved settings, so match either rather than silently
    /// resolving to nothing (which reads as "the formatter just did not run").
    /// </summary>
    public static ModelInfo? Resolve(ModelInfo[] models, string? key)
    {
        if (string.IsNullOrWhiteSpace(key)) return null;
        return models.FirstOrDefault(m => m.File == key)
            ?? models.FirstOrDefault(m => m.Name == key)
            ?? models.FirstOrDefault(m => CompactName(m) == key);
    }

    public static ModelInfo? ActiveWhisperModel()
    {
        string[] qualityOrder = ["ggml-large-v3.bin", "ggml-large-v3-turbo.bin", "ggml-small.bin", "ggml-base.bin", "ggml-tiny.bin"];
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
