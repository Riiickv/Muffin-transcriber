using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;

namespace MuffinTranscriber;

public enum EngineProblem
{
    None,
    EnginesMissing,   // exe files absent: broken or partial install
    RuntimeMissing,   // exes present but the VC++ runtime DLLs they import are not
    Unknown,
}

public sealed record EngineHealthReport(EngineProblem Problem, string Detail);

// Startup self-test for the bundled engines (ffmpeg/whisper/llama). Before this
// existed, a missing VC++ runtime surfaced as a raw Windows "system error" box
// or an exception dump in the transcript area, which testers read as "the app
// is broken". Now the failure is detected up front and explained in one banner.
public static class EngineHealth
{
    // NTSTATUS STATUS_DLL_NOT_FOUND: the loader could not find an imported DLL,
    // in practice always MSVCP140/VCRUNTIME140 on a machine without the VC++
    // redistributable. Reported as the process exit code.
    public const int StatusDllNotFound = unchecked((int)0xC0000135);

    public const string VcRedistUrl = "https://aka.ms/vs/17/release/vc_redist.x64.exe";
    public const string InstallerUrl = "https://github.com/Riiickv/Muffin-transcriber/releases/latest";

    public static async Task<EngineHealthReport> CheckAsync()
    {
        if (string.IsNullOrEmpty(AppModel.FfmpegExe) ||
            string.IsNullOrEmpty(AppModel.WhisperExe) ||
            string.IsNullOrEmpty(AppModel.LlamaExe))
        {
            return new(EngineProblem.EnginesMissing, "engine executables not found");
        }

        // Actually start each engine once with a harmless flag. Any exit code
        // proves the process could load; only the DLL-not-found status matters.
        foreach ((string exe, string args) in new[]
        {
            (AppModel.FfmpegExe, "-version"),
            (AppModel.WhisperExe, "--help"),
            (AppModel.LlamaExe, "--version"),
        })
        {
            try
            {
                ProcessStartInfo startInfo = new()
                {
                    FileName = exe,
                    Arguments = args,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                };

                using Process? process = Process.Start(startInfo);
                if (process is null)
                {
                    return new(EngineProblem.Unknown, Path.GetFileName(exe));
                }

                // Drain the pipes so a chatty exe can't block on a full buffer.
                _ = process.StandardOutput.ReadToEndAsync();
                _ = process.StandardError.ReadToEndAsync();
                await process.WaitForExitAsync();

                if (process.ExitCode == StatusDllNotFound)
                {
                    return new(EngineProblem.RuntimeMissing, Path.GetFileName(exe));
                }
            }
            catch (Win32Exception ex)
            {
                return new(EngineProblem.Unknown, $"{Path.GetFileName(exe)}: {ex.Message}");
            }
        }

        return new(EngineProblem.None, string.Empty);
    }

    // Translates pipeline exceptions into a message a person can act on.
    // Returns null when there is no better story than the exception itself.
    public static string? FriendlyMessage(Exception ex) => ex switch
    {
        FileNotFoundException => AppStrings.Health_EnginesMissingBody,
        EngineProcessException engine when engine.ExitCode == StatusDllNotFound => AppStrings.Health_RuntimeMissingBody,
        _ => null,
    };
}
