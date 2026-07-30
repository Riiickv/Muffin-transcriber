namespace MuffinTranscriber;

/// <summary>
/// Every user-visible string, resolved against the SHARED string catalog.
///
/// The keys and English defaults here mirror mobile_app/constants/strings.ts
/// exactly - the two apps are the same product, and the words must be
/// literally identical. Strings/{lang}.json is GENERATED from the mobile files
/// by scripts/export-strings-to-pc.mjs; never hand-edit those, edit the mobile
/// file and re-run the script.
///
/// Keys under "pc." exist only on Windows (updater, engines, mini window...)
/// and live in Strings/pc.{lang}.json, which IS hand-maintained.
/// </summary>
public static class AppStrings
{
    private static string T(string key, string fallback) => LocalizationManager.GetString(key, fallback);

    // The updater compares this against the release tag; not user-visible text.
    // A property (not const) because x:Bind can't bind to constants.
    public static string AppVersion => "v1.12.1";

    // NAVIGATION - the same five destinations as the mobile tab bar.
    public static string Nav_Home => T("tabs.transcribe", "Muffin!");
    public static string Nav_Record => T("tabs.record", "Record");
    public static string Nav_History => T("tabs.history", "History");
    public static string Nav_Chat => T("tabs.chat", "Chat");
    public static string Nav_Models => T("settings.modelManagement", "Models");
    public static string Nav_Settings => T("tabs.settings", "Settings");

    public static string App_Title => T("pc.appTitle", "Muffin Transcriber");
    public static string Credits => T("pc.credits", "made by Rick in his free time");
    public static string Settings_BtnChangelog => T("pc.settings.changelog", "View Changelog");

    // COMMON
    public static string Common_NoModelInstalled => T("models.noneInstalled", "No models installed yet");

    // MAIN WINDOW
    public static string Main_Status_MiniWindowOpen => T("pc.mini.open", "Mini-Muffin is open.");
    public static string Main_Status_ModelsNotInstalled => T("models.noneInstalledDesc", "Models are what let the app work offline. Download one and it'll show up here.");

    // MINI WINDOW (share target) - PC-only surface.
    public static string Mini_DropFileHere => T("pc.mini.dropHere", "Drop File Here");
    public static string Mini_Tooltip_Copy => T("common.copy", "Copy");
    public static string Mini_Tooltip_Format => T("historyDetail.format", "Improve");
    public static string Mini_Status_Transcribing => T("transcribe.transcribing", "Transcribing...");
    public static string Mini_Status_Done => T("chat.actionExecuted", "Done");
    public static string Mini_Status_Error => T("pc.mini.errorPrefix", "Error: ");
    public static string Mini_Status_NoWhisper => T("dialog.noWhisperModel.message", "Choose a transcriber model.");
    public static string Mini_Status_NoFormatter => T("dialog.noFormatterModel.message", "Choose a formatter model first.");
    public static string Mini_Status_NoSpeech => T("pc.mini.noSpeech", "No speech detected in this file.");
    public static string Mini_Status_Loading => T("pc.mini.loading", "Loading file...");
    public static string Mini_Status_NoFile => T("pc.mini.noFile", "No file was shared.");
    public static string Mini_Status_Copied => T("record.copied", "Copied!");
    public static string Mini_Status_Formatting => T("transcribe.formatting", "Improving...");
    public static string Mini_Status_Formatted => T("transcribe.formattedTab", "Improved");
    public static string Mini_Status_FormatFailed => T("dialog.formattingFailed.title", "Improvement failed");
    public static string Mini_Error_Generic => T("dialog.transcriptionFailed.title", "Transcription failed");
    public static string Mini_Tooltip_OpenApp => T("pc.mini.openApp", "Open Full App");

