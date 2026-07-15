/** FRANÇAIS — traduction de constants/strings.ts. Si une clé manque, l'app affiche l'anglais. */
export const FR = {
  tabs: { transcribe: "Muffin !", record: "Enregistrer", history: "Historique", chat: "Chat", settings: "Réglages" },

  common: {
    ok: "OK", cancel: "Annuler", save: "Enregistrer", delete: "Supprimer", close: "Fermer",
    back: "Retour", copy: "Copier", notSet: "Non défini", loading: "Chargement...",
  },

  transcribe: {
    formatToggle: "Mettre en forme",
    summarizeToggle: "Résumer",
    formatterModelLabel: "Qualité de mise en forme",
    formatLanguageLabel: "Langue de mise en forme",
    customPromptLabel: "Sois précis",
    customPromptPlaceholder: "Utilise des puces, 100 mots maximum, etc.",

    languageLabel: "Langue",
    whisperModelLabel: "Qualité de transcription",
    selectFileButton: "Choisir un fichier",
    transcribeButton: "C'est parti !",
    listenButton: "Écouter",

    transcriptTitle: "Transcription",
    transcriptPlaceholder: "La transcription apparaîtra ici.",
    rawTab: "Brut",
    formattedTab: "Mis en forme",
    summaryTab: "Résumé",

    loadingModel: "Chargement du transcripteur...",
    convertingAudio: "Conversion de l'audio...",
    transcribing: "Transcription en cours...",
    formatting: "Mise en forme...",
    summarizing: "Résumé en cours...",
    generatingTitle: "Création du titre...",

    noTitle: "Note vocale",
    importedAudio: "Audio importé",

    whileWaiting: "En attendant...",
    supportMe: "Soutiens-moi !",
    supportDesc: "Muffin est gratuit et fonctionne hors ligne. S'il te plaît et que tu veux soutenir mon projet, voilà comment !",
    supportCancel: "Plus tard",
  },

  record: {
    readyToTranscribe: "Prêt à transcrire",
    listening: "J'écoute...",
    using: "Utilise",
    noModelSelected: "Aucun modèle sélectionné",

    loadingModel: "Chargement du transcripteur...",
    transcribing: "Transcription en cours...",

    formatToggle: "Mettre en forme la transcription",
    summarizeToggle: "Résumer",
    whisperModelLabel: "Whisper",
    languageLabel: "Langue",
    formatterModelLabel: "Mise en forme",
    formatLanguageLabel: "Sortie",

    startRecording: "Démarrer l'enregistrement",
    stopRecording: "Arrêter l'enregistrement",

    transcriptTitle: "Transcription",
    transcriptPlaceholder: "Tes mots apparaîtront ici après l'enregistrement.",
    copyButton: "Copier",
    copied: "Copié !",
  },

  history: {
    header: "Historique",
    noHistory: "Pas encore de transcription.",
    emptyDesc: "Enregistre ou transcris un fichier audio pour le voir ici.",
    renameTranscript: "Renommer la transcription",
    saveRename: "Enregistrer",
    openTranscript: "Ouvrir {name}",
    renameAction: "Renommer la transcription",
    deleteAction: "Supprimer la transcription",
  },

  historyDetail: {
    play: "Lecture", pause: "Pause", audioMissing: "Fichier audio introuvable",

    retranscribe: "Retranscrire", format: "Mettre en forme", summarize: "Résumer",

    retranscribing: "Retranscription...",
    formatting: "Mise en forme...",
    summarizing: "Résumé en cours...",
    working: "Traitement...",

    whisperModelLabel: "Qualité de transcription",
    formatterModelLabel: "Qualité de mise en forme",

    customPromptLabel: "Sois précis",
    customPromptPlaceholder: "Utilise des puces, 100 mots maximum, etc...",

    transcriptTitle: "Transcription",
    rawTab: "Brut",
    formattedTab: "Mis en forme",
    summaryTab: "Résumé",
    copyButton: "Copier",
    copiedTitle: "Copié !",
    copiedDesc: "Texte copié dans le presse-papiers",
    deleteButton: "Supprimer",
    backButton: "Retour",
  },

  chat: {
    header: "Chat",
    inputPlaceholder: "Pose-moi une question sur tes transcriptions...",
    sendButton: "Envoyer",
    thinking: "Je réfléchis...",
    emptyState: "Tu peux me demander tout ce que tu veux sur tes transcriptions, dis-moi juste ce qu'il te faut !",
    errorMessage: "Désolé, quelque chose s'est mal passé. Voilà ce que dit l'app :",
    noMemory: "Je n'ai rien trouvé de pertinent.",
    modelLoadFailed: "Le fichier du modèle de chat semble incomplet ou endommagé. Supprime-le dans Réglages > Modèles, puis télécharge-le à nouveau.",
    modelBrokenTitle: "Modèle de chat incomplet",
    modelBrokenMessage: "Le fichier du modèle fait {actual} mais devrait faire environ {expected}. Le téléchargement a été interrompu. Supprime-le dans Réglages > Modèles, retélécharge-le et reste sur cet écran jusqu'à la fin.",

    noModelSelected: "Aucun modèle de chat sélectionné",
    noModelSubtitle: "Va dans les Réglages et sélectionne un modèle de chat pour utiliser l'assistant.",
    goToSettings: "Aller aux Réglages",

    chats: "Chats",
    newChat: "Nouveau chat",
    noChats: "Pas encore de chat.",
    noChatsHint: "Touche + ci-dessus pour en commencer un.",
    renameChat: "Renommer le chat",
    deleteChat: "Supprimer le chat",

    actionExecuted: "Fait",
    deleteTitle: "Supprimer la transcription ?",
    deleteMessage: "Supprimer « {name} » ? C'est irréversible.",
    deleteManyTitle: "Supprimer {count} transcriptions ?",
    deleteManyMessage: "Seront supprimées :\n{list}\n\nC'est irréversible.",
    delete: "Supprimer",
    deleteMessageAction: "Supprimer le message",

    addTo: "Ajouter à",
    calendar: "Calendrier",
    alarms: "Alarmes",
    eventName: "Nom de l'événement",
    openNativeApp: "Ouvrir l'app",
  },

  memory: {
    header: "Mémoires",
    noMemories: "Pas encore de mémoire enregistrée. Continue à discuter ou ajoute-les.",
    addCustom: "Ajouter une mémoire",
    memoryPrompt: "Tu peux me demander tout ce que tu veux sur tes transcriptions, dis-moi juste ce qu'il te faut !",
    backButton: "Retour",
  },

  settings: {
    header: "Réglages",

    segmentPreferences: "Préférences",
    segmentModels: "Modèles",

    general: "Général",
    defaultLanguage: "Langue par défaut",

    autoDeleteLabel: "Supprimer automatiquement les fichiers audio",
    autoDeleteNever: "Jamais",
    autoDelete1Week: "1 semaine",
    autoDelete1Month: "1 mois",

    normalizeAudio: "Normaliser l'audio",
    normalizeAudioDesc: "Monte le volume faible pour une transcription plus nette.",
    autoCopy: "Copier la transcription automatiquement",
    autoCopyDesc: "Copie dans le presse-papiers une fois terminé",
    formatByDefault: "Mettre en forme par défaut",
    formatByDefaultDesc: "Met en forme la transcription après la transcription",
    summarizeByDefault: "Résumer par défaut",
    summarizeByDefaultDesc: "Résume la transcription après la transcription",

    contextLearning: "Mémoire",
    contextLearningDesc: "La mémoire aide à combler les trous quand l'audio n'est pas clair.",
    memoryContext: "Contexte mémoire",
    memoryDesc: "Permet à la transcription d'utiliser les mémoires. Plus précis mais plus lent.",

    manageMemory: "Gérer les mémoires",
    compressProfile: "Optimiser les mémoires",
    compressing: "Optimisation...",
    compressingDesc: "Compression...",
    clearChat: "Effacer l'historique du chat",

    addMemory: "Ajouter une mémoire",
    addMemoryDesc: "Apprends à Muffin des noms, des termes ou des faits précis.",
    addMemoryPlaceholder: "Ajouter une mémoire",
    addMemoryBtn: "Ajouter",
    saveMemory: "Enregistrer la mémoire",
    deleteMemoryAction: "Supprimer la mémoire",
    deleteMemoryTitle: "Supprimer la mémoire ?",
    noMemories: "Pas encore de mémoire enregistrée. Continue à discuter ou ajoute-les.",

    appearance: "Apparence",
    themeMode: "Thème",
    accentColor: "Couleur principale",

    customPrompts: "Prompts personnalisés",
    customPromptsFooter: "Laisse vide pour utiliser les réglages par défaut de Muffin. Ils s'appliquent à chaque transcription.",
    storageHeader: "Stockage",
    customPrompt: "Prompt personnalisé",
    formatSystemPrompt: "Prompt de mise en forme par défaut",
    formatSystemPromptPlaceholder: "Tu es un éditeur expert...",
    summarySystemPrompt: "Prompt de résumé par défaut",
    summarySystemPromptPlaceholder: "Résume le texte suivant...",

    transcription: "Transcription",
    whisperModel: "Modèle de transcription",
    formatSummarize: "Mise en forme et résumé",
    preferredFormatter: "Modèle de mise en forme",
    preferredChat: "Modèle de chat",
    formatLanguage: "Langue de mise en forme",

    modelManagement: "Modèles",
    modelsInstalled: "installés",
    downloadModels: "Télécharger des modèles",
    whisperModelsHeader: "Modèles de transcription",
    formatterModelsHeader: "Modèles de mise en forme",
    chatModelsHeader: "Modèles de chat",
    embeddingModelsHeader: "Modèles d'appoint (obligatoires pour que le chat soit utile)",

    get: "Télécharger",
    downloadButton: "Télécharger",
    downloading: "Téléchargement",
    delete: "Supprimer",
    deleteButton: "Supprimer",
    progress: "Progression",
    deletedTitle: "Supprimé",
    deletedDesc: "Modèle supprimé.",

    version: "Muffin Transcriber v{version}",

    supportTitle: "Offre-moi un café ! ☕",
    supportMessage: "Muffin est gratuit et fonctionne hors ligne. S'il te plaît et que tu veux soutenir mon projet, voilà comment !",
    supportButton: "Offrir un café",
    supportCancel: "Plus tard",

    appLanguage: "Langue de l'app",
    appLanguageDesc: "Automatique suit la langue du téléphone.",
  },

  models: {
    whisperTiny: "Plus rapide",
    whisperTinyDesc: "Ultra rapide pour des transcriptions basiques. Recommandé pour les appareils peu puissants.",
    whisperBaseEn: "Base (anglais)",
    whisperBaseEnDesc: "Rapide et très précis en anglais.",
    whisperSmall: "Équilibré (multilingue)",
    whisperSmallDesc: "Bon équilibre entre vitesse et précision.",
    whisperTurbo: "Plus lent",
    whisperTurboDesc: "Le meilleur pour une grande précision. Recommandé pour les appareils puissants.",

    qwenSmall: "Plus rapide",
    qwenSmallDesc: "Ultra rapide mais peut se tromper.",
    qwenLarge: "Équilibré",
    qwenLargeDesc: "Bon équilibre entre vitesse et qualité. Recommandé pour les appareils moyens à puissants.",

    llama1b: "Lent",
    llama1bDesc: "Meilleure qualité. Recommandé pour les appareils puissants.",
    phi3Mini: "Plus lent",
    phi3MiniDesc: "Presque parfait. Recommandé pour les appareils très puissants.",

    miniLm: "Appoint (obligatoire pour le chat)",
    miniLmDesc: "Ce modèle permet au Chat d'utiliser l'app à ta place si tu as la flemme.",

    noneInstalled: "Aucun modèle installé",
    noneInstalledDesc: "Les modèles sont ce qui fait fonctionner l'app hors ligne. Télécharges-en un et il apparaîtra ici.",
    goToModels: "Télécharger un modèle",
  },

  dialog: {
    defaultOk: "OK",
    selectOption: "Choisis une option",

    noFileSelected: { title: "Aucun fichier sélectionné", message: "Choisis d'abord un fichier audio." },
    noWhisperModel: {
      title: "Aucun transcripteur sélectionné",
      message: "Choisis un modèle de transcription.",
      messagePickOne: "Choisis d'abord un modèle de transcription.",
    },
    noFormatterModel: { title: "Aucun modèle de mise en forme sélectionné", message: "Choisis d'abord un modèle de mise en forme." },
    noChatModel: { title: "Aucun chat sélectionné", message: "Choisis d'abord un modèle de chat." },
    modelNotDownloaded: {
      title: "Modèle non téléchargé",
      message: "Va dans Réglages > Modèles pour le télécharger.",
      messageWhisper: "Va dans Réglages > Modèles pour télécharger le modèle de transcription.",
      messageFormatter: "Va dans Réglages > Modèles pour télécharger le modèle de mise en forme.",
      messageChat: "Va dans Réglages > Modèles pour télécharger le modèle de chat.",
      messageEmbedding: "Va dans Réglages > Modèles pour télécharger le modèle d'embedding.",
    },
    micPermission: { title: "Autorisation micro nécessaire", message: "Active l'accès au micro pour enregistrer." },
    noInternet: { title: "Pas de connexion internet", message: "Vérifie ta connexion et réessaie." },

    confirmDelete: {
      title: "Supprimer la transcription ?",
      message: "Tu es sûr de vouloir supprimer cette transcription ?",
      cancel: "Annuler",
      delete: "Supprimer",
    },
    deleteChat: {
      title: "Supprimer le chat ?",
      messageNamed: "« {name} » sera supprimé.",
      messageFallback: "Ce chat sera supprimé.",
    },
    clearChat: {
      title: "Effacer l'historique du chat",
      message: "Tu es sûr de vouloir supprimer ton historique de chat ?",
      clear: "Effacer",
      clearedTitle: "Effacé",
      clearedMessage: "Historique du chat effacé.",
    },

    compressSuccess: { title: "Fait", message: "Mémoire compressée avec succès !" },
    compressFailed: { title: "Pas assez de données", message: "La mémoire est déjà compressée ou trop petite." },

    noAudio: {
      title: "Aucun fichier audio",
      message: "Cette transcription n'a pas d'audio associé.",
      messageReTranscribe: "Cette transcription n'a pas de fichier audio à retranscrire.",
    },
    audioMissing: { title: "Audio manquant", message: "Le fichier audio n'est plus disponible." },

    transcriptionFailed: { title: "Échec de la transcription" },
    reTranscribeFailed: { title: "Échec de la retranscription" },
    formattingFailed: { title: "Échec de la mise en forme" },
    summarizationFailed: { title: "Échec du résumé" },
    actionFailed: { title: "Échec de l'action", message: "Impossible d'ouvrir l'app." },
    recordingFailed: {
      title: "Échec de l'enregistrement",
      messageStart: "Impossible de démarrer l'enregistrement.",
      messageStop: "Impossible d'arrêter l'enregistrement.",
      messageNoFile: "Aucun fichier audio n'a été produit.",
    },
  },

  notFound: { title: "Oups !", message: "Cet écran n'existe pas.", goHome: "Aller à l'écran d'accueil !" },
};
