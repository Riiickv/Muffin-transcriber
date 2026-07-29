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

// Single source of truth for settings and screens, shared by the chat prompt and the tool executor.
public static class AppCapabilities
{
    public static readonly SettingSpec[] Settings =
    [
        new("FormatByDefault", "Improve by default", "Settings", "Clean up punctuation and capitalization automatically after each transcription.", "boolean", [], "true or false"),
        new("SummarizeByDefault", "Summarize by default", "Home / Record screen", "Produce a bullet-point summary automatically after each transcription.", "boolean", [], "true or false"),
        new("NormalizeAudio", "Normalize audio", "Settings › Transcription Behavior", "Boost quiet audio before transcribing for better accuracy.", "boolean", [], "true or false"),
        new("AutoCopyTranscript", "Auto-copy transcript", "Settings › Transcription Behavior", "Copy the finished transcript to the clipboard automatically.", "boolean", [], "true or false"),
        new("EnableContextLearning", "Context learning", "Settings › AI Context Memory", "Learn jargon and names from your transcripts to improve future ones.", "boolean", [], "true or false"),
        new("EnableAutoUpdateCheck", "Auto-check for updates", "Settings › About", "Ping GitHub on launch to check for a newer version.", "boolean", [], "true or false"),
        new("DefaultLanguage", "Default language", "Settings", "The spoken language to transcribe. Auto-Detect works for any language.", "enum", WhisperLanguages.TranscriptionNames.ToArray(), "a language name (e.g. English, Spanish) or Auto-Detect"),
        new("FormatLanguage", "Output language", "Settings", "The language the formatted and summarized text is written in.", "enum", WhisperLanguages.FormatNames.ToArray(), "a language name, or \"Auto-Detect / Original\" to keep the source language"),
        new("AutoDeleteCacheDuration", "Auto-delete media cache", "Settings › Storage", "How long to keep cached audio/video before deleting it.", "enum", ["Never", "1 Week", "1 Month"], "Never, 1 Week or 1 Month"),
        new("ThemeMode", "Theme", "Settings › Appearance", "Light, dark, or pure-black (AMOLED) appearance.", "enum", ThemeHelper.Modes, "System, Light, Dark or AMOLED"),
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

        if (spec.Key == "ThemeMode")
        {
            App.MainWindow?.DispatcherQueue.TryEnqueue(() => ThemeHelper.Apply(App.MainWindow, value.ToString() ?? "System"));
        }
    }

    public static string BuildCapabilitiesBlock()
    {
        UserSettings settings = UserSettings.Load();
        string settingLines = string.Join("\n", Settings.Select(spec =>
            $"- {spec.Key} (\"{spec.Label}\") = {GetValue(settings, spec)} | {spec.Description} | set to: {spec.ValuesHint} | found in: {spec.Location}"));

        string screenLines = string.Join("\n", Screens.Select(s => $"- {s.Id} ({s.Name}): {s.Description}"));

        return $"<app_settings>\nThese are the app's settings and their current values. To change one, use SET_SETTING with the exact key and a value from \"set to\". Never invent keys or values.\n{settingLines}\n</app_settings>\n\n<app_screens>\n{screenLines}\n</app_screens>";
    }

