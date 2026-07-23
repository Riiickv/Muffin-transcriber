namespace MuffinTranscriber;

public static class AppStrings
{
    // GLOBAL / NAVIGATION
    public static string Nav_Home => LocalizationManager.GetString("Nav_Home", "Muffin!");
    public static string Nav_Record => LocalizationManager.GetString("Nav_Record", "Record");
    public static string Nav_History => LocalizationManager.GetString("Nav_History", "History");
    public static string Nav_Chat => LocalizationManager.GetString("Nav_Chat", "Chat");
    public static string Nav_Models => LocalizationManager.GetString("Nav_Models", "Models");
    public static string Nav_Settings => LocalizationManager.GetString("Nav_Settings", "Settings");

    public static string App_Title => LocalizationManager.GetString("App_Title", "Muffin Transcriber");

    // COMMON
    public static string Common_NoModelInstalled => LocalizationManager.GetString("Common_NoModelInstalled", "No model installed");
    public static string AppVersion => LocalizationManager.GetString("AppVersion", "v1.2.2");
    public static string Credits => LocalizationManager.GetString("Credits", "made by Rick in his free time");
    public static string Settings_BtnChangelog => LocalizationManager.GetString("Settings_BtnChangelog", "View Changelog");

    // MAIN WINDOW
    public static string Main_Status_MiniWindowOpen => LocalizationManager.GetString("Main_Status_MiniWindowOpen", "Mini-Muffin is open.");
    public static string Main_Status_ModelsNotInstalled => LocalizationManager.GetString("Main_Status_ModelsNotInstalled", "You have not installed any model, go to the Models tab to get started.");

    // MINI WINDOW
    public static string Mini_DropFileHere => LocalizationManager.GetString("Mini_DropFileHere", "Drop File Here");
    public static string Mini_Tooltip_Copy => LocalizationManager.GetString("Mini_Tooltip_Copy", "Copy");
    public static string Mini_Tooltip_Format => LocalizationManager.GetString("Mini_Tooltip_Format", "Format");
    public static string Mini_Status_Transcribing => LocalizationManager.GetString("Mini_Status_Transcribing", "Mini Muffin is transcribing...");
    public static string Mini_Status_Done => LocalizationManager.GetString("Mini_Status_Done", "Done");
    public static string Mini_Status_Error => LocalizationManager.GetString("Mini_Status_Error", "Error: ");
    public static string Mini_Status_NoWhisper => LocalizationManager.GetString("Mini_Status_NoWhisper", "No Whisper model installed!");
    public static string Mini_Status_NoFormatter => LocalizationManager.GetString("Mini_Status_NoFormatter", "No Formatter model installed!");
    public static string Mini_Status_NoSpeech => LocalizationManager.GetString("Mini_Status_NoSpeech", "No speech detected in this file.");
    public static string Mini_Status_Loading => LocalizationManager.GetString("Mini_Status_Loading", "Loading file...");
    public static string Mini_Status_NoFile => LocalizationManager.GetString("Mini_Status_NoFile", "No file was shared.");
    public static string Mini_Status_Copied => LocalizationManager.GetString("Mini_Status_Copied", "Copied!");
    public static string Mini_Status_Formatting => LocalizationManager.GetString("Mini_Status_Formatting", "Formatting...");
    public static string Mini_Status_Formatted => LocalizationManager.GetString("Mini_Status_Formatted", "Formatted");
    public static string Mini_Status_FormatFailed => LocalizationManager.GetString("Mini_Status_FormatFailed", "Format Failed");
    public static string Mini_Error_Generic => LocalizationManager.GetString("Mini_Error_Generic", "Transcription failed.");
    public static string Mini_Tooltip_OpenApp => LocalizationManager.GetString("Mini_Tooltip_OpenApp", "Open Full App");

    // HOME PAGE
    public static string Home_Title => LocalizationManager.GetString("Home_Title", "Muffin!");

    // Drop Zone
    public static string Home_DropZoneText => LocalizationManager.GetString("Home_DropZoneText", "Drag & Drop any audio or video file");
    public static string Home_OrClickToBrowse => LocalizationManager.GetString("Home_OrClickToBrowse", "or click to browse");
    public static string Home_DropCaption => LocalizationManager.GetString("Home_DropCaption", "Drop to transcribe");

    // Configuration
    public static string Home_ConfigurationTitle => LocalizationManager.GetString("Home_ConfigurationTitle", "Configuration");
    public static string Home_LanguageLabel => LocalizationManager.GetString("Home_LanguageLabel", "Language:");
    public static string Home_WhisperModelLabel => LocalizationManager.GetString("Home_WhisperModelLabel", "Whisper Model:");

