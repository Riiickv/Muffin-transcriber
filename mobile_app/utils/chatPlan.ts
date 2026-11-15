// What the chat does with a message, decided in code before any model runs.
//
// Pure on purpose: no imports, so it runs under plain Node in the tests
// (tests/chatPlan.test.ts) and in the PC harness that measured it. The reasons
// for every choice here, with the numbers, are in docs/chat-research.md.
//
// Three jobs:
//   1. commandGuess: is this message an order for the app (delete, rename, open
//      a screen, change a setting), or something to answer? A small model
//      cannot make that call (measured), so code does.
//   2. searchNotes / passage: which notes, and which part of a long one, the
//      model gets to read.
//   3. the two prompts: a command step whose output is forced into a fixed
//      shape, and a short answer step that knows nothing about actions.

export interface PlanNote {
  id: string;
  name: string;
  text: string;
  summary?: string;
  timestampISO: string;
}

export interface PlanSetting {
  key: string;
  type: 'boolean' | 'enum';
  options?: string[];
  /** One line for the model: what the setting is, in plain words. */
  about: string;
  current: string;
}

export interface PlanTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

const ACCENTS: Record<string, string> = {
  à: 'a', á: 'a', â: 'a', ã: 'a', ä: 'a', å: 'a', ç: 'c', è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i', ñ: 'n', ò: 'o', ó: 'o', ô: 'o', õ: 'o', ö: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u', ý: 'y', ÿ: 'y', ß: 'ss',
};

/** Lower case, accents removed. "Perché" and "perche" must be the same word. */
export function fold(s: string): string {
  return s.toLowerCase().replace(/[ß-ÿ]/g, (c) => ACCENTS[c] ?? c);
}

