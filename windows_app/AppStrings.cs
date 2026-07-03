namespace MuffinTranscriber;

public static class AppStrings
{
    // ==========================================
    // GLOBAL / NAVIGATION
    // ==========================================
    public static string Nav_Home => "Muffin!";
    public static string Nav_Record => "Record";
    public static string Nav_History => "History";
    public static string Nav_Models => "Models";
    public static string Nav_Settings => "Settings";

    public static string App_Title => "Muffin Transcriber";
    public static string AppVersion => "v1.2.0";
    public static string Credits => "made by Rick in his free time";
    public static string Settings_BtnChangelog => "View Changelog";

    // ==========================================
    // MAIN WINDOW
    // ==========================================
    public static string Main_Status_MiniWindowOpen => "Mini-Muffin is open.";
    public static string Main_Status_ModelsNotInstalled => "You have not installed any model, go to the Models tab to get started.";

    // ==========================================
    // MINI WINDOW
    // ==========================================
    public static string Mini_DropFileHere => "Drop File Here";
    public static string Mini_Tooltip_Copy => "Copy";
    public static string Mini_Tooltip_Format => "Format";
    public static string Mini_Status_Transcribing => "Mini Muffin is transcribing...";
    public static string Mini_Status_Done => "Done";
    public static string Mini_Status_Error => "Error: ";
    public static string Mini_Status_NoWhisper => "No Whisper model installed!";
    public static string Mini_Status_NoFormatter => "No Formatter model installed!";

    // ==========================================
    // HOME PAGE
    // ==========================================
    public static string Home_Title => "Home";

    // Drop Zone
    public static string Home_DropZoneText => "Drag & Drop any audio or video file";
    public static string Home_OrClickToBrowse => "or click to browse";

    // Configuration
    public static string Home_ConfigurationTitle => "Configuration";
    public static string Home_LanguageLabel => "Language:";
    public static string Home_WhisperModelLabel => "Whisper Model:";

    // Actions
    public static string Home_TranscribeButton => "Transcribe";
    public static string Home_ProcessAllButton => "Process All";
    public static string Home_FormatSwitch => "Auto format";
    public static string Home_SummarizeSwitch => "Auto summarize";

    // LLM Formatter Config
    public static string Home_FormatModelLabel => "Format Model";
    public static string Home_FormatLanguageLabel => "Format Language";
    public static string Home_CustomPromptLabel => "Custom Instruction";

    // Transcript Output
    public static string Home_TranscriptTitle => "Transcript";
    public static string Home_TabRaw => "Raw";
    public static string Home_TabFormatted => "Formatted";
    public static string Home_TabSummary => "Summary";
    public static string Home_CopyButton => "Copy";

    // Status Messages
    public static string Home_Status_NoFormatter => "No formatter installed";
    public static string Home_Status_InvalidFile => "Use an audio or video file.";
    public static string Home_Status_FileReady => "File ready.";
    public static string Home_Status_CheckingDuplicate => "Checking for duplicate...";
    public static string Home_Status_LoadedFromHistory => "Loaded from history.";
    public static string Home_Status_LoadedFromHistoryCopied => "Loaded from history and copied.";
    public static string Home_Status_CachingMedia => "Caching media file to internal storage...";
    public static string Home_Status_PreparingAudio => "Preparing audio...";
    public static string Home_Status_TranscribingWhisper => "Transcribing";
    public static string Home_Status_FormattingLLM => "Formatting transcript";
    public static string Home_Status_SummarizingLLM => "Summarizing transcript";
    public static string Home_Status_TranscriptionCompleteCopied => "Transcription complete and copied.";
    public static string Home_Status_TranscriptionComplete => "Transcription complete.";
    public static string Home_Status_CopiedToClipboard => "Copied to clipboard.";
    public static string Home_Status_QueuedMultiple => "{0} files queued.";
    public static string Home_Status_BatchProgress => "Processing {0} of {1}: {2}";
    public static string Home_Status_BatchComplete => "Batch processing complete. {0} files processed.";

