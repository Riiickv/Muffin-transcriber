/**
 * ITALIANO - traduzione di constants/strings.ts
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
    welcomeBody: "Muffin è un trascrittore che usa l'AI per migliorare il testo. Può anche imparare da te e aiutarti quando l'audio non è chiaro!",
    welcomeStep: "Puoi condividere i tuoi file con Muffin o registrare nell'app, e farà tutto il lavoro per te!",
    welcomeButton: "Configura!",
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
    supportDesc: "Muffin è gratis, privato e funziona offline. Se ti piace e vuoi supportare il mio progetto, ecco come!",
    supportCancel: "Magari dopo",
  },

  coach: {
    micHint: "Tocca per registrare/fermare, tieni premuto per le opzioni!",
  },

  record: {
    optionsTitle: "Opzioni di registrazione",
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
    summaryTooShort: "Troppo corto per riassumerlo.",
    summaryFailed: "Non sono riuscito a riassumerlo.",
    busyTitle: "Una alla volta!",
    busyMessage: "Se avvii {next}, {current} si fermerà.",
    busyDontAsk: "Non mostrare più",
    busyConfirm: "Ok!",

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
    betaEnableBody: "La Chat con Muffin non è ancora pronta. Puoi provarla e mandarmi un feedback, mi aiuterebbe tantissimo a svilupparla più in fretta.\n\nCosa funziona adesso:\n• Può cambiare le impostazioni dell'app per te, e indicarti dove sono.\n• Conosce tutta l'app, quindi può aiutarti a trovare qualsiasi cosa.\n• A volte riesce a trovare la trascrizione che ti serve se le dici l'argomento.\n\nCosa non funziona:\n• Non puoi chattarci in modo affidabile, quindi non riesce davvero ad aiutarti a ragionare sulle tue trascrizioni. È un limite dei dispositivi mobili, e sto cercando tutti i modi possibili per alleggerire il carico sui telefoni medi e meno potenti.\n\nCi sono molte più funzioni in programma, ma servono tempo e test.\n\nGrazie per la pazienza!\n\n-Rick",
    header: "Chat",
    beta: "Beta",
    betaTitle: "Chat in beta",
    betaBody: "Sì, qualcosa lo fa, il resto è una merda totale.\n\nNon riesco a farlo funzionare come si deve, non per tutte le funzioni carine che vorrei, soprattutto sui dispositivi meno potenti. Non volevo che rallentasse l'uscita dell'app, dato che il resto è pronto, almeno nei miei test. Se qualcosa fa schifo, lascia un feedback sul Play Store e vedo cosa posso fare!",
    betaOk: "Ok!",
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
    chatBetaLabel: "Chat con Muffin",
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
    aboutHeader: "Info",
    privacyPolicy: "Privacy",

    supportTitle: "Supportami!",
    supportMessage: "Muffin è gratis, privato e funziona offline. Se ti piace e vuoi supportare il mio progetto, ecco come!",
    supportButton: "Offri un caffè",
    supportCancel: "Magari dopo",

    // -- Lingua dell'app (questo selettore) --
    appLanguage: "Lingua dell'app",
    appLanguageDesc: "Automatica segue la lingua del telefono.",
  },

  setup: {
    transcriberTitle: "Trascrittore!",
    transcriberBody: "Questo è il tuo trascrittore.\n\nQuello evidenziato è consigliato per il tuo dispositivo, ma puoi scaricarne quanti vuoi.",

    formatterTitle: "Formattatore e Riassuntore!",
    formatterBody: "Questo è il cervello delle tue trascrizioni. Le sistema per te! Puoi anche dirgli come le vuoi.\n\nQuello evidenziato è consigliato per il tuo dispositivo, ma puoi scaricarne quanti vuoi.",

    optionalTitle: "Opzionali!",
    optionalBody: "Qualche strumento opzionale ma utile che potrebbe servirti!",
    chatSectionTitle: "Modello per la chat!",
    chatNoneSuggested: "Oh no! Nessun modello è davvero consigliato per il tuo dispositivo. Puoi comunque provarli, ma saranno lentiiiissimi.",
    butlerSectionTitle: "Maggiordomo!",
    butlerBody: "Questo ti aiuta a estrarre cose utili dalle trascrizioni, tipo le date importanti. Il testo verrà evidenziato, quindi tieni gli occhi aperti!",

    back: "Indietro",
    next: "Avanti!",
    finish: "Inizia!",
  },

  models: {
    tierFastest: "Più veloce",
    tierFast: "Veloce",
    tierBalanced: "Bilanciato",
    tierBest: "Qualità migliore",
    tierAccurate: "Più preciso",
    tierSmartSearch: "Ricerca intelligente",

    descWhisperFastest: "Testo più grezzo. Va bene per note brevi e chiare.",
    descWhisperBalanced: "Il giusto compromesso per la maggior parte delle note vocali.",
    descWhisperAccurate: "Il migliore con accenti e rumore di fondo. Il più lento.",
    descFmtFastest: "Ottimizzato per i chip dei telefoni più recenti.",
    descFmtFast: "Formulazione un po' migliore rispetto a Più veloce.",
    descFmtBalanced: "Più grande, ma ancora rapido sui telefoni recenti.",
    descFmtBest: "Formulazione più pulita. Il più lento.",
    descChatFast: "Risposte rapide, più semplici.",
    descChatBest: "Risposte più intelligenti. Richiede un telefono recente.",
    descEmbed: "Permette alla Chat di trovare la trascrizione giusta per significato, non solo per parole.",

    noneInstalled: "Nessun modello installato",
    noneInstalledDesc: "I modelli sono ciò che fa funzionare l'app offline. Scaricane uno e apparirà qui.",
    goToModels: "Scarica un modello",
  },

  languages: {
    autoDetect: "Rilevamento automatico",
    original: "Originale",
  },

  downloads: {
    downloading: "Scaricamento",
    downloadingModel: "Scaricamento di {model}",
    pause: "Pausa",
    resume: "Riprendi",
    cancel: "Annulla",
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
