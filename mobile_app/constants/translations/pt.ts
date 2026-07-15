/** PORTUGUÊS — tradução de constants/strings.ts. Se faltar uma chave, a app mostra o inglês. */
export const PT = {
  tabs: { transcribe: "Muffin!", record: "Gravar", history: "Histórico", chat: "Chat", settings: "Definições" },

  common: {
    ok: "OK", cancel: "Cancelar", save: "Guardar", delete: "Eliminar", close: "Fechar",
    back: "Voltar", copy: "Copiar", notSet: "Não definido", loading: "A carregar...",
  },

  transcribe: {
    formatToggle: "Formatar",
    summarizeToggle: "Resumir",
    formatterModelLabel: "Qualidade da formatação",
    formatLanguageLabel: "Idioma da formatação",
    customPromptLabel: "Sê específico",
    customPromptPlaceholder: "Usa tópicos, máximo 100 palavras, etc.",

    languageLabel: "Idioma",
    whisperModelLabel: "Qualidade da transcrição",
    selectFileButton: "Escolher ficheiro",
    transcribeButton: "Vamos!",
    listenButton: "Ouvir",

    transcriptTitle: "Transcrição",
    transcriptPlaceholder: "A transcrição vai aparecer aqui.",
    rawTab: "Bruto",
    formattedTab: "Formatado",
    summaryTab: "Resumo",

    loadingModel: "A carregar o transcritor...",
    convertingAudio: "A converter o áudio...",
    transcribing: "A transcrever...",
    formatting: "A formatar...",
    summarizing: "A resumir...",
    generatingTitle: "A criar o título...",

    noTitle: "Nota de voz",
    importedAudio: "Áudio importado",

    whileWaiting: "Enquanto esperas...",
    supportMe: "Apoia-me!",
    supportDesc: "O Muffin é grátis e funciona offline. Se gostas e queres apoiar o meu projeto, é aqui!",
    supportCancel: "Talvez depois",
  },

  record: {
    readyToTranscribe: "Pronto a transcrever",
    listening: "A ouvir...",
    using: "A usar",
    noModelSelected: "Nenhum modelo selecionado",

    loadingModel: "A carregar o transcritor...",
    transcribing: "A transcrever...",

    formatToggle: "Formatar transcrição",
    summarizeToggle: "Resumir",
    whisperModelLabel: "Whisper",
    languageLabel: "Idioma",
    formatterModelLabel: "Formatador",
    formatLanguageLabel: "Saída",

    startRecording: "Começar a gravar",
    stopRecording: "Parar a gravação",

    transcriptTitle: "Transcrição",
    transcriptPlaceholder: "As tuas palavras vão aparecer aqui depois de gravares.",
    copyButton: "Copiar",
    copied: "Copiado!",
  },

  history: {
    header: "Histórico",
    noHistory: "Ainda não há transcrições.",
    emptyDesc: "Grava ou transcreve um ficheiro de áudio para o veres aqui.",
    renameTranscript: "Mudar o nome da transcrição",
    saveRename: "Guardar",
    openTranscript: "Abrir {name}",
    renameAction: "Mudar o nome da transcrição",
    deleteAction: "Eliminar transcrição",
  },

  historyDetail: {
    play: "Reproduzir", pause: "Pausa", audioMissing: "Ficheiro de áudio não encontrado",

    retranscribe: "Transcrever de novo", format: "Formatar", summarize: "Resumir",

    retranscribing: "A transcrever de novo...",
    formatting: "A formatar...",
    summarizing: "A resumir...",
    working: "A trabalhar...",

    whisperModelLabel: "Qualidade da transcrição",
    formatterModelLabel: "Qualidade da formatação",

    customPromptLabel: "Sê específico",
    customPromptPlaceholder: "Usa tópicos, máximo 100 palavras, etc...",

    transcriptTitle: "Transcrição",
    rawTab: "Bruto",
    formattedTab: "Formatado",
    summaryTab: "Resumo",
    copyButton: "Copiar",
    copiedTitle: "Copiado!",
    copiedDesc: "Texto copiado para a área de transferência",
    deleteButton: "Eliminar",
    backButton: "Voltar",
  },

  chat: {
    header: "Chat",
    inputPlaceholder: "Pergunta-me sobre as tuas transcrições...",
    sendButton: "Enviar",
    thinking: "A pensar...",
    emptyState: "Podes perguntar-me o que quiseres sobre as tuas transcrições, diz-me só do que precisas!",
    errorMessage: "Desculpa, algo correu mal. Isto é o que a app diz:",
    noMemory: "Não consegui lembrar-me de nada relevante.",
    modelLoadFailed: "O ficheiro do modelo de chat parece incompleto ou danificado. Elimina-o em Definições > Modelos e transfere-o de novo.",
    modelBrokenTitle: "Modelo de chat incompleto",
    modelBrokenMessage: "O ficheiro do modelo tem {actual} mas devia ter cerca de {expected}. A transferência foi interrompida. Elimina-o em Definições > Modelos, transfere-o de novo e fica nesse ecrã até terminar.",

    noModelSelected: "Nenhum modelo de chat selecionado",
    noModelSubtitle: "Vai às Definições e seleciona um modelo de chat para usares o assistente.",
    goToSettings: "Ir às Definições",

    chats: "Chats",
    newChat: "Novo chat",
    noChats: "Ainda não há chats.",
    noChatsHint: "Toca em + acima para começares um.",
    renameChat: "Mudar o nome do chat",
    deleteChat: "Eliminar chat",

    actionExecuted: "Feito",
    actionFailed: "Não consegui",
    deleteTitle: "Eliminar a transcrição?",
    deleteMessage: "Eliminar “{name}”? Não dá para desfazer.",
    deleteManyTitle: "Eliminar {count} transcrições?",
    deleteManyMessage: "Vão ser eliminadas:\n{list}\n\nNão dá para desfazer.",
    delete: "Eliminar",
    deleteMessageAction: "Eliminar mensagem",

    addTo: "Adicionar a",
    calendar: "Calendário",
    alarms: "Alarmes",
    eventName: "Nome do evento",
    openNativeApp: "Abrir app",
  },

  memory: {
    header: "Memórias",
    noMemories: "Ainda não há memórias guardadas. Continua a conversar ou adiciona-as.",
    addCustom: "Adicionar uma memória",
    memoryPrompt: "Podes perguntar-me o que quiseres sobre as tuas transcrições, diz-me só do que precisas!",
    backButton: "Voltar",
  },

  settings: {
    header: "Definições",

    segmentPreferences: "Preferências",
    segmentModels: "Modelos",

    general: "Geral",
    defaultLanguage: "Idioma predefinido",

    autoDeleteLabel: "Eliminar ficheiros de áudio automaticamente",
    autoDeleteNever: "Nunca",
    autoDelete1Week: "1 semana",
    autoDelete1Month: "1 mês",

    normalizeAudio: "Normalizar áudio",
    normalizeAudioDesc: "Aumenta o volume baixo para uma transcrição mais limpa.",
    autoCopy: "Copiar transcrição automaticamente",
    autoCopyDesc: "Copia para a área de transferência quando terminar",
    formatByDefault: "Formatar por predefinição",
    formatByDefaultDesc: "Formata a transcrição depois de transcrever",
    summarizeByDefault: "Resumir por predefinição",
    summarizeByDefaultDesc: "Resume a transcrição depois de transcrever",

    contextLearning: "Memória",
    contextLearningDesc: "A memória ajuda a preencher as falhas quando o áudio não é claro.",
    memoryContext: "Contexto da memória",
    memoryDesc: "Permite que a transcrição use as memórias. Mais precisa mas mais lenta.",

    manageMemory: "Gerir memórias",
    compressProfile: "Otimizar memórias",
    compressing: "A otimizar...",
    compressingDesc: "A comprimir...",
    clearChat: "Limpar histórico do chat",

    addMemory: "Adicionar memória",
    addMemoryDesc: "Ensina ao Muffin nomes, termos ou factos específicos.",
    addMemoryPlaceholder: "Adicionar uma memória",
    addMemoryBtn: "Adicionar",
    saveMemory: "Guardar memória",
    deleteMemoryAction: "Eliminar memória",
    deleteMemoryTitle: "Eliminar a memória?",
    noMemories: "Ainda não há memórias guardadas. Continua a conversar ou adiciona-as.",

    appearance: "Aspeto",
    themeMode: "Tema",
    accentColor: "Cor principal",

    customPrompts: "Prompts personalizados",
    customPromptsFooter: "Deixa vazio para usar as predefinições do Muffin. Aplicam-se a todas as transcrições.",
    storageHeader: "Armazenamento",
    customPrompt: "Prompt personalizado",
    formatSystemPrompt: "Prompt predefinido de formatação",
    formatSystemPromptPlaceholder: "És um editor experiente...",
    summarySystemPrompt: "Prompt predefinido de resumo",
    summarySystemPromptPlaceholder: "Resume o texto seguinte...",

    transcription: "Transcrição",
    whisperModel: "Modelo transcritor",
    formatSummarize: "Formatar e resumir",
    preferredFormatter: "Modelo formatador",
    preferredChat: "Modelo de chat",
    formatLanguage: "Idioma da formatação",

    modelManagement: "Modelos",
    modelsInstalled: "instalados",
    downloadModels: "Transferir modelos",
    whisperModelsHeader: "Modelos transcritores",
    formatterModelsHeader: "Modelos formatadores",
    chatModelsHeader: "Modelos de chat",
    embeddingModelsHeader: "Modelos de apoio (obrigatórios para o chat ser útil)",

    get: "Obter",
    downloadButton: "Transferir",
    downloading: "A transferir",
    delete: "Eliminar",
    deleteButton: "Eliminar",
    progress: "Progresso",
    deletedTitle: "Eliminado",
    deletedDesc: "Modelo eliminado.",

    version: "Muffin Transcriber v{version}",

    supportTitle: "Paga-me um café! ☕",
    supportMessage: "O Muffin é grátis e funciona offline. Se gostas e queres apoiar o meu projeto, é aqui!",
    supportButton: "Pagar um café",
    supportCancel: "Talvez depois",

    appLanguage: "Idioma da app",
    appLanguageDesc: "Automático segue o idioma do telemóvel.",
  },

  models: {
    whisperTiny: "Mais rápido",
    whisperTinyDesc: "Rapidíssimo para transcrições básicas. Recomendado para dispositivos menos potentes.",
    whisperBaseEn: "Base (inglês)",
    whisperBaseEnDesc: "Rápido e muito preciso em inglês.",
    whisperSmall: "Equilibrado (multilingue)",
    whisperSmallDesc: "Bom equilíbrio entre velocidade e precisão.",
    whisperTurbo: "Mais lento",
    whisperTurboDesc: "O melhor para alta precisão. Recomendado para dispositivos potentes.",

    qwenSmall: "Mais rápido",
    qwenSmallDesc: "Rapidíssimo mas pode enganar-se.",
    qwenLarge: "Equilibrado",
    qwenLargeDesc: "Bom equilíbrio entre velocidade e qualidade. Recomendado para dispositivos médios e potentes.",

    llama1b: "Lento",
    llama1bDesc: "Melhor qualidade. Recomendado para dispositivos potentes.",
    phi3Mini: "Mais lento",
    phi3MiniDesc: "Quase perfeito. Recomendado para dispositivos muito potentes.",

    miniLm: "Apoio (obrigatório para o chat)",
    miniLmDesc: "Este modelo deixa o Chat usar a app por ti se tiveres preguiça.",

    noneInstalled: "Não há modelos instalados",
    noneInstalledDesc: "Os modelos são o que faz a app funcionar offline. Transfere um e vai aparecer aqui.",
    goToModels: "Transferir um modelo",
  },

  dialog: {
    defaultOk: "OK",
    selectOption: "Escolhe uma opção",

    noFileSelected: { title: "Nenhum ficheiro selecionado", message: "Escolhe primeiro um ficheiro de áudio." },
    noWhisperModel: {
      title: "Nenhum transcritor selecionado",
      message: "Escolhe um modelo transcritor.",
      messagePickOne: "Escolhe primeiro um modelo transcritor.",
    },
    noFormatterModel: { title: "Nenhum formatador selecionado", message: "Escolhe primeiro um modelo formatador." },
    noChatModel: { title: "Nenhum chat selecionado", message: "Escolhe primeiro um modelo de chat." },
    modelNotDownloaded: {
      title: "Modelo não transferido",
      message: "Vai a Definições > Modelos para o transferires.",
      messageWhisper: "Vai a Definições > Modelos para transferires o modelo transcritor.",
      messageFormatter: "Vai a Definições > Modelos para transferires o modelo formatador.",
      messageChat: "Vai a Definições > Modelos para transferires o modelo de chat.",
      messageEmbedding: "Vai a Definições > Modelos para transferires o modelo de embedding.",
    },
    micPermission: { title: "É preciso permissão do microfone", message: "Ativa o acesso ao microfone para gravares." },
    noInternet: { title: "Sem ligação à internet", message: "Verifica a tua ligação e tenta outra vez." },

    confirmDelete: {
      title: "Eliminar a transcrição?",
      message: "Tens a certeza de que queres eliminar esta transcrição?",
      cancel: "Cancelar",
      delete: "Eliminar",
    },
    deleteChat: {
      title: "Eliminar o chat?",
      messageNamed: "\"{name}\" vai ser eliminado.",
      messageFallback: "Este chat vai ser eliminado.",
    },
    clearChat: {
      title: "Limpar histórico do chat",
      message: "Tens a certeza de que queres eliminar o teu histórico de chat?",
      clear: "Limpar",
      clearedTitle: "Limpo",
      clearedMessage: "Histórico do chat limpo.",
    },

    compressSuccess: { title: "Feito", message: "Memória comprimida com sucesso!" },
    compressFailed: { title: "Dados insuficientes", message: "A memória já está comprimida ou é demasiado pequena." },

    noAudio: {
      title: "Sem ficheiro de áudio",
      message: "Esta transcrição não tem áudio associado.",
      messageReTranscribe: "Esta transcrição não tem um ficheiro de áudio para transcrever de novo.",
    },
    audioMissing: { title: "Áudio em falta", message: "O ficheiro de áudio já não está disponível." },

    transcriptionFailed: { title: "A transcrição falhou" },
    reTranscribeFailed: { title: "A nova transcrição falhou" },
    formattingFailed: { title: "A formatação falhou" },
    summarizationFailed: { title: "O resumo falhou" },
    actionFailed: { title: "A ação falhou", message: "Não foi possível abrir a app." },
    recordingFailed: {
      title: "A gravação falhou",
      messageStart: "Não foi possível começar a gravar.",
      messageStop: "Não foi possível parar a gravação.",
      messageNoFile: "Não foi produzido nenhum ficheiro de áudio.",
    },
  },

  notFound: { title: "Ups!", message: "Este ecrã não existe.", goHome: "Ir para o ecrã principal!" },
};
