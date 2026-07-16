/** DEUTSCH — Übersetzung von constants/strings.ts. Fehlt ein Schlüssel, zeigt die App Englisch. */
export const DE = {
  tabs: { transcribe: "Muffin!", record: "Aufnehmen", history: "Verlauf", chat: "Chat", settings: "Einstellungen" },

  common: {
    ok: "OK", cancel: "Abbrechen", save: "Speichern", delete: "Löschen", close: "Schließen",
    back: "Zurück", copy: "Kopieren", notSet: "Nicht festgelegt", loading: "Lädt...",
  },

  transcribe: {
    welcomeTitle: "Willkommen bei Muffin!",
    welcomeBody: "Muffin ist ein Transkribierer, er nutzt KI, um den Text zu verbessern. Optional, aber empfohlen!",
    welcomeStep: "Du kannst deine Dateien mit Muffin teilen und er macht die ganze Arbeit für dich!",
    welcomeReminderTitle: "ERINNERUNG",
    welcomeReminder: "Wenn du transkribieren oder zusammenfassen willst, musst du ein Modell manuell herunterladen.",
    formatToggle: "Formatieren",
    summarizeToggle: "Zusammenfassen",
    formatterModelLabel: "Formatierungsqualität",
    formatLanguageLabel: "Formatierungssprache",
    customPromptLabel: "Sei genau",
    customPromptPlaceholder: "Nutze Stichpunkte, maximal 100 Wörter, usw.",

    languageLabel: "Sprache",
    whisperModelLabel: "Transkriptionsqualität",
    selectFileButton: "Datei wählen",
    transcribeButton: "Los!",
    listenButton: "Anhören",

    transcriptTitle: "Transkript",
    transcriptPlaceholder: "Das Transkript erscheint hier.",
    rawTab: "Roh",
    formattedTab: "Formatiert",
    summaryTab: "Zusammenfassung",

    loadingModel: "Transkribierer wird geladen...",
    convertingAudio: "Audio wird konvertiert...",
    transcribing: "Wird transkribiert...",
    formatting: "Wird formatiert...",
    summarizing: "Wird zusammengefasst...",
    generatingTitle: "Titel wird erstellt...",

    noTitle: "Sprachnotiz",
    importedAudio: "Importiertes Audio",

    whileWaiting: "Während du wartest...",
    supportMe: "Unterstütze mich!",
    supportDesc: "Muffin ist kostenlos und läuft offline. Wenn es dir gefällt und du mein Projekt unterstützen willst, hier ist wie!",
    supportCancel: "Vielleicht später",
  },

  record: {
    readyToTranscribe: "Bereit zum Transkribieren",
    listening: "Ich höre zu...",
    using: "Nutzt",
    noModelSelected: "Kein Modell ausgewählt",

    loadingModel: "Transkribierer wird geladen...",
    transcribing: "Wird transkribiert...",

    formatToggle: "Transkript formatieren",
    summarizeToggle: "Zusammenfassen",
    whisperModelLabel: "Whisper",
    languageLabel: "Sprache",
    formatterModelLabel: "Formatierer",
    formatLanguageLabel: "Ausgabe",

    startRecording: "Aufnahme starten",
    stopRecording: "Aufnahme stoppen",

    transcriptTitle: "Transkript",
    transcriptPlaceholder: "Deine Worte erscheinen hier nach der Aufnahme.",
    copyButton: "Kopieren",
    copied: "Kopiert!",
  },

  history: {
    header: "Verlauf",
    noHistory: "Noch keine Transkripte.",
    emptyDesc: "Nimm etwas auf oder transkribiere eine Audiodatei, um sie hier zu sehen.",
    renameTranscript: "Transkript umbenennen",
    saveRename: "Speichern",
    openTranscript: "{name} öffnen",
    renameAction: "Transkript umbenennen",
    deleteAction: "Transkript löschen",
  },

  historyDetail: {
    play: "Abspielen", pause: "Pause", audioMissing: "Audiodatei nicht gefunden",

    retranscribe: "Neu transkribieren", format: "Formatieren", summarize: "Zusammenfassen",

    retranscribing: "Wird neu transkribiert...",
    formatting: "Wird formatiert...",
    summarizing: "Wird zusammengefasst...",
    working: "Arbeitet...",

    whisperModelLabel: "Transkriptionsqualität",
    formatterModelLabel: "Formatierungsqualität",

    customPromptLabel: "Sei genau",
    customPromptPlaceholder: "Nutze Stichpunkte, maximal 100 Wörter, usw...",

    transcriptTitle: "Transkript",
    rawTab: "Roh",
    formattedTab: "Formatiert",
    summaryTab: "Zusammenfassung",
    copyButton: "Kopieren",
    copiedTitle: "Kopiert!",
    copiedDesc: "Text in die Zwischenablage kopiert",
    deleteButton: "Löschen",
    backButton: "Zurück",
  },

  chat: {
    header: "Chat",
    inputPlaceholder: "Frag mich etwas zu deinen Transkripten...",
    sendButton: "Senden",
    thinking: "Denkt nach...",
    emptyState: "Du kannst mich alles zu deinen Transkripten fragen, sag mir einfach, was du brauchst!",
    errorMessage: "Sorry, etwas ist schiefgelaufen. Das sagt die App:",
    noMemory: "Ich konnte mich an nichts Passendes erinnern.",
    modelLoadFailed: "Die Chat-Modell-Datei scheint unvollständig oder beschädigt zu sein. Lösche sie unter Einstellungen > Modelle und lade sie erneut herunter.",
    modelBrokenTitle: "Chat-Modell unvollständig",
    modelBrokenMessage: "Die Modelldatei ist {actual} groß, sollte aber etwa {expected} sein. Der Download wurde unterbrochen. Lösche sie unter Einstellungen > Modelle, lade sie erneut herunter und bleib auf dem Bildschirm, bis es fertig ist.",

    noModelSelected: "Kein Chat-Modell ausgewählt",
    noModelSubtitle: "Geh in die Einstellungen und wähle ein Chat-Modell, um den Assistenten zu nutzen.",
    goToSettings: "Zu den Einstellungen",

    chats: "Chats",
    newChat: "Neuer Chat",
    noChats: "Noch keine Chats.",
    noChatsHint: "Tippe oben auf +, um einen zu starten.",
    renameChat: "Chat umbenennen",
    deleteChat: "Chat löschen",

    actionExecuted: "Fertig",
    actionFailed: "Hat nicht geklappt",
    renameAskTitle: "Wie soll es heißen?",
    renameAskMessage: "\"{name}\" wird umbenannt",
    deleteTitle: "Transkript löschen?",
    deleteMessage: "„{name}“ löschen? Das lässt sich nicht rückgängig machen.",
    deleteManyTitle: "{count} Transkripte löschen?",
    deleteManyMessage: "Diese werden gelöscht:\n{list}\n\nDas lässt sich nicht rückgängig machen.",
    delete: "Löschen",
    deleteMessageAction: "Nachricht löschen",

    addTo: "Hinzufügen zu",
    calendar: "Kalender",
    alarms: "Wecker",
    eventName: "Name des Termins",
    openNativeApp: "App öffnen",
  },

  memory: {
    header: "Erinnerungen",
    noMemories: "Noch keine Erinnerungen gespeichert. Chatte weiter oder füge welche hinzu.",
    addCustom: "Erinnerung hinzufügen",
    suggestedTitle: "Habe ich das richtig verstanden?",
    suggestedDesc: "Das habe ich aus deinen Aufnahmen aufgeschnappt. Ich liege oft daneben, also wird nichts gespeichert, bis du ja sagst.",
    dismissAll: "Nein zu allem",
    dismissOne: "Nein",
    acceptOne: "Ja, merk dir das",
    memoryPrompt: "Du kannst mich alles zu deinen Transkripten fragen, sag mir einfach, was du brauchst!",
    backButton: "Zurück",
  },

  settings: {
    header: "Einstellungen",

    segmentPreferences: "Einstellungen",
    segmentModels: "Modelle",

    general: "Allgemein",
    defaultLanguage: "Standardsprache",

    autoDeleteLabel: "Audiodateien automatisch löschen",
    autoDeleteNever: "Nie",
    autoDelete1Week: "1 Woche",
    autoDelete1Month: "1 Monat",

    normalizeAudio: "Audio normalisieren",
    normalizeAudioDesc: "Hebt leise Stellen an für eine sauberere Transkription.",
    autoCopy: "Transkript automatisch kopieren",
    autoCopyDesc: "Kopiert es nach Abschluss in die Zwischenablage",
    formatByDefault: "Standardmäßig formatieren",
    formatByDefaultDesc: "Formatiert das Transkript nach dem Transkribieren",
    summarizeByDefault: "Standardmäßig zusammenfassen",
    summarizeByDefaultDesc: "Fasst das Transkript nach dem Transkribieren zusammen",

    contextLearning: "Erinnerung",
    contextLearningDesc: "Erinnerungen helfen, Lücken zu füllen, wenn das Audio unklar ist.",
    memoryContext: "Erinnerungskontext",
    memoryDesc: "Erlaubt der Transkription, Erinnerungen zu nutzen. Genauer, aber langsamer.",

    manageMemory: "Erinnerungen verwalten",
    compressProfile: "Erinnerungen optimieren",
    compressing: "Wird optimiert...",
    compressingDesc: "Wird komprimiert...",
    clearChat: "Chatverlauf löschen",

    addMemory: "Erinnerung hinzufügen",
    addMemoryDesc: "Bring Muffin bestimmte Namen, Begriffe oder Fakten bei.",
    addMemoryPlaceholder: "Erinnerung hinzufügen",
    addMemoryBtn: "Hinzufügen",
    saveMemory: "Erinnerung speichern",
    deleteMemoryAction: "Erinnerung löschen",
    deleteMemoryTitle: "Erinnerung löschen?",
    noMemories: "Noch keine Erinnerungen gespeichert. Chatte weiter oder füge welche hinzu.",

    appearance: "Aussehen",
    themeMode: "Design",
    accentColor: "Akzentfarbe",

    customPrompts: "Eigene Prompts",
    customPromptsFooter: "Leer lassen, um Muffins Standard zu nutzen. Gilt für jedes Transkript.",
    storageHeader: "Speicher",
    customPrompt: "Eigener Prompt",
    formatSystemPrompt: "Standard-Formatierungsprompt",
    formatSystemPromptPlaceholder: "Du bist ein erfahrener Lektor...",
    summarySystemPrompt: "Standard-Zusammenfassungsprompt",
    summarySystemPromptPlaceholder: "Fasse den folgenden Text zusammen...",

    transcription: "Transkription",
    whisperModel: "Transkribierer-Modell",
    formatSummarize: "Formatieren & Zusammenfassen",
    preferredFormatter: "Formatierer-Modell",
    preferredChat: "Chat-Modell",
    formatLanguage: "Formatierungssprache",

    modelManagement: "Modelle",
    modelsInstalled: "installiert",
    downloadModels: "Modelle herunterladen",
    whisperModelsHeader: "Transkribierer-Modelle",
    formatterModelsHeader: "Formatierer-Modelle",
    chatModelsHeader: "Chat-Modelle",
    embeddingModelsHeader: "Hilfsmodelle (nötig, damit der Chat nützlich ist)",

    get: "Laden",
    downloadButton: "Herunterladen",
    downloading: "Lädt herunter",
    delete: "Löschen",
    deleteButton: "Löschen",
    progress: "Fortschritt",
    deletedTitle: "Gelöscht",
    deletedDesc: "Modell gelöscht.",

    version: "Muffin Transcriber v{version}",

    supportTitle: "Spendier mir einen Kaffee! ☕",
    supportMessage: "Muffin ist kostenlos und läuft offline. Wenn es dir gefällt und du mein Projekt unterstützen willst, hier ist wie!",
    supportButton: "Kaffee spendieren",
    supportCancel: "Vielleicht später",

    appLanguage: "App-Sprache",
    appLanguageDesc: "Automatisch folgt der Sprache des Telefons.",
  },

  models: {
    whisperTiny: "Schneller",
    whisperTinyDesc: "Extrem schnell für einfache Transkriptionen. Empfohlen für schwächere Geräte.",
    whisperBaseEn: "Base (Englisch)",
    whisperBaseEnDesc: "Schnell und sehr genau auf Englisch.",
    whisperSmall: "Ausgewogen (mehrsprachig)",
    whisperSmallDesc: "Gutes Gleichgewicht aus Tempo und Genauigkeit.",
    whisperTurbo: "Langsamer",
    whisperTurboDesc: "Am besten für hohe Genauigkeit. Empfohlen für starke Geräte.",

    qwenSmall: "Schneller",
    qwenSmallDesc: "Extrem schnell, macht aber Fehler.",
    qwenLarge: "Ausgewogen",
    qwenLargeDesc: "Gutes Gleichgewicht aus Tempo und Qualität. Empfohlen für mittlere bis starke Geräte.",

    llama1b: "Langsam",
    llama1bDesc: "Beste Qualität. Empfohlen für starke Geräte.",
    phi3Mini: "Langsamer",
    phi3MiniDesc: "Fast perfekt. Empfohlen für sehr starke Geräte.",

    miniLm: "Hilfsmodell (nötig für den Chat)",
    miniLmDesc: "Dieses Modell lässt den Chat die App für dich bedienen, wenn du faul bist.",

    noneInstalled: "Keine Modelle installiert",
    noneInstalledDesc: "Modelle sind das, was die App offline laufen lässt. Lade eins herunter und es erscheint hier.",
    goToModels: "Modell herunterladen",
  },

  dialog: {
    defaultOk: "OK",
    selectOption: "Option wählen",

    noFileSelected: { title: "Keine Datei ausgewählt", message: "Wähle zuerst eine Audiodatei." },
    noWhisperModel: {
      title: "Kein Transkribierer ausgewählt",
      message: "Wähle ein Transkribierer-Modell.",
      messagePickOne: "Wähle zuerst ein Transkribierer-Modell.",
    },
    noFormatterModel: { title: "Kein Formatierer ausgewählt", message: "Wähle zuerst ein Formatierer-Modell." },
    noChatModel: { title: "Kein Chat ausgewählt", message: "Wähle zuerst ein Chat-Modell." },
    modelNotDownloaded: {
      title: "Modell nicht heruntergeladen",
      message: "Geh zu Einstellungen > Modelle, um es herunterzuladen.",
      messageWhisper: "Geh zu Einstellungen > Modelle, um das Transkribierer-Modell herunterzuladen.",
      messageFormatter: "Geh zu Einstellungen > Modelle, um das Formatierer-Modell herunterzuladen.",
      messageChat: "Geh zu Einstellungen > Modelle, um das Chat-Modell herunterzuladen.",
      messageEmbedding: "Geh zu Einstellungen > Modelle, um das Embedding-Modell herunterzuladen.",
    },
    micPermission: { title: "Mikrofonberechtigung nötig", message: "Erlaube den Mikrofonzugriff, um aufzunehmen." },
    noInternet: { title: "Keine Internetverbindung", message: "Prüfe deine Verbindung und versuch es nochmal." },

    confirmDelete: {
      title: "Transkript löschen?",
      message: "Willst du dieses Transkript wirklich löschen?",
      cancel: "Abbrechen",
      delete: "Löschen",
    },
    deleteChat: {
      title: "Chat löschen?",
      messageNamed: "„{name}“ wird gelöscht.",
      messageFallback: "Dieser Chat wird gelöscht.",
    },
    clearChat: {
      title: "Chatverlauf löschen",
      message: "Willst du deinen Chatverlauf wirklich löschen?",
      clear: "Löschen",
      clearedTitle: "Gelöscht",
      clearedMessage: "Chatverlauf gelöscht.",
    },

    compressSuccess: { title: "Fertig", message: "Erinnerung erfolgreich komprimiert!" },
    compressFailed: { title: "Zu wenig Daten", message: "Die Erinnerung ist schon komprimiert oder zu klein." },

    noAudio: {
      title: "Keine Audiodatei",
      message: "Zu diesem Transkript gibt es kein Audio.",
      messageReTranscribe: "Zu diesem Transkript gibt es keine Audiodatei zum neu Transkribieren.",
    },
    audioMissing: { title: "Audio fehlt", message: "Die Audiodatei ist nicht mehr verfügbar." },

    transcriptionFailed: { title: "Transkription fehlgeschlagen" },
    reTranscribeFailed: { title: "Neu-Transkribieren fehlgeschlagen" },
    formattingFailed: { title: "Formatieren fehlgeschlagen" },
    summarizationFailed: { title: "Zusammenfassen fehlgeschlagen" },
    actionFailed: { title: "Aktion fehlgeschlagen", message: "Die App konnte nicht geöffnet werden." },
    recordingFailed: {
      title: "Aufnahme fehlgeschlagen",
      messageStart: "Die Aufnahme konnte nicht gestartet werden.",
      messageStop: "Die Aufnahme konnte nicht gestoppt werden.",
      messageNoFile: "Es wurde keine Audiodatei erzeugt.",
    },
  },

  notFound: { title: "Hoppla!", message: "Diesen Bildschirm gibt es nicht.", goHome: "Zum Startbildschirm!" },
};
