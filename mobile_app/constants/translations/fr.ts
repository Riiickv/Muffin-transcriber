/** FRANÇAIS - traduction de constants/strings.ts. Si une clé manque, l'app affiche l'anglais. */
export const FR = {
  tabs: { transcribe: "Muffin !", record: "Enregistrer", history: "Historique", chat: "Chat", settings: "Réglages" },

  common: {
    ok: "OK", cancel: "Annuler", save: "Enregistrer", delete: "Supprimer", close: "Fermer",
    back: "Retour", copy: "Copier", notSet: "Non défini", loading: "Chargement...",
  },

  transcribe: {
    welcomeTitle: "Bienvenue sur Muffin !",
    welcomeBody: "Muffin est un transcripteur qui utilise l'IA pour améliorer le texte. Il peut même apprendre de toi et t'aider quand l'audio n'est pas clair !",
    welcomeStep: "Tu peux partager tes fichiers avec Muffin ou enregistrer dans l'app, et il fera tout le travail pour toi !",
    welcomeButton: "Configurer !",
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
    supportDesc: "Muffin est gratuit, privé et fonctionne hors ligne. S'il te plaît et que tu veux soutenir mon projet, voilà comment !",
    supportCancel: "Plus tard",
  },

  coach: {
    micHint: "Appuie pour enregistrer/arrêter, maintiens pour les options !",
  },

  record: {
    optionsTitle: "Options d'enregistrement",
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
    summaryTooShort: "Trop court pour être résumé.",
    summaryFailed: "Je n'ai pas pu le résumer.",
    busyTitle: "Une à la fois !",
    busyMessage: "Lancer {next} arrêtera {current}.",
    busyDontAsk: "Ne plus afficher",
    busyConfirm: "Ok !",
    stop: "Arrêter",
    stopping: "Arrêt...",

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
    betaEnableBody: "Le Chat avec Muffin n'est pas encore prêt. Tu peux le tester et m'envoyer un retour, ça accélérerait beaucoup son développement.\n\nCe qui marche pour l'instant :\n• Il peut changer les réglages de l'app pour toi, et te montrer où ils sont.\n• Il connaît toute l'app, donc il peut t'aider à trouver ce que tu veux.\n• Il retrouve parfois la transcription qu'il te faut si tu lui donnes le sujet.\n\nCe qui ne marche pas :\n• Tu ne peux pas discuter avec lui de façon fiable, donc il ne peut pas vraiment t'aider à réfléchir à partir de tes transcriptions. C'est une limite des appareils mobiles, et je cherche tous les moyens possibles d'alléger la charge sur les téléphones moyens et moins puissants.\n\nIl y a beaucoup d'autres fonctions prévues, mais ça demande du temps et des tests.\n\nMerci pour ta patience !\n\n-Rick",
    header: "Chat",
    beta: "Beta",
    betaTitle: "Chat en bêta",
    betaBody: "Oui, il fait quelques trucs, le reste c'est de la merde totale.\n\nJe n'arrive pas à le faire marcher correctement, pas pour toutes les fonctions sympas que je voudrais, surtout sur les appareils moins puissants. Je ne voulais pas que ça retarde la sortie de l'app, vu que le reste est prêt, au moins dans mes tests. Si quelque chose est nul, laisse un avis sur le Play Store et je verrai ce que je peux faire !",
    betaOk: "Ok !",
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
    actionFailed: "Je n'ai pas pu",
    renameAskTitle: "Je l'appelle comment ?",
    renameAskMessage: "Renommage de \"{name}\"",
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
    suggestedTitle: "J'ai bien compris ?",
    suggestedDesc: "J'ai relevé ça dans tes enregistrements. Je me trompe souvent, donc rien n'est enregistré tant que tu ne dis pas oui.",
    dismissAll: "Non à tout",
    dismissOne: "Non",
    acceptOne: "Oui, retiens ça",
    memoryPrompt: "Tu peux me demander tout ce que tu veux sur tes transcriptions, dis-moi juste ce qu'il te faut !",
    backButton: "Retour",
  },

  settings: {
    chatBetaLabel: "Chat avec Muffin",
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
    typewriter: "Effet machine à écrire",
    typewriterDesc: "Écrit les transcriptions au fur et à mesure",
    typewriterSpeed: "Vitesse d'écriture",
    speedSlow: "Lente",
    speedBalanced: "Équilibrée",
    speedFast: "Rapide",
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
    aboutHeader: "À propos",
    privacyPolicy: "Confidentialité",

    supportTitle: "Soutiens-moi !",
    supportMessage: "Muffin est gratuit, privé et fonctionne hors ligne. S'il te plaît et que tu veux soutenir mon projet, voilà comment !",
    supportButton: "Offrir un café",
    supportCancel: "Plus tard",

    appLanguage: "Langue de l'app",
    appLanguageDesc: "Automatique suit la langue du téléphone.",
  },

  setup: {
    transcriberTitle: "Transcripteur !",
    transcriberBody: "Voici ton transcripteur.\n\nCelui qui est mis en avant est conseillé pour ton appareil, mais tu peux en télécharger autant que tu veux.",

    formatterTitle: "Mise en forme et Résumé !",
    formatterBody: "C'est le cerveau de tes transcriptions. Il les corrige pour toi ! Tu peux même lui dire comment tu les veux.\n\nCelui qui est mis en avant est conseillé pour ton appareil, mais tu peux en télécharger autant que tu veux.",

    optionalTitle: "Optionnels !",
    optionalBody: "Quelques outils optionnels mais pratiques dont tu pourrais avoir besoin !",
    chatSectionTitle: "Modèle de chat !",
    chatNoneSuggested: "Oh non ! Aucun modèle n'est vraiment conseillé pour ton appareil. Tu peux quand même les essayer, mais ils seront leeeents.",
    butlerSectionTitle: "Majordome !",
    butlerBody: "Ça t'aide à extraire des choses utiles des transcriptions, comme les dates importantes. Le texte sera mis en avant, alors ouvre l'oeil !",

    back: "Retour",
    next: "Suivant !",
    finish: "C'est parti !",
  },

  models: {
    tierFastest: "Le plus rapide",
    tierFast: "Rapide",
    tierBalanced: "Équilibré",
    tierBest: "Meilleure qualité",
    tierAccurate: "Le plus précis",
    tierSmartSearch: "Recherche intelligente",

    descWhisperFastest: "Formulation plus brute. Convient aux notes courtes et claires.",
    descWhisperBalanced: "Le bon compromis pour la plupart des notes vocales.",
    descWhisperAccurate: "Le meilleur avec les accents et le bruit de fond. Le plus lent.",
    descFmtFastest: "Optimisé pour les puces des téléphones récents.",
    descFmtFast: "Formulation un peu meilleure que Le plus rapide.",
    descFmtBalanced: "Plus gros, mais toujours rapide sur les téléphones récents.",
    descFmtBest: "Formulation la plus soignée. Le plus lent.",
    descChatFast: "Réponses rapides, plus simples.",
    descChatBest: "Réponses plus intelligentes. Nécessite un téléphone récent.",
    descEmbed: "Permet au Chat de trouver la bonne transcription par le sens, pas seulement par les mots.",

    noneInstalled: "Aucun modèle installé",
    noneInstalledDesc: "Les modèles sont ce qui fait fonctionner l'app hors ligne. Télécharges-en un et il apparaîtra ici.",
    goToModels: "Télécharger un modèle",
  },

  languages: {
    autoDetect: "Détection automatique",
    original: "Original",
  },

  downloads: {
    downloading: "Téléchargement",
    downloadingModel: "Téléchargement de {model}",
    pause: "Pause",
    resume: "Reprendre",
    cancel: "Annuler",
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