    // Actions
    public static string Home_TranscribeButton => LocalizationManager.GetString("Home_TranscribeButton", "Transcribe");
    public static string Home_ProcessAllButton => LocalizationManager.GetString("Home_ProcessAllButton", "Process All");
    public static string Home_FormatSwitch => LocalizationManager.GetString("Home_FormatSwitch", "Auto format");
    public static string Home_SummarizeSwitch => LocalizationManager.GetString("Home_SummarizeSwitch", "Auto summarize");

    // LLM Formatter Config
    public static string Home_FormatModelLabel => LocalizationManager.GetString("Home_FormatModelLabel", "Format Model");
    public static string Home_FormatLanguageLabel => LocalizationManager.GetString("Home_FormatLanguageLabel", "Format Language");
    public static string Home_CustomPromptLabel => LocalizationManager.GetString("Home_CustomPromptLabel", "Custom Instruction");

    // Transcript Output
    public static string Home_TranscriptTitle => LocalizationManager.GetString("Home_TranscriptTitle", "Transcript");
    public static string Home_TabRaw => LocalizationManager.GetString("Home_TabRaw", "Raw");
    public static string Home_TabFormatted => LocalizationManager.GetString("Home_TabFormatted", "Formatted");
    public static string Home_TabSummary => LocalizationManager.GetString("Home_TabSummary", "Summary");
    public static string Home_CopyButton => LocalizationManager.GetString("Home_CopyButton", "Copy");
    public static string Home_TranscriptPlaceholder => LocalizationManager.GetString("Home_TranscriptPlaceholder", "Transcript will appear here.");
    public static string Home_CustomPromptPlaceholder => LocalizationManager.GetString("Home_CustomPromptPlaceholder", "Clean up punctuation and paragraphs with a local LLM.");

    // Status Messages
    public static string Home_Status_NoFormatter => LocalizationManager.GetString("Home_Status_NoFormatter", "No formatter installed");
    public static string Home_Status_InvalidFile => LocalizationManager.GetString("Home_Status_InvalidFile", "Use an audio or video file.");
    public static string Home_Status_FileReady => LocalizationManager.GetString("Home_Status_FileReady", "File ready.");
    public static string Home_Status_CheckingDuplicate => LocalizationManager.GetString("Home_Status_CheckingDuplicate", "Checking for duplicate...");
    public static string Home_Status_LoadedFromHistory => LocalizationManager.GetString("Home_Status_LoadedFromHistory", "Loaded from history.");
    public static string Home_Status_LoadedFromHistoryCopied => LocalizationManager.GetString("Home_Status_LoadedFromHistoryCopied", "Loaded from history and copied.");
    public static string Home_Status_CachingMedia => LocalizationManager.GetString("Home_Status_CachingMedia", "Caching media file to internal storage...");
    public static string Home_Status_PreparingAudio => LocalizationManager.GetString("Home_Status_PreparingAudio", "Preparing audio...");
    public static string Home_Status_TranscribingWhisper => LocalizationManager.GetString("Home_Status_TranscribingWhisper", "Transcribing");
    public static string Home_Status_FormattingLLM => LocalizationManager.GetString("Home_Status_FormattingLLM", "Formatting transcript");
    public static string Home_Status_SummarizingLLM => LocalizationManager.GetString("Home_Status_SummarizingLLM", "Summarizing transcript");
    public static string Home_Status_TranscriptionCompleteCopied => LocalizationManager.GetString("Home_Status_TranscriptionCompleteCopied", "Transcription complete and copied.");
    public static string Home_Status_TranscriptionComplete => LocalizationManager.GetString("Home_Status_TranscriptionComplete", "Transcription complete.");
    public static string Home_Status_CopiedToClipboard => LocalizationManager.GetString("Home_Status_CopiedToClipboard", "Copied to clipboard.");
    public static string Home_Status_QueuedMultiple => LocalizationManager.GetString("Home_Status_QueuedMultiple", "{0} files queued.");
    public static string Home_Status_BatchProgress => LocalizationManager.GetString("Home_Status_BatchProgress", "Processing {0} of {1}: {2}");
    public static string Home_Status_BatchComplete => LocalizationManager.GetString("Home_Status_BatchComplete", "Batch processing complete. {0} files processed.");
    public static string Home_Status_NoSpeechDetected => LocalizationManager.GetString("Home_Status_NoSpeechDetected", "No speech detected in {0}.");

