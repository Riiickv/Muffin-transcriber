/**
 * ITALIANO — traduzione di constants/strings.ts
 *
 * Cambia solo il testo tra virgolette. NON cambiare i nomi a sinistra dei due
 * punti: sono quelli che il codice cerca.
 *
 * Se una chiave manca qui, l'app mostra l'inglese. Quindi puoi cancellare una
 * riga senza rompere niente.
 */
export const IT = {
  tabs: {
    transcribe: "Muffin!",
    record: "Registra",
    history: "Cronologia",
    chat: "Chat",
    settings: "Impostazioni",
  },

  common: {
    ok: "OK",
    cancel: "Annulla",
    save: "Salva",
    delete: "Elimina",
    close: "Chiudi",
    back: "Indietro",
    copy: "Copia",
    notSet: "Non impostato",
    loading: "Caricamento...",
  },

  transcribe: {
    welcomeTitle: "Benvenuto su Muffin!",
    welcomeBody: "Muffin trasforma i messaggi vocali in testo. Succede tutto sul tuo telefono e non viene caricato niente.",
    welcomeStep: "Per iniziare, scarica un modello. È quello che fa il lavoro. Ci vuole qualche minuto e lo fai una volta sola.",
    formatToggle: "Formatta",
    summarizeToggle: "Riassumi",
    formatterModelLabel: "Qualità formattazione",
    formatLanguageLabel: "Lingua formattazione",
    customPromptLabel: "Sii specifico",
    customPromptPlaceholder: "Usa elenchi puntati, massimo 100 parole, ecc.",

    languageLabel: "Lingua",
    whisperModelLabel: "Qualità trascrizione",
    selectFileButton: "Scegli file",
    transcribeButton: "Via!",
    listenButton: "Ascolta",

    transcriptTitle: "Trascrizione",
    transcriptPlaceholder: "La trascrizione apparirà qui.",
    rawTab: "Grezzo",
    formattedTab: "Formattato",
    summaryTab: "Riassunto",

    loadingModel: "Caricamento trascrittore...",
    convertingAudio: "Conversione audio...",
    transcribing: "Trascrizione in corso...",
    formatting: "Formattazione...",
    summarizing: "Riassunto in corso...",
    generatingTitle: "Creazione titolo...",

    noTitle: "Nota vocale",
    importedAudio: "Audio importato",

    whileWaiting: "Nel frattempo...",
    supportMe: "Supportami!",
    supportDesc: "Muffin è gratis e funziona offline. Se ti piace e vuoi supportare il mio progetto, ecco come!",
    supportCancel: "Magari dopo",
  },

  record: {
    readyToTranscribe: "Pronto a trascrivere",
    listening: "Sto ascoltando...",
    using: "Uso",
    noModelSelected: "Nessun modello selezionato",

    loadingModel: "Caricamento trascrittore...",
    transcribing: "Trascrizione in corso...",

    formatToggle: "Formatta trascrizione",
    summarizeToggle: "Riassumi",
    whisperModelLabel: "Whisper",
    languageLabel: "Lingua",
    formatterModelLabel: "Formattatore",
    formatLanguageLabel: "Output",

    startRecording: "Inizia registrazione",
    stopRecording: "Ferma registrazione",

    transcriptTitle: "Trascrizione",
    transcriptPlaceholder: "Le tue parole appariranno qui dopo la registrazione.",
    copyButton: "Copia",
    copied: "Copiato!",
  },

  history: {
    header: "Cronologia",
    noHistory: "Ancora nessuna trascrizione.",
    emptyDesc: "Registra o trascrivi un file audio per vederlo qui.",
    renameTranscript: "Rinomina trascrizione",
    saveRename: "Salva",
    openTranscript: "Apri {name}",
    renameAction: "Rinomina trascrizione",
    deleteAction: "Elimina trascrizione",
  },

  historyDetail: {
    play: "Riproduci",
    pause: "Pausa",
    audioMissing: "File audio non trovato",

    retranscribe: "Ritrascrivi",
    format: "Formatta",
    summarize: "Riassumi",

    retranscribing: "Ritrascrizione...",
    formatting: "Formattazione...",
    summarizing: "Riassunto in corso...",
    working: "Elaborazione...",

    whisperModelLabel: "Qualità trascrizione",
    formatterModelLabel: "Qualità formattazione",

    customPromptLabel: "Sii specifico",
    customPromptPlaceholder: "Usa elenchi puntati, massimo 100 parole, ecc...",

    transcriptTitle: "Trascrizione",
    rawTab: "Grezzo",
    formattedTab: "Formattato",
    summaryTab: "Riassunto",
    copyButton: "Copia",
    copiedTitle: "Copiato!",
    copiedDesc: "Testo copiato negli appunti",
    deleteButton: "Elimina",
    backButton: "Indietro",
  },

  chat: {
    header: "Chat",
    inputPlaceholder: "Chiedimi delle tue trascrizioni...",
    sendButton: "Invia",
    thinking: "Sto pensando...",
    emptyState: "Puoi chiedermi qualsiasi cosa sulle tue trascrizioni, dimmi solo cosa ti serve!",
    errorMessage: "Scusa, qualcosa è andato storto. Ecco cosa dice l'app:",
    noMemory: "Non sono riuscito a ricordare niente di utile.",
    modelLoadFailed: "Il file del modello di chat sembra incompleto o danneggiato. Eliminalo in Impostazioni > Modelli e scaricalo di nuovo.",
    modelBrokenTitle: "Modello di chat incompleto",
    modelBrokenMessage: "Il file del modello è di {actual} ma dovrebbe essere circa {expected}. Il download si è interrotto. Eliminalo in Impostazioni > Modelli, poi scaricalo di nuovo e resta su quella schermata finché non finisce.",

    noModelSelected: "Nessun modello di chat selezionato",
    noModelSubtitle: "Vai nelle Impostazioni e seleziona un modello di chat per usare l'assistente.",
    goToSettings: "Vai alle Impostazioni",

    chats: "Chat",
    newChat: "Nuova chat",
    noChats: "Ancora nessuna chat.",
    noChatsHint: "Tocca + qui sopra per iniziare.",
    renameChat: "Rinomina chat",
    deleteChat: "Elimina chat",

    actionExecuted: "Fatto",
    actionFailed: "Non ci sono riuscito",
    renameAskTitle: "Come lo chiamo?",
    renameAskMessage: "Stai rinominando \"{name}\"",
    deleteTitle: "Eliminare la trascrizione?",
    deleteMessage: "Eliminare “{name}”? Non si può annullare.",
    deleteManyTitle: "Eliminare {count} trascrizioni?",
    deleteManyMessage: "Verranno eliminate:\n{list}\n\nNon si può annullare.",
    delete: "Elimina",
    deleteMessageAction: "Elimina messaggio",

    addTo: "Aggiungi a",
    calendar: "Calendario",
    alarms: "Sveglie",
    eventName: "Nome evento",
    openNativeApp: "Apri app",
  },

  memory: {
    header: "Memorie",
    noMemories: "Ancora nessuna memoria salvata. Continua a chattare o aggiungile.",
    addCustom: "Aggiungi una memoria",
    suggestedTitle: "Ho capito bene?",
    suggestedDesc: "Ho colto queste cose dalle tue registrazioni. Sbaglio spesso, quindi non salvo niente finché non dici di sì.",
    dismissAll: "No a tutto",
    dismissOne: "No",
    acceptOne: "Sì, ricordalo",
    memoryPrompt: "Puoi chiedermi qualsiasi cosa sulle tue trascrizioni, dimmi solo cosa ti serve!",
    backButton: "Indietro",
  },

  settings: {
    header: "Impostazioni",

    segmentPreferences: "Preferenze",
    segmentModels: "Modelli",

    general: "Generale",
    defaultLanguage: "Lingua predefinita",

    autoDeleteLabel: "Elimina automaticamente i file audio",
    autoDeleteNever: "Mai",
    autoDelete1Week: "1 settimana",
    autoDelete1Month: "1 mese",

    normalizeAudio: "Normalizza audio",
    normalizeAudioDesc: "Alza il volume basso per una trascrizione più pulita.",
    autoCopy: "Copia automaticamente la trascrizione",
    autoCopyDesc: "Copia negli appunti quando ha finito",
    formatByDefault: "Formatta di default",
    formatByDefaultDesc: "Formatta la trascrizione dopo averla trascritta",
    summarizeByDefault: "Riassumi di default",
    summarizeByDefaultDesc: "Riassume la trascrizione dopo averla trascritta",

    contextLearning: "Memoria",
    contextLearningDesc: "La memoria aiuta a riempire i vuoti quando l'audio non è chiaro.",
    memoryContext: "Contesto memoria",
    memoryDesc: "Permette alla trascrizione di usare le memorie. Più precisa ma più lenta.",

    manageMemory: "Gestisci memorie",
    compressProfile: "Ottimizza memorie",
    compressing: "Ottimizzazione...",
    compressingDesc: "Compressione...",
    clearChat: "Cancella cronologia chat",

    addMemory: "Aggiungi memoria",
    addMemoryDesc: "Insegna a Muffin nomi, termini o fatti specifici.",
    addMemoryPlaceholder: "Aggiungi una memoria",
    addMemoryBtn: "Aggiungi",
    saveMemory: "Salva memoria",
    deleteMemoryAction: "Elimina memoria",
    deleteMemoryTitle: "Eliminare la memoria?",
    noMemories: "Ancora nessuna memoria salvata. Continua a chattare o aggiungile.",

    appearance: "Aspetto",
    themeMode: "Tema",
    accentColor: "Colore principale",

    customPrompts: "Prompt personalizzati",
    customPromptsFooter: "Lascia vuoto per usare i valori predefiniti di Muffin. Valgono per ogni trascrizione.",
    storageHeader: "Archiviazione",
    customPrompt: "Prompt personalizzato",
    formatSystemPrompt: "Prompt predefinito di formattazione",
    formatSystemPromptPlaceholder: "Sei un editor esperto...",
    summarySystemPrompt: "Prompt predefinito di riassunto",
    summarySystemPromptPlaceholder: "Riassumi il testo seguente...",

    transcription: "Trascrizione",
    whisperModel: "Modello trascrittore",
    formatSummarize: "Formatta e riassumi",
    preferredFormatter: "Modello formattatore",
    preferredChat: "Modello chat",
    formatLanguage: "Lingua formattazione",

    modelManagement: "Modelli",
    modelsInstalled: "installati",
    downloadModels: "Scarica modelli",
    whisperModelsHeader: "Modelli trascrittore",
    formatterModelsHeader: "Modelli formattatore",
    chatModelsHeader: "Modelli chat",
    embeddingModelsHeader: "Modelli di supporto (obbligatori perché la chat sia utile)",

    get: "Scarica",
    downloadButton: "Scarica",
    downloading: "Scaricamento",
    delete: "Elimina",
    deleteButton: "Elimina",
    progress: "Avanzamento",
    deletedTitle: "Eliminato",
    deletedDesc: "Modello eliminato.",

    version: "Muffin Transcriber v{version}",

    supportTitle: "Offrimi un caffè! ☕",
    supportMessage: "Muffin è gratis e funziona offline. Se ti piace e vuoi supportare il mio progetto, ecco come!",
    supportButton: "Offri un caffè",
    supportCancel: "Magari dopo",

    // -- Lingua dell'app (questo selettore) --
    appLanguage: "Lingua dell'app",
    appLanguageDesc: "Automatica segue la lingua del telefono.",
  },

  models: {
    whisperTiny: "Più veloce",
    whisperTinyDesc: "Velocissimo per trascrizioni semplici. Consigliato per dispositivi poco potenti.",
    whisperBaseEn: "Base (inglese)",
    whisperBaseEnDesc: "Veloce e molto preciso in inglese.",
    whisperSmall: "Bilanciato (multilingua)",
    whisperSmallDesc: "Buon equilibrio tra velocità e precisione.",
    whisperTurbo: "Più lento",
    whisperTurboDesc: "Il migliore per l'alta precisione. Consigliato per dispositivi potenti.",

    qwenSmall: "Più veloce",
    qwenSmallDesc: "Velocissimo ma può sbagliare.",
    qwenLarge: "Bilanciato",
    qwenLargeDesc: "Buon equilibrio tra velocità e qualità. Consigliato per dispositivi medi e potenti.",

    llama1b: "Lento",
    llama1bDesc: "Qualità migliore. Consigliato per dispositivi potenti.",
    phi3Mini: "Più lento",
    phi3MiniDesc: "Quasi perfetto. Consigliato per dispositivi molto potenti.",

    miniLm: "Supporto (obbligatorio per la chat)",
    miniLmDesc: "Questo modello permette alla Chat di usare l'app al posto tuo se hai voglia di fare poco.",

    noneInstalled: "Nessun modello installato",
    noneInstalledDesc: "I modelli sono ciò che fa funzionare l'app offline. Scaricane uno e apparirà qui.",
    goToModels: "Scarica un modello",
  },

  dialog: {
    defaultOk: "OK",
    selectOption: "Scegli un'opzione",

    noFileSelected: {
      title: "Nessun file selezionato",
      message: "Scegli prima un file audio.",
    },
    noWhisperModel: {
      title: "Nessun trascrittore selezionato",
      message: "Scegli un modello trascrittore.",
      messagePickOne: "Scegli prima un modello trascrittore.",
    },
    noFormatterModel: {
      title: "Nessun formattatore selezionato",
      message: "Scegli prima un modello formattatore.",
    },
    noChatModel: {
      title: "Nessuna chat selezionata",
      message: "Scegli prima un modello di chat.",
    },
    modelNotDownloaded: {
      title: "Modello non scaricato",
      message: "Vai su Impostazioni > Modelli per scaricarlo.",
      messageWhisper: "Vai su Impostazioni > Modelli per scaricare il modello trascrittore.",
      messageFormatter: "Vai su Impostazioni > Modelli per scaricare il modello formattatore.",
      messageChat: "Vai su Impostazioni > Modelli per scaricare il modello di chat.",
      messageEmbedding: "Vai su Impostazioni > Modelli per scaricare il modello di embedding.",
    },
    micPermission: {
      title: "Serve il permesso del microfono",
      message: "Attiva l'accesso al microfono per registrare.",
    },
    noInternet: {
      title: "Nessuna connessione a internet",
      message: "Controlla la connessione e riprova.",
    },

    confirmDelete: {
      title: "Eliminare la trascrizione?",
      message: "Sei sicuro di voler eliminare questa trascrizione?",
      cancel: "Annulla",
      delete: "Elimina",
    },
    deleteChat: {
      title: "Eliminare la chat?",
      messageNamed: "\"{name}\" verrà eliminata.",
      messageFallback: "Questa chat verrà eliminata.",
    },
    clearChat: {
      title: "Cancella cronologia chat",
      message: "Sei sicuro di voler eliminare la cronologia delle chat?",
      clear: "Cancella",
      clearedTitle: "Cancellata",
      clearedMessage: "Cronologia chat cancellata.",
    },

    compressSuccess: {
      title: "Fatto",
      message: "Memoria compressa con successo!",
    },
    compressFailed: {
      title: "Dati insufficienti",
      message: "La memoria è già compressa o troppo piccola.",
    },

    noAudio: {
      title: "Nessun file audio",
      message: "Questa trascrizione non ha un audio associato.",
      messageReTranscribe: "Questa trascrizione non ha un file audio da ritrascrivere.",
    },
    audioMissing: {
      title: "Audio mancante",
      message: "Il file audio non è più disponibile.",
    },

    transcriptionFailed: { title: "Trascrizione fallita" },
    reTranscribeFailed: { title: "Ritrascrizione fallita" },
    formattingFailed: { title: "Formattazione fallita" },
    summarizationFailed: { title: "Riassunto fallito" },
    actionFailed: {
      title: "Azione fallita",
      message: "Non è stato possibile aprire l'app.",
    },
    recordingFailed: {
      title: "Registrazione fallita",
      messageStart: "Non è stato possibile avviare la registrazione.",
      messageStop: "Non è stato possibile fermare la registrazione.",
      messageNoFile: "Nessun file audio è stato prodotto.",
    },
  },

  notFound: {
    title: "Ops!",
    message: "Questa schermata non esiste.",
    goHome: "Vai alla schermata principale!",
  },
};