// Everything that separates words: spaces, ASCII and Latin-1 punctuation,
// typographic quotes and dashes, CJK punctuation. Splitting on separators
// (instead of matching a list of letters) keeps Cyrillic, Greek and the rest
// intact. JS \b and \w are ASCII only and are not used anywhere in this file.
const SEPARATORS = /[\s\u0000-/:-@[-`{-¿ -⁯　-〿]+/;

export function words(s: string): string[] {
  return fold(s).split(SEPARATORS).filter(Boolean);
}

/**
 * A crude stem, enough to join singular and plural and the Romance gender
 * endings: "regalo" and "regali", "notes" and "note", "dentista" and "dentist".
 */
export function stem(w: string): string {
  let s = w;
  if (s.length > 4 && s.endsWith('s')) s = s.slice(0, -1);
  if (s.length > 4 && 'aeiou'.includes(s[s.length - 1])) s = s.slice(0, -1);
  return s;
}

const set = (list: string) => new Set(list.split(/\s+/).filter(Boolean));

// Words that carry no topic. Folded. Function words of the six app languages,
// the words for "note" itself, and the verbs people use to ask.
const STOP = set(`
a an the and or but if of to in on at by for with from about into over than then so as is are was were be been am do does did
have has had i you he she it we they me my your his her its our their this that these those there here what which who whom when
where why how not no yes can could would should will shall may might must just also any some all each more most very much many
tell say said says talk talked mention mentioned mentions know give show find get got please thanks thank hello want need
note notes transcript transcripts transcription transcriptions recording recordings memo memos voice
cost costs price time hour number name called tomorrow domani manana demain morgen amanha
every everything tutto tutta tutti tutte ogni todo toda todos todas cada tout toute tous toutes chaque alle alles allen jede jeder jedes tudo
costa costano costo prezzo ora ore orario numero nome chiama chiamano
cuesta cuestan precio hora nombre llama
coute coutent prix heure numero nom appelle
kostet kosten preis uhr nummer name heisst
custa custam preco horas chama
il lo la i gli le un uno una e ed o ma se di a da in con su per tra fra del dello della dei degli delle al allo alla ai agli alle
dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle che chi cosa cui come dove quando
perche quale quali quanto quanta quanti quante non si no mi ti ci vi lo li ne io tu lui lei noi voi loro mio mia miei mie tuo tua
suo sua questo questa questi queste quello quella quelli quelle ho hai ha abbiamo avete hanno sono sei siamo siete era ero
essere avere fare detto dico dice parlo parla parlato dimmi dammi fammi trova cerca grazie ciao voglio vorrei devo dell nell sull dall coll quell
nota appunto appunti trascrizione trascrizioni registrazione registrazioni
el los las unos unas y u pero de del al en con por para sobre entre que quien cual cuales cuando donde como cuanto cuanta
cuantos cuantas es son era fue soy eres somos he has ha hemos han hay mi mis tu tus su sus este esta estos estas ese esa esos esas
yo ella nosotros ellos dije dijo dice digo hablo habla dime dame busca gracias hola quiero necesito tengo tienes tiene tenemos tienen
notas transcripcion transcripciones grabacion grabaciones
le les des du au aux et ou mais si dans sur sous avec pour par entre qui quoi dont quand comment pourquoi quel quelle quels
quelles combien est sont etait suis es sommes etes ai as avons avez ont je tu il elle nous vous ils elles mon ma mes ton ta tes
son sa ses ce cet cette ces ne pas dit dis parle parler donne trouve cherche merci bonjour salut veux voudrais
enregistrement enregistrements
der die das den dem des ein eine einen einem einer eines und oder aber wenn von zu zum zur im am an auf aus bei mit nach uber
unter fur durch um was wer wen wem wann wo wie warum welche welcher welches wieviel ist sind war waren bin bist habe hast hat
haben hatte ich du er sie es wir ihr mein meine dein deine sein seine dieser diese dieses nicht kein keine gesagt sage sagt
gib zeig finde such danke hallo will mochte viel viele
notiz notizen transkript transkripte aufnahme aufnahmen
os as um uma uns umas mas se do da dos das ao aos no na nos nas em com por para sobre entre que quem qual quais quando onde
como porque quanto quanta quantos quantas e sao era foi sou somos tenho tens tem temos ha meu minha meus minhas teu tua seu sua
este esta estes estas esse essa isso isto eu ele ela nos eles elas nao sim disse diz falo fala falei diga procura obrigado ola
quero preciso
transcricao transcricoes gravacao gravacoes
`);

// Greetings, thanks and "what can you do", in the six languages. A message
// made only of these and of words with no topic is talk, not a question about
// the notes, and it must never go looking for a note: "Buongiorno" once
// brought up a mechanic's voice message that happened to start with it.
const GREETING = set(`
hey hi hello hiya yo ciao salve buongiorno buonasera buonanotte buondi hola buenas bonjour bonsoir coucou salut hallo servus moin ola oi
thanks thank thx grazie gracias merci danke obrigado obrigada ok okay lol
help aiuto ayuda aide hilfe ajuda sai sabes sais kannst
`);
const GREETING_PHRASES = [
  'good morning', 'good evening', 'good night', 'good afternoon', 'buenos dias', 'buenas tardes', 'buenas noches', 'bom dia', 'boa tarde',
  'boa noite', 'guten tag', 'guten morgen', 'guten abend', 'gute nacht', 'grazie mille', 'thank you', 'muchas gracias', 'merci beaucoup',
  'vielen dank', 'muito obrigado', 'muito obrigada',
];

/** True for "Hey", "Grazie mille", "Cosa sai fare?": a greeting or thanks with no topic in it. */
export function isSmallTalk(text: string): boolean {
  let rest = ' ' + words(text).join(' ') + ' ';
  let greeted = false;
  for (const phrase of GREETING_PHRASES) {
    if (rest.includes(' ' + phrase + ' ')) {
      rest = rest.replace(' ' + phrase + ' ', ' ');
      greeted = true;
    }
  }
  const left = rest.trim().split(' ').filter(Boolean);
  if (left.some((w) => GREETING.has(w))) greeted = true;
  return greeted && left.every((w) => GREETING.has(w) || STOP.has(w));
}

// "The last one", in the six languages.
const NEWEST = set('last latest newest recent ultima ultimo ultime ultimi recente reciente recientes dernier derniere dernieres derniers letzte letzten letztes letzter neueste neuesten');
const TODAY = set('today oggi hoy heute hoje stamattina stasera');
const YESTERDAY = set('yesterday ieri ayer gestern ontem');

/** The words of a text that carry its topic, stemmed. */
export function contentStems(text: string): string[] {
  const out: string[] = [];
  for (const w of words(text)) {
    if (STOP.has(w) || GREETING.has(w) || NEWEST.has(w) || TODAY.has(w) || YESTERDAY.has(w)) continue;
    const isNumber = w[0] >= '0' && w[0] <= '9';
    if (w.length < 3 && !isNumber) continue;
    out.push(stem(w));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface Search {
  /** Best first. Only notes that matched something. */
  hits: { note: PlanNote; score: number }[];
  /** How much a stem of the question is worth; 0 for a word the question lacks. */
  weight: (stem: string) => number;
  /** True when the question asked for the newest note by position, not topic. */
  askedNewest: boolean;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Two stems are the same word when equal, or one continues the other by a short ending. */
function related(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 6 && long.length - short.length <= 3 && long.startsWith(short);
}

/**
 * Keyword search with rarity weighting (BM25): a word that is in every note is
 * worth nothing, a word in one note is worth a lot, and a long note does not
 * win just by being long. The note's name counts extra.
 */
export function searchNotes(query: string, notes: PlanNote[], now: Date = new Date()): Search {
  const queryWords = words(query);
  const askedNewest = queryWords.some((w) => NEWEST.has(w));
  const askedToday = queryWords.some((w) => TODAY.has(w));
  const askedYesterday = queryWords.some((w) => YESTERDAY.has(w));
  const queryStems = [...new Set(contentStems(query))];

  const docs = notes.map((note) => ({
    note,
    name: contentStems(note.name),
    body: contentStems([note.text, note.summary || ''].join(' ')),
  }));
  const average = docs.reduce((n, d) => n + d.body.length, 0) / Math.max(1, docs.length) || 1;

  const weights = new Map<string, number>();
  const scores = docs.map(() => 0);
  for (const q of queryStems) {
    const inBody = docs.map((d) => d.body.filter((s) => related(q, s)).length);
    const inName = docs.map((d) => d.name.some((s) => related(q, s)));
    const found = docs.filter((_, i) => inBody[i] > 0 || inName[i]).length;
    if (found === 0) continue;
    const rarity = Math.log(1 + (docs.length - found + 0.5) / (found + 0.5));
    weights.set(q, rarity);
    docs.forEach((d, i) => {
      const tf = inBody[i];
      if (tf > 0) scores[i] += (rarity * tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (d.body.length / average)));
      if (inName[i]) scores[i] += rarity * 1.5;
    });
  }

  const time = (n: PlanNote) => new Date(n.timestampISO).getTime();
  const newest = notes.length ? notes.reduce((a, b) => (time(b) > time(a) ? b : a)) : undefined;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const top = Math.max(1, ...scores);
  docs.forEach((d, i) => {
    // Asked by position or by day: those notes go first whatever the words say.
    if (askedNewest && newest && d.note.id === newest.id) scores[i] += top * 2;
    if (askedToday && sameDay(new Date(d.note.timestampISO), now)) scores[i] += top;
    if (askedYesterday && sameDay(new Date(d.note.timestampISO), yesterday)) scores[i] += top;
  });

  const hits = docs
    .map((d, i) => ({ note: d.note, score: scores[i] }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || time(b.note) - time(a.note));

  const weight = (s: string) => {
    for (const [q, w] of weights) if (related(q, s)) return w;
    return 0;
  };
  return { hits, weight, askedNewest };
}

/**
 * The part of a long note worth showing: the run of sentences that holds the
 * most of what was asked. The old code sent the first 1,200 characters, so a
 * fact at the end of a long note was never seen.
 */
export function passage(text: string, search: Search, limit: number): string {
  if (text.length <= limit) return text;

  // Sentences; a run with no punctuation is cut at spaces so no piece is huge.
  // A full stop only ends a sentence when a space follows: "1.350 euro" is one
  // piece, and cutting it in two once dropped the price this was looking for.
  const pieces: string[] = [];
  for (const sentence of text.match(/[\s\S]+?(?:[.!?]+(?=\s|$)|\n|$)\s*/g) || [text]) {
    let rest = sentence;
    while (rest.length > 240) {
      let cut = rest.lastIndexOf(' ', 240);
      if (cut < 80) cut = 240;
      pieces.push(rest.slice(0, cut + 1));
      rest = rest.slice(cut + 1);
    }
    if (rest) pieces.push(rest);
  }

  const worth = pieces.map((p) => {
    const seen = new Set<string>();
    let total = 0;
    for (const w of words(p)) {
      const s = stem(w);
      if (seen.has(s)) continue;
      seen.add(s);
      total += search.weight(s);
    }
    return total;
  });

  let best = { from: 0, to: 0, total: -1 };
  let to = 0;
  let length = 0;
  let total = 0;
  for (let from = 0; from < pieces.length; from++) {
    while (to < pieces.length && (length + pieces[to].length <= limit || to === from)) {
      length += pieces[to].length;
      total += worth[to];
      to++;
    }
    if (total > best.total + 1e-9) best = { from, to, total };
    length -= pieces[from].length;
    total -= worth[from];
  }
  if (best.total <= 0) return text.slice(0, limit).trim() + ' ...';

  // Keep the sentences that matched and grow outwards from them, one before
  // and one after in turn, so what was asked sits in the middle with its
  // context on both sides instead of at the very edge of the cut.
  let from = best.from;
  to = best.to;
  while (from < to - 1 && worth[from] === 0) from++;
  while (to > from + 1 && worth[to - 1] === 0) to--;
  length = pieces.slice(from, to).reduce((n, p) => n + p.length, 0);
  for (let grew = true, before = false; grew; ) {
    grew = false;
    for (let side = 0; side < 2 && !grew; side++, before = !before) {
      if (before && from > 0 && length + pieces[from - 1].length <= limit) {
        length += pieces[--from].length;
        grew = true;
      } else if (!before && to < pieces.length && length + pieces[to].length <= limit) {
        length += pieces[to++].length;
        grew = true;
      }
    }
  }

  const body = pieces.slice(from, to).join('').trim().slice(0, limit);
  return (from > 0 ? '... ' : '') + body + (to < pieces.length ? ' ...' : '');
}

// ---------------------------------------------------------------------------
// Command or question
// ---------------------------------------------------------------------------

export type CommandKind = 'delete' | 'rename' | 'navigate' | 'setting' | 'where';

export interface CommandGuess {
  kinds: CommandKind[];
  /** Set when the message names a screen to open. */
  tab?: string;
}

// Said before the actual request: greetings, "please", "can you". Longest first.
const LEAD_INS = [
  'i would like to', 'i d like to', 'go ahead and', 'i want to', 'i need to', 'can you', 'could you', 'would you', 'will you',
  'hey muffin', 'ok muffin', 'please', 'hey', 'hi', 'hello', 'muffin', 'now', 'ok', 'okay', 'then', 'just',
  'per favore', 'per piacere', 'per cortesia', 'mi puoi', 'mi potresti', 'puoi', 'potresti', 'vorrei', 'voglio', 'ehi', 'ciao',
  'ora', 'adesso', 'poi',
  'por favor', 'me puedes', 'puedes', 'podrias', 'quiero', 'quisiera', 'necesito', 'oye', 'hola', 'ahora',
  's il te plait', 's il vous plait', 'est ce que tu peux', 'peux tu', 'tu peux', 'pourrais tu', 'pouvez vous', 'je veux',
  'je voudrais', 'j aimerais', 'salut', 'bonjour', 'maintenant',
  'bitte', 'kannst du', 'konntest du', 'ich mochte', 'ich will', 'hallo', 'jetzt',
  'voce pode', 'podes', 'pode', 'poderia', 'quero', 'queria', 'preciso', 'ola', 'oi', 'agora',
].map((p) => p.split(' ')).sort((a, b) => b.length - a.length);

// Asking for something to be done ("can you ...") rather than saying it outright.
const ASKING = set('can could would will puoi potresti vorrei voglio puedes podrias quiero quisiera necesito peux pourrais pouvez veux voudrais aimerais kannst konntest mochte will pode podes poderia quero queria preciso want need like');

// A message that opens with one of these is a question, not an order.
const QUESTION_OPENERS = set(`
what which who whom whose when why how where did do does is are was were have has am
cosa che chi quando perche come quale quali quanto quanta quanti quante dove dov ho hai e c
que quien quienes cuando como cual cuales cuanto cuanta cuantos cuantas donde hay
qui quand pourquoi comment quel quelle quels quelles combien est ou y
was wer wann warum wie welche welcher welches wieviel wo habe hat ist gibt
o quem qual quais onde tem ha
`);
const WHERE = set('where dove dov donde ou wo onde');
const HOW = set('how come como comment wie');

const DELETE_VERBS = set(`
delete remove erase trash
cancella cancellare cancellami elimina eliminare eliminami rimuovi rimuovere
borra borrar borrame eliminar suprime suprimir
supprime supprimer supprimez efface effacer effacez
losche loschen losch entferne entfernen
apaga apagar exclui excluir remover deleta deletar
`);
const RENAME_VERBS = set(`
rename
rinomina rinominare rinominala rinominalo chiamala chiamalo
renombra renombrar renombrala renombralo llamala llamalo
renomme renommer renommez
umbenennen umbenenne benenne nenne
renomeia renomear renomeie
`);
const OPEN_VERBS = set(`
open go show take
apri aprire vai mostra mostrami portami
abre abrir ve muestra muestrame llevame
ouvre ouvrir ouvrez va montre affiche emmene
offne offnen gehe geh zeige zeig
abra mostre leva
`);
const SETTING_VERBS = set(`
turn enable disable activate deactivate switch set change use stop toggle keep
attiva attivare disattiva disattivare abilita disabilita accendi spegni metti mettere imposta impostare cambia cambiare
usa usare togli passa tieni conserva mantieni
activa activar desactiva desactivar pon poner cambiar quita enciende habilita deshabilita guarda manten
active activer desactive desactiver mets mettre change changer utilise utiliser passe allume eteins garde
aktiviere aktivieren deaktiviere deaktivieren schalte schalten stelle stellen andere andern wechsle wechseln nutze benutze
verwende behalte
ativa ativar desativa desativar liga ligar desliga desligar poe coloca colocar muda mudar troca trocar desabilita mantem
`);

// The names the screens carry in the app, per language, plus the obvious synonyms.
const SCREEN_WORDS: Record<string, string> = {};
const screen = (tab: string, list: string) => list.split(/\s+/).filter(Boolean).forEach((w) => (SCREEN_WORDS[w] = tab));
screen('settings', 'settings preferences impostazioni ajustes configuracion reglages parametres einstellungen definicoes configuracoes');
screen('history', 'history cronologia historial historique verlauf historico');
screen('memory', 'memory memoria memoire erinnerung erinnerungen');
screen('index', 'home inicio accueil startseite');
screen('chat', 'chat');

// Words that only come up when talking about a setting. Stems are matched at
// the start of a word, whole words exactly.
const SETTING_WORDS = set(`
theme tema thema design dark scuro scura oscuro oscura sombre dunkel dunkles dunklen escuro escura light chiaro chiara claro
clara clair hell helles hellen amoled mode modalita modo modus
accent color colour colore colori couleur farbe akzentfarbe cor
language lingua idioma langue sprache standardsprache
copy copia copiar copie copier kopieren kopie clipboard
volume audio memory memoria memoire erinnerung
setting impostazione ajuste reglage parametre einstellung definicao option opzione opcion opcao
`);
const SETTING_STEMS = ['summar', 'riassunt', 'riassum', 'resum', 'zusammenfass', 'improv', 'miglior', 'mejor', 'amelior', 'verbesser', 'melhor', 'normali'];
const NAME_WORDS = set('name title nome titolo nombre titulo nom titre namen titel');

const isSettingWord = (w: string) => SETTING_WORDS.has(w) || SETTING_STEMS.some((s) => w.startsWith(s));

/**
 * Is this an order for the app? Null means no: answer it instead.
 *
 * Deliberately narrow. A verb counts only as the first word of the request, or
 * right after "can you" and the like, so "remind me to delete the old
 * photos" stays a note about photos. A missed command costs a reply that talks
 * instead of doing; a false one puts a delete dialog in front of someone who
 * asked a question, which is worse.
 */
export function commandGuess(text: string): CommandGuess | null {
  const all = words(text);
  const first = guessClause(all);
  if (!first) return null;
  // "Use the light theme and open the history": what follows "and" is judged
  // as a request of its own, but only once the message has started as an order.
  let clause: string[] = [];
  let seen = false;
  for (const word of [...all, 'and']) {
    if (!AND.has(word)) {
      clause.push(word);
      continue;
    }
    const more = seen && clause.length ? guessClause(clause) : null;
    for (const k of more?.kinds || []) if (!first.kinds.includes(k)) first.kinds.push(k);
    if (more?.tab && !first.tab) first.tab = more.tab;
    seen = true;
    clause = [];
  }
  return first;
}

const AND = set('and then e ed poi y luego et puis und dann depois');

function guessClause(all: string[]): CommandGuess | null {
  let w = all;
  let asked = false;
  for (let stripped = true; stripped; ) {
    stripped = false;
    for (const lead of LEAD_INS) {
      if (lead.length < w.length && lead.every((t, i) => w[i] === t)) {
        if (lead.some((t) => ASKING.has(t))) asked = true;
        w = w.slice(lead.length);
        stripped = true;
        break;
      }
    }
  }
  if (w.length === 0) return null;

  const settingWord = w.some(isSettingWord);
  if (!asked && QUESTION_OPENERS.has(w[0])) {
    // "Where is the language setting?", "How do I change the theme?"
    if (settingWord && (WHERE.has(w[0]) || (HOW.has(w[0]) && w.some((x) => SETTING_VERBS.has(x))))) return { kinds: ['where'] };
    return null;
  }

  // After "can you" the verb is the next word, or the last one in German.
  const has = (verbs: Set<string>) => verbs.has(w[0]) || (asked && (verbs.has(w[1]) || verbs.has(w[w.length - 1])));
  const kinds: CommandKind[] = [];
  let tab: string | undefined;

  if (has(RENAME_VERBS) || (has(SETTING_VERBS) && w.some((x) => NAME_WORDS.has(x)))) kinds.push('rename');
  if (has(DELETE_VERBS)) kinds.push('delete');
  if (has(OPEN_VERBS)) {
    const named = w.find((x) => SCREEN_WORDS[x]);
    if (named) {
      tab = SCREEN_WORDS[named];
      kinds.push('navigate');
    }
  }
  if (!kinds.includes('rename') && settingWord && has(SETTING_VERBS)) kinds.push('setting');
  // "Dark mode", "tema scuro": a setting named with nothing else said.
  if (kinds.length === 0 && w.length <= 3 && w.filter(isSettingWord).length >= Math.min(2, w.length) && w.some((x) => SETTING_WORDS.has(x))) kinds.push('setting');

  return kinds.length ? { kinds, tab } : null;
}

// ---------------------------------------------------------------------------
// The command step
// ---------------------------------------------------------------------------

export const SCREEN_NAMES: [string, string][] = [
  ['index', 'Home'], ['history', 'History'], ['chat', 'Chat'], ['settings', 'Settings'], ['memory', 'Memory'],
];

export interface CommandRequest {
  system: string;
  /** JSON schema the reply is forced into. */
  schema: object;
  /** Short names used in the prompt, back to the real note ids. */
  ids: Record<string, string>;
}

const firstWords = (text: string, n: number) => text.replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * The prompt and the output shape for a message commandGuess called an order.
 *
 * Only the actions the message could mean are on offer, and a note can only be
 * picked from the short list the search produced, so the model's whole job is
 * to choose. Returns null when there is nothing to choose from (a delete that
 * matches no note): the caller reports that instead of guessing.
 */
export function commandRequest(
  ask: string,
  guess: CommandGuess,
  notes: PlanNote[],
  settings: PlanSetting[],
  now: Date = new Date()
): CommandRequest | null {
  const wants = (k: CommandKind) => guess.kinds.includes(k);
  const branch = (action: string, props: Record<string, object>) => ({
    type: 'object',
    properties: { action: { const: action }, ...props },
    required: ['action', ...Object.keys(props)],
    additionalProperties: false,
  });

  const branches: object[] = [];
  const lines: string[] = [];
  const sections: string[] = [];
  const examples: string[] = [];
  const ids: Record<string, string> = {};

  if (wants('setting') || wants('where')) {
    if (wants('setting')) {
      lines.push('- SET_SETTING: change a setting ("key", "value").');
      for (const s of settings) {
        branches.push(
          branch('SET_SETTING', {
            key: { const: s.key },
            value: s.type === 'boolean' ? { type: 'boolean' } : { type: 'string', enum: s.options || [] },
          })
        );
      }
      examples.push('"Usa il tema chiaro" -> {"actions":[{"action":"SET_SETTING","key":"themeMode","value":"light"}]}');
    }
    lines.push('- SHOW_SETTING: the user asks where a setting is, how to change it, or what it is set to ("key").');
    branches.push(branch('SHOW_SETTING', { key: { type: 'string', enum: settings.map((s) => s.key) } }));
    examples.push('"Where is the volume boost?" -> {"actions":[{"action":"SHOW_SETTING","key":"normalizeAudio"}]}');
    const values = (s: PlanSetting) =>
      s.type === 'boolean' ? 'true, false' : (s.options || []).length > 8 ? 'a language name in English, e.g. Italian' : (s.options || []).join(', ');
    sections.push(`Settings (key | meaning | now | allowed values):\n${settings.map((s) => `- ${s.key} | ${s.about} | ${s.current} | ${values(s)}`).join('\n')}`);
  }

  if (wants('navigate')) {
    lines.push('- NAVIGATE_TO: open a screen ("tab").');
    branches.push(branch('NAVIGATE_TO', { tab: { type: 'string', enum: SCREEN_NAMES.map((s) => s[0]) } }));
    sections.push(`Screens (tab | name): ${SCREEN_NAMES.map((s) => `${s[0]} | ${s[1]}`).join(', ')}`);
    examples.push('"Go to history" -> {"actions":[{"action":"NAVIGATE_TO","tab":"history"}]}');
  }

  if (wants('delete') || wants('rename')) {
    const search = searchNotes(ask, notes, now);
    const time = (n: PlanNote) => new Date(n.timestampISO).getTime();
    const newest = notes.length ? notes.reduce((a, b) => (time(b) > time(a) ? b : a)) : undefined;
    const listed = search.hits.slice(0, 6).map((h) => h.note);
    // A rename with no note named means the newest one; the app shows the name
    // and asks before anything changes. A delete never guesses.
    if (newest && !listed.includes(newest) && (wants('rename') || search.askedNewest)) listed.push(newest);
    if (listed.length === 0 && !wants('setting') && !wants('navigate')) return null;
    if (listed.length > 0) {
      listed.forEach((n, i) => (ids[`N${i + 1}`] = n.id));
      const pick = { type: 'string', enum: Object.keys(ids) };
      if (wants('delete')) {
        lines.push('- DELETE_TRANSCRIPT: delete a note ("note").');
        branches.push(branch('DELETE_TRANSCRIPT', { note: pick }));
      }
      if (wants('rename')) {
        lines.push('- RENAME_TRANSCRIPT: rename a note ("note", and "new_name": the new name exactly as the user wrote it).');
        branches.push(branch('RENAME_TRANSCRIPT', { note: pick, new_name: { type: 'string', maxLength: 80 } }));
      }
      const row = (n: PlanNote, i: number) => `- N${i + 1} | ${n.name} | ${firstWords(n.text, 70)}${newest && n.id === newest.id ? ' | the newest note' : ''}`;
      sections.push(`Notes that match the message, best first (note | name | first words):\n${listed.map(row).join('\n')}`);
    }
  }

  lines.push('- NONE: the message is not one of these.');
  branches.push(branch('NONE', {}));

  const system = `You turn a command for Muffin, a voice-note app, into actions. Reply with JSON only.

Actions:
${lines.join('\n')}
Several things asked at once are several actions.

${sections.join('\n\n')}

Examples:
${examples.join('\n')}`;

  const schema = {
    type: 'object',
    properties: { actions: { type: 'array', minItems: 1, maxItems: 3, items: branches.length === 1 ? branches[0] : { anyOf: branches } } },
    required: ['actions'],
    additionalProperties: false,
  };
  return { system, schema, ids };
}

/**
 * The model's reply, as the actions the app already knows how to carry out.
 * Empty when it said NONE or wrote something unreadable.
 */
export function readCommandReply(raw: string, ids: Record<string, string>): any[] {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const actions = Array.isArray(parsed?.actions) ? parsed.actions : [];
  const out: any[] = [];
  for (const a of actions) {
    if (!a || typeof a.action !== 'string' || a.action === 'NONE') continue;
    const { note, ...rest } = a;
    const action = note === undefined ? rest : { ...rest, transcript_id: ids[String(note)] };
    // The same note twice, or the same setting twice, is one action.
    const same = (b: any) => JSON.stringify({ ...b, new_name: undefined, value: undefined }) === JSON.stringify({ ...action, new_name: undefined, value: undefined });
    if (!out.some(same)) out.push(action);
  }
  return out;
}

/** Actions in the form the chat screen parses and runs. */
export function toolCallText(actions: any[]): string {
  return actions.map((a) => `<tool_call>${JSON.stringify(a)}</tool_call>`).join('\n');
}

// ---------------------------------------------------------------------------
// The answer step
// ---------------------------------------------------------------------------

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Sat 14 Nov 2026": fixed, so a model never has to guess day-first or month-first. */
export function plainDate(d: Date): string {
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Search by meaning, for when no word of the question is in any note. Takes
 * the question's vector and the notes' vectors from the helper model and
 * returns the one note worth showing, or null.
 *
 * Raw similarity is no use as it comes: the model (multilingual-e5) scores any
 * two texts between 0.7 and 0.9, and a question with no answer anywhere still
 * scored 0.85 against some note. Most of every vector is a part all texts
 * share. So that shared part, the mean of the library's own vectors, is taken
 * out of the notes and the question first, and what is left is compared.
 * Measured with this function on 44 questions in six languages against
 * libraries of 3 to 10 notes (docs/chat-research.md, section 13): the right
 * note shown for 54 to 68 in 100 questions that have one, a wrong note for
 * at most 3 in 100, a note shown for a question with no answer at most 4 in
 * 100. A plain gap to the runner-up, the rule before this one, showed a note
 * for nothing 29 times in 100 on a library of three. At 0.20 the right note
 * shows about 8 in 100 more often and a note for nothing up to 7 in 100.
 */
export const MEANING_LEAST = 0.22;
export const MEANING_MIN_NOTES = 3;
export function clearestByMeaning(question: number[], notes: { id: string; vector: number[] }[]): string | null {
  const size = question.length;
  const usable = notes.filter((n) => size > 0 && n.vector.length === size);
  if (usable.length < MEANING_MIN_NOTES) return null;
  const unit = (v: number[]) => {
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  };
  const units = usable.map((n) => unit(n.vector));
  const centre = new Array<number>(size).fill(0);
  for (const v of units) for (let i = 0; i < size; i++) centre[i] += v[i] / units.length;
  const apart = (v: number[]) => unit(v.map((x, i) => x - centre[i]));
  const q = apart(unit(question));
  let best = 0;
  let bestScore = -Infinity;
  units.forEach((v, k) => {
    const w = apart(v);
    let score = 0;
    for (let i = 0; i < size; i++) score += q[i] * w[i];
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  });
  return bestScore >= MEANING_LEAST ? usable[best].id : null;
}

/**
 * A note cut into pieces a helper model can read. These models take a few
 * hundred tokens at most and refuse or cut anything longer, so a long note is
 * read as several pieces and its vector is their mean. Pieces end at the end
 * of a sentence where there is one. A note too long for `max` pieces keeps
 * pieces spread evenly from its start to its end rather than only its start.
 */
export function piecesForEmbedding(text: string, size = 1000, max = 4): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  const all: string[] = [];
  let at = 0;
  while (at < clean.length) {
    let end = Math.min(clean.length, at + size);
    if (end < clean.length) {
      const part = clean.slice(at, end);
      const stop = Math.max(part.lastIndexOf('. '), part.lastIndexOf('? '), part.lastIndexOf('! '));
      const space = part.lastIndexOf(' ');
      if (stop > size * 0.6) end = at + stop + 1;
      else if (space > size * 0.6) end = at + space;
    }
    const piece = clean.slice(at, end).trim();
    if (piece) all.push(piece);
    at = end;
  }
  if (all.length <= max) return all;
  if (max <= 1) return all.slice(0, 1);
  return Array.from({ length: max }, (_, i) => all[Math.round((i * (all.length - 1)) / (max - 1))]);
}

/** The mean of several vectors, scaled to length one. Empty when there is nothing to average. */
export function meanVector(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const sum = new Array<number>(vectors[0].length).fill(0);
  for (const v of vectors) {
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    for (let i = 0; i < sum.length; i++) sum[i] += (v[i] ?? 0) / norm;
  }
  const norm = Math.sqrt(sum.reduce((s, x) => s + x * x, 0)) || 1;
  return sum.map((x) => x / norm);
}

/** A vector as it is stored: four decimals, a third of the size on disk, the scores unchanged to the third decimal. */
export function packVector(vector: number[]): number[] {
  return vector.map((x) => Math.round(x * 10000) / 10000);
}

/** Changes when a note's text does, so the helper model reads the note again. */
export function textMark(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return text.length + ':' + hash.toString(36);
}

export const MAX_NOTES_SHOWN = 3;
const BEST_NOTE_CHARS = 1600;
const OTHER_NOTE_CHARS = 800;
const SUMMARY_CHARS = 300;
const MEMORIES_SHOWN = 8;
const OLD_TURN_CHARS = 400;
const LAST_TURN_CHARS = 1000;

/**
 * Which notes the answer step reads. The last message decides; a follow-up
 * with no topic of its own ("and at what time?") falls back to the message
 * before it.
 */
export function notesForTurns(
  turns: PlanTurn[],
  notes: PlanNote[],
  now: Date = new Date(),
  memories: string[] = []
): { search: Search; shown: PlanNote[] } {
  const asked = turns.filter((t) => t.role === 'user').map((t) => t.content);
  // A saved fact that shares a word with the question lends it its other
  // words: "the accountant" finds the note that only says "Ferri".
  const widen = (q: string) => {
    const said = new Set(contentStems(q));
    return [q, ...memories.filter((m) => contentStems(m).some((s) => said.has(s)))].join(' ');
  };
  let search = searchNotes(widen(asked[asked.length - 1] || ''), notes, now);
  if (search.hits.length === 0 && asked.length > 1) search = searchNotes(widen(asked[asked.length - 2]), notes, now);
  // A note far weaker than the best one is noise, and noise gets quoted.
  const floor = search.hits.length ? search.hits[0].score * 0.5 : 0;
  const shown = search.hits.filter((h) => h.score >= floor).slice(0, MAX_NOTES_SHOWN).map((h) => h.note);
  return { search, shown };
}

const HOW_MANY = set('many quante quanti cuantas cuantos combien viele quantas quantos');
const NOTE_WORDS = set(`
note notes transcript transcripts transcription transcriptions recording recordings memo memos
nota appunto appunti trascrizione trascrizioni registrazione registrazioni notas transcripcion transcripciones grabacion grabaciones
enregistrement enregistrements notiz notizen aufnahme aufnahmen transkription transkriptionen transcricao transcricoes gravacao gravacoes
`);

/**
 * "How many notes do I have?": a count, which the app knows and a small model
 * gets wrong (Llama 3.2 1B, told "The user has 10 voice notes", answered
 * "Non ho note"). True only when the question has no other topic.
 */
export function asksNoteCount(ask: string): boolean {
  const w = words(ask);
  return w.some((x) => HOW_MANY.has(x)) && w.some((x) => NOTE_WORDS.has(x)) && contentStems(ask).length === 0;
}

/**
 * The instructions for a message that is not about any note: a greeting, a
 * thank you, "how are you". Kept this bare on purpose. Told what the app can
 * do, the smallest chat model acted it out ("I've opened a new note for
 * you"); told about "the user's message", it described the message instead
 * of answering it (both measured, docs/chat-research.md section 14).
 */
export function talkSystem(ask: string, notes: PlanNote[]): string {
  const count = words(ask).some((w) => HOW_MANY.has(w)) ? ` The user has ${notes.length} voice notes.` : '';
  return `You are a helpful assistant called Muffin Chat. You help people with their voice notes.${count} Answer in one short sentence, in the same language as the user.`;
}

/**
 * The answer step's instructions. Bounded whatever the library holds: at most
 * MAX_NOTES_SHOWN passages of fixed size and a capped list of saved facts.
 * `scale` shrinks the passages for a small context.
 *
 * The notes go in WITHOUT their names. Notes on a real phone are often named
 * after a file ("PTT-20261106-WA0017"); shown that name and asked to cite it,
 * a small model answers with the name and nothing else. The app adds the
 * source itself, see sourceOf. Measured on 10 questions, 3 seeds each: Llama
 * 3.2 1B 6 of 30 before, 15 of 30 after; Qwen 2.5 1.5B 27 before, 30 after.
 */
export function answerSystem(
  shown: PlanNote[],
  search: Search,
  notes: PlanNote[],
  memories: string[],
  now: Date = new Date(),
  scale = 1,
  missing = 'Not found in the notes.'
): string {
  if (shown.length === 0) return talkSystem('', notes);
  const one = shown.length === 1;
  const block = (n: PlanNote, i: number) => {
    const summary = n.summary ? `Summary: ${n.summary.slice(0, SUMMARY_CHARS)}\n` : '';
    const text = passage(n.text, search, Math.round((i === 0 ? BEST_NOTE_CHARS : OTHER_NOTE_CHARS) * scale));
    return `${one ? 'The voice note' : `Voice note ${i + 1}`}, recorded ${plainDate(new Date(n.timestampISO))}:\n"""\n${summary}${text}\n"""`;
  };
  const facts = memories.slice(0, MEMORIES_SHOWN).map((m) => '- ' + m.slice(0, 120));
  const known = facts.length ? `Known about the user:\n${facts.join('\n')}\n\n` : '';

  return `You are Muffin Chat, the assistant inside Muffin, a voice-note app. Answer the user's question from the voice ${one ? 'note' : 'notes'} below.

Today is ${plainDate(now)}.

${known}${shown.map(block).join('\n\n')}

Rules:
- Reply in the language of the user's message, even when the note is in another language.
- Say what the ${one ? 'note says' : 'notes say'} about the question: the facts, names, amounts, dates and times. Two to four short sentences.
- Use only what is written there. If the ${one ? 'note does' : 'notes do'} not give the answer, reply only: "${missing}" Never make up a name, number, date or price.`;
}

/**
 * The note a reply was taken from, so the app can put its name under the
 * reply (the chat screen turns a note's name into a link). Chosen by what the
 * reply shares with each note shown, numbers counting double; null when the
 * reply shares nothing or holds the app's "not found" sentence, which is what
 * "the note does not say" looks like, or when the reply names the note already.
 */
export function sourceOf(reply: string, shown: PlanNote[], missing = ''): PlanNote | null {
  if (missing && fold(reply).includes(fold(missing))) return null;
  const said = new Set(contentStems(reply));
  let best: PlanNote | null = null;
  let bestScore = 0;
  for (const note of shown) {
    const stems = new Set(contentStems([note.text, note.summary || ''].join(' ')));
    let score = 0;
    for (const s of said) if (stems.has(s)) score += s[0] >= '0' && s[0] <= '9' ? 2 : 1;
    if (score > bestScore) {
      best = note;
      bestScore = score;
    }
  }
  if (!best || bestScore < (shown.length === 1 ? 1 : 2)) return null;
  return fold(reply).includes(fold(best.name)) ? null : best;
}

/** The turns the answer step sees: the last few things actually said, nothing private, nothing huge. */
export function turnsForAnswer(turns: PlanTurn[], keep = 4): PlanTurn[] {
  const said = turns
    .filter((t) => t.role !== 'system')
    .map((t) => ({ role: t.role, content: t.content.replace(/<tool_call>[\s\S]*?(<\/tool_call>|$)/gi, '').trim() }))
    .filter((t) => t.content)
    .slice(-keep);
  return said.map((t, i) => ({ role: t.role, content: t.content.slice(0, i === said.length - 1 ? LAST_TURN_CHARS : OLD_TURN_CHARS) }));
}

// ---------------------------------------------------------------------------
// Prompt formats
// ---------------------------------------------------------------------------

/** The chat format each model family was trained on, chosen by file name. */
export function wrapPrompt(modelFile: string, system: string, turns: PlanTurn[]): string {
  const lower = modelFile.toLowerCase();
  if (lower.includes('llama-3')) {
    return (
      `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n${system}<|eot_id|>` +
      turns.map((m) => `<|start_header_id|>${m.role}<|end_header_id|>\n\n${m.content}<|eot_id|>`).join('') +
      `<|start_header_id|>assistant<|end_header_id|>\n\n`
    );
  }
  if (lower.includes('phi-3')) {
    return `<|system|>\n${system}<|end|>\n` + turns.map((m) => `<|${m.role}|>\n${m.content}<|end|>\n`).join('') + `<|assistant|>\n`;
  }
  return `<|im_start|>system\n${system}<|im_end|>\n` + turns.map((m) => `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`).join('') + `<|im_start|>assistant\n`;
}

/** How much the generation may add after the prompt. */
export const ANSWER_TOKENS = 400;

/**
 * The most tokens a prompt may hold for this model.
 *
 * Phi-3 Mini 4K is the special case. Its file says 4,096, but measured on the
 * file the app downloads it answers correctly with a prompt of 2,217 tokens
 * and writes garbage at 2,608, at any window size. 1,500 leaves room for the
 * answer below the last length known to work.
 */
export function promptBudget(modelFile: string, contextSize: number): number {
  const room = Math.max(600, (contextSize || 4096) - ANSWER_TOKENS - 100);
  return modelFile.toLowerCase().includes('phi-3') ? Math.min(room, 1500) : room;
}

/** What the answer step tries, largest first, until the prompt fits the budget. */
export const ANSWER_SIZES = [
  { scale: 1, notes: 3, turns: 4 },
  { scale: 0.6, notes: 3, turns: 2 },
  { scale: 0.35, notes: 2, turns: 2 },
  { scale: 0.2, notes: 1, turns: 1 },
];

export const STOP_TOKENS = ['<|im_end|>', '<|end|>', '<|eot_id|>', '<|endoftext|>'];