    // RECORD PAGE
    public static string Record_Title => LocalizationManager.GetString("Record_Title", "Voice Memos");
    public static string Record_StartButton => LocalizationManager.GetString("Record_StartButton", "Start Recording");
    public static string Record_StopButton => LocalizationManager.GetString("Record_StopButton", "Stop Recording");
    public static string Record_Instructions => LocalizationManager.GetString("Record_Instructions", "");
    public static string Record_Status_NoAudioDetected => LocalizationManager.GetString("Record_Status_NoAudioDetected", "No speech detected. If your mic works elsewhere, check Windows Settings → Privacy → Microphone and enable 'Let desktop apps access your microphone'.");
    public static string Record_Status_NoMic => LocalizationManager.GetString("Record_Status_NoMic", "No microphones detected! Please plug in a microphone.");
    public static string Record_Status_Processing => LocalizationManager.GetString("Record_Status_Processing", "Processing...");
    public static string Record_Status_Wait => LocalizationManager.GetString("Record_Status_Wait", "Wait...");
    public static string Record_Status_MicFailedFormat => LocalizationManager.GetString("Record_Status_MicFailedFormat", "Failed to access microphone. {0}");
    public static string Record_VoiceMemoName => LocalizationManager.GetString("Record_VoiceMemoName", "Voice Memo");

    // CHAT PAGE
    public static string Chat_Title => LocalizationManager.GetString("Chat_Title", "Chat");
    public static string Chat_NewChat => LocalizationManager.GetString("Chat_NewChat", "New chat");
    public static string Chat_EmptyHint => LocalizationManager.GetString("Chat_EmptyHint", "Ask me anything about your transcripts — or tell me to change a setting, open a screen, or delete a transcript.");
    public static string Chat_InputPlaceholder => LocalizationManager.GetString("Chat_InputPlaceholder", "Ask about your transcripts...");
    public static string Chat_NoModel => LocalizationManager.GetString("Chat_NoModel", "No local LLM is installed. Download one from the Models tab to use the assistant.");
    public static string Chat_Thinking => LocalizationManager.GetString("Chat_Thinking", "Thinking...");
    public static string Chat_Done => LocalizationManager.GetString("Chat_Done", "Done.");
    public static string Chat_DeleteTitle => LocalizationManager.GetString("Chat_DeleteTitle", "Delete transcript?");
    public static string Chat_DeleteConfirm => LocalizationManager.GetString("Chat_DeleteConfirm", "Delete “{0}”? This can't be undone.");
    public static string Chat_Delete => LocalizationManager.GetString("Chat_Delete", "Delete");
    public static string Chat_Cancel => LocalizationManager.GetString("Chat_Cancel", "Cancel");

    // HISTORY PAGE
    public static string History_Title => LocalizationManager.GetString("History_Title", "Transcription History");

    // Actions
    public static string History_BtnReTranscribe => LocalizationManager.GetString("History_BtnReTranscribe", "Re-Transcribe");
    public static string History_LanguageLabel => LocalizationManager.GetString("History_LanguageLabel", "Language");
    public static string History_CustomPromptTitle => LocalizationManager.GetString("History_CustomPromptTitle", "Custom Prompt");
    public static string History_CustomPromptPlaceholder => LocalizationManager.GetString("History_CustomPromptPlaceholder", "Override format/summarize instructions for the selected item...");

    public static string History_ExportBtn => LocalizationManager.GetString("History_ExportBtn", "Export");
    public static string History_ExportText => LocalizationManager.GetString("History_ExportText", "Export as Text (.txt)");
    public static string History_ExportSrt => LocalizationManager.GetString("History_ExportSrt", "Export as Subtitles (.srt)");
    public static string History_ExportVtt => LocalizationManager.GetString("History_ExportVtt", "Export as WebVTT (.vtt)");

    public static string History_EmptyDetailsText => LocalizationManager.GetString("History_EmptyDetailsText", "Select a transcription to view details.");

