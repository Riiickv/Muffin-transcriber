using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;

namespace MuffinTranscriber;

public sealed record SettingSpec(
    string Key,          // matches a UserSettings property name
    string Label,
    string Location,     // where the same control lives in the UI
    string Description,
    string Type,         // "boolean" or "enum"
    string[] Options,    // full option list for enum controls
    string ValuesHint);  // compact hint for the model

// One description of the app that both the chat prompt and the tool executor
// read from, so "where is X", "change X" and the inline chat controls stay in
// sync with a single edit here.
public static class AppCapabilities
{
    public static readonly SettingSpec[] Settings =
    [
        new("FormatByDefault", "Format by default", "Settings › Formatting", "Clean up punctuation and capitalization automatically after each transcription.", "boolean", [], "true or false"),
        new("SummarizeByDefault", "Summarize by default", "Home / Record screen", "Produce a bullet-point summary automatically after each transcription.", "boolean", [], "true or false"),
        new("NormalizeAudio", "Normalize audio", "Settings › Transcription Behavior", "Boost quiet audio before transcribing for better accuracy.", "boolean", [], "true or false"),
        new("AutoCopyTranscript", "Auto-copy transcript", "Settings › Transcription Behavior", "Copy the finished transcript to the clipboard automatically.", "boolean", [], "true or false"),
        new("EnableContextLearning", "Context learning", "Settings › AI Context Memory", "Learn jargon and names from your transcripts to improve future ones.", "boolean", [], "true or false"),
        new("EnableAutoUpdateCheck", "Auto-check for updates", "Settings › About", "Ping GitHub on launch to check for a newer version.", "boolean", [], "true or false"),
        new("DefaultLanguage", "Default language", "Settings", "The spoken language to transcribe. Auto-Detect works for any language.", "enum", WhisperLanguages.TranscriptionNames.ToArray(), "a language name (e.g. English, Spanish) or Auto-Detect"),
        new("FormatLanguage", "Output language", "Settings", "The language the formatted and summarized text is written in.", "enum", WhisperLanguages.FormatNames.ToArray(), "a language name, or \"Auto-Detect / Original\" to keep the source language"),
        new("AutoDeleteCacheDuration", "Auto-delete media cache", "Settings › Storage", "How long to keep cached audio/video before deleting it.", "enum", ["Never", "1 Week", "1 Month"], "Never, 1 Week or 1 Month"),
    ];

    public static readonly (string Id, string Name, string Description)[] Screens =
    [
        ("home", "Home", "Drag in or share an audio/video file and transcribe it."),
        ("record", "Record", "Record a voice memo and transcribe it."),
        ("history", "History", "Browse, read and edit past transcriptions."),
        ("chat", "Chat", "This assistant."),
        ("models", "Models", "Download or remove Whisper and LLM models."),
        ("settings", "Settings", "All preferences, storage and appearance."),
    ];

    public static SettingSpec? GetSpec(string key) =>
        Settings.FirstOrDefault(s => string.Equals(s.Key, key, StringComparison.OrdinalIgnoreCase));

    public static string GetValue(UserSettings settings, SettingSpec spec)
    {
        object? value = typeof(UserSettings).GetProperty(spec.Key)?.GetValue(settings);
        if (value is bool b) return b ? "true" : "false";
        return value?.ToString() ?? "";
    }

    // Applies a setting the assistant asked to change and persists it.
    public static void SetValue(SettingSpec spec, object rawValue)
    {
        PropertyInfo? prop = typeof(UserSettings).GetProperty(spec.Key);
        if (prop is null) return;

        UserSettings settings = UserSettings.Load();
        object value;
        if (spec.Type == "boolean")
        {
            value = rawValue is bool b ? b : rawValue?.ToString()?.ToLowerInvariant() is "true" or "on" or "1" or "yes";
        }
        else
        {
            string s = rawValue?.ToString() ?? "";
            value = spec.Options.FirstOrDefault(o => string.Equals(o, s, StringComparison.OrdinalIgnoreCase)) ?? s;
        }

        prop.SetValue(settings, value);
        settings.Save();
    }

    public static string BuildCapabilitiesBlock()
    {
        UserSettings settings = UserSettings.Load();
        string settingLines = string.Join("\n", Settings.Select(spec =>
            $"- {spec.Key} (\"{spec.Label}\") = {GetValue(settings, spec)} | {spec.Description} | set to: {spec.ValuesHint} | found in: {spec.Location}"));

        string screenLines = string.Join("\n", Screens.Select(s => $"- {s.Id} — {s.Name}: {s.Description}"));

        return $"<app_settings>\nThese are the app's settings and their current values. To change one, use SET_SETTING with the exact key and a value from \"set to\". Never invent keys or values.\n{settingLines}\n</app_settings>\n\n<app_screens>\n{screenLines}\n</app_screens>";
    }

    public const string ToolInstructions = @"<tools>
You can act on the app. To do so, add a <tool_call> block with a single JSON object AFTER a short, friendly confirmation sentence. Only use the actions and exact keys listed above.

- Change a setting (applies immediately; the user sees a live control in the chat):
  <tool_call>{""action"": ""SET_SETTING"", ""key"": ""FormatByDefault"", ""value"": true}</tool_call>
- Show a setting's control without changing it (e.g. when asked where it is):
  <tool_call>{""action"": ""SHOW_SETTING"", ""key"": ""AutoCopyTranscript""}</tool_call>
- Go to a screen (use an id from app_screens):
  <tool_call>{""action"": ""NAVIGATE_TO"", ""tab"": ""settings""}</tool_call>
- Delete a transcript (the user is asked to confirm first):
  <tool_call>{""action"": ""DELETE_TRANSCRIPT"", ""transcript_id"": ""the-id-from-history_index""}</tool_call>

Rules:
- Only emit a tool_call when the user actually asks you to do or change something.
- To answer ""where is X"", tell them the location from ""found in"" and use SHOW_SETTING so they can change it right here.
- Never claim you changed something without emitting the matching tool_call.
</tools>";
}