    // TRANSCRIBE SCREEN ("Muffin!") - the mobile transcribe.* group.
    public static string Home_Title => T("tabs.transcribe", "Muffin!");
    public static string Home_DropZoneText => T("pc.dropZone", "Drag & Drop any audio or video file");
    public static string Home_OrClickToBrowse => T("pc.dropZoneHint", "or click to browse");
    public static string Home_DropCaption => T("pc.dropCaption", "Drop to transcribe");
    public static string Home_LanguageLabel => T("transcribe.languageLabel", "Language");
    public static string Home_WhisperModelLabel => T("transcribe.whisperModelLabel", "Transcription quality");
    public static string Home_TranscribeButton => T("transcribe.transcribeButton", "Go!");
    public static string Home_FormatSwitch => T("transcribe.formatToggle", "Improve");
    public static string Home_SummarizeSwitch => T("transcribe.summarizeToggle", "Summarize");
    public static string Home_FormatModelLabel => T("transcribe.formatterModelLabel", "Improvement quality");
    public static string Home_FormatLanguageLabel => T("transcribe.formatLanguageLabel", "Improvement language");
    public static string Home_CustomPromptLabel => T("transcribe.customPromptLabel", "Be specific");
    public static string Home_CustomPromptPlaceholder => T("transcribe.customPromptPlaceholder", "Use bullet points, max 100 words, etc.");
    public static string Home_TranscriptTitle => T("transcribe.transcriptTitle", "Transcript");
    public static string Home_TabRaw => T("transcribe.rawTab", "Raw");
    public static string Home_TabFormatted => T("transcribe.formattedTab", "Improved");
    public static string Home_TabSummary => T("transcribe.summaryTab", "Summary");
    public static string Home_CopyButton => T("common.copy", "Copy");
    public static string Home_TranscriptPlaceholder => T("transcribe.transcriptPlaceholder", "Transcript will appear here.");
    public static string Home_CancelButton => T("common.cancel", "Cancel");

    // Progress and status lines.
    public static string Home_Status_TranscribingWhisper => T("transcribe.transcribing", "Transcribing...");
    public static string Home_Status_FormattingLLM => T("transcribe.formatting", "Improving...");
    public static string Home_Status_SummarizingLLM => T("transcribe.summarizing", "Summarizing...");
    public static string Home_Status_CopiedToClipboard => T("historyDetail.copiedDesc", "Text copied to clipboard");
    public static string Home_Status_NoFormatter => T("dialog.noFormatterModel.title", "No formatter selected");
    public static string Home_Status_InvalidFile => T("pc.status.invalidFile", "Use an audio or video file.");
    public static string Home_Status_FileReady => T("pc.status.fileReady", "File ready.");
    public static string Home_Status_CheckingDuplicate => T("pc.status.checkingDuplicate", "Checking for duplicate...");
    public static string Home_Status_LoadedFromHistory => T("pc.status.loadedFromHistory", "Loaded from history.");
    public static string Home_Status_LoadedFromHistoryCopied => T("pc.status.loadedFromHistoryCopied", "Loaded from history and copied.");
    public static string Home_Status_CachingMedia => T("pc.status.cachingMedia", "Caching media file to internal storage...");
    public static string Home_Status_PreparingAudio => T("transcribe.convertingAudio", "Converting audio...");
    public static string Home_Status_TranscriptionCompleteCopied => T("pc.status.completeCopied", "Transcription complete and copied.");
    public static string Home_Status_TranscriptionComplete => T("pc.status.complete", "Transcription complete.");
    public static string Home_Status_QueuedMultiple => T("pc.status.queuedMultiple", "{0} files queued.");
    public static string Home_Status_BatchProgress => T("pc.status.batchProgress", "Processing {0} of {1}: {2}");
    public static string Home_Status_BatchComplete => T("pc.status.batchComplete", "Batch processing complete. {0} files processed.");
    public static string Home_Status_NoSpeechDetected => T("pc.status.noSpeechIn", "No speech detected in {0}.");
    public static string Home_Status_Cancelled => T("pc.status.cancelled", "Cancelled.");
    public static string Home_Status_TranscribingPercentFormat => T("pc.status.transcribingPercent", "Transcribing {0}%");