    public static string History_Dialog_RenameTitle => LocalizationManager.GetString("History_Dialog_RenameTitle", "Rename File");
    public static string History_NoLlmInstalled => LocalizationManager.GetString("History_NoLlmInstalled", "No LLM installed");
    public static string History_NoWhisperInstalled => LocalizationManager.GetString("History_NoWhisperInstalled", "No Whisper installed");
    public static string History_Tooltip_Rename => LocalizationManager.GetString("History_Tooltip_Rename", "Rename");
    public static string History_Tooltip_Delete => LocalizationManager.GetString("History_Tooltip_Delete", "Delete");
    public static string History_Tooltip_Format => LocalizationManager.GetString("History_Tooltip_Format", "Format Transcript");
    public static string History_Tooltip_Summarize => LocalizationManager.GetString("History_Tooltip_Summarize", "Summarize Transcript");
    public static string History_Status_SelectFormatter => LocalizationManager.GetString("History_Status_SelectFormatter", "Please select a formatter model.");
    public static string History_Status_FormatComplete => LocalizationManager.GetString("History_Status_FormatComplete", "Formatting complete.");
    public static string History_Status_FormatFailed => LocalizationManager.GetString("History_Status_FormatFailed", "Formatting returned empty or failed.");
    public static string History_Status_NoSubtitles => LocalizationManager.GetString("History_Status_NoSubtitles", "No subtitle data available for this transcript. Please re-transcribe the file.");
    public static string History_Status_SelectSummarizer => LocalizationManager.GetString("History_Status_SelectSummarizer", "Please select a summarization model.");
    public static string History_Status_SummaryComplete => LocalizationManager.GetString("History_Status_SummaryComplete", "Summarization complete.");
    public static string History_Status_SummaryFailed => LocalizationManager.GetString("History_Status_SummaryFailed", "Summarization returned empty or failed.");
    public static string History_Status_SelectWhisper => LocalizationManager.GetString("History_Status_SelectWhisper", "Please select a Whisper model.");
    public static string History_Status_RetranscribeComplete => LocalizationManager.GetString("History_Status_RetranscribeComplete", "Re-transcription complete.");

    public static string History_AddToCalendar => LocalizationManager.GetString("History_AddToCalendar", "Find dates & add to calendar");
    public static string History_FindingDates => LocalizationManager.GetString("History_FindingDates", "Looking for dates and events...");
    public static string History_NoDatesFound => LocalizationManager.GetString("History_NoDatesFound", "No dates or events found.");
    public static string History_DatesFoundTitle => LocalizationManager.GetString("History_DatesFoundTitle", "Dates & events");
    public static string History_AddButton => LocalizationManager.GetString("History_AddButton", "Add");
    public static string History_CalendarHint => LocalizationManager.GetString("History_CalendarHint", "Opens in your calendar app — set the exact date and time there.");
    public static string History_Close => LocalizationManager.GetString("History_Close", "Close");

    // MODELS PAGE
    public static string Models_Title => LocalizationManager.GetString("Models_Title", "Manage Models");
    public static string Models_Instructions => LocalizationManager.GetString("Models_Instructions", "Download at least one Whisper model (for transcription) and one LLM (for formatting/summarization).");

    // Whisper Models
    public static string Models_WhisperSectionTitle => LocalizationManager.GetString("Models_WhisperSectionTitle", "Whisper Models (Transcription)");
    public static string Models_WhisperSectionDesc => LocalizationManager.GetString("Models_WhisperSectionDesc", "Download or remove local Whisper models.");

    // Formatter Models
    public static string Models_FormatterSectionTitle => LocalizationManager.GetString("Models_FormatterSectionTitle", "Formatter Models (Local LLMs)");
    public static string Models_FormatterSectionDesc => LocalizationManager.GetString("Models_FormatterSectionDesc", "Download local LLMs for formatting.");

    public static string Models_EmbeddingSectionTitle => LocalizationManager.GetString("Models_EmbeddingSectionTitle", "Semantic Search (Chat)");
    public static string Models_EmbeddingSectionDesc => LocalizationManager.GetString("Models_EmbeddingSectionDesc", "Optional tiny model that lets Chat find transcripts by meaning, not just keywords.");

    // Button States
    public static string Models_BtnDownload => LocalizationManager.GetString("Models_BtnDownload", "Download");
    public static string Models_BtnCancel => LocalizationManager.GetString("Models_BtnCancel", "Cancel");
    public static string Models_BtnDelete => LocalizationManager.GetString("Models_BtnDelete", "Delete");
    public static string Models_Downloaded => LocalizationManager.GetString("Models_Downloaded", "Downloaded");

