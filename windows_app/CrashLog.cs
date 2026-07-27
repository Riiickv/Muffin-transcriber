using System;
using System.IO;

namespace MuffinTranscriber;

// Error logging to %LOCALAPPDATA%\MuffinTranscriber\logs. One file per day; the
// folder is pruned so it can never grow unbounded. Everything here is
// best-effort: logging must never take the app down with it.
public static class CrashLog
{
    private const int KeepDays = 7;

    public static string LogDir => Path.Combine(AppModel.AppDataDir, "logs");

    public static string CurrentLogPath => Path.Combine(LogDir, $"muffin-{DateTime.Now:yyyy-MM-dd}.log");

    public static void Write(string source, Exception ex)
    {
        try
        {
            Directory.CreateDirectory(LogDir);
            File.AppendAllText(CurrentLogPath, $"[{DateTime.Now:HH:mm:ss}] {source}\r\n{ex}\r\n\r\n");
            Prune();
        }
        catch
        {
        }
    }

    /// <summary>
    /// A plain line in the same log. For things worth knowing that are not
    /// failures, like a step that took far longer than it should have.
    /// </summary>
    public static void Note(string message)
    {
        try
        {
            Directory.CreateDirectory(LogDir);
            File.AppendAllText(CurrentLogPath, $"[{DateTime.Now:HH:mm:ss.fff}] {message}\r\n");
        }
        catch
        {
        }
    }

    public static void OpenLogFolder()
    {
        try
        {
            Directory.CreateDirectory(LogDir);
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = LogDir,
                UseShellExecute = true,
            });
        }
        catch
        {
        }
    }

    private static void Prune()
    {
        string[] files = Directory.GetFiles(LogDir, "muffin-*.log");
        if (files.Length <= KeepDays)
        {
            return;
        }

        Array.Sort(files); // date-stamped names sort chronologically
        for (int i = 0; i < files.Length - KeepDays; i++)
        {
            try { File.Delete(files[i]); } catch { }
        }
    }
}