    // RECORDING - the app-wide mic.
    public static string Record_Title => T("tabs.record", "Record");
    public static string Record_StartButton => T("record.startRecording", "Start recording");
    public static string Record_StopButton => T("record.stopRecording", "Stop recording");
    public static string Record_VoiceMemoName => T("transcribe.noTitle", "Voice Memo");
    public static string Record_Status_NoMic => T("pc.record.noMic", "No microphones detected! Please plug in a microphone.");
    public static string Record_Status_MicFailedFormat => T("dialog.recordingFailed.messageStart", "Could not start recording.");
    public static string Record_Status_NoAudioDetected => T("pc.record.noSpeechHint", "No speech detected. If your mic works elsewhere, check Windows Settings → Privacy → Microphone and enable 'Let desktop apps access your microphone'.");

    // CHAT
    public static string Chat_Title => T("chat.header", "Chat");
    public static string Chat_NewChat => T("chat.newChat", "New Chat");
    public static string Chat_EmptyHint => T("chat.emptyState", "You can ask me anything about your transcripts, just tell me what you need!");
    public static string Chat_InputPlaceholder => T("chat.inputPlaceholder", "Ask about your transcripts...");
    public static string Chat_NoModel => T("chat.noModelSubtitle", "Please go to Settings and select a Chat Model to use the assistant.");
    public static string Chat_Thinking => T("chat.thinking", "Thinking...");
    public static string Chat_Done => T("chat.actionExecuted", "Done");
    // Raised WHILE recording, not after: a muted or unplugged microphone
    // records a flat signal, and finding out from an empty transcript means
    // finding out once the lecture is already over.
    public static string Record_SilentTitle =>
        T("pc.record.silentTitle", "Muffin can't hear anything");

    public static string Record_SilentBody =>
        T("pc.record.silentBody", "This recording has been silent so far. Check that the right microphone is selected and that it isn't muted. Recording is still running.");

    public static string Record_BtnSoundSettings =>
        T("pc.record.soundSettings", "Sound settings");

    public static string Chat_ActionFailed => T("chat.actionFailed", "Couldn't do that");

    // Shown under the chip when the assistant reached for something that is not
    // one of its actions at all, rather than for one that ran and failed.
    public static string Chat_ActionUnsupported =>
        T("pc.chat.actionUnsupported", "That isn't something I can do from the chat.");
    public static string Chat_ErrorMessage => T("chat.errorMessage", "Sorry, something went wrong. Here is what the app said:");
    public static string Chat_DeleteTitle => T("chat.deleteTitle", "Delete transcript?");
    public static string Chat_DeleteConfirm => T("chat.deleteMessage", "Delete “{name}”? This can't be undone.");
    public static string Chat_Delete => T("common.delete", "Delete");
    public static string Chat_Cancel => T("common.cancel", "Cancel");