    // Model Status Messages
    public static string Models_Status_DownloadFailed => LocalizationManager.GetString("Models_Status_DownloadFailed", "Download failed!");
    public static string Models_Status_Cancelled => LocalizationManager.GetString("Models_Status_Cancelled", "Download cancelled.");
    public static string Models_Status_OneAtATime => LocalizationManager.GetString("Models_Status_OneAtATime", "Finish or cancel the current download first.");
    public static string Models_Status_InUse => LocalizationManager.GetString("Models_Status_InUse", "Couldn't delete — the model is in use. Try again in a moment.");
    public static string Models_Status_Installed => LocalizationManager.GetString("Models_Status_Installed", "Installed");
    public static string Models_Status_Broken => LocalizationManager.GetString("Models_Status_Broken", "Broken Download");
    public static string Models_Status_NotInstalled => LocalizationManager.GetString("Models_Status_NotInstalled", "Not Installed");

    // Dynamic Formats
    public static string Models_Status_DeletedFormat => LocalizationManager.GetString("Models_Status_DeletedFormat", "{0} deleted.");
    public static string Models_Status_DownloadingFormat => LocalizationManager.GetString("Models_Status_DownloadingFormat", "Downloading {0}...");
    public static string Models_Status_DownloadingProgressFormat => LocalizationManager.GetString("Models_Status_DownloadingProgressFormat", "Downloading {0} ({1} GB / {2} GB) - {3} MB/s - {4} remaining");
    public static string Models_Status_InstalledFormat => LocalizationManager.GetString("Models_Status_InstalledFormat", "{0} installed.");

    // SETTINGS PAGE
    public static string Settings_Title => LocalizationManager.GetString("Settings_Title", "Settings");

    public static string Settings_DefaultsHeader => LocalizationManager.GetString("Settings_DefaultsHeader", "Defaults");
    
    // Personalization
    public static string Settings_PersonalizationTitle => LocalizationManager.GetString("Settings_PersonalizationTitle", "Personalization");
    public static string Settings_LanguageTitle => LocalizationManager.GetString("Settings_LanguageTitle", "App Language");
    public static string Settings_LanguageDesc => LocalizationManager.GetString("Settings_LanguageDesc", "Select the UI language.");

    public static string Settings_AppearanceHeader => LocalizationManager.GetString("Settings_AppearanceHeader", "Appearance");
    public static string Settings_ThemeTitle => LocalizationManager.GetString("Settings_ThemeTitle", "Theme");
    public static string Settings_ThemeDesc => LocalizationManager.GetString("Settings_ThemeDesc", "Choose light, dark, or pure-black (AMOLED).");

    public static string Settings_AccentTitle => LocalizationManager.GetString("Settings_AccentTitle", "Accent colour");
    public static string Settings_AccentDesc => LocalizationManager.GetString("Settings_AccentDesc", "The highlight colour used across the app.");
    public static string Settings_AccentMuffin => LocalizationManager.GetString("Settings_AccentMuffin", "Muffin");
    public static string Settings_AccentGreen => LocalizationManager.GetString("Settings_AccentGreen", "Green");
    public static string Settings_AccentPurple => LocalizationManager.GetString("Settings_AccentPurple", "Purple");
    public static string Settings_AccentRed => LocalizationManager.GetString("Settings_AccentRed", "Red");

    public static string Settings_TypewriterTitle => LocalizationManager.GetString("Settings_TypewriterTitle", "Typewriter effect");
    public static string Settings_TypewriterDesc => LocalizationManager.GetString("Settings_TypewriterDesc", "Type transcripts out as they arrive instead of showing them all at once.");
    public static string Settings_TypewriterSpeedTitle => LocalizationManager.GetString("Settings_TypewriterSpeedTitle", "Typing speed");
    public static string Settings_TypewriterSpeedDesc => LocalizationManager.GetString("Settings_TypewriterSpeedDesc", "How fast the typewriter reveals text.");
    public static string Settings_SpeedSlow => LocalizationManager.GetString("Settings_SpeedSlow", "Slow");
    public static string Settings_SpeedBalanced => LocalizationManager.GetString("Settings_SpeedBalanced", "Balanced");
    public static string Settings_SpeedFast => LocalizationManager.GetString("Settings_SpeedFast", "Fast");

    public static string Settings_DefaultLanguageTitle => LocalizationManager.GetString("Settings_DefaultLanguageTitle", "Default language");
    public static string Settings_DefaultLanguageDesc => LocalizationManager.GetString("Settings_DefaultLanguageDesc", "Preselect this language when opening Transcription.");

    public static string Settings_AutoSelectModel => LocalizationManager.GetString("Settings_AutoSelectModel", "Auto-select best installed model");
    public static string Settings_Status_Saved => LocalizationManager.GetString("Settings_Status_Saved", "Settings saved.");
    public static string Settings_PrefWhisperTitle => LocalizationManager.GetString("Settings_PrefWhisperTitle", "Preferred Whisper model");
    public static string Settings_PrefWhisperDesc => LocalizationManager.GetString("Settings_PrefWhisperDesc", "Use this installed model first when available.");

