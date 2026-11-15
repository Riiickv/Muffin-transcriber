// A made-up library of voice notes, shared by tests/chatPlan.test.ts and by the
// PC harness that runs the real models (see docs/chat-research.md).
// No imports, so plain Node can load it.

export interface FixtureNote {
  id: string;
  name: string;
  text: string;
  summary?: string;
  timestampISO: string;
}

const day = (d: number, h = 10) => new Date(2026, 10, d, h, 0, 0).toISOString();

// About 1,500 characters, with the fact people ask about in its last sentence.
const plumber =
  "Allora, l'idraulico è venuto stamattina a vedere il bagno. La perdita viene dal tubo dietro il lavandino, quello di rame vecchio, " +
  'e secondo lui conviene sostituire tutto il tratto fino alla colonna invece di mettere una pezza. Ha guardato anche la doccia e dice che ' +
  'il sifone è da cambiare perché scarica lento. Per le piastrelle bisogna romperne quattro o cinque dietro il mobile, lui le rimette ma ' +
  'devo trovare io quelle uguali, altrimenti si vede la differenza. Mi ha consigliato di andare dal rivenditore in via Torino che tiene ' +
  'ancora le serie vecchie. Poi c\'è la questione del boiler: funziona, ma ha quindici anni e la resistenza è piena di calcare, quindi ' +
  'prima o poi va cambiato, però non è urgente e possiamo pensarci in primavera. Ha detto che per il lavoro servono due giorni pieni, ' +
  'il primo per smontare e sostituire i tubi, il secondo per richiudere, stuccare e rimontare il mobile. L\'acqua resterà chiusa solo ' +
  'la mattina del primo giorno. Devo liberare il bagno e spostare la lavatrice in corridoio. Mi manda la conferma scritta via mail. ' +
  "Per il pagamento vuole un acconto del trenta per cento all'inizio e il saldo a lavoro finito, con bonifico, e fa la fattura per la " +
  "detrazione. Se troviamo le piastrelle prima, meglio, cosi' non perde mezza giornata. " +
  "In totale il preventivo dell'idraulico è di 1.350 euro, IVA inclusa, e può iniziare il 24 novembre.";

export const NOW = new Date(2026, 10, 15, 9, 0, 0);

export const NOTES: FixtureNote[] = [
  { id: '1794600000001', name: 'Lista della spesa', timestampISO: day(14, 18), text: 'Devo comprare latte, uova, pane, pomodori e il detersivo per la lavatrice. Ricordarsi anche le pile per il telecomando.' },
  { id: '1794500000002', name: 'Dentista', timestampISO: day(13), text: "Ho chiamato lo studio del dottor Bianchi. L'appuntamento dal dentista è martedì 17 novembre alle 15:30. Devo portare la radiografia vecchia e la tessera sanitaria." },
  { id: '1794400000003', name: 'Assicurazione auto', timestampISO: day(12), text: "L'assicurazione della macchina scade il 30 novembre. Il preventivo di Unipol è 480 euro all'anno, quello di Allianz 520. Devo decidere entro la settimana prossima." },
  { id: '1794300000004', name: 'Idee regalo mamma', timestampISO: day(10), text: 'Per il compleanno della mamma, che è il 3 dicembre, pensavo a un corso di ceramica, oppure un weekend alle terme, oppure quel libro di cucina ligure che voleva. Le piacciono molto anche le piante.' },
  { id: '1794200000005', name: 'Riunione commercialista', timestampISO: day(9), text: 'Riunione con il commercialista Ferri. Dobbiamo mandare le fatture del terzo trimestre entro il 20 novembre. La partita IVA va aggiornata con il nuovo codice ATECO. Mi richiama giovedì.' },
  {
    id: '1794100000006', name: 'Viaggio a Roma', timestampISO: day(7),
    text: "Per il viaggio a Roma partiamo venerdì 27 novembre con il treno delle 8:10 da Milano Centrale. L'hotel è vicino a Piazza Navona, tre notti. Sabato visitiamo i Musei Vaticani, biglietti già presi per le 10. Domenica pranzo da zia Carla a Trastevere. Rientro lunedì sera.",
    summary: '- Partenza venerdì 27 novembre, treno 8:10 da Milano Centrale\n- Hotel vicino a Piazza Navona, tre notti\n- Sabato Musei Vaticani alle 10\n- Domenica pranzo da zia Carla\n- Rientro lunedì sera',
  },
  { id: '1794000000007', name: 'Preventivo idraulico', timestampISO: day(5), text: plumber },
  { id: '1793900000008', name: 'Meeting notes', timestampISO: day(4), text: 'Meeting with the design team. We agreed to ship the new onboarding by December 5th. Anna owns the illustrations, Paolo the copy. Next check-in is Thursday at 10.' },
  { id: '1793800000009', name: 'Recording 3', timestampISO: day(3), text: "Promemoria: la palestra è chiusa lunedì per manutenzione. L'abbonamento si rinnova a gennaio, costa 45 euro al mese." },
  { id: '1793700000010', name: 'Ricetta pesto', timestampISO: day(1), text: "Per il pesto servono 50 grammi di basilico, 30 di pinoli, mezzo bicchiere d'olio, parmigiano e pecorino, uno spicchio d'aglio. Frullare poco per non scaldare." },
];