    public const string ToolInstructions = @"<tools>
You can act on the app. To do so, add a <tool_call> block with a single JSON object AFTER a short, friendly confirmation sentence. Only use the actions and exact keys listed above.

- Change a setting. This is the one you want whenever the user says what they want. It applies immediately and the user sees a live control in the chat. ""value"" is REQUIRED: an on/off setting takes true or false, and every other setting takes one of the exact words from its ""set to"" list.
  On/off:  <tool_call>{""action"": ""SET_SETTING"", ""key"": ""FormatByDefault"", ""value"": true}</tool_call>
  A choice: <tool_call>{""action"": ""SET_SETTING"", ""key"": ""ThemeMode"", ""value"": ""Light""}</tool_call>
- Show a setting's control WITHOUT changing it. Only when the user has not said which value they want, or is only asking where it lives:
  <tool_call>{""action"": ""SHOW_SETTING"", ""key"": ""AutoCopyTranscript""}</tool_call>
- Go to a screen (use an id from app_screens):
  <tool_call>{""action"": ""NAVIGATE_TO"", ""tab"": ""settings""}</tool_call>
- Delete a transcript (the user is asked to confirm first):
  <tool_call>{""action"": ""DELETE_TRANSCRIPT"", ""transcript_id"": ""the-id-from-history_index""}</tool_call>
- Rename a transcript. Emit this whenever the user asks to rename something, then say one short sentence like ""Sure - renaming it now."" and nothing else. Do not say it IS renamed. Your job is only WHICH transcript. new_name: include it only if the user said what to call it, and then it is the complete new name on its own - never the old name, and never the old name with something added. If they did not say, leave new_name out. If unsure which transcript, leave transcript_id out too - a wrong id is worse than none:
  <tool_call>{""action"": ""RENAME_TRANSCRIPT"", ""transcript_id"": ""the-id-from-history_index"", ""new_name"": ""exactly-what-the-user-said-to-call-it""}</tool_call>

You may emit SEVERAL <tool_call> blocks in one reply - one per action. If the user asks for three transcripts to be deleted, emit three blocks. Never say you cannot do something just because it takes more than one action.

Every example in these instructions is a SHAPE to follow, never text to copy. Never reuse a name, value or id from an example: they are invented, and using one tells the user something false.

Things you CANNOT do, however the user phrases it:
- Re-transcribe, improve, summarise, export or copy a transcript. Those buttons live on the transcript's own page in History.
- Start or stop a recording, or transcribe a new file.
- Edit or write the words of a transcript.
Asked for one of these, do NOT invent an action for it: an action that does not exist does nothing at all, and the user is told it failed with no idea why. Say in ONE sentence that you cannot do it from the chat, say where it IS done, and offer to take them there. If they say yes, use NAVIGATE_TO.
  Shape: ""I can't re-transcribe from here, but you can from the transcript's page - want me to open it?""

Rules:
- These are the ONLY actions you have. If the user wants something else, say so plainly - do not emit a different action and hope.
- Only emit a tool_call when the user actually asks you to DO or CHANGE something. A question is not a request. ""What is the latest transcript about?"" is answered with a sentence about what it says, and NOTHING else: no setting is shown, no screen is opened. If you are unsure whether they asked you to act, they did not.
- One request, one action. Never fire several unrelated actions in one reply hoping one of them was wanted - that changes the user's app behind their back. Several blocks are only for a request that genuinely names several things (""delete these three"").
- If the user says WHAT THEY WANT, set it. ""I want light mode"", ""switch to light mode"" and ""make it light"" all mean SET_SETTING with key ThemeMode and value ""Light"". Never answer a request with a question about which value they meant when they already said it.
- Saying you will do it is NOT doing it. A sentence like ""I'll switch to Light mode"" with no tool_call changes nothing and the user is left staring at an unchanged app. Every such sentence MUST be accompanied by its SET_SETTING block.
- Never use SHOW_SETTING as a substitute for SET_SETTING. If the user named a value, changing it is the answer; showing them the control instead is a failure.
- Never ask ""would you like me to?"" or ""shall I go ahead?"". You genuinely have these tools: emit the tool_call. The app asks for confirmation itself where one is needed.
- If the user agrees to something you just offered (""yes"", ""do it""), emit the tool_call for it in your very next reply.
- SHOW_SETTING only shows a control, it changes nothing. Use it for ""where is X"" or when they have not said which value they want.
- To answer ""where is X"", tell them the location from ""found in"" and use SHOW_SETTING so they can change it right here.
- Never claim you changed something without emitting the matching tool_call.
- The user never sees the tool_call, only your sentence, so say what you are doing in plain words. Never write tool_call, JSON, key or action in your reply.
</tools>";
}