    public static string Settings_FormattingHeader => LocalizationManager.GetString("Settings_FormattingHeader", "Formatting");
    public static string Settings_FormatByDefaultTitle => LocalizationManager.GetString("Settings_FormatByDefaultTitle", "Format by default");
    public static string Settings_FormatByDefaultDesc => LocalizationManager.GetString("Settings_FormatByDefaultDesc", "Enable transcript cleanup automatically.");
    public static string Settings_FormatLanguageTitle => LocalizationManager.GetString("Settings_FormatLanguageTitle", "Default format language");
    public static string Settings_FormatLanguageDesc => LocalizationManager.GetString("Settings_FormatLanguageDesc", "Used when formatting is enabled.");

    public static string Settings_BehaviorHeader => LocalizationManager.GetString("Settings_BehaviorHeader", "Transcription Behavior");
    public static string Settings_AudioNormTitle => LocalizationManager.GetString("Settings_AudioNormTitle", "Normalize audio");
    public static string Settings_AudioNormDesc => LocalizationManager.GetString("Settings_AudioNormDesc", "Apply high-pass, low-pass, and loudness normalization before Whisper.");

    public static string Settings_AutoCopyTitle => LocalizationManager.GetString("Settings_AutoCopyTitle", "Auto-copy finished transcript");
    public static string Settings_AutoCopyDesc => LocalizationManager.GetString("Settings_AutoCopyDesc", "Copy the final transcript to the clipboard when processing completes.");

    public static string Settings_PromptsHeader => LocalizationManager.GetString("Settings_PromptsHeader", "Custom System Prompts");
    public static string Settings_CustomFormatTitle => LocalizationManager.GetString("Settings_CustomFormatTitle", "Custom Format Prompt");
    public static string Settings_CustomFormatDesc => LocalizationManager.GetString("Settings_CustomFormatDesc", "Override the default system prompt used for formatting. Leave empty to use the default.");
    public static string Settings_CustomSummaryTitle => LocalizationManager.GetString("Settings_CustomSummaryTitle", "Custom Summary Prompt");
    public static string Settings_CustomSummaryDesc => LocalizationManager.GetString("Settings_CustomSummaryDesc", "Override the default system prompt used for summarization. Leave empty to use the default.");
    public static string Settings_BtnResetPrompt => LocalizationManager.GetString("Settings_BtnResetPrompt", "Reset format prompt");
    public static string Settings_BtnResetSummary => LocalizationManager.GetString("Settings_BtnResetSummary", "Reset summary prompt");

    public static string Settings_MemoryHeader => LocalizationManager.GetString("Settings_MemoryHeader", "AI Context Memory");
    public static string Settings_ContextLearnTitle => LocalizationManager.GetString("Settings_ContextLearnTitle", "Enable context learning");
    public static string Settings_ContextLearnDesc => LocalizationManager.GetString("Settings_ContextLearnDesc", "Automatically learn and remember your specific jargon and transcription habits to improve accuracy over time.");
    public static string Settings_ManageMemoryTitle => LocalizationManager.GetString("Settings_ManageMemoryTitle", "Manage memory bank");
    public static string Settings_ManageMemoryDesc => LocalizationManager.GetString("Settings_ManageMemoryDesc", "View, edit, or clear the terms the AI has learned from your previous transcriptions.");
    public static string Settings_BtnEditMemory => LocalizationManager.GetString("Settings_BtnEditMemory", "Edit Memory");
    public static string Settings_BtnClear => LocalizationManager.GetString("Settings_BtnClear", "Clear");

    public static string Settings_StorageHeader => LocalizationManager.GetString("Settings_StorageHeader", "Storage");
    public static string Settings_AutoDeleteTitle => LocalizationManager.GetString("Settings_AutoDeleteTitle", "Auto-delete media cache");
    public static string Settings_AutoDeleteDesc => LocalizationManager.GetString("Settings_AutoDeleteDesc", "Automatically delete cached audio and video files.");
    public static string Settings_AudioCacheTitle => LocalizationManager.GetString("Settings_AudioCacheTitle", "Audio cache");
    public static string Settings_AudioCacheDesc => LocalizationManager.GetString("Settings_AudioCacheDesc", "Clear original audio files saved for re-transcription.");
    public static string Settings_VideoCacheTitle => LocalizationManager.GetString("Settings_VideoCacheTitle", "Video cache");
    public static string Settings_VideoCacheDesc => LocalizationManager.GetString("Settings_VideoCacheDesc", "Clear original video files saved for re-transcription.");