    // ==========================================
    // RECORD PAGE
    // ==========================================
    public static string Record_Title => "Voice Memos";
    public static string Record_StartButton => "Start Recording";
    public static string Record_StopButton => "Stop Recording";
    public static string Record_Instructions => "";

    // ==========================================
    // HISTORY PAGE
    // ==========================================
    public static string History_Title => "Transcription History";

    // Actions
    public static string History_BtnReTranscribe => "Re-Transcribe";
    public static string History_LanguageLabel => "Language";
    public static string History_CustomPromptTitle => "Custom Prompt";
    public static string History_CustomPromptPlaceholder => "Override format/summarize instructions for the selected item...";

    public static string History_ExportBtn => "Export";
    public static string History_ExportText => "Export as Text (.txt)";
    public static string History_ExportSrt => "Export as Subtitles (.srt)";
    public static string History_ExportVtt => "Export as WebVTT (.vtt)";

    public static string History_EmptyDetailsText => "Select a transcription to view details.";

    // ==========================================
    // MODELS PAGE
    // ==========================================
    public static string Models_Title => "Manage Models";
    public static string Models_Instructions => "Download at least one Whisper model (for transcription) and one LLM (for formatting/summarization).";

    // Whisper Models
    public static string Models_WhisperSectionTitle => "Whisper Models (Transcription)";
    public static string Models_WhisperSectionDesc => "Download or remove local Whisper models.";

    // Formatter Models
    public static string Models_FormatterSectionTitle => "Formatter Models (Local LLMs)";
    public static string Models_FormatterSectionDesc => "Download local LLMs for formatting.";

    // Button States
    public static string Models_BtnDownload => "Download";
    public static string Models_BtnCancel => "Cancel";
    public static string Models_BtnDelete => "Delete";
    public static string Models_Downloaded => "Downloaded";

    // Model Status Messages
    public static string Models_Status_DownloadFailed => "Download failed!";
    public static string Models_Status_Cancelled => "Download cancelled.";
    public static string Models_Status_Installed => "Installed";
    public static string Models_Status_Broken => "Broken Download";
    public static string Models_Status_NotInstalled => "Not Installed";

    // Dynamic Formats
    public static string Models_Status_DeletedFormat => "{0} deleted.";
    public static string Models_Status_DownloadingFormat => "Downloading {0}...";
    public static string Models_Status_DownloadingProgressFormat => "Downloading {0} ({1} GB / {2} GB) - {3} MB/s - {4} remaining";
    public static string Models_Status_InstalledFormat => "{0} installed.";

    // ==========================================
    // SETTINGS PAGE
    // ==========================================
    public static string Settings_Title => "Settings";

    public static string Settings_DefaultsHeader => "Defaults";
    public static string Settings_DefaultLanguageTitle => "Default language";
    public static string Settings_DefaultLanguageDesc => "Preselect this language when opening Transcription.";

    public static string Settings_PrefWhisperTitle => "Preferred Whisper model";
    public static string Settings_PrefWhisperDesc => "Use this installed model first when available.";

    public static string Settings_FormattingHeader => "Formatting";
    public static string Settings_FormatByDefaultTitle => "Format by default";
    public static string Settings_FormatByDefaultDesc => "Enable transcript cleanup automatically.";
    public static string Settings_FormatLanguageTitle => "Default format language";
    public static string Settings_FormatLanguageDesc => "Used when formatting is enabled.";

    public static string Settings_BehaviorHeader => "Transcription Behavior";
    public static string Settings_AudioNormTitle => "Normalize audio";
    public static string Settings_AudioNormDesc => "Apply high-pass, low-pass, and loudness normalization before Whisper.";

    public static string Settings_AutoCopyTitle => "Auto-copy finished transcript";
    public static string Settings_AutoCopyDesc => "Copy the final transcript to the clipboard when processing completes.";