export const MEMORIES = ["The user's accountant is called Ferri", "The user's mother is called Lucia"];

/** The settings as the chat sees them, with made-up current values. */
export const SETTINGS = [
  { key: 'formatByDefault', type: 'boolean' as const, about: 'Improve the text automatically after every transcription', current: 'false' },
  { key: 'summarizeByDefault', type: 'boolean' as const, about: 'Summarize automatically after every transcription', current: 'false' },
  { key: 'normalizeAudio', type: 'boolean' as const, about: 'Boost the volume of quiet recordings', current: 'true' },
  { key: 'autoCopyTranscript', type: 'boolean' as const, about: 'Auto copy: copy the finished transcript to the clipboard', current: 'false' },
  { key: 'enableContextLearning', type: 'boolean' as const, about: 'Memory: learn names and terms from the recordings', current: 'true' },
  { key: 'defaultLanguage', type: 'enum' as const, options: ['Auto-Detect', 'English', 'Italian', 'Spanish', 'French', 'German', 'Portuguese', 'Dutch', 'Polish', 'Japanese'], about: 'Transcription language: the language spoken in the recordings', current: 'Auto-Detect' },
  { key: 'formatLanguage', type: 'enum' as const, options: ['Auto-Detect / Original', 'English', 'Italian', 'Spanish', 'French', 'German', 'Portuguese', 'Dutch', 'Polish', 'Japanese'], about: 'Language that Improve and Summarize write in', current: 'Auto-Detect / Original' },
  { key: 'autoDeleteCacheDuration', type: 'enum' as const, options: ['Never', '1 Week', '1 Month'], about: 'How long the audio files are kept before they are deleted', current: 'Never' },
  { key: 'themeMode', type: 'enum' as const, options: ['system', 'light', 'dark', 'amoled'], about: 'Theme: light or dark appearance', current: 'system' },
  { key: 'accentColor', type: 'enum' as const, options: ['system', 'muffin', 'green', 'purple', 'red'], about: 'Accent color of the app', current: 'muffin' },
];

/**
 * Messages for the command rule: [message, kinds it should be read as, or null
 * for something to answer]. GATE_A was at hand while the rule was written.
 */
export const GATE_A: [string, string | null][] = [
  ['Turn on auto copy', 'setting'], ['Metti il tema scuro', 'setting'], ['Where do I change the transcription language?', 'where'],
  ['Cancella la nota sulla palestra', 'delete'], ['Rename the latest transcript to Spesa sabato', 'rename'], ['Open the settings', 'navigate'],
  ['Enable summaries after every transcription and switch the accent color to green', 'setting'],
  ["In quale nota parlo dell'assicurazione?", null], ['Which note mentions the accountant?', null],
  ["A che ora è l'appuntamento dal dentista?", null], ["Quanto costa il preventivo dell'idraulico?", null],
  ['Quando parte il treno per Roma?', null], ["Quanto costa l'assicurazione con Unipol?", null],
  ['Who owns the illustrations in the design meeting?', null], ['Ciao! Cosa sai fare?', null],
  ['Dammi tre idee regalo per mia mamma basandoti sulle mie note', null], ['Riassumimi la nota sul viaggio a Roma', null],
  ['Disattiva il riassunto automatico', 'setting'], ["What's on my shopping list?", null], ['Elimina la ricetta del pesto', 'delete'],
  ['Che cosa devo portare dal dentista?', null], ['Cambia il colore in rosso', 'setting'], ['Apri la memoria', 'navigate'],
  ['Grazie mille!', null], ['Quante note ho?', null], ["Dov'è l'impostazione della lingua?", 'where'],
  ['Tell me about the Rome trip', null], ['Rinomina la nota del dentista in Visita Bianchi', 'rename'],
  ["Quando scade l'assicurazione?", null], ['Pon el tema oscuro', 'setting'], ['¿Qué dije sobre el gimnasio?', null],
  ['Supprime la note sur le dentiste', 'delete'], ['Was habe ich über die Versicherung gesagt?', null],
];