    public static string Settings_ManageModelsTitle => LocalizationManager.GetString("Settings_ManageModelsTitle", "AI models");
    public static string Settings_ManageModelsDesc => LocalizationManager.GetString("Settings_ManageModelsDesc", "Download or remove the models Muffin uses to transcribe and format.");
    public static string Settings_BtnManageModels => LocalizationManager.GetString("Settings_BtnManageModels", "Manage models");
    public static string Settings_ModelsFolderTitle => LocalizationManager.GetString("Settings_ModelsFolderTitle", "Models folder");
    public static string Settings_ModelsFolderDesc => LocalizationManager.GetString("Settings_ModelsFolderDesc", "Open the folder where Whisper and formatter models are stored.");
    public static string Settings_BtnOpen => LocalizationManager.GetString("Settings_BtnOpen", "Open");

    public static string Settings_MicHeader => LocalizationManager.GetString("Settings_MicHeader", "Permissions");
    public static string Settings_MicTitle => LocalizationManager.GetString("Settings_MicTitle", "Microphone access");
    public static string Settings_MicDesc => LocalizationManager.GetString("Settings_MicDesc", "Windows requires you to enable 'Let desktop apps access your microphone' to use the Voice Memos feature.");
    public static string Settings_BtnOpenMic => LocalizationManager.GetString("Settings_BtnOpenMic", "Open Windows Settings");

    public static string Settings_ResetTitle => LocalizationManager.GetString("Settings_ResetTitle", "Reset settings");
    public static string Settings_ResetDesc => LocalizationManager.GetString("Settings_ResetDesc", "Restore all WinUI app preferences to defaults.");
    public static string Settings_BtnReset => LocalizationManager.GetString("Settings_BtnReset", "Reset");

    // Status Messages
    public static string Settings_Status_Reset => LocalizationManager.GetString("Settings_Status_Reset", "Settings reset.");
    public static string Settings_Status_AudioCacheCleared => LocalizationManager.GetString("Settings_Status_AudioCacheCleared", "Audio cache cleared.");
    public static string Settings_Status_VideoCacheCleared => LocalizationManager.GetString("Settings_Status_VideoCacheCleared", "Video cache cleared.");
    public static string Settings_Status_MemoryUpdated => LocalizationManager.GetString("Settings_Status_MemoryUpdated", "AI memory updated.");
    public static string Settings_Status_MemoryCleared => LocalizationManager.GetString("Settings_Status_MemoryCleared", "AI memory cleared.");

    // Dialog Strings
    public static string Settings_Dialog_EditMemoryTitle => LocalizationManager.GetString("Settings_Dialog_EditMemoryTitle", "Edit Memory");
    public static string Settings_Dialog_Save => LocalizationManager.GetString("Settings_Dialog_Save", "Save");
    public static string Settings_Dialog_Cancel => LocalizationManager.GetString("Settings_Dialog_Cancel", "Cancel");

    // SETUP WIZARD
    public static string Setup_Title => LocalizationManager.GetString("Setup_Title", "Welcome to Muffin!");
    public static string Setup_Subtitle => LocalizationManager.GetString("Setup_Subtitle", "Free, private, 100% offline transcription. Muffin runs AI models on your own PC, so nothing ever leaves it. Grab the recommended models below (one-time download) and you're set.");
    public static string Setup_WhisperCardTitle => LocalizationManager.GetString("Setup_WhisperCardTitle", "Transcription model (required)");
    public static string Setup_WhisperCardDesc => LocalizationManager.GetString("Setup_WhisperCardDesc", "Whisper [small]: the best balance of speed and accuracy. 466 MB.");
    public static string Setup_LlmCardTitle => LocalizationManager.GetString("Setup_LlmCardTitle", "Formatting model (optional)");
    public static string Setup_LlmCardDesc => LocalizationManager.GetString("Setup_LlmCardDesc", "Qwen 2.5 [1.5B]: adds punctuation, cleanup and summaries. 1.1 GB.");
    public static string Setup_BtnDownload => LocalizationManager.GetString("Setup_BtnDownload", "Download");
    public static string Setup_BtnDownloaded => LocalizationManager.GetString("Setup_BtnDownloaded", "Installed");
    public static string Setup_BtnSkip => LocalizationManager.GetString("Setup_BtnSkip", "Skip for now");
    public static string Setup_BtnFinish => LocalizationManager.GetString("Setup_BtnFinish", "Start using Muffin");
    public static string Setup_MoreModelsHint => LocalizationManager.GetString("Setup_MoreModelsHint", "You can add or remove models at any time from the Models tab.");
    public static string Setup_Status_DownloadFailedFormat => LocalizationManager.GetString("Setup_Status_DownloadFailedFormat", "Download failed: {0}");