    // HISTORY
    public static string History_Title => T("history.header", "History");
    public static string History_BtnReTranscribe => T("historyDetail.retranscribe", "Re-Transcribe");
    public static string History_LanguageLabel => T("transcribe.languageLabel", "Language");
    public static string History_CustomPromptTitle => T("historyDetail.customPromptLabel", "Be specific");
    public static string History_CustomPromptPlaceholder => T("historyDetail.customPromptPlaceholder", "Use bullet points, max 100 words, etc...");
    public static string History_ExportBtn => T("pc.history.export", "Export");
    public static string History_ExportText => T("pc.history.exportText", "Export as Text (.txt)");
    public static string History_ExportSrt => T("pc.history.exportSrt", "Export as Subtitles (.srt)");
    public static string History_ExportVtt => T("pc.history.exportVtt", "Export as WebVTT (.vtt)");
    public static string History_EmptyDetailsText => T("history.emptyDesc", "Record or transcribe an audio file to see it here.");
    public static string History_Dialog_RenameTitle => T("history.renameTranscript", "Rename Transcript");
    public static string History_NoLlmInstalled => T("dialog.noFormatterModel.title", "No formatter selected");
    public static string History_NoWhisperInstalled => T("dialog.noWhisperModel.title", "No transcriber selected");
    public static string History_Tooltip_Rename => T("history.renameAction", "Rename transcript");
    public static string History_Tooltip_Delete => T("history.deleteAction", "Delete transcript");
    public static string History_Tooltip_Format => T("historyDetail.format", "Improve");
    public static string History_Tooltip_Summarize => T("historyDetail.summarize", "Summarize");
    public static string History_Status_SourceMissing => T("historyDetail.audioMissing", "Audio file not found");
    public static string History_Status_SelectFormatter => T("dialog.noFormatterModel.message", "Choose a formatter model first.");
    public static string History_Status_FormatComplete => T("pc.status.formatComplete", "Improvement complete.");
    public static string History_Status_FormatFailed => T("dialog.formattingFailed.title", "Improvement failed");
    public static string History_Status_NoSubtitles => T("pc.history.noSubtitles", "No subtitle data available for this transcript. Please re-transcribe the file.");
    public static string History_Status_SelectSummarizer => T("dialog.noFormatterModel.message", "Choose a formatter model first.");
    public static string History_Status_SummaryComplete => T("pc.status.summaryComplete", "Summarization complete.");
    public static string History_Status_SummaryTooShort => T("historyDetail.summaryTooShort", "Too short to summarize.");
    public static string History_Status_SummaryFailed => T("historyDetail.summaryFailed", "Couldn't summarize this one.");
    public static string History_Status_SelectWhisper => T("dialog.noWhisperModel.messagePickOne", "Choose a transcriber model first.");
    public static string History_Status_RetranscribeComplete => T("pc.status.retranscribeComplete", "Re-transcription complete.");
    public static string History_AddToCalendar => T("pc.history.findDates", "Find dates & add to calendar");
    public static string History_FindingDates => T("pc.history.findingDates", "Looking for dates and events...");
    public static string History_NoDatesFound => T("pc.history.noDatesFound", "No dates or events found.");
    public static string History_DatesFoundTitle => T("pc.history.datesTitle", "Dates & events");
    public static string History_AddButton => T("settings.addMemoryBtn", "Add");
    public static string History_CalendarHint => T("pc.history.calendarHint", "Opens in your calendar app. Set the exact date and time there.");
    public static string History_Close => T("common.close", "Close");

    // MODELS - labels shared with the mobile Models page.
    public static string Models_Title => T("settings.modelManagement", "Models");
    public static string Models_Instructions => T("settings.downloadModels", "Download models");
    public static string Models_WhisperSectionTitle => T("settings.whisperModelsHeader", "Transcriber models");
    public static string Models_WhisperSectionDesc => T("models.descWhisperBalanced", "The sweet spot for most voice notes.");
    public static string Models_FormatterSectionTitle => T("settings.formatterModelsHeader", "Formatter models");
    public static string Models_FormatterSectionDesc => T("models.descFmtBalanced", "Bigger, still quick on newer phones.");
    public static string Models_EmbeddingSectionTitle => T("settings.embeddingModelsHeader", "Helper models (mandatory for the chat to be helpful)");
    public static string Models_EmbeddingSectionDesc => T("models.descEmbed", "Lets Chat find the right transcript by meaning, not just words.");
    public static string Models_BtnDownload => T("settings.downloadButton", "Download");
    public static string Models_BtnCancel => T("downloads.cancel", "Cancel");
    public static string Models_BtnDelete => T("settings.deleteButton", "Delete");
    public static string Models_Downloaded => T("settings.downloading", "Downloading");
    public static string Models_Status_DownloadFailed => T("pc.models.downloadFailed", "Download failed!");
    public static string Models_Status_Cancelled => T("pc.models.cancelled", "Download cancelled.");
    public static string Models_Status_OneAtATime => T("pc.models.oneAtATime", "Finish or cancel the current download first.");
    public static string Models_Status_InUse => T("pc.models.inUse", "Couldn't delete: the model is in use. Try again in a moment.");
    public static string Models_Status_Installed => T("settings.modelsInstalled", "installed");
    public static string Models_Status_Broken => T("pc.models.broken", "Broken Download");
    public static string Models_Status_NotInstalled => T("pc.models.notInstalled", "Not Installed");
    public static string Models_Status_DeletedFormat => T("settings.deletedDesc", "Model deleted.");
    public static string Models_Status_DownloadingFormat => T("downloads.downloadingModel", "Downloading {model}");
    public static string Models_Status_InstalledFormat => T("pc.models.installedFormat", "{0} installed.");

