/** ESPAÑOL — traducción de constants/strings.ts. Si falta una clave, la app muestra el inglés. */
export const ES = {
  tabs: { transcribe: "¡Muffin!", record: "Grabar", history: "Historial", chat: "Chat", settings: "Ajustes" },

  common: {
    ok: "OK", cancel: "Cancelar", save: "Guardar", delete: "Eliminar", close: "Cerrar",
    back: "Atrás", copy: "Copiar", notSet: "Sin definir", loading: "Cargando...",
  },

  transcribe: {
    welcomeTitle: "¡Bienvenido a Muffin!",
    welcomeBody: "Muffin es un transcriptor que usa IA para mejorar el texto. ¡Incluso puede aprender de ti y ayudarte cuando el audio no se entiende bien!",
    welcomeStep: "¡Puedes compartir tus archivos con Muffin o grabar en la app, y él hará todo el trabajo por ti!",
    welcomeButton: "¡Configurar!",
    formatToggle: "Formatear",
    summarizeToggle: "Resumir",
    formatterModelLabel: "Calidad del formato",
    formatLanguageLabel: "Idioma del formato",
    customPromptLabel: "Sé específico",
    customPromptPlaceholder: "Usa viñetas, máximo 100 palabras, etc.",

    languageLabel: "Idioma",
    whisperModelLabel: "Calidad de transcripción",
    selectFileButton: "Elegir archivo",
    transcribeButton: "¡Vamos!",
    listenButton: "Escuchar",

    transcriptTitle: "Transcripción",
    transcriptPlaceholder: "La transcripción aparecerá aquí.",
    rawTab: "Sin editar",
    formattedTab: "Formateado",
    summaryTab: "Resumen",

    loadingModel: "Cargando transcriptor...",
    convertingAudio: "Convirtiendo audio...",
    transcribing: "Transcribiendo...",
    formatting: "Formateando...",
    summarizing: "Resumiendo...",
    generatingTitle: "Creando título...",

    noTitle: "Nota de voz",
    importedAudio: "Audio importado",

    whileWaiting: "Mientras esperas...",
    supportMe: "¡Apóyame!",
    supportDesc: "Muffin es gratis, privado y funciona sin conexión. Si te gusta y quieres apoyar mi proyecto, ¡aquí tienes cómo!",
    supportCancel: "Quizá más tarde",
  },

  record: {
    readyToTranscribe: "Listo para transcribir",
    listening: "Escuchando...",
    using: "Usando",
    noModelSelected: "Ningún modelo seleccionado",

    loadingModel: "Cargando transcriptor...",
    transcribing: "Transcribiendo...",

    formatToggle: "Formatear transcripción",
    summarizeToggle: "Resumir",
    whisperModelLabel: "Whisper",
    languageLabel: "Idioma",
    formatterModelLabel: "Formateador",
    formatLanguageLabel: "Salida",

    startRecording: "Empezar a grabar",
    stopRecording: "Parar de grabar",

    transcriptTitle: "Transcripción",
    transcriptPlaceholder: "Tus palabras aparecerán aquí después de grabar.",
    copyButton: "Copiar",
    copied: "¡Copiado!",
  },

  history: {
    header: "Historial",
    noHistory: "Todavía no hay transcripciones.",
    emptyDesc: "Graba o transcribe un archivo de audio para verlo aquí.",
    renameTranscript: "Renombrar transcripción",
    saveRename: "Guardar",
    openTranscript: "Abrir {name}",
    renameAction: "Renombrar transcripción",
    deleteAction: "Eliminar transcripción",
  },

  historyDetail: {
    play: "Reproducir", pause: "Pausa", audioMissing: "Archivo de audio no encontrado",

    retranscribe: "Retranscribir", format: "Formatear", summarize: "Resumir",

    retranscribing: "Retranscribiendo...",
    formatting: "Formateando...",
    summarizing: "Resumiendo...",
    working: "Trabajando...",

    whisperModelLabel: "Calidad de transcripción",
    formatterModelLabel: "Calidad del formato",

    customPromptLabel: "Sé específico",
    customPromptPlaceholder: "Usa viñetas, máximo 100 palabras, etc...",

    transcriptTitle: "Transcripción",
    rawTab: "Sin editar",
    formattedTab: "Formateado",
    summaryTab: "Resumen",
    copyButton: "Copiar",
    copiedTitle: "¡Copiado!",
    copiedDesc: "Texto copiado al portapapeles",
    deleteButton: "Eliminar",
    backButton: "Atrás",
  },

  chat: {
    header: "Chat",
    beta: "Beta",
    inputPlaceholder: "Pregúntame sobre tus transcripciones...",
    sendButton: "Enviar",
    thinking: "Pensando...",
    emptyState: "Puedes preguntarme lo que quieras sobre tus transcripciones, ¡solo dime qué necesitas!",
    errorMessage: "Lo siento, algo ha salido mal. Esto es lo que dice la app:",
    noMemory: "No he podido recordar nada relevante.",
    modelLoadFailed: "El archivo del modelo de chat parece incompleto o dañado. Elimínalo en Ajustes > Modelos y descárgalo de nuevo.",
    modelBrokenTitle: "Modelo de chat incompleto",
    modelBrokenMessage: "El archivo del modelo ocupa {actual} pero debería ocupar unos {expected}. La descarga se interrumpió. Elimínalo en Ajustes > Modelos, descárgalo de nuevo y quédate en esa pantalla hasta que termine.",

    noModelSelected: "Ningún modelo de chat seleccionado",
    noModelSubtitle: "Ve a Ajustes y selecciona un modelo de chat para usar el asistente.",
    goToSettings: "Ir a Ajustes",

    chats: "Chats",
    newChat: "Nuevo chat",
    noChats: "Todavía no hay chats.",
    noChatsHint: "Toca + arriba para empezar uno.",
    renameChat: "Renombrar chat",
    deleteChat: "Eliminar chat",

    actionExecuted: "Hecho",
    actionFailed: "No he podido",
    renameAskTitle: "¿Cómo lo llamo?",
    renameAskMessage: "Renombrando \"{name}\"",
    deleteTitle: "¿Eliminar la transcripción?",
    deleteMessage: "¿Eliminar “{name}”? No se puede deshacer.",
    deleteManyTitle: "¿Eliminar {count} transcripciones?",
    deleteManyMessage: "Se eliminarán:\n{list}\n\nNo se puede deshacer.",
    delete: "Eliminar",
    deleteMessageAction: "Eliminar mensaje",

    addTo: "Añadir a",
    calendar: "Calendario",
    alarms: "Alarmas",
    eventName: "Nombre del evento",
    openNativeApp: "Abrir app",
  },

  memory: {
    header: "Memorias",
    noMemories: "Todavía no hay memorias guardadas. Sigue chateando o añádelas.",
    addCustom: "Añadir una memoria",
    suggestedTitle: "¿Lo he entendido bien?",
    suggestedDesc: "He sacado esto de tus grabaciones. Me equivoco a menudo, así que no guardo nada hasta que digas que sí.",
    dismissAll: "No a todo",
    dismissOne: "No",
    acceptOne: "Sí, recuérdalo",
    memoryPrompt: "Puedes preguntarme lo que quieras sobre tus transcripciones, ¡solo dime qué necesitas!",
    backButton: "Atrás",
  },

  settings: {
    header: "Ajustes",

    segmentPreferences: "Preferencias",
    segmentModels: "Modelos",

    general: "General",
    defaultLanguage: "Idioma predeterminado",

    autoDeleteLabel: "Eliminar archivos de audio automáticamente",
    autoDeleteNever: "Nunca",
    autoDelete1Week: "1 semana",
    autoDelete1Month: "1 mes",

    normalizeAudio: "Normalizar audio",
    normalizeAudioDesc: "Sube el volumen bajo para una transcripción más limpia.",
    autoCopy: "Copiar transcripción automáticamente",
    autoCopyDesc: "Copia al portapapeles al terminar",
    formatByDefault: "Formatear por defecto",
    formatByDefaultDesc: "Formatea la transcripción después de transcribirla",
    summarizeByDefault: "Resumir por defecto",
    summarizeByDefaultDesc: "Resume la transcripción después de transcribirla",

    contextLearning: "Memoria",
    contextLearningDesc: "La memoria ayuda a rellenar los huecos cuando el audio no está claro.",
    memoryContext: "Contexto de memoria",
    memoryDesc: "Permite que la transcripción use las memorias. Más precisa pero más lenta.",

    manageMemory: "Gestionar memorias",
    compressProfile: "Optimizar memorias",
    compressing: "Optimizando...",
    compressingDesc: "Comprimiendo...",
    clearChat: "Borrar historial de chat",

    addMemory: "Añadir memoria",
    addMemoryDesc: "Enseña a Muffin nombres, términos o datos concretos.",
    addMemoryPlaceholder: "Añadir una memoria",
    addMemoryBtn: "Añadir",
    saveMemory: "Guardar memoria",
    deleteMemoryAction: "Eliminar memoria",
    deleteMemoryTitle: "¿Eliminar la memoria?",
    noMemories: "Todavía no hay memorias guardadas. Sigue chateando o añádelas.",

    appearance: "Apariencia",
    themeMode: "Tema",
    accentColor: "Color principal",

    customPrompts: "Prompts personalizados",
    customPromptsFooter: "Déjalo vacío para usar los valores por defecto de Muffin. Se aplican a todas las transcripciones.",
    storageHeader: "Almacenamiento",
    customPrompt: "Prompt personalizado",
    formatSystemPrompt: "Prompt por defecto de formato",
    formatSystemPromptPlaceholder: "Eres un editor experto...",
    summarySystemPrompt: "Prompt por defecto de resumen",
    summarySystemPromptPlaceholder: "Resume el siguiente texto...",

    transcription: "Transcripción",
    whisperModel: "Modelo transcriptor",
    formatSummarize: "Formatear y resumir",
    preferredFormatter: "Modelo formateador",
    preferredChat: "Modelo de chat",
    formatLanguage: "Idioma del formato",

    modelManagement: "Modelos",
    modelsInstalled: "instalados",
    downloadModels: "Descargar modelos",
    whisperModelsHeader: "Modelos transcriptores",
    formatterModelsHeader: "Modelos formateadores",
    chatModelsHeader: "Modelos de chat",
    embeddingModelsHeader: "Modelos de apoyo (obligatorios para que el chat sea útil)",

    get: "Descargar",
    downloadButton: "Descargar",
    downloading: "Descargando",
    delete: "Eliminar",
    deleteButton: "Eliminar",
    progress: "Progreso",
    deletedTitle: "Eliminado",
    deletedDesc: "Modelo eliminado.",

    version: "Muffin Transcriber v{version}",
    aboutHeader: "Acerca de",
    privacyPolicy: "Privacidad",

    supportTitle: "¡Apóyame!",
    supportMessage: "Muffin es gratis, privado y funciona sin conexión. Si te gusta y quieres apoyar mi proyecto, ¡aquí tienes cómo!",
    supportButton: "Invitar a un café",
    supportCancel: "Quizá más tarde",

    appLanguage: "Idioma de la app",
    appLanguageDesc: "Automático sigue el idioma del teléfono.",
  },

  setup: {
    transcriberTitle: "¡Transcriptor!",
    transcriberBody: "Este es tu transcriptor.\n\nEl resaltado es el recomendado para tu dispositivo, pero puedes descargar todos los que quieras.",

    formatterTitle: "¡Formateador y Resumidor!",
    formatterBody: "Este es el cerebro de tus transcripciones. ¡Te las arregla! Incluso puedes decirle cómo las quieres.\n\nEl resaltado es el recomendado para tu dispositivo, pero puedes descargar todos los que quieras.",

    optionalTitle: "¡Opcionales!",
    optionalBody: "¡Algunas herramientas opcionales pero útiles que quizá necesites!",
    chatSectionTitle: "¡Modelo de chat!",
    chatNoneSuggested: "¡Oh no! Ningún modelo es realmente recomendable para tu dispositivo. Puedes probarlos igual, pero irán lentíííísimos.",
    butlerSectionTitle: "¡Mayordomo!",
    butlerBody: "Esto te ayuda a sacar cosas útiles de las transcripciones, como fechas importantes. El texto se resaltará, ¡así que estate atento!",

    back: "Atrás",
    next: "¡Siguiente!",
    finish: "¡Empezar!",
  },

  models: {
    whisperTiny: "Más rápido",
    whisperTinyDesc: "Rapidísimo para transcripciones básicas. Recomendado para dispositivos poco potentes.",
    whisperBaseEn: "Base (inglés)",
    whisperBaseEnDesc: "Rápido y muy preciso en inglés.",
    whisperSmall: "Equilibrado (multilingüe)",
    whisperSmallDesc: "Buen equilibrio entre velocidad y precisión.",
    whisperTurbo: "Más lento",
    whisperTurboDesc: "El mejor para alta precisión. Recomendado para dispositivos potentes.",

    qwenSmall: "Más rápido",
    qwenSmallDesc: "Rapidísimo pero puede equivocarse.",
    qwenLarge: "Equilibrado",
    qwenLargeDesc: "Buen equilibrio entre velocidad y calidad. Recomendado para dispositivos medios y potentes.",

    llama1b: "Lento",
    llama1bDesc: "La mejor calidad. Recomendado para dispositivos potentes.",
    phi3Mini: "Más lento",
    phi3MiniDesc: "Casi perfecto. Recomendado para dispositivos muy potentes.",

    miniLm: "Apoyo (obligatorio para el chat)",
    miniLmDesc: "Este modelo permite que el Chat use la app por ti si te da pereza.",

    noneInstalled: "No hay modelos instalados",
    noneInstalledDesc: "Los modelos son lo que hace que la app funcione sin conexión. Descarga uno y aparecerá aquí.",
    goToModels: "Descargar un modelo",
  },

  dialog: {
    defaultOk: "OK",
    selectOption: "Elige una opción",

    noFileSelected: { title: "Ningún archivo seleccionado", message: "Elige primero un archivo de audio." },
    noWhisperModel: {
      title: "Ningún transcriptor seleccionado",
      message: "Elige un modelo transcriptor.",
      messagePickOne: "Elige primero un modelo transcriptor.",
    },
    noFormatterModel: { title: "Ningún formateador seleccionado", message: "Elige primero un modelo formateador." },
    noChatModel: { title: "Ningún chat seleccionado", message: "Elige primero un modelo de chat." },
    modelNotDownloaded: {
      title: "Modelo no descargado",
      message: "Ve a Ajustes > Modelos para descargarlo.",
      messageWhisper: "Ve a Ajustes > Modelos para descargar el modelo transcriptor.",
      messageFormatter: "Ve a Ajustes > Modelos para descargar el modelo formateador.",
      messageChat: "Ve a Ajustes > Modelos para descargar el modelo de chat.",
      messageEmbedding: "Ve a Ajustes > Modelos para descargar el modelo de embedding.",
    },
    micPermission: { title: "Se necesita permiso del micrófono", message: "Activa el acceso al micrófono para grabar." },
    noInternet: { title: "Sin conexión a internet", message: "Comprueba tu conexión e inténtalo de nuevo." },

    confirmDelete: {
      title: "¿Eliminar la transcripción?",
      message: "¿Seguro que quieres eliminar esta transcripción?",
      cancel: "Cancelar",
      delete: "Eliminar",
    },
    deleteChat: {
      title: "¿Eliminar el chat?",
      messageNamed: "\"{name}\" se eliminará.",
      messageFallback: "Este chat se eliminará.",
    },
    clearChat: {
      title: "Borrar historial de chat",
      message: "¿Seguro que quieres eliminar tu historial de chat?",
      clear: "Borrar",
      clearedTitle: "Borrado",
      clearedMessage: "Historial de chat borrado.",
    },

    compressSuccess: { title: "Hecho", message: "¡Memoria comprimida con éxito!" },
    compressFailed: { title: "Datos insuficientes", message: "La memoria ya está comprimida o es demasiado pequeña." },

    noAudio: {
      title: "Sin archivo de audio",
      message: "Esta transcripción no tiene audio asociado.",
      messageReTranscribe: "Esta transcripción no tiene un archivo de audio para retranscribir.",
    },
    audioMissing: { title: "Audio no disponible", message: "El archivo de audio ya no está disponible." },

    transcriptionFailed: { title: "Transcripción fallida" },
    reTranscribeFailed: { title: "Retranscripción fallida" },
    formattingFailed: { title: "Formateo fallido" },
    summarizationFailed: { title: "Resumen fallido" },
    actionFailed: { title: "Acción fallida", message: "No se ha podido abrir la app." },
    recordingFailed: {
      title: "Grabación fallida",
      messageStart: "No se ha podido empezar a grabar.",
      messageStop: "No se ha podido parar la grabación.",
      messageNoFile: "No se ha generado ningún archivo de audio.",
    },
  },

  notFound: { title: "¡Vaya!", message: "Esta pantalla no existe.", goHome: "¡Ir a la pantalla principal!" },
};
