/**
 * ============================================================================
 *  EVERY PIECE OF TEXT THE USER CAN SEE IN THE APP.
 * ============================================================================
 *
 *  HOW TO USE THIS FILE
 *  --------------------
 *  Change any text on the right-hand side of the colon. That's it.
 *  Do NOT change the names on the left (`title:`, `cancel:`, ...) - those are
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
 *  NEVER leave a string empty ("") - the app will fall back to old text.
 *  If you want nothing there, use a single space: " ".
 *
 *  Organised by screen, in the order you'd meet them using the app.
 * ============================================================================
 */

export const APP_STRINGS = {
  // ==========================================================================
  //  WELCOME - one-time popup on first launch
  // ==========================================================================
  welcome: {
    welcomeTitle: "Muffin is OUT!",
    welcomeBody: "I will keep improving Muffin until I'm satisfied with what we got!\nIf you find it useful, feel free to tell me what you think about it, what you'd change, add or fix.\nThank you!",
    welcomeOk: "Got it",
  },

  // ==========================================================================
  //  BOTTOM NAVIGATION BAR - the 5 buttons at the bottom of the screen
  // ==========================================================================
  tabs: {
    transcribe: "Muffin!",
    record: "Record",
    history: "History",
    chat: "Chat",
    settings: "Settings",
  },

  // ==========================================================================
  //  SHARED - buttons and words reused all over the app
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
  //  "MUFFIN!" TAB - the main screen where you pick a file and transcribe it
  // ==========================================================================
  transcribe: {
    // -- FIRST RUN: shown instead of everything else when no model is
    // -- installed yet, because nothing works until one is.
    welcomeTitle: "Welcome to Muffin!",
    welcomeBody: "Muffin is a transcriber that uses AI to improve the text output. It can even learn from you and help you when the audio is unclear!",
    welcomeStep: "You can share your files with Muffin or record in the app, and it will do all the work for you!",
    welcomeButton: "Setup!",
    downloadingTitle: "Downloading models",

    // -- The Improve / Summarize card at the top --
    formatToggle: "Improve",
    summarizeToggle: "Summarize",
    formatterModelLabel: "Improvement quality",
    formatLanguageLabel: "Improvement language",
    customPromptLabel: "Be specific",
    outputShapeLabel: "Answer as",
    shapeAuto: "Auto",
    shapeBullets: "Bullets",
    shapeParagraph: "Paragraph",
    customPromptPlaceholder: "Use bullet points, max 100 words, etc.",

    // -- The file / engine card --
    languageLabel: "Language",
    whisperModelLabel: "Transcription quality",
    selectFileButton: "Pick file",
    transcribeButton: "Go!",
    heroRecord: "Tap to record",
    heroStop: "Recording. Tap to stop",
    newTranscription: "New",
    removeFile: "Remove file",
    listenButton: "Listen",

    // -- The transcript card at the bottom --
    transcriptTitle: "Transcript",
    transcriptPlaceholder: "Transcript will appear here.",
    rawTab: "Raw",
    formattedTab: "Improved",
    summaryTab: "Summary",

    // -- Progress messages shown while it works --
    loadingModel: "Loading transcriber...",
    convertingAudio: "Converting audio...",
    transcribing: "Transcribing...",
    formatting: "Improving...",
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
    supportDesc: "Muffin is free, private and works offline. If you like it and would like to support my project, here's how!",
    // The "no thanks" button on that pop-up.
    supportCancel: "Maybe later",
  },

  // ==========================================================================
  //  "RECORD" TAB - the big microphone button screen
  // ==========================================================================
  coach: {
    micHint: "Click to record/stop, hold for options!",
  },

  record: {
    // Raised WHILE recording, not after: a muted or hijacked microphone records
    // a flat signal, and finding out from an empty transcript means finding out
    // once the lecture is already over.
    silentTitle: "Muffin can't hear anything",
    silentBody: "This recording has been silent so far. Check that the right microphone is selected and nothing else is using it. Recording is still running.",

    optionsTitle: "Options",
    readyToTranscribe: "Ready to Transcribe",
    listening: "Listening...",
    using: "Using",
    noModelSelected: "No model selected",

    loadingModel: "Loading transcriber...",
    transcribing: "Transcribing...",

    // -- Compact labels on this screen (shorter than elsewhere, space is tight) --
    formatToggle: "Improve Transcript",
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
  //  "HISTORY" TAB - the list of everything you've transcribed
  // ==========================================================================
  history: {
    header: "History",
    noHistory: "No transcripts yet.",
    // Shown above the list when some transcripts are stored but could not be opened.
    unreadable: "Some transcripts could not be read.",
    emptyDesc: "Record or transcribe an audio file to see it here.",
    renameTranscript: "Rename Transcript",
    saveRename: "Save",
    openTranscript: "Open {name}",
    renameAction: "Rename transcript",
    deleteAction: "Delete transcript",
  },

  // ==========================================================================
  //  TRANSCRIPT DETAIL - opens when you tap a transcript in History
  // ==========================================================================
  historyDetail: {
    editTranscript: "Edit transcript",
    doneEditing: "Done",
    // -- Audio player at the top --
    play: "Play",
    pause: "Pause",
    audioMissing: "Audio file not found",

    // -- The three action buttons --
    retranscribe: "Re-Transcribe",
    format: "Improve",
    summarize: "Summarize",

    // -- What those buttons say while they're working --
    retranscribing: "Re-transcribing...",
    formatting: "Improving...",
    summarizing: "Summarizing...",
    working: "Working...",

    // -- When a summary can't be produced. These are STORED as the summary and
    //    shown in the transcript box, so they have to speak the user's language
    //    like everything else. --
    summaryTooShort: "Too short to summarize.",
    summaryFailed: "Couldn't summarize this one.",

    // -- Starting one AI action while another is running. {next} is what they
    //    just tapped, {current} is what's already going. --
    busyTitle: "One at a time!",
    busyMessage: "Starting {next} will stop {current}.",
    busyDontAsk: "Don't show this again",
    busyConfirm: "Ok!",
    /** Replaces the running action's own button while it works. */
    stop: "Stop",
    /** While the engine winds down - aborting isn't instant. */
    stopping: "Stopping...",

    // -- Model pickers --
    whisperModelLabel: "Transcription quality",
    formatterModelLabel: "Improvement quality",

    // -- Custom prompt box --
    customPromptLabel: "Be specific",
    customPromptPlaceholder: "Use bullet points, max 100 words, etc...",

    // -- Transcript box --
    transcriptTitle: "Transcript",
    rawTab: "Raw",
    formattedTab: "Improved",
    summaryTab: "Summary",
    copyButton: "Copy",
    copiedTitle: "Copied!",
    copiedDesc: "Text copied to clipboard",
    deleteButton: "Delete",
    backButton: "Back",
  },

  // ==========================================================================
  //  "CHAT" TAB - talking to the AI about your transcripts
  // ==========================================================================
  chat: {
    betaEnableBody: "Chat with Muffin isn't quite ready yet. You can test it and send feedback, which would speed its development up a lot.\n\nWhat works right now:\n• It can change the app's settings for you, and point you to them.\n• It knows the whole app, so it can help you find anything you need.\n• It can sometimes find the transcription you need if you tell it the topic.\n\nWhat doesn't:\n• You can't reliably chat with it, so it can't really help you brainstorm with your transcriptions yet. That's a limit of mobile devices, and I'm working on as many ways as I can to lighten the load on medium and lower-end phones.\n\nThere's a lot more planned, but it needs time and testing.\n\nThanks for your patience!\n\n-Rick",
    header: "Chat",
    beta: "Beta",
    betaTitle: "Chat in beta",
    betaBody: "Yes, it can do some things, the rest is total shit.\n\nI cannot find a way to make it work properly, not for all the nice features I want it to have, especially for lower-end models. I just didn't want it to slow down the release of the app, since the rest is ready, at least in my tests. If anything is terrible, send feedback on the Play Store and I'll see what I can do!",
    betaOk: "Ok!",
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
    notFound: "Not found in the notes.",
    noteCount: "Transcriptions: {count}.",
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
  //  "MEMORIES" SCREEN - words you teach the AI (opened from Settings)
  // ==========================================================================
  memory: {
    header: "Memories",
    noMemories: "No memories saved.",
    addCustom: "Add a memory",
    // The review list: things the assistant guessed while transcribing.
    // Nothing is saved until the user taps yes.
    suggestedTitle: "Did I get this right?",
    suggestedDesc: "Detected in recordings. Saved only when accepted.",
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
    exportTranscripts: "Export transcriptions",
    exportTranscriptsDesc: "Copy of all transcriptions in a chosen folder.",
    exportEmpty: "There is nothing to export yet.",
    exportDone: "Exported",
    exportDoneDesc: "Saved {count} transcriptions.",
    exportFailed: "Export failed",
    keepAfterUninstall: "Keep transcriptions after uninstalling",
    keepAfterUninstallDesc: "Copy in a chosen folder on the phone.",
    speedReport: "Speed report",
    copyReport: "Copy",
    clearReport: "Clear",
    chatBetaLabel: "Chat with Muffin",
    defaultLanguageDesc: "Language spoken in the recordings.",
    preferredFormatterDesc: "Model for Improve and Summarize.",
    chatBetaDesc: "Questions about saved transcriptions.",
    preferredChatDesc: "Model for chat.",
    compressProfileDesc: "Merged, shorter memories.",
    autoDeleteDesc: "Retention period for stored audio.",
    speedReportDesc: "Timings of recent transcriptions.",
    header: "Settings",

    // -- The two buttons at the bottom that switch the page --
    segmentPreferences: "Preferences",
    segmentModels: "Models",

    // ---- PREFERENCES PAGE ----
    general: "General",
    defaultLanguage: "Default language",

    autoDeleteLabel: "Auto-delete audio files",
    autoDeleteNever: "Never",
    autoDelete1Week: "1 Week",
    autoDelete1Month: "1 Month",

    normalizeAudio: "Normalize audio",
    normalizeAudioDesc: "Volume boost for quiet recordings.",
    progressive: "Fast draft first",
    progressiveDesc: "Rough text first, accurate text after. Higher battery use.",
    autoCopy: "Auto-copy transcript",
    autoCopyDesc: "Finished transcript to the clipboard.",
    typewriter: "Typewriter effect",
    typewriterDesc: "Letter-by-letter text display.",
    typewriterSpeed: "Typing speed",
    speedSlow: "Slow",
    speedBalanced: "Balanced",
    speedFast: "Fast",
    formatByDefault: "Improve by default",
    formatByDefaultDesc: "Improve after every transcription.",
    summarizeByDefault: "Summarize by default",
    summarizeByDefaultDesc: "Summarize after every transcription.",

    contextLearning: "Memory",
    contextLearningDesc: "Saved terms for unclear audio.",
    memoryContext: "Memory Context",
    memoryDesc: "Saved memories in transcription. Slower.",

    manageMemory: "Manage memories",
    compressProfile: "Optimize memories",
    compressing: "Optimizing...",
    compressingDesc: "Compressing...",
    clearChat: "Clear chat history",

    // -- Add-a-memory box --
    addMemory: "Add memory",
    addMemoryDesc: "Names, terms or facts for transcription.",
    addMemoryPlaceholder: "Add a memory",
    addMemoryBtn: "Add",
    saveMemory: "Save memory",
    deleteMemoryAction: "Delete memory",
    deleteMemoryTitle: "Delete memory?",
    noMemories: "No memories saved.",

    // -- Appearance --
    appearance: "Appearance",
    themeMode: "Theme",
    accentColor: "Accent color",
    themeAuto: "Auto",
    themeLight: "Light",
    themeDark: "Dark",
    themeBlack: "Black",
    accentSystem: "System",
    accentMuffin: "Muffin",
    accentGreen: "Green",
    accentPurple: "Purple",
    accentRed: "Red",
    uiScale: "UI size",
    uiScaleCompact: "Compact",
    uiScaleNormal: "Normal",
    uiScaleComfy: "Comfy",
    uiScaleTitle: "Change UI size?",
    uiScaleMessage: "The app reloads for a moment to apply the new size.",
    uiScaleApply: "Apply",
    // -- The app's own language (this picker) --
    appLanguage: "App language",
    appLanguageDesc: "Automatic: the phone's language.",

    // -- Custom prompts --
    customPrompts: "Custom prompts",
    customPromptsFooter: "Empty: default prompts. Applied to every transcript.",
    storageHeader: "Storage",
    customPrompt: "Custom prompt",
    formatSystemPrompt: "Improvement default prompt",
    formatSystemPromptPlaceholder: "You are an expert editor...",
    summarySystemPrompt: "Summary default prompt",
    summarySystemPromptPlaceholder: "Summarize the following text...",

    // -- Which models to use (dropdowns on the Preferences page) --
    transcription: "Transcription",
    whisperModel: "Transcriber model",
    formatSummarize: "Improve & Summarize",
    preferredFormatter: "Formatter model",
    preferredChat: "Chat model",
    formatLanguage: "Improvement language",

    // ---- MODELS PAGE (section headings above each group) ----
    modelManagement: "Models",
    modelsInstalled: "installed",
    downloadModels: "Download models",
    whisperModelsHeader: "Transcriber models",
    formatterModelsHeader: "Formatter models",
    chatModelsHeader: "Chat models",
    embeddingModelsHeader: "Helper models (optional)",
    modelListOptions: "List options",
    showModelNames: "Show model names",
    showModelNamesDesc: "Technical model names.",
    showTimeEstimate: "Show estimated time",
    showTimeEstimateDesc: "Expected time per model on this phone.",

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
    aboutHeader: "About",
    privacyPolicy: "Privacy policy",

    // -- The heart button in the top-right of every tab --
    // Opens buymeacoffee.com/riiickv in a browser tab.
    supportTitle: "Support me!",
    // DESCRIPTION under the heart pop-up. Rewrite this in your voice.
    supportMessage: "Muffin is free, private and works offline. If you like it and would like to support my project, here's how!",
    // The button that opens the page.
    supportButton: "Buy a coffee",
    // The "no thanks" button on that pop-up.
    supportCancel: "Maybe later",
  },

  // ==========================================================================
  //  MODEL CATALOG - the name + description on each model card in Settings
  // ==========================================================================
  // ==========================================================================
  //  FIRST-RUN SETUP - the guided pages that download the models
  // ==========================================================================
  setup: {
    transcriberTitle: "Transcriber!",
    transcriberBody: "This is your transcriber.\n\nThe highlighted one is suggested for your device, but you can download as many as you want.",

    formatterTitle: "Formatter and Summarizer!",
    formatterBody: "This is the brain of your transcriptions. It fixes them for you! You can even tell it how you want them.\n\nThe highlighted one is suggested for your device, but you can download as many as you want.",

    optionalTitle: "Optional!",
    optionalBody: "A few optional but useful tools you might need!",
    chatSectionTitle: "Chat model!",
    // Shown above the chat list when the phone can't really run any of them.
    chatNoneSuggested: "Oh no! No model is really suggested for your device. You can still try them, but they will be slooow.",
    butlerSectionTitle: "Butler!",
    butlerBody: "This will help you extract useful content from the transcriptions, like important dates. The text will be highlighted, so keep an eye out for it!",

    back: "Back",
    next: "Next!",
    finish: "Start!",
    noModelTitle: "No model is installed",
    noModelBody: "Are you sure you want to continue? You can still download them in Settings.",
    letMeIn: "Let me in",
  },

  models: {
    // Tier labels, shared across model groups. Each is a speed/quality rung,
    // not a product name - see ModelDef in utils/ModelManager.ts. Shown through
    // modelName()/modelDesc(), so these are what makes the pickers translate.
    tierFastest: "Fastest",
    tierFast: "Fast",
    tierFastQuality: "Fast, high quality",
    tierBalanced: "Balanced",
    tierBest: "Best quality",
    tierAccurate: "Most accurate",
    tierSmartSearch: "Smart search",

    // One-line blurb per model.
    descWhisperFastest: "Short, clear speech. Lowest accuracy.",
    descWhisperBalanced: "General speech. All languages.",
    descWhisperAccurate: "Accents, background noise. All languages.",
    descSpeechFast: "Speech in 25 European languages.",
    estimatePerRecording: "about {t} per recording",
    estimatePerMinute: "about {t} per minute of recording",
    measuredPerRecording: "{t} per recording on this phone",
    measuredPerMinute: "{t} per minute of recording on this phone",
    descFmtFastest: "Improve, Summarize. Lowest quality.",
    descFmtFast: "Improve, Summarize. Low quality.",
    descFmtBalanced: "Improve, Summarize. Medium quality.",
    descFmtBest: "Improve, Summarize. Highest quality.",
    descChatFast: "Chat. Short answers.",
    descChatBest: "Chat. Detailed answers. High memory use.",
    descEmbed: "Chat search by meaning. All languages.",

    // Shown inside a picker when there is nothing to pick yet.
    noneInstalled: "No models installed yet",
    noneInstalledDesc: "Downloaded model required.",
    goToModels: "Get a model",
  },

  // ==========================================================================
  //  SPOKEN-LANGUAGE PICKERS - the two special options. The ~100 real language
  //  names are localized at runtime from their code (utils/languages.ts), so
  //  they're not listed here.
  // ==========================================================================
  languages: {
    autoDetect: "Auto-Detect",
    original: "Original",
  },

  // The download progress banner / header ring. {model} is the tier name.
  downloads: {
    downloading: "Downloading",
    downloadingModel: "Downloading {model}",
    pause: "Pause",
    resume: "Resume",
    cancel: "Cancel",
  },

  // ==========================================================================
  //  POP-UP MESSAGES - every dialog box that can appear
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
    formattingFailed: { title: "Improvement failed" },
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
  //  ERROR SCREEN - only shows if the app gets badly lost
  // ==========================================================================
  notFound: {
    title: "Oops!",
    message: "This screen doesn't exist.",
    goHome: "Go to home screen!",
  },
};