    public static string Settings_PromptsHeader => "Custom System Prompts";
    public static string Settings_CustomFormatTitle => "Custom Format Prompt";
    public static string Settings_CustomFormatDesc => "Override the default system prompt used for formatting. Leave empty to use the default.";
    public static string Settings_CustomSummaryTitle => "Custom Summary Prompt";
    public static string Settings_CustomSummaryDesc => "Override the default system prompt used for summarization. Leave empty to use the default.";
    public static string Settings_BtnResetPrompt => "Reset format prompt";
    public static string Settings_BtnResetSummary => "Reset summary prompt";

    public static string Settings_MemoryHeader => "AI Context Memory";
    public static string Settings_ContextLearnTitle => "Enable context learning";
    public static string Settings_ContextLearnDesc => "Automatically learn and remember your specific jargon and transcription habits to improve accuracy over time.";
    public static string Settings_ManageMemoryTitle => "Manage memory bank";
    public static string Settings_ManageMemoryDesc => "View, edit, or clear the terms the AI has learned from your previous transcriptions.";
    public static string Settings_BtnEditMemory => "Edit Memory";
    public static string Settings_BtnClear => "Clear";

    public static string Settings_StorageHeader => "Storage";
    public static string Settings_AutoDeleteTitle => "Auto-delete media cache";
    public static string Settings_AutoDeleteDesc => "Automatically delete cached audio and video files.";
    public static string Settings_AudioCacheTitle => "Audio cache";
    public static string Settings_AudioCacheDesc => "Clear original audio files saved for re-transcription.";
    public static string Settings_VideoCacheTitle => "Video cache";
    public static string Settings_VideoCacheDesc => "Clear original video files saved for re-transcription.";

    public static string Settings_ModelsFolderTitle => "Models folder";
    public static string Settings_ModelsFolderDesc => "Open the folder where Whisper and formatter models are stored.";
    public static string Settings_BtnOpen => "Open";

    public static string Settings_MicHeader => "Permissions";
    public static string Settings_MicTitle => "Microphone access";
    public static string Settings_MicDesc => "Windows requires you to enable 'Let desktop apps access your microphone' to use the Voice Memos feature.";
    public static string Settings_BtnOpenMic => "Open Windows Settings";

    public static string Settings_ResetTitle => "Reset settings";
    public static string Settings_ResetDesc => "Restore all WinUI app preferences to defaults.";
    public static string Settings_BtnReset => "Reset";

    // Status Messages
    public static string Settings_Status_Reset => "Settings reset.";
    public static string Settings_Status_AudioCacheCleared => "Audio cache cleared.";
    public static string Settings_Status_VideoCacheCleared => "Video cache cleared.";
    public static string Settings_Status_MemoryUpdated => "AI memory updated.";
    public static string Settings_Status_MemoryCleared => "AI memory cleared.";

    // Dialog Strings
    public static string Settings_Dialog_EditMemoryTitle => "Edit Memory";
    public static string Settings_Dialog_Save => "Save";
    public static string Settings_Dialog_Cancel => "Cancel";

    // ==========================================
    // AUTO UPDATER
    // ==========================================
    public static string Update_BannerTitle => "Muffin update available!";
    public static string Update_BtnUpdate => "Update!";
    public static string Update_BtnRestart => "Restart";
    public static string Update_BtnDownloading => "Downloading update...";
    public static string Update_StatusReady => "Muffin update ready to install!";
    public static string Update_StatusAvailableFormat => "Version {0} is available.";
    public static string Update_StatusFailedFormat => "Download failed: {0}";
    
    public static string Settings_AboutHeader => "About";
    public static string Settings_AutoUpdateTitle => "Auto-check for updates";
    public static string Settings_AutoUpdateDesc => "The app pings GitHub on launch just to see if there's a newer version. Turn it off if you'd rather it stayed fully offline.";
    public static string Settings_BtnCheckUpdates => "Check for updates";
    public static string Settings_UpdateChecking => "Checking...";
    public static string Settings_UpdateFound => "Update found!";
    public static string Settings_UpdateUpToDate => "Up to date";
}
