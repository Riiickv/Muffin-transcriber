/**
 * ============================================================================
 *  EVERY PIECE OF TEXT THE USER CAN SEE IN THE APP.
 * ============================================================================
 *
 *  HOW TO USE THIS FILE
 *  --------------------
 *  Change any text on the right-hand side of the colon. That's it.
 *  Do NOT change the names on the left (`title:`, `cancel:`, ...) — those are
 *  what the code looks up. Changing one breaks that piece of text.
 *
 *  Keep the quotes. Keep the comma at the end of the line.
 *      GOOD:  title: "Pick a file",
 *      BAD:   title: Pick a file        <- no quotes
 *      BAD:   title: "Pick a file"      <- no comma
 *
 *  If a line has {something} in curly braces, that gets replaced with a real
 *  value at runtime (a file name, a number...). Keep the braces and the exact
 *  word inside them, but you can move them around in the sentence.
 *
 *  NEVER leave a string empty ("") — the app will fall back to old text.
 *  If you want nothing there, use a single space: " ".
 *
 *  Organised by screen, in the order you'd meet them using the app.
 * ============================================================================
 */

export const APP_STRINGS = {
  // ==========================================================================
  //  BOTTOM NAVIGATION BAR — the 5 buttons at the bottom of the screen
  // ==========================================================================
  tabs: {
    transcribe: "Muffin!",
    record: "Record",
    history: "History",
    chat: "Chat",
    settings: "Settings",
  },

  // ==========================================================================
  //  SHARED — buttons and words reused all over the app
  // ==========================================================================
  common: {
    ok: "OK",
    cancel: "Cancel",
    save: "Save",
    delete: "Delete",
    close: "Close",
    back: "Back",
    copy: "Copy",
    notSet: "Not Set",
    loading: "Loading...",
  },

  // ==========================================================================
  //  "MUFFIN!" TAB — the main screen where you pick a file and transcribe it
  // ==========================================================================
  transcribe: {
    // -- FIRST RUN: shown instead of everything else when no model is
    // -- installed yet, because nothing works until one is.
    welcomeTitle: "Welcome to Muffin!",
    welcomeBody: "Muffin is a transcriber, it uses AI to improve the text output. It's optional but recommended!",
    welcomeStep: "You can share your files with Muffin and it will do all the work for you!",
    welcomeReminderTitle: "REMINDER",
    welcomeReminder: "If you want to transcribe or summarize, you need to download a model manually.",

    // -- The Format / Summarize card at the top --
    formatToggle: "Format",
    summarizeToggle: "Summarize",
    formatterModelLabel: "Format quality",
    formatLanguageLabel: "Format Language",
    customPromptLabel: "Be specific",
    customPromptPlaceholder: "Use bullet points, max 100 words, etc.",

    // -- The file / engine card --
    languageLabel: "Language",
    whisperModelLabel: "Transcription quality",
    selectFileButton: "Pick file",
    transcribeButton: "Go!",
    listenButton: "Listen",

    // -- The transcript card at the bottom --
    transcriptTitle: "Transcript",
    transcriptPlaceholder: "Transcript will appear here.",
    rawTab: "Raw",
    formattedTab: "Formatted",
    summaryTab: "Summary",

    // -- Progress messages shown while it works --
    loadingModel: "Loading transcriber...",
    convertingAudio: "Converting audio...",
    transcribing: "Transcribing...",
    formatting: "Formatting...",
    summarizing: "Summarizing...",
    generatingTitle: "Generating title...",

    // -- Names given to a transcript when we don't have a better one --
    noTitle: "Voice Memo",
    importedAudio: "Imported Audio",

    // -- The "support me" card that appears while you wait --
    // The button opens buymeacoffee.com/riiickv in a browser tab.
    whileWaiting: "While you're waiting...",
    // Button label.
    supportMe: "Support me!",
    // DESCRIPTION under the "Support me!" pop-up. Rewrite this in your voice.
    supportDesc: "Muffin is free and works offline. If you like it and would like to support my project, here's how!",
    // The "no thanks" button on that pop-up.
    supportCancel: "Maybe later",
  },

  // ==========================================================================
  //  "RECORD" TAB — the big microphone button screen
  // ==========================================================================
  record: {
    readyToTranscribe: "Ready to Transcribe",
    listening: "Listening...",
    using: "Using",
    noModelSelected: "No model selected",

    loadingModel: "Loading transcriber...",
    transcribing: "Transcribing...",

    // -- Compact labels on this screen (shorter than elsewhere, space is tight) --
    formatToggle: "Format Transcript",
    summarizeToggle: "Summarize",
    whisperModelLabel: "Whisper",
    languageLabel: "Language",
    formatterModelLabel: "Formatter",
    formatLanguageLabel: "Output",

    startRecording: "Start recording",
    stopRecording: "Stop recording",

    // -- The transcript box that appears under the mic button once you're done --
    transcriptTitle: "Transcript",
    transcriptPlaceholder: "Your words will appear here after you record.",
    copyButton: "Copy",
    copied: "Copied!",
  },

  // ==========================================================================
  //  "HISTORY" TAB — the list of everything you've transcribed
  // ==========================================================================
  history: {
    header: "History",
    noHistory: "No transcripts yet.",
    emptyDesc: "Record or transcribe an audio file to see it here.",
    renameTranscript: "Rename Transcript",
    saveRename: "Save",
    openTranscript: "Open {name}",
    renameAction: "Rename transcript",
    deleteAction: "Delete transcript",
  },

  // ==========================================================================
  //  TRANSCRIPT DETAIL — opens when you tap a transcript in History
  // ==========================================================================
  historyDetail: {
    // -- Audio player at the top --
    play: "Play",
    pause: "Pause",
    audioMissing: "Audio file not found",

    // -- The three action buttons --
    retranscribe: "Re-Transcribe",
    format: "Format",
    summarize: "Summarize",

    // -- What those buttons say while they're working --
    retranscribing: "Re-transcribing...",
    formatting: "Formatting...",
    summarizing: "Summarizing...",
    working: "Working...",

    // -- Model pickers --
    whisperModelLabel: "Transcription quality",
    formatterModelLabel: "Format quality",

    // -- Custom prompt box --
    customPromptLabel: "Be specific",
    customPromptPlaceholder: "Use bullet points, max 100 words, etc...",

    // -- Transcript box --
    transcriptTitle: "Transcript",
    rawTab: "Raw",
    formattedTab: "Formatted",
    summaryTab: "Summary",
    copyButton: "Copy",
    copiedTitle: "Copied!",
    copiedDesc: "Text copied to clipboard",
    deleteButton: "Delete",
    backButton: "Back",
  },

  // ==========================================================================
  //  "CHAT" TAB — talking to the AI about your transcripts
  // ==========================================================================
  chat: {
    header: "Chat",
    inputPlaceholder: "Ask about your transcripts...",
    sendButton: "Send",
    thinking: "Thinking...",
    emptyState: "You can ask me anything about your transcripts, just tell me what you need!",
    errorMessage: "Sorry, something went wrong. Here is what the app said:",
    noMemory: "I couldn't recall anything relevant.",
    // Shown when the chat model file exists but cannot be loaded (usually a
    // download that got cut off before this app version).
    modelLoadFailed: "The chat model file looks incomplete or damaged. Delete it in Settings > Models, then download it again.",
    // Shown with real numbers when the file on disk is smaller than the download should be.
    modelBrokenTitle: "Chat model incomplete",
    modelBrokenMessage: "The model file is {actual} but should be about {expected}. The download was interrupted. Delete it in Settings > Models, then download it again and stay on that screen until it finishes.",

    // -- Shown when no chat model is picked yet --
    noModelSelected: "No Chat Model Selected",
    noModelSubtitle: "Please go to Settings and select a Chat Model to use the assistant.",
    goToSettings: "Go to Settings",

    // -- The side drawer listing your chats --
    chats: "Chats",
    newChat: "New Chat",
    noChats: "No chats yet.",
    noChatsHint: "Tap + above to start one.",
    renameChat: "Rename chat",
    deleteChat: "Delete chat",

    // -- When the AI does something for you --
    actionExecuted: "Done",
    // Shown when the assistant tried to do something it cannot actually do.
    actionFailed: "Couldn't do that",
    // The app asks this itself when the assistant wants to rename something
    // but was never told the new name.
    renameAskTitle: "What should I call it?",
    renameAskMessage: "Renaming \"{name}\"",
    deleteTitle: "Delete transcript?",
    deleteMessage: "Delete “{name}”? This can't be undone.",
    // Shown when the assistant is asked to delete several at once.
    deleteManyTitle: "Delete {count} transcripts?",
    deleteManyMessage: "These will be deleted:\n{list}\n\nThis can't be undone.",
    delete: "Delete",
    deleteMessageAction: "Delete message",

    // -- Adding a reminder/event the AI spotted in a transcript --
    addTo: "Add to",
    calendar: "Calendar",
    alarms: "Alarms",
    eventName: "Event Name",
    openNativeApp: "Open App",
  },

  // ==========================================================================
  //  "MEMORIES" SCREEN — words you teach the AI (opened from Settings)
  // ==========================================================================
  memory: {
    header: "Memories",
    noMemories: "No memories saved yet. Keep chatting or add them.",
    addCustom: "Add a memory",
    // The review list: things the assistant guessed while transcribing.
    // Nothing is saved until the user taps yes.
    suggestedTitle: "Did I get this right?",
    suggestedDesc: "I picked these up from your recordings. I'm often wrong, so nothing is saved until you say yes.",
    dismissAll: "No to all",
    dismissOne: "No",
    acceptOne: "Yes, remember this",
    memoryPrompt: "You can ask me anything about your transcripts, just tell me what you need!",
    backButton: "Back",
  },

  // ==========================================================================
  //  "SETTINGS" TAB
  // ==========================================================================
  settings: {
    header: "Settings",

    // -- The two buttons at the bottom that switch the page --
    segmentPreferences: "Preferences",
    segmentModels: "Models",

    // ---- PREFERENCES PAGE ----
    general: "General",
    defaultLanguage: "Default Language",

    autoDeleteLabel: "Auto-Delete Audio Files",
    autoDeleteNever: "Never",
    autoDelete1Week: "1 Week",
    autoDelete1Month: "1 Month",

    normalizeAudio: "Normalize audio",
    normalizeAudioDesc: "Boosts low volume for a cleaner transcription.",
    autoCopy: "Auto-copy transcript",
    autoCopyDesc: "Copies to clipboard when done",
    formatByDefault: "Format by default",
    formatByDefaultDesc: "Formats transcript after transcription",
    summarizeByDefault: "Summarize by Default",
    summarizeByDefaultDesc: "Summarizes transcript after transcription",

    contextLearning: "Memory",
    contextLearningDesc: "Memory helps with filling the blanks when the audio is unclear.",
    memoryContext: "Memory Context",
    memoryDesc: "Allow the transcription to use memories. Higher accuracy but slower.",

    manageMemory: "Manage memories",
    compressProfile: "Optimize memories",
    compressing: "Optimizing...",
    compressingDesc: "Compressing...",
    clearChat: "Clear chat history",

    // -- Add-a-memory box --
    addMemory: "Add memory",
    addMemoryDesc: "Teach Muffin specific names, terms, or facts.",
    addMemoryPlaceholder: "Add a memory",
    addMemoryBtn: "Add",
    saveMemory: "Save memory",
    deleteMemoryAction: "Delete memory",
    deleteMemoryTitle: "Delete memory?",
    noMemories: "No memories saved yet. Keep chatting or add them.",

    // -- Appearance --
    appearance: "Appearance",
    themeMode: "Theme",
    accentColor: "Accent color",
    // -- The app's own language (this picker) --
    appLanguage: "App language",
    appLanguageDesc: "Automatic follows your phone's language.",

    // -- Custom prompts --
    customPrompts: "Custom prompts",
    customPromptsFooter: "Leave empty to use Muffin's defaults. These apply to every transcript.",
    storageHeader: "Storage",
    customPrompt: "Custom prompt",
    formatSystemPrompt: "Format default prompt",
    formatSystemPromptPlaceholder: "You are an expert editor...",
    summarySystemPrompt: "Summary default prompt",
    summarySystemPromptPlaceholder: "Summarize the following text...",

    // -- Which models to use (dropdowns on the Preferences page) --
    transcription: "Transcription",
    whisperModel: "Transcriber model",
    formatSummarize: "Format & Summarize",
    preferredFormatter: "Formatter model",
    preferredChat: "Chat model",
    formatLanguage: "Format language",

    // ---- MODELS PAGE (section headings above each group) ----
    modelManagement: "Models",
    modelsInstalled: "installed",
    downloadModels: "Download models",
    whisperModelsHeader: "Transcriber models",
    formatterModelsHeader: "Formatter models",
    chatModelsHeader: "Chat models",
    embeddingModelsHeader: "Helper models (mandatory for the chat to be helpful)",

    // -- The button on each model card --
    get: "Get",
    downloadButton: "Download",
    downloading: "Downloading",
    delete: "Delete",
    deleteButton: "Delete",
    progress: "Progress",
    deletedTitle: "Deleted",
    deletedDesc: "Model deleted.",

    // -- About --
    version: "Muffin Transcriber v{version}",

    // -- The heart button in the top-right of every tab --
    // Opens buymeacoffee.com/riiickv in a browser tab.
    supportTitle: "Buy me a coffee! ☕",
    // DESCRIPTION under the heart pop-up. Rewrite this in your voice.
    supportMessage: "Muffin is free and works offline. If you like it and would like to support my project, here's how!",
    // The button that opens the page.
    supportButton: "Buy a coffee",
    // The "no thanks" button on that pop-up.
    supportCancel: "Maybe later",
  },

  // ==========================================================================
  //  MODEL CATALOG — the name + description on each model card in Settings
  // ==========================================================================
  models: {
    whisperTiny: "Faster",
    whisperTinyDesc: "Extremely fast for basic transcriptions. Recommended for low-end devices.",
    whisperBaseEn: "Base (English)",
    whisperBaseEnDesc: "Fast and highly accurate in English.",
    whisperSmall: "Balanced (Multilingual)",
    whisperSmallDesc: "Good balance of speed and accuracy.",
    whisperTurbo: "Slower",
    whisperTurboDesc: "Best for high accuracy. Recommended for high-end devices.",

    qwenSmall: "Faster",
    qwenSmallDesc: "Extremely fast but can make mistakes.",
    qwenLarge: "Balanced",
    qwenLargeDesc: "Good balance of speed and quality. Recommended for medium to high-end devices.",

    llama1b: "Slow",
    llama1bDesc: "Best quality. Recommended for high-end devices.",
    phi3Mini: "Slower",
    phi3MiniDesc: "Almost perfect. Recommended for very high-end devices.",

    miniLm: "Helper (mandatory for chat)",
    miniLmDesc: "This model allows the Chat to use the app for you if you're lazy.",

    // Shown inside a picker when there is nothing to pick yet.
    noneInstalled: "No models installed yet",
    noneInstalledDesc: "Models are what let the app work offline. Download one and it'll show up here.",
    goToModels: "Get a model",
  },

  // ==========================================================================
  //  POP-UP MESSAGES — every dialog box that can appear
  // ==========================================================================
  dialog: {
    defaultOk: "OK",
    selectOption: "Select Option",

    // -- Things you need to do first --
    noFileSelected: {
      title: "No file selected",
      message: "Pick an audio file first.",
    },
    noWhisperModel: {
      title: "No transcriber selected",
      message: "Choose a transcriber model.",
      messagePickOne: "Choose a transcriber model first.",
    },
    noFormatterModel: {
      title: "No formatter selected",
      message: "Choose a formatter model first.",
    },
    noChatModel: {
      title: "No chat selected",
      message: "Choose a chat model first.",
    },
    modelNotDownloaded: {
      title: "Model not downloaded",
      message: "Go to Settings > Models to download it.",
      messageWhisper: "Go to Settings > Models to download transcriber model.",
      messageFormatter: "Go to Settings > Models to download formatter model.",
      messageChat: "Go to Settings > Models to download chat model.",
      messageEmbedding: "Go to Settings > Models to download embedding model.",
    },
    micPermission: {
      title: "Microphone permission required",
      message: "Enable microphone access to record.",
    },
    noInternet: {
      title: "No internet connection",
      message: "Check your connection and try again.",
    },

    // -- Confirmations --
    confirmDelete: {
      title: "Delete transcript?",
      message: "Are you sure you want to delete this transcript?",
      cancel: "Cancel",
      delete: "Delete",
    },
    deleteChat: {
      title: "Delete chat?",
      messageNamed: "\"{name}\" will be deleted.",
      messageFallback: "This chat will be deleted.",
    },
    clearChat: {
      title: "Clear chat history",
      message: "Are you sure you want to delete your chat history?",
      clear: "Clear",
      clearedTitle: "Cleared",
      clearedMessage: "Chat history cleared.",
    },

    // -- Memory compression --
    compressSuccess: {
      title: "Success",
      message: "Memory compressed successfully!",
    },
    compressFailed: {
      title: "Not enough data",
      message: "Memory is already compressed or too small.",
    },

    // -- Missing audio --
    noAudio: {
      title: "No audio file",
      message: "This transcript has no associated audio.",
      messageReTranscribe: "This transcript has no associated audio file to re-transcribe.",
    },
    audioMissing: {
      title: "Audio missing",
      message: "The audio file is no longer available.",
    },

    // -- Something went wrong. The exact reason gets added underneath. --
    transcriptionFailed: { title: "Transcription failed" },
    reTranscribeFailed: { title: "Re-transcribe failed" },
    formattingFailed: { title: "Formatting failed" },
    summarizationFailed: { title: "Summarization failed" },
    actionFailed: {
      title: "Action failed",
      message: "Could not open in the app.",
    },
    recordingFailed: {
      title: "Recording failed",
      messageStart: "Could not start recording.",
      messageStop: "Could not stop the recording.",
      messageNoFile: "No audio file was produced.",
    },
  },

  // ==========================================================================
  //  ERROR SCREEN — only shows if the app gets badly lost
  // ==========================================================================
  notFound: {
    title: "Oops!",
    message: "This screen doesn't exist.",
    goHome: "Go to home screen!",
  },
};