    // SETTINGS - mobile's settings.* group, same words.
    public static string Settings_Title => T("settings.header", "Settings");
    public static string Settings_TranscriptionHeader => T("settings.transcription", "Transcription");
    public static string Settings_DefaultLanguageTitle => T("settings.defaultLanguage", "Default Language");
    public static string Settings_AudioNormTitle => T("settings.normalizeAudio", "Normalize audio");
    public static string Settings_AudioNormDesc => T("settings.normalizeAudioDesc", "Boosts low volume for a cleaner transcription.");
    public static string Settings_AutoCopyTitle => T("settings.autoCopy", "Auto-copy transcript");
    public static string Settings_AutoCopyDesc => T("settings.autoCopyDesc", "Copies to clipboard when done");
    public static string Settings_TypewriterTitle => T("settings.typewriter", "Typewriter effect");
    public static string Settings_TypewriterDesc => T("settings.typewriterDesc", "Type transcriptions out as they arrive");
    public static string Settings_TypewriterSpeedTitle => T("settings.typewriterSpeed", "Typing speed");
    public static string Settings_SpeedSlow => T("settings.speedSlow", "Slow");
    public static string Settings_SpeedBalanced => T("settings.speedBalanced", "Balanced");
    public static string Settings_SpeedFast => T("settings.speedFast", "Fast");
    public static string Settings_FormattingHeader => T("settings.formatSummarize", "Improve & Summarize");
    public static string Settings_FormatByDefaultTitle => T("settings.formatByDefault", "Improve by default");
    public static string Settings_FormatByDefaultDesc => T("settings.formatByDefaultDesc", "Improves the transcript after transcribing");
    public static string Settings_SummarizeByDefaultTitle => T("settings.summarizeByDefault", "Summarize by Default");
    public static string Settings_SummarizeByDefaultDesc => T("settings.summarizeByDefaultDesc", "Summarizes transcript after transcription");
    public static string Settings_PrefWhisperTitle => T("settings.whisperModel", "Transcriber model");
    public static string Settings_PreferredFormatterTitle => T("settings.preferredFormatter", "Formatter model");
    public static string Settings_FormatLanguageTitle => T("settings.formatLanguage", "Improvement language");
    public static string Settings_MemoryHeader => T("settings.memoryContext", "Memory Context");
    public static string Settings_MemoryFooter => T("settings.memoryDesc", "Allow the transcription to use memories. Higher accuracy but slower.");
    public static string Settings_ContextLearnTitle => T("settings.contextLearning", "Memory");
    public static string Settings_ContextLearnDesc => T("settings.contextLearningDesc", "Memory helps with filling the blanks when the audio is unclear.");
    public static string Settings_ManageMemoryTitle => T("settings.manageMemory", "Manage memories");
    public static string Settings_BtnEditMemory => T("settings.manageMemory", "Manage memories");
    public static string Settings_BtnClear => T("settings.clearChat", "Clear chat history");
    public static string Settings_AppearanceHeader => T("settings.appearance", "Appearance");
    public static string Settings_ThemeTitle => T("settings.themeMode", "Theme");
    public static string Settings_AccentTitle => T("settings.accentColor", "Accent color");
    public static string Settings_LanguageTitle => T("settings.appLanguage", "App language");
    public static string Settings_LanguageDesc => T("pc.settings.appLanguageDesc", "Automatic follows your PC's language.");
    public static string Settings_PromptsHeader => T("settings.customPrompts", "Custom prompts");
    public static string Settings_PromptsFooter => T("settings.customPromptsFooter", "Leave empty to use Muffin's defaults. These apply to every transcript.");
    public static string Settings_CustomFormatTitle => T("settings.formatSystemPrompt", "Improvement default prompt");
    public static string Settings_CustomFormatPlaceholder => T("settings.formatSystemPromptPlaceholder", "You are an expert editor...");
    public static string Settings_CustomSummaryTitle => T("settings.summarySystemPrompt", "Summary default prompt");
    public static string Settings_CustomSummaryPlaceholder => T("settings.summarySystemPromptPlaceholder", "Summarize the following text...");
    public static string Settings_StorageHeader => T("settings.storageHeader", "Storage");
    public static string Settings_AutoDeleteTitle => T("settings.autoDeleteLabel", "Auto-Delete Audio Files");
    public static string Settings_AutoDeleteNever => T("settings.autoDeleteNever", "Never");
    public static string Settings_AutoDelete1Week => T("settings.autoDelete1Week", "1 Week");
    public static string Settings_AutoDelete1Month => T("settings.autoDelete1Month", "1 Month");
    public static string Settings_AboutHeader => T("settings.aboutHeader", "About");
    public static string Settings_PrivacyPolicy => T("settings.privacyPolicy", "Privacy policy");
    public static string Settings_SupportTitle => T("settings.supportTitle", "Support me!");
    public static string Settings_SupportMessage => T("settings.supportMessage", "Muffin is free, private and works offline. If you like it and would like to support my project, here's how!");
    public static string Settings_SupportButton => T("settings.supportButton", "Buy a coffee");
    public static string Settings_SupportCancel => T("settings.supportCancel", "Maybe later");
    public static string Settings_VersionFormat => T("settings.version", "Muffin Transcriber v{version}");