    // ENGINE HEALTH / CRASH REPORTING
    public static string Health_BannerTitle => LocalizationManager.GetString("Health_BannerTitle", "Muffin can't start its engines");
    public static string Health_RuntimeMissingBody => LocalizationManager.GetString("Health_RuntimeMissingBody", "Windows is missing a component the transcription engines need (the Microsoft Visual C++ runtime). Install it, then restart Muffin.");
    public static string Health_EnginesMissingBody => LocalizationManager.GetString("Health_EnginesMissingBody", "The engine files are missing from Muffin's folder. Reinstall Muffin with the full installer to restore them.");
    public static string Health_UnknownBodyFormat => LocalizationManager.GetString("Health_UnknownBodyFormat", "An engine failed to start ({0}). Transcription may not work. Reinstalling Muffin usually fixes this.");
    public static string Health_BtnInstallRuntime => LocalizationManager.GetString("Health_BtnInstallRuntime", "Install component");
    public static string Health_BtnGetInstaller => LocalizationManager.GetString("Health_BtnGetInstaller", "Get installer");
    public static string Crash_BannerTitle => LocalizationManager.GetString("Crash_BannerTitle", "Something went wrong");
    public static string Crash_BannerBody => LocalizationManager.GetString("Crash_BannerBody", "Muffin hit an unexpected error but kept running. If something looks stuck, restart the app. Technical details were saved to the log.");
    public static string Crash_BtnOpenLog => LocalizationManager.GetString("Crash_BtnOpenLog", "Open log");

    // TRANSCRIPTION PROGRESS / CANCEL
    public static string Home_CancelButton => LocalizationManager.GetString("Home_CancelButton", "Cancel");
    public static string Home_Status_Cancelled => LocalizationManager.GetString("Home_Status_Cancelled", "Cancelled.");
    public static string Home_Status_TranscribingPercentFormat => LocalizationManager.GetString("Home_Status_TranscribingPercentFormat", "Transcribing {0}%");

    // AUTO UPDATER
    public static string Update_BannerTitle => LocalizationManager.GetString("Update_BannerTitle", "Muffin update available!");
    public static string Update_BtnUpdate => LocalizationManager.GetString("Update_BtnUpdate", "Update!");
    public static string Update_BtnRestart => LocalizationManager.GetString("Update_BtnRestart", "Restart");
    public static string Update_BtnDownloading => LocalizationManager.GetString("Update_BtnDownloading", "Downloading update...");
    public static string Update_StatusReady => LocalizationManager.GetString("Update_StatusReady", "Muffin update ready to install!");
    public static string Update_StatusAvailableFormat => LocalizationManager.GetString("Update_StatusAvailableFormat", "Version {0} is available.");
    public static string Update_StatusFailedFormat => LocalizationManager.GetString("Update_StatusFailedFormat", "Download failed: {0}");
    public static string Update_StatusInstallCancelled => LocalizationManager.GetString("Update_StatusInstallCancelled", "Update install was cancelled. Click Restart to try again.");
    
    public static string Settings_AboutHeader => LocalizationManager.GetString("Settings_AboutHeader", "About");
    public static string Settings_AutoUpdateTitle => LocalizationManager.GetString("Settings_AutoUpdateTitle", "Auto-check for updates");
    public static string Settings_AutoUpdateDesc => LocalizationManager.GetString("Settings_AutoUpdateDesc", "The app pings GitHub on launch just to see if there's a newer version. Turn it off if you'd rather it stayed fully offline.");
    public static string Settings_BtnCheckUpdates => LocalizationManager.GetString("Settings_BtnCheckUpdates", "Check for updates");
    public static string Settings_UpdateChecking => LocalizationManager.GetString("Settings_UpdateChecking", "Checking...");
    public static string Settings_UpdateFound => LocalizationManager.GetString("Settings_UpdateFound", "Update found!");
    public static string Settings_UpdateUpToDate => LocalizationManager.GetString("Settings_UpdateUpToDate", "Up to date");
}