/** Written after the rule, before it was ever run on them. */
export const GATE_B: [string, string | null][] = [
  // English
  ['Delete the note about the plumber', 'delete'], ['Could you rename the meeting notes to Design sync', 'rename'],
  ['Take me to the history', 'navigate'], ['Switch to dark mode', 'setting'], ['Disable auto copy', 'setting'],
  ['How do I change the accent color?', 'where'], ['Please turn off summaries', 'setting'],
  ['What did I say about the insurance?', null], ['Summarize my last note', null], ['When is my dentist appointment?', null],
  ['Did I mention deleting the old photos?', null], ['Remind me what the plumber said about the color of the tiles', null],
  ['Give me ideas for the trip', null], ['How much is the gym?', null], ["Thanks, that's all", null],
  ["Can you tell me what's in the shopping list?", null], ['Is there a note about the theme of the party?', null],
  ['I want to change my insurance', null], ['Turn the dentist note into a list', null], ['Change the summary of the Rome note', null],
  // Italian
  ["Elimina la nota sull'assicurazione", 'delete'], ["Puoi rinominare l'ultima nota in Spesa", 'rename'],
  ['Apri le impostazioni', 'navigate'], ['Attiva la copia automatica', 'setting'], ['Imposta la lingua su italiano', 'setting'],
  ['Dove cambio il tema?', 'where'], ['Passa al tema chiaro', 'setting'],
  ['Cosa ho detto sul colore delle piastrelle?', null], ['Riassumi la nota di ieri', null], ['Quando devo cambiare il boiler?', null],
  ["Ricordami di cancellare l'abbonamento della palestra", null], ['Che lingua parlano nel video?', null],
  ['Ho già mandato le fatture?', null], ['Fammi un riassunto del viaggio', null], ['Usa le mie note per scrivere una lista', null],
  // Spanish
  ['Borra la nota del gimnasio', 'delete'], ['Renombra la última nota a Compras', 'rename'], ['Abre el historial', 'navigate'],
  ['Activa el modo oscuro', 'setting'], ['¿Dónde está el ajuste del idioma?', 'where'],
  ['¿Qué dije sobre el dentista?', null], ['Resume la nota del viaje', null], ['¿Cuándo sale el tren?', null], ['Dame ideas para el regalo', null],
  // French
  ['Efface la note sur le plombier', 'delete'], ['Renomme la dernière note en Courses', 'rename'], ['Ouvre les réglages', 'navigate'],
  ['Mets le thème sombre', 'setting'], ['Désactive la copie automatique', 'setting'], ['Où est le réglage de la langue ?', 'where'],
  ["Qu'est-ce que j'ai dit sur l'assurance ?", null], ['Résume ma dernière note', null], ['Combien coûte le plombier ?', null],
  ['Change-t-on de train à Rome ?', null],
  // German
  ['Lösche die Notiz über den Zahnarzt', 'delete'], ['Kannst du die Notiz über die Versicherung löschen?', 'delete'],
  ['Öffne die Einstellungen', 'navigate'], ['Aktiviere das dunkle Design', 'setting'], ['Wo ändere ich die Sprache?', 'where'],
  ['Benenne die letzte Notiz in Einkauf um', 'rename'],
  ['Was habe ich über den Zahnarzt gesagt?', null], ['Fasse die letzte Notiz zusammen', null], ['Wann fährt der Zug nach Rom?', null],
  ['Wie viel kostet das Fitnessstudio?', null],
  // Portuguese
  ['Apaga a nota sobre o dentista', 'delete'], ['Renomeia a última nota para Compras', 'rename'], ['Abre as definições', 'navigate'],
  ['Ativa o tema escuro', 'setting'], ['Onde mudo o idioma?', 'where'],
  ['O que eu disse sobre o seguro?', null], ['Resume a última nota', null], ['Quando é a consulta no dentista?', null],
  ['Quanto custa o ginásio?', null],
];