    // Settings entries that exist only on Windows.
    public static string Settings_ManageModelsTitle => T("settings.modelManagement", "Models");
    public static string Settings_ManageModelsDesc => T("settings.downloadModels", "Download models");
    public static string Settings_BtnManageModels => T("models.goToModels", "Get a model");
    public static string Settings_ModelsFolderTitle => T("pc.settings.modelsFolder", "Models folder");
    public static string Settings_ModelsFolderDesc => T("pc.settings.modelsFolderDesc", "Open the folder where the models are stored.");
    public static string Settings_BtnOpen => T("pc.settings.open", "Open");
    public static string Settings_MicHeader => T("pc.settings.micHeader", "Permissions");
    public static string Settings_MicTitle => T("pc.settings.micTitle", "Microphone access");
    public static string Settings_MicDesc => T("pc.settings.micDesc", "Windows requires you to enable 'Let desktop apps access your microphone' to record.");
    public static string Settings_BtnOpenMic => T("pc.settings.openWindowsSettings", "Open Windows Settings");
    public static string Settings_ResetTitle => T("pc.settings.reset", "Reset settings");
    public static string Settings_ResetDesc => T("pc.settings.resetDesc", "Restore all app preferences to defaults.");
    public static string Settings_BtnReset => T("pc.settings.resetBtn", "Reset");
    public static string Settings_Status_Reset => T("pc.settings.resetDone", "Settings reset.");
    public static string Settings_AudioCacheTitle => T("pc.settings.audioCache", "Audio cache");
    public static string Settings_AudioCacheDesc => T("pc.settings.audioCacheDesc", "Clear original audio files saved for re-transcription.");
    public static string Settings_VideoCacheTitle => T("pc.settings.videoCache", "Video cache");
    public static string Settings_VideoCacheDesc => T("pc.settings.videoCacheDesc", "Clear original video files saved for re-transcription.");
    public static string Settings_Status_AudioCacheCleared => T("pc.settings.audioCacheCleared", "Audio cache cleared.");
    public static string Settings_Status_VideoCacheCleared => T("pc.settings.videoCacheCleared", "Video cache cleared.");
    public static string Settings_Status_MemoryUpdated => T("pc.settings.memoryUpdated", "AI memory updated.");
    public static string Settings_Status_MemoryCleared => T("pc.settings.memoryCleared", "AI memory cleared.");
    public static string Settings_Status_Saved => T("pc.settings.saved", "Settings saved.");
    public static string Settings_AutoSelectModel => T("pc.settings.autoSelectModel", "Auto-select best installed model");
    public static string Settings_AutoUpdateTitle => T("pc.settings.autoUpdate", "Auto-check for updates");
    public static string Settings_AutoUpdateDesc => T("pc.settings.autoUpdateDesc", "The app pings GitHub on launch just to see if there's a newer version. Turn it off if you'd rather it stayed fully offline.");
    public static string Settings_BtnCheckUpdates => T("pc.settings.checkUpdates", "Check for updates");
    public static string Settings_UpdateChecking => T("pc.settings.checking", "Checking...");
    public static string Settings_UpdateFound => T("pc.settings.updateFound", "Update found!");
    public static string Settings_UpdateUpToDate => T("pc.settings.upToDate", "Up to date");
    public static string Settings_Dialog_EditMemoryTitle => T("settings.manageMemory", "Manage memories");
    public static string Settings_Dialog_Save => T("common.save", "Save");
    public static string Settings_Dialog_Cancel => T("common.cancel", "Cancel");

