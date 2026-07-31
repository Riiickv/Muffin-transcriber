using System;
using System.Collections.Generic;
using Microsoft.Win32;

namespace MuffinTranscriber;

/// <summary>
/// The "Transcribe with Muffin" entry on Explorer's right-click menu.
///
/// The installer writes these keys on install, and this writes the same ones at
/// runtime so the entry can be turned off and on again from Settings without
/// reinstalling. Both write to exactly the same place, so whichever ran last
/// wins and neither leaves the other's keys behind.
///
/// HKCU, because the installer asks for no elevation and neither should this.
/// SystemFileAssociations rather than the file types themselves, so adding the
/// verb cannot take .mp3 away from whatever plays it.
/// </summary>
public static class ShellIntegration
{
    private const string VerbKey = "MuffinTranscribe";

    private static string ExePath => System.IO.Path.Combine(
        AppModel.AppInstallDir, "MuffinTranscriber.exe");

    private static string SubKeyFor(string extension) =>
        $@"Software\Classes\SystemFileAssociations\{extension}\shell\{VerbKey}";

    /// <summary>True when the entry is registered for the types we accept.</summary>
    public static bool IsInstalled()
    {
        try
        {
            // One probe, not twelve: they are written together and removed
            // together, so the first is a faithful answer for all of them.
            foreach (string extension in AppModel.MediaExtensions)
            {
                using RegistryKey? key = Registry.CurrentUser.OpenSubKey(SubKeyFor(extension));
                return key is not null;
            }
        }
        catch (Exception ex)
        {
            CrashLog.Write("Reading the shell integration", ex);
        }
        return false;
    }

    public static void Install()
    {
        try
        {
            string label = AppStrings.Shell_TranscribeVerb;
            foreach (string extension in AppModel.MediaExtensions)
            {
                using RegistryKey key = Registry.CurrentUser.CreateSubKey(SubKeyFor(extension));
                key.SetValue(null, label);
                key.SetValue("Icon", $"{ExePath},0");
                using RegistryKey command = key.CreateSubKey("command");
                command.SetValue(null, $"\"{ExePath}\" \"%1\"");
            }
        }
        catch (Exception ex)
        {
            // A context-menu entry is a convenience. Failing to write it must
            // never take the app down with it.
            CrashLog.Write("Adding the shell integration", ex);
        }
    }

    public static void Uninstall()
    {
        foreach (string extension in AppModel.MediaExtensions)
        {
            try
            {
                Registry.CurrentUser.DeleteSubKeyTree(SubKeyFor(extension), throwOnMissingSubKey: false);
            }
            catch (Exception ex)
            {
                CrashLog.Write("Removing the shell integration", ex);
            }
        }
    }

    /// <summary>Writes or clears the entry to match the setting.</summary>
    public static void Apply(bool enabled)
    {
        if (enabled) Install();
        else Uninstall();
    }
}