    // Accent options - same palette as mobile, System first like on Android.
    public static string Settings_AccentSystem => T("pc.accent.system", "System");
    public static string Settings_AccentMuffin => T("pc.accent.muffin", "Muffin");
    public static string Settings_AccentGreen => T("pc.accent.green", "Green");
    public static string Settings_AccentPurple => T("pc.accent.purple", "Purple");
    public static string Settings_AccentRed => T("pc.accent.red", "Red");

    // SETUP WIZARD - mobile setup.* where it maps, pc.setup.* for the rest.
    public static string Setup_Title => T("transcribe.welcomeTitle", "Welcome to Muffin!");
    public static string Setup_Subtitle => T("transcribe.welcomeBody", "Muffin is a transcriber that uses AI to improve the text output. It can even learn from you and help you when the audio is unclear!");
    public static string Setup_BtnFinish => T("setup.finish", "Start!");

    // ENGINE HEALTH / CRASH - PC-only by nature.
    public static string Health_BannerTitle => T("pc.health.title", "Muffin can't start its engines");
    public static string Health_RuntimeMissingBody => T("pc.health.runtimeMissing", "Windows is missing a component the transcription engines need (the Microsoft Visual C++ runtime). Install it, then restart Muffin.");
    public static string Health_EnginesMissingBody => T("pc.health.enginesMissing", "The engine files are missing from Muffin's folder. Reinstall Muffin with the full installer to restore them.");
    public static string Health_UnknownBodyFormat => T("pc.health.unknownFormat", "An engine failed to start ({0}). Transcription may not work. Reinstalling Muffin usually fixes this.");
    public static string Health_WebViewMissingBody => T("pc.health.webviewMissing", "Windows is missing the WebView2 component Muffin draws its interface with. Install it, then restart Muffin.");
    public static string Health_BtnInstallRuntime => T("pc.health.installRuntime", "Install component");
    public static string Health_BtnGetInstaller => T("pc.health.getInstaller", "Get installer");
    public static string Crash_BannerTitle => T("pc.crash.title", "Something went wrong");
    public static string Crash_BannerBody => T("pc.crash.body", "Muffin hit an unexpected error but kept running. If something looks stuck, restart the app. Technical details were saved to the log.");
    public static string Crash_BtnOpenLog => T("pc.crash.openLog", "Open log");

    // AUTO UPDATER - PC-only.
    public static string Update_BannerTitle => T("pc.update.title", "Muffin update available!");
    public static string Update_BtnUpdate => T("pc.update.update", "Update!");
    public static string Update_BtnRestart => T("pc.update.restart", "Restart");
    public static string Update_BtnDownloading => T("pc.update.downloading", "Downloading update...");
    public static string Update_StatusReady => T("pc.update.ready", "Muffin update ready to install!");
    public static string Update_StatusAvailableFormat => T("pc.update.availableFormat", "Version {0} is available.");
    public static string Update_StatusFailedFormat => T("pc.update.failedFormat", "Download failed: {0}");
    public static string Update_StatusNoConnection => T("pc.update.failedNetwork", "Could not reach GitHub. Check your connection and try again.");
    public static string Update_StatusInstallCancelled => T("pc.update.installCancelled", "Update install was cancelled. Click Restart to try again.");
}
