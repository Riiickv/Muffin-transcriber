/**
 * Date/time detection for transcript highlighting - PURE, no model, no native
 * modules, so it's unit-testable in plain Node.
 *
 * Extracted from LLMEngine so the logic that decides what gets highlighted (and
 * caused the "highlights words that make no sense" bug) has a test net. The
 * engine calls sanitiseEntities/mergeEntities; the screens call findHighlights.
 *
 * Finding and resolving the dates themselves is the second half of this file.
 */

export interface ActionableEntity {
  quote: string;
  name: string;
  type: 'date' | 'time';
  /**
   * The actual day (and hour) the quote means. Worked out again every time the
   * text is shown, from the recording's own date, so it is never stored: a
   * stored value would go stale the day after "domani" was said.
   */
  when?: When;
}

/** More than this and a transcript is all underline. */
const MAX_ENTITIES = 12;

/**
 * A clock reading: "5pm", "17:30", "5.30", "18h". Decides date-vs-time by
 * inspection instead of trusting the model's guess.
 */
const CLOCK_RE = /\b\d{1,2}\s*[:.]\s*\d{2}\b|\b\d{1,2}\s*(?:am|pm|a\.m\.|p\.m\.)\b|\b\d{1,2}\s*h\b/i;

/**
 * Temporal cues in the languages the app itself speaks. NOT a parser - Whisper
 * transcribes ~100 languages, so this can't be exhaustive. It's a sanity filter:
 * a real date/time nearly always carries a digit, and this catches the common
 * wordy ones ("tomorrow", "domani", "nächste Woche") that don't.
 */
const TEMPORAL_WORDS = [
  // en
  'today', 'tomorrow', 'tonight', 'yesterday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
  'saturday', 'sunday', 'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september',
  'october', 'november', 'december', 'morning', 'afternoon', 'evening', 'noon', 'midnight', 'week',
  'month', 'year', 'weekend',
  // it
  'oggi', 'domani', 'stasera', 'ieri', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato',
  'domenica', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto',
  'settembre', 'ottobre', 'novembre', 'dicembre', 'mattina', 'pomeriggio', 'sera', 'mezzogiorno',
  'settimana', 'mese', 'anno',
  // es
  'hoy', 'mañana', 'ayer', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'domingo', 'enero',
  'febrero', 'abril', 'mayo', 'junio', 'julio', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  'tarde', 'noche', 'mediodía', 'semana', 'año',
  // fr
  "aujourd'hui", 'demain', 'hier', 'soir', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi',
  'dimanche', 'janvier', 'février', 'mars', 'avril', 'juin', 'juillet', 'août', 'octobre', 'décembre',
  'matin', 'midi', 'semaine', 'mois', 'année',
  // de
  'heute', 'morgen', 'gestern', 'abend', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag',
  'samstag', 'sonntag', 'januar', 'februar', 'märz', 'juni', 'juli', 'oktober', 'dezember',
  'vormittag', 'nachmittag', 'mittag', 'woche', 'monat', 'jahr',
  // pt
  'hoje', 'amanhã', 'ontem', 'noite', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'janeiro',
  'fevereiro', 'março', 'maio', 'junho', 'julho', 'setembro', 'outubro', 'novembro', 'dezembro',
  'manhã', 'meio-dia', 'mês',
];

function looksTemporal(quote: string): boolean {
  if (/\d/.test(quote)) return true;
  const lower = quote.toLowerCase();
  return TEMPORAL_WORDS.some((w) => lower.includes(w));
}

/**
 * Keep only entities we can actually stand behind.
 *
 * The highlight works by locating `quote` inside the transcript, so a quote the
 * model invented either fails to match or latches onto something unrelated -
 * which is exactly the "it highlights words that make no sense" problem. So:
 * the quote must appear VERBATIM, must look temporal at all, must be unique, and
 * the date/time type is decided by inspection rather than the model's guess.
 */
export function sanitiseEntities(parsed: unknown, transcript: string): ActionableEntity[] {
  if (!Array.isArray(parsed)) return [];
  const haystack = transcript.toLowerCase();
  const seen = new Set<string>();
  const out: ActionableEntity[] = [];

  for (const raw of parsed) {
    if (!raw || typeof raw !== 'object') continue;
    const quote = typeof (raw as any).quote === 'string' ? (raw as any).quote.trim() : '';
    const name = typeof (raw as any).name === 'string' ? (raw as any).name.trim() : '';
    if (quote.length < 3 || !name) continue;

    const key = quote.toLowerCase();
    if (!haystack.includes(key)) continue; // hallucinated quote
    if (!looksTemporal(quote)) continue; // not actually a date or time
    if (seen.has(key)) continue; // same moment twice
    seen.add(key);

    out.push({ quote, name, type: CLOCK_RE.test(quote) ? 'time' : 'date' });
    if (out.length >= MAX_ENTITIES) break;
  }
  return out;
}

type Span = { start: number; end: number; type: 'date' | 'time' };

/**
 * A calendar title for a date the model didn't name: the few words that follow
 * it, which is usually the point ("il 15 luglio devo comprare le patate").
 * Stays in the speaker's language for free, and the user can edit it anyway.
 */
function nameFromContext(transcript: string, span: Span): string {
  // Conjunctions, articles and prepositions, so a five-word window doesn't end
  // on "e" or "alle". Trimmed after slicing, or the dangling word survives.
  const FILLER =
    /^(?:e|ed|y|et|and|und|o|ou|or|il|lo|la|le|i|gli|the|el|los|las|der|die|das|a|al|all'|alle|allo|ai|agli|da|dal|dalla|de|del|della|dei|degli|di|du|des|zu|am|im|um|in|su|con|per|at|to|of|for|on|en)$/i;
  const trimFiller = (words: string[]) => {
    let a = 0;
    let b = words.length;
    while (a < b && FILLER.test(words[a])) a++;
    while (b > a && FILLER.test(words[b - 1])) b--;
    return words.slice(a, b);
  };

  const after = () => {
    const rest = transcript.slice(span.end);
    const cut = rest.search(/[.,;:!?\n]/);
    const words = (cut === -1 ? rest : rest.slice(0, cut)).trim().split(/\s+/).filter(Boolean);
    return trimFiller(trimFiller(words).slice(0, 5));
  };
  const before = () => {
    const head = transcript.slice(0, span.start);
    const start = Math.max(...[...'.,;:!?\n'].map((c) => head.lastIndexOf(c)));
    const words = head.slice(start + 1).trim().split(/\s+/).filter(Boolean);
    return trimFiller(trimFiller(words).slice(-5));
  };

  // The action usually sits before an hour ("devo andare dal dottore alle 4")
  // and after a date ("il 15 luglio devo comprare le patate").
  const [first, second] = span.type === 'time' ? [before(), after()] : [after(), before()];
  const pick = first.length >= 2 ? first : second.length >= 2 ? second : first.length ? first : second;
  return pick.join(' ') || transcript.slice(span.start, span.end).trim();
}

/**
 * Pattern matches first (they always highlight, and they come with the real
 * date), then any model entity the patterns missed: the wordy ones ("after the
 * holidays") the model is better at spotting. Those have no resolved date.
 *
 * `ref` is when the note was recorded. "Domani" means the day after THAT.
 */
export function mergeEntities(
  modelEntities: ActionableEntity[],
  transcript: string,
  ref: Date = new Date()
): ActionableEntity[] {
  const out: ActionableEntity[] = [];
  const overlaps = (a: string, b: string) => a.includes(b) || b.includes(a);
  const sameDay = (a: When, b: When) => a.year === b.year && a.month === b.month && a.day === b.day;

  const spans = findDateSpans(transcript, ref);
  // An hour that belongs to a date ("il 17 luglio ... alle 4") is the same
  // event, so it takes the date's title instead of naming itself.
  const titleOfDay: { when: When; name: string }[] = [];
  const seen = new Set<string>();

  const push = (span: (typeof spans)[number]) => {
    const quote = transcript.slice(span.start, span.end).trim();
    if (!quote) return;
    const lower = quote.toLowerCase();
    // The screen highlights by quote, so a second identical one adds nothing.
    if (seen.has(lower)) return;
    seen.add(lower);
    // Reuse the model's title when it spotted the same moment - it names things
    // better than the surrounding words do.
    const named = modelEntities.find((e) => overlaps(e.quote.toLowerCase(), lower));
    const paired = span.kind === 'time' && span.when.dateSaid ? titleOfDay.find((d) => sameDay(d.when, span.when)) : undefined;
    const name = named?.name || paired?.name || nameFromContext(transcript, { start: span.start, end: span.end, type: span.kind });
    if (span.kind === 'date') titleOfDay.push({ when: span.when, name });
    out.push({ quote, name, type: span.kind, when: span.when });
  };

  // Dates first, so an hour spoken before its date still finds the title.
  spans.filter((s) => s.kind === 'date').forEach(push);
  spans.filter((s) => s.kind === 'time').forEach(push);
  out.sort((a, b) => transcript.indexOf(a.quote) - transcript.indexOf(b.quote));
  if (out.length >= MAX_ENTITIES) return out.slice(0, MAX_ENTITIES);

  for (const e of modelEntities) {
    // Belt and braces: sanitiseEntities already dropped these, but a quote that
    // isn't in the text can never highlight, so it must never reach the list.
    if (!transcript.toLowerCase().includes(e.quote.toLowerCase())) continue;
    if (out.some((o) => overlaps(o.quote.toLowerCase(), e.quote.toLowerCase()))) continue;
    // Never trust a `when` that came in from storage: resolve it again, here.
    out.push({ quote: e.quote, name: e.name, type: e.type, when: resolveQuote(e.quote, ref) });
    if (out.length >= MAX_ENTITIES) break;
  }
  return out;
}

/**
 * Highlights for whatever text is currently on screen.
 *
 * Entities are extracted once, from the raw transcript, but the screen can be
 * showing the formatted or summarized version, where those exact quotes may not
 * survive the rewording. Since the patterns are pure regex, re-running them on
 * the visible text is instant and needs no model, so every tab can highlight -
 * reusing the stored titles wherever they line up.
 */
export function findHighlights(text: string, stored: ActionableEntity[] = [], ref: Date = new Date()): ActionableEntity[] {
  if (!text) return [];
  return mergeEntities(stored, text, ref);
}

// =====================================================================
// Reading dates and times
//
// The old Butler only FOUND "15 luglio" or "alle 4"; it never worked out which
// day or hour that was, so the calendar opened on today with nothing filled in.
// This part reads the expression and resolves it against the moment the note
// was recorded ("domani" in a note from Monday is Tuesday, whenever it is
// opened).
//
// Written for the six app languages. chrono-node was measured first and
// rejected: wrong days in five languages ("pasado mañana" came back as
// tomorrow). docs/butler-research.md has both runs.
//
// Two rules here are judgement calls, not facts about any language:
// - a bare hour from 1 to 6 with no "am", "di mattina" and so on is read as
//   the afternoon ("alle 4" is 16:00);
// - a weekday means its next occurrence after the recording day.
// The dialog shows the resolved value before anything is created.
//
// Regex notes: JS `\b` is ASCII-only, so it fails after "lunedì" or "amanhã".
// Boundaries are checked by hand on the left (see scan) and by RIGHT on the
// right. No lookbehind and no \p{...}, so nothing depends on the engine.
//
// It lives in this file, not its own, because the tests run under plain Node,
// which needs ".ts" on a sibling import, and the app's typecheck forbids it.
// =====================================================================

export interface When {
  year: number;
  /** 1 to 12 */
  month: number;
  day: number;
  /** Absent means the whole day. */
  hour?: number;
  minute?: number;
  /** False when only an hour was spoken and the day was assumed. */
  dateSaid: boolean;
}

export interface DateSpan {
  start: number;
  end: number;
  kind: 'date' | 'time';
  when: When;
}

type Part = 'morning' | 'afternoon' | 'evening' | 'night';
type Marker = 'am' | 'pm' | '24';

interface DateHit {
  start: number;
  end: number;
  year: number;
  month: number;
  day: number;
  part?: Part;
  /** "today"-type words: worth showing only with an hour attached. */
  needsTime?: boolean;
}

interface TimeHit {
  start: number;
  end: number;
  hour: number;
  minute: number;
  marker?: Marker;
  part?: Part;
  /** Too ambiguous alone ("14h", "at eight"): kept only beside a date. */
  weak?: boolean;
}

const WORD = 'A-Za-zÀ-ÖØ-öø-ÿ0-9';
const RIGHT = `(?![${WORD}])`;
const WORD_RE = new RegExp(`[${WORD}]`);
const APOS = "['’]";

function scan(text: string, re: RegExp, onMatch: (m: RegExpExecArray) => void) {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!m[0]) {
      re.lastIndex++;
      continue;
    }
    if (m.index > 0 && WORD_RE.test(text[m.index - 1])) {
      re.lastIndex = m.index + 1;
      continue;
    }
    onMatch(m);
  }
}

const rx = (source: string) => new RegExp(source, 'gi');
const lower = (s: string | undefined) => (s ?? '').toLowerCase();

// ---------------------------------------------------------------- calendar

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function addDays(ref: Date, n: number): { year: number; month: number; day: number } {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + n);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

function addMonths(ref: Date, n: number): { year: number; month: number; day: number } {
  const first = new Date(ref.getFullYear(), ref.getMonth() + n, 1);
  const year = first.getFullYear();
  const month = first.getMonth() + 1;
  return { year, month, day: Math.min(ref.getDate(), daysInMonth(year, month)) };
}

/** A day and month with no year: this year if still ahead, otherwise next. */
function resolveYear(ref: Date, month: number, day: number, year?: number): number | null {
  if (month < 1 || month > 12 || day < 1) return null;
  if (year !== undefined) {
    const full = year < 100 ? 2000 + year : year;
    return day <= daysInMonth(full, month) ? full : null;
  }
  const y = ref.getFullYear();
  const passed = month < ref.getMonth() + 1 || (month === ref.getMonth() + 1 && day < ref.getDate());
  const pick = passed ? y + 1 : y;
  // 29 February only exists in some years; take the next one that has it.
  for (let k = 0; k < 8; k++) if (day <= daysInMonth(pick + k, month)) return pick + k;
  return null;
}

// ---------------------------------------------------------------- lexicons

const MONTHS: Record<string, number> = {};
[
  ['january', 'gennaio', 'enero', 'janvier', 'januar', 'jänner', 'janeiro'],
  ['february', 'febbraio', 'febrero', 'février', 'fevrier', 'februar', 'fevereiro'],
  ['march', 'marzo', 'mars', 'märz', 'maerz', 'março', 'marco'],
  ['april', 'aprile', 'abril', 'avril'],
  ['may', 'maggio', 'mayo', 'mai', 'maio'],
  ['june', 'giugno', 'junio', 'juin', 'juni', 'junho'],
  ['july', 'luglio', 'julio', 'juillet', 'juli', 'julho'],
  ['august', 'agosto', 'août', 'aout'],
  ['september', 'settembre', 'septiembre', 'setiembre', 'septembre', 'setembro'],
  ['october', 'ottobre', 'octubre', 'octobre', 'oktober', 'outubro'],
  ['november', 'novembre', 'noviembre', 'novembro'],
  ['december', 'dicembre', 'diciembre', 'décembre', 'decembre', 'dezember', 'dezembro'],
].forEach((names, i) => names.forEach((n) => (MONTHS[n] = i + 1)));
const alt = (words: string[]) => [...words].sort((a, b) => b.length - a.length).join('|');
const MONTH_ALT = alt(Object.keys(MONTHS));
const MONTH_EN = 'january|february|march|april|may|june|july|august|september|october|november|december';

// 0 = Sunday, as Date.getDay().
const WEEKDAYS: Record<string, number> = {};
[
  ['sunday', 'domenica', 'domingo', 'dimanche', 'sonntag'],
  ['monday', 'lunedì', 'lunedi', 'lunes', 'lundi', 'montag', 'segunda'],
  ['tuesday', 'martedì', 'martedi', 'martes', 'mardi', 'dienstag', 'terça', 'terca'],
  ['wednesday', 'mercoledì', 'mercoledi', 'miércoles', 'miercoles', 'mercredi', 'mittwoch', 'quarta'],
  ['thursday', 'giovedì', 'giovedi', 'jueves', 'jeudi', 'donnerstag', 'quinta'],
  ['friday', 'venerdì', 'venerdi', 'viernes', 'vendredi', 'freitag', 'sexta'],
  ['saturday', 'sabato', 'sábado', 'sabado', 'samedi', 'samstag', 'sonnabend'],
].forEach((names, i) => names.forEach((n) => (WEEKDAYS[n] = i)));

const NUM: Record<string, number> = {};
[
  ['a', 'an', 'one', 'un', 'una', 'uno', 'une', 'ein', 'eine', 'einem', 'einer', 'eins', 'um', 'uma'],
  ['two', 'due', 'dos', 'deux', 'zwei', 'dois', 'duas'],
  ['three', 'tre', 'tres', 'trois', 'drei', 'três'],
  ['four', 'quattro', 'cuatro', 'quatre', 'vier', 'quatro'],
  ['five', 'cinque', 'cinco', 'cinq', 'fünf', 'fuenf'],
  ['six', 'sei', 'seis', 'sechs'],
  ['seven', 'sette', 'siete', 'sept', 'sieben', 'sete'],
  ['eight', 'otto', 'ocho', 'huit', 'acht', 'oito'],
  ['nine', 'nove', 'nueve', 'neuf', 'neun'],
  ['ten', 'dieci', 'diez', 'dix', 'zehn', 'dez'],
  ['eleven', 'undici', 'once', 'onze', 'elf'],
  ['twelve', 'dodici', 'doce', 'douze', 'zwölf', 'zwoelf', 'doze'],
].forEach((names, i) => names.forEach((n) => (NUM[n] = i + 1)));

const num = (s: string | undefined): number => {
  const t = lower(s);
  return /^\d+$/.test(t) ? parseInt(t, 10) : (NUM[t] ?? NaN);
};
const isWordNumber = (s: string | undefined) => !/^\d+$/.test(lower(s));

const H = {
  en: '\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve',
  it: '\\d{1,2}|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici',
  es: '\\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce',
  fr: '\\d{1,2}|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze',
  de: '\\d{1,2}|eins|ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf',
  pt: '\\d{1,2}|uma|duas|três|quatro|cinco|seis|sete|oito|nove|dez|onze|doze',
};
const SMALL = {
  en: '\\d{1,3}|a|an|one|two|three|four|five|six|seven|eight|nine|ten',
  it: '\\d{1,3}|un|una|uno|due|tre|quattro|cinque|sei|sette|otto|nove|dieci',
  es: '\\d{1,3}|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez',
  fr: '\\d{1,3}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix',
  de: '\\d{1,3}|einem|einer|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn',
  pt: '\\d{1,3}|um|uma|dois|duas|três|quatro|cinco|seis|sete|oito|nove|dez',
};

/** Part-of-day words, wherever they appear inside a matched phrase. */
const PART_WORDS: [RegExp, Part][] = [
  [/mattin|stamani|morning|mañana|matin|vormittag|morgens|früh|manhã|madrugada/i, 'morning'],
  [/pomeriggio|afternoon|tarde|après-midi|apres-midi|aprem|nachmittag/i, 'afternoon'],
  [/sera|evening|tonight|soir|abend/i, 'evening'],
  [/notte|night|noche|nuit|nacht|noite/i, 'night'],
];
function partOf(s: string | undefined): Part | undefined {
  if (!s) return undefined;
  for (const [re, part] of PART_WORDS) if (re.test(s)) return part;
  return undefined;
}

/** A number after "at" that is a quantity, not an hour ("at 5 euros"). */
const NOT_AN_HOUR =
  '(?!\\s*(?:%|€|\\$|£|°|[.,]\\d|(?:euro|euros|dollar|dollars|dollari|dólares|pound|pounds|percent|per cento|' +
  'por ciento|pour cent|prozent|por cento|people|persone|personas|personnes|leute|pessoas|years|anni|años|ans|' +
  'jahre|anos|times|volte|veces|fois|mal|vezes|km|kg|kilos?|chili|metri|meters|metros|mètres|grad|gradi|' +
  'degrees|grados|degrés|graus|minutes?|minuti|minutos|minuten|seconds?|secondi|point|points|punti|' +
  `ragazz[ei]|bambin[ei]|giorni|days|días|jours|tage|dias)${RIGHT}))`;

// ---------------------------------------------------------------- dates

function collectDates(text: string, ref: Date): DateHit[] {
  const hits: DateHit[] = [];
  const add = (m: RegExpExecArray, ymd: { year: number; month: number; day: number } | null, extra?: Partial<DateHit>) => {
    if (!ymd) return;
    hits.push({ start: m.index, end: m.index + m[0].length, ...ymd, ...extra });
  };
  const absolute = (month: number, day: number, year?: number) => {
    const y = resolveYear(ref, month, day, year);
    return y === null ? null : { year: y, month, day };
  };
  const offset = (n: number, part?: Part, needsTime?: boolean) => (m: RegExpExecArray) =>
    add(m, addDays(ref, n), { part: part ?? partOf(m[0]), needsTime });

  // "15 luglio", "15th of July 2027", "12 de septiembre", "3. Oktober", "1er mars"
  scan(
    text,
    rx(
      `(\\d{1,2}|primo|premier|primero|primeiro|first|1er|erster|ersten)(?:º|°|\\.|st|nd|rd|th)?\\s+(?:of\\s+|de\\s+|di\\s+|du\\s+)?(${MONTH_ALT})${RIGHT}(?:\\s+(?:de\\s+|del\\s+)?(\\d{4})${RIGHT})?`
    ),
    (m) => {
      const day = /^\d/.test(m[1]) ? parseInt(m[1], 10) : 1;
      add(m, absolute(MONTHS[lower(m[2])], day, m[3] ? parseInt(m[3], 10) : undefined));
    }
  );
  // "July 15", "July 15th, 2027" (English order only)
  scan(text, rx(`(${MONTH_EN})\\s+(\\d{1,2})(?:st|nd|rd|th)?${RIGHT}(?:,?\\s+(\\d{4})${RIGHT})?`), (m) =>
    add(m, absolute(MONTHS[lower(m[1])], parseInt(m[2], 10), m[3] ? parseInt(m[3], 10) : undefined))
  );
  // 15/07, 15/07/2026. Day first unless only month-first fits ("11/20").
  scan(text, rx(`(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?${RIGHT}`), (m) => {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    const year = m[3] ? parseInt(m[3], 10) : undefined;
    // "3/4 di tazza" is a fraction, not the third of April.
    if (year === undefined && /^(?:1\/2|1\/3|2\/3|1\/4|3\/4)$/.test(`${a}/${b}`)) return;
    const [day, month] = b > 12 && a <= 12 ? [b, a] : [a, b];
    add(m, absolute(month, day, year));
  });
  // 15.07.2026 / 15-07-2026: dots and dashes only count with a year.
  scan(text, rx(`(\\d{1,2})[.-](\\d{1,2})[.-](\\d{4}|\\d{2})${RIGHT}`), (m) =>
    add(m, absolute(parseInt(m[2], 10), parseInt(m[1], 10), parseInt(m[3], 10)))
  );

  // Relative days. Longest phrases first inside each alternation.
  const IT_PART = '(?:\\s+(?:mattina|pomeriggio|sera|notte))?';
  scan(text, rx(`(?:dopodomani|dopo\\s+domani)${IT_PART}${RIGHT}`), offset(2));
  scan(text, rx(`domani${IT_PART}${RIGHT}`), offset(1));
  scan(text, rx(`oggi${IT_PART}${RIGHT}`), offset(0, undefined, true));
  scan(text, rx(`(?:stasera|stamattina|stamani|stanotte)${RIGHT}`), offset(0, undefined, true));

  const EN_PART = '(?:\\s+(?:morning|afternoon|evening|night))?';
  scan(text, rx(`(?:the\\s+)?day\\s+after\\s+tomorrow${EN_PART}${RIGHT}`), offset(2));
  scan(text, rx(`tomorrow${EN_PART}${RIGHT}`), offset(1));
  scan(text, rx(`(?:today|tonight|this\\s+(?:morning|afternoon|evening))${RIGHT}`), offset(0, undefined, true));

  const ES_PART = '(?:\\s+(?:por|en|a)\\s+la\\s+(?:mañana|tarde|noche))?';
  scan(text, rx(`pasado\\s+mañana${ES_PART}${RIGHT}`), offset(2));
  scan(text, rx(`mañana${ES_PART}${RIGHT}`), (m) => {
    // "por la mañana", "esta mañana": the morning, not tomorrow.
    const before = text.slice(Math.max(0, m.index - 12), m.index).toLowerCase();
    if (/(?:\bla|\besta|\buna|\bcada|\bpasado)\s+$/.test(before)) return;
    const tail = m[0].slice('mañana'.length);
    add(m, addDays(ref, 1), { part: partOf(tail) });
  });
  scan(text, rx(`(?:hoy${ES_PART}|esta\\s+(?:noche|tarde|mañana))${RIGHT}`), offset(0, undefined, true));

  const FR_PART = `(?:\\s+(?:matin|soir|après-midi|apres-midi|midi))?`;
  scan(text, rx(`(?:après|apres)[-\\s]demain${FR_PART}${RIGHT}`), offset(2));
  scan(text, rx(`demain${FR_PART}${RIGHT}`), (m) => {
    const before = text.slice(Math.max(0, m.index - 7), m.index).toLowerCase();
    if (/(?:après|apres)[-\s]$/.test(before)) return;
    add(m, addDays(ref, 1), { part: partOf(m[0]) });
  });
  scan(
    text,
    rx(`(?:aujourd${APOS}hui|ce\\s+soir|ce\\s+matin|cet\\s+(?:après-midi|apres-midi|aprem))${RIGHT}`),
    offset(0, undefined, true)
  );

  const DE_PART = '(?:\\s+(?:früh|vormittag|nachmittag|abend|nacht|mittag))?';
  scan(text, rx(`(?:übermorgen|uebermorgen)${DE_PART}${RIGHT}`), offset(2));
  scan(text, rx(`morgen${DE_PART}${RIGHT}`), (m) => {
    // "am Morgen", "guten Morgen", "heute Morgen": the morning, not tomorrow.
    const before = text.slice(Math.max(0, m.index - 10), m.index).toLowerCase();
    if (/(?:\bam|guten|heute|jeden|\bder|\bden|\bdem|diesen|einen|gestern)\s+$/.test(before)) return;
    add(m, addDays(ref, 1), { part: partOf(m[0].slice('morgen'.length)) });
  });
  scan(text, rx(`heute(?:\\s+(?:morgen|früh|vormittag|nachmittag|abend|nacht|mittag))?${RIGHT}`), (m) => {
    const tail = lower(m[0].slice('heute'.length));
    add(m, addDays(ref, 0), { part: /morgen/.test(tail) ? 'morning' : partOf(tail), needsTime: true });
  });

  const PT_PART = '(?:\\s+(?:de\\s+manhã|de\\s+tarde|à\\s+tarde|à\\s+noite|de\\s+noite))?';
  scan(text, rx(`depois\\s+de\\s+amanhã${PT_PART}${RIGHT}`), offset(2));
  scan(text, rx(`amanhã${PT_PART}${RIGHT}`), (m) => {
    const before = text.slice(Math.max(0, m.index - 10), m.index).toLowerCase();
    if (/depois\s+de\s+$/.test(before)) return;
    add(m, addDays(ref, 1), { part: partOf(m[0].slice('amanhã'.length)) });
  });
  scan(text, rx(`(?:hoje${PT_PART}|esta\\s+(?:noite|tarde|manhã))${RIGHT}`), offset(0, undefined, true));

  // "tra due settimane", "in 3 days", "dentro de un mes", "daqui a duas semanas"
  const relative = (pattern: string) =>
    scan(text, rx(pattern), (m) => {
      const n = num(m[1]);
      if (!(n >= 1 && n <= 366)) return;
      const unit = lower(m[2]);
      if (/^(?:mes|mês|mois|month|monat)/.test(unit)) add(m, addMonths(ref, n));
      else add(m, addDays(ref, /^(?:sett|week|sem|woche)/.test(unit) ? n * 7 : n));
    });
  relative(`(?:tra|fra)\\s+(${SMALL.it})\\s+(giorn[oi]|settiman[ae]|mes[ei])${RIGHT}`);
  relative(`in\\s+(${SMALL.en})\\s+(days?|weeks?|months?)${RIGHT}`);
  relative(`(?:dentro\\s+de|en)\\s+(${SMALL.es})\\s+(días?|dias?|semanas?|mes(?:es)?)${RIGHT}`);
  relative(`dans\\s+(${SMALL.fr})\\s+(jours?|semaines?|mois)${RIGHT}`);
  relative(`in\\s+(${SMALL.de})\\s+(tag(?:en)?|wochen?|monat(?:en)?)${RIGHT}`);
  relative(`(?:daqui\\s+a|dentro\\s+de|em)\\s+(${SMALL.pt})\\s+(dias?|semanas?|m[eê]s(?:es)?)${RIGHT}`);

  // Weekdays: the next one after the recording day. "scorso", "last" are the past.
  const weekday = (m: RegExpExecArray, name: string) => {
    if (/scors|last|pasad|dernier|letzt|passad/i.test(m[0])) return;
    const target = WEEKDAYS[lower(name)];
    if (target === undefined) return;
    const ahead = (target - ref.getDay() + 7) % 7 || 7;
    add(m, addDays(ref, ahead), { part: partOf(m[0].slice(m[0].toLowerCase().indexOf(lower(name)) + name.length)) });
  };
  scan(
    text,
    rx(
      `(?:(?:questo|questa|prossimo|prossima)\\s+)?(lunedì|lunedi|martedì|martedi|mercoledì|mercoledi|giovedì|giovedi|venerdì|venerdi|sabato|domenica)${RIGHT}(?:\\s+(?:prossimo|prossima|scorso|scorsa)${RIGHT})?${IT_PART}`
    ),
    (m) => weekday(m, m[1])
  );
  scan(
    text,
    rx(`(?:(?:next|this|last|on)\\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)${RIGHT}${EN_PART}`),
    (m) => weekday(m, m[1])
  );
  scan(
    text,
    rx(
      `(?:(?:el|este|próximo|proximo)\\s+)*(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)${RIGHT}(?:\\s+(?:que\\s+viene|próximo|proximo|pasado)${RIGHT})?(?:\\s+por\\s+la\\s+(?:mañana|tarde|noche)${RIGHT})?`
    ),
    (m) => weekday(m, m[1])
  );
  scan(
    text,
    rx(`(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)${RIGHT}(?:\\s+(?:prochain|dernier)${RIGHT})?${FR_PART}`),
    (m) => weekday(m, m[1])
  );
  scan(
    text,
    rx(
      `(?:(?:nächsten|nächste|naechsten|kommenden|diesen|letzten|am)\\s+)?(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonnabend|sonntag)(?:vormittag|nachmittag|abend|morgen)?${RIGHT}${DE_PART}`
    ),
    (m) => weekday(m, m[1])
  );
  // Portuguese weekdays are also ordinals ("a segunda vez"), so the bare word
  // needs "-feira", a preposition, or an hour or part of day right after it.
  const PT_DAY = 'segunda|terça|terca|quarta|quinta|sexta';
  const PT_TAIL = `(?:\\s+(?:que\\s+vem|passada)${RIGHT})?${PT_PART}`;
  scan(text, rx(`(?:(?:na|no|próxima|proxima)\\s+)*(${PT_DAY})-feira${RIGHT}${PT_TAIL}`), (m) => weekday(m, m[1]));
  scan(
    text,
    rx(`(?:(?:na|nesta|próxima|proxima)\\s+)+(${PT_DAY})${RIGHT}(?!\\s+(?:vez|parte|fase)${RIGHT})${PT_TAIL}`),
    (m) => weekday(m, m[1])
  );
  scan(text, rx(`(${PT_DAY})(?=\\s+(?:de\\s+manhã|à\\s+tarde|à\\s+noite|às\\s+\\d))${PT_TAIL}`), (m) => weekday(m, m[1]));

  return hits;
}

// ---------------------------------------------------------------- times

function collectTimes(text: string): TimeHit[] {
  const hits: TimeHit[] = [];
  const add = (m: RegExpExecArray, hour: number, minute: number, extra?: Partial<TimeHit>) => {
    if (!(hour >= 0 && hour <= 24 && minute >= 0 && minute < 60)) return;
    if (hour === 24 && minute > 0) return;
    hits.push({ start: m.index, end: m.index + m[0].length, hour: hour % 24, minute, ...extra });
  };
  const markerOf = (s: string | undefined): Marker | undefined => {
    const t = lower(s).replace(/[.\s]/g, '');
    return t === 'am' ? 'am' : t === 'pm' ? 'pm' : undefined;
  };
  /** "08", "0", 13 to 24: the speaker already used the 24-hour clock. */
  const explicit = (raw: string | undefined, hour: number): Marker | undefined =>
    hour >= 13 || hour === 0 || /^0\d$/.test(raw ?? '') ? '24' : undefined;

  const AMPM = '(?:am|pm|a\\.m\\.|p\\.m\\.)';

  // 16:30, 4:30 pm
  scan(text, rx(`(\\d{1,2}):(\\d{2})(?:\\s*(${AMPM}))?${RIGHT}`), (m) => {
    const h = parseInt(m[1], 10);
    add(m, h, parseInt(m[2], 10), { marker: markerOf(m[3]) ?? explicit(m[1], h) });
  });
  // 5pm, 5 p.m.
  scan(text, rx(`(\\d{1,2})\\s*(${AMPM})(?![${WORD}])`), (m) => add(m, parseInt(m[1], 10), 0, { marker: markerOf(m[2]) }));

  // Italian: "alle 4 e un quarto del pomeriggio", "all'una", "ore 16.30"
  const IT_FRACTION = `(?:\\s+e\\s+(mezza|mezzo|un\\s+quarto|tre\\s+quarti|\\d{1,2})|\\s+meno\\s+(un\\s+quarto|\\d{1,2}))?`;
  const IT_DAYPART = `(?:\\s+(?:del\\s+mattino|di\\s+mattina|della\\s+mattina|del\\s+pomeriggio|di\\s+pomeriggio|di\\s+sera|della\\s+sera|di\\s+notte|della\\s+notte))?`;
  scan(
    text,
    rx(`(?:alle|all${APOS}|verso\\s+le|per\\s+le|ore)\\s*(${H.it})${RIGHT}(?:[:.](\\d{2})${RIGHT})?${IT_FRACTION}${IT_DAYPART}${NOT_AN_HOUR}`),
    (m) => {
      let h = num(m[1]);
      let min = m[2] ? parseInt(m[2], 10) : 0;
      const plus = lower(m[3]);
      const minus = lower(m[4]);
      if (plus) min = /mezz/.test(plus) ? 30 : /tre/.test(plus) ? 45 : /quarto/.test(plus) ? 15 : parseInt(plus, 10);
      if (minus) {
        min = 60 - (/quarto/.test(minus) ? 15 : parseInt(minus, 10));
        h -= 1;
      }
      const part = partOf(m[0].slice(m[0].search(/\s(?:del|di|della)\s/i) + 1));
      const bare = !m[2] && !plus && !minus && !part;
      add(m, h, min, { marker: explicit(m[1], h), part, weak: bare && isWordNumber(m[1]) });
    }
  );
  scan(text, rx(`a\\s+mezzogiorno${RIGHT}`), (m) => add(m, 12, 0, { marker: '24' }));

  // English: "at 5", "at 5:30 pm", "at eight", "half past four", "quarter to five"
  const EN_DAYPART = '(?:\\s+(?:in\\s+the\\s+morning|in\\s+the\\s+afternoon|in\\s+the\\s+evening|at\\s+night))?';
  scan(
    text,
    rx(`at\\s+(${H.en})${RIGHT}(?::(\\d{2})${RIGHT})?(?:\\s*(${AMPM}|o${APOS}clock)${RIGHT})?${EN_DAYPART}${NOT_AN_HOUR}`),
    (m) => {
      const h = num(m[1]);
      const tail = m[0].replace(/^at\s+\S+/i, '');
      const part = partOf(tail.replace(/tonight/i, ''));
      const marker = markerOf(m[3]);
      const bare = !m[2] && !m[3] && !part;
      add(m, h, m[2] ? parseInt(m[2], 10) : 0, { marker: marker ?? explicit(m[1], h), part, weak: bare && isWordNumber(m[1]) });
    }
  );
  scan(text, rx(`(?:at\\s+)?(half|(?:a\\s+)?quarter)\\s+(past|to)\\s+(${H.en})${RIGHT}`), (m) => {
    const h = num(m[3]);
    const step = /half/i.test(m[1]) ? 30 : 15;
    if (/to/i.test(m[2])) add(m, h - 1, 60 - step);
    else add(m, h, step);
  });
  scan(text, rx(`at\\s+(?:noon|midday)${RIGHT}`), (m) => add(m, 12, 0, { marker: '24' }));

  // Spanish: "a las 5 de la tarde", "a la una y media"
  const ES_FRACTION = `(?:\\s+y\\s+(media|cuarto|\\d{1,2})|\\s+menos\\s+(cuarto|\\d{1,2}))?`;
  const ES_DAYPART = `(?:\\s+de\\s+la\\s+(?:mañana|tarde|noche|madrugada))?`;
  scan(
    text,
    rx(`(?:a|sobre|hacia)\\s+las?\\s+(${H.es})${RIGHT}(?:[:.](\\d{2})${RIGHT})?${ES_FRACTION}${ES_DAYPART}${NOT_AN_HOUR}`),
    (m) => {
      let h = num(m[1]);
      let min = m[2] ? parseInt(m[2], 10) : 0;
      const plus = lower(m[3]);
      const minus = lower(m[4]);
      if (plus) min = plus === 'media' ? 30 : plus === 'cuarto' ? 15 : parseInt(plus, 10);
      if (minus) {
        min = 60 - (minus === 'cuarto' ? 15 : parseInt(minus, 10));
        h -= 1;
      }
      const dp = /de\s+la\s+(mañana|tarde|noche|madrugada)\s*$/i.exec(m[0]);
      const part = dp ? partOf(dp[1]) : undefined;
      add(m, h, min, { marker: explicit(m[1], h), part });
    }
  );
  scan(text, rx(`al?\\s+mediodía${RIGHT}`), (m) => add(m, 12, 0, { marker: '24' }));

  // French: "à 17h", "17h30", "à 5 heures et demie", "à midi"
  const FR_FRACTION = `(?:\\s+et\\s+(demie?|quart)|\\s+moins\\s+le\\s+(quart))?`;
  const FR_DAYPART = `(?:\\s+(?:du\\s+matin|de\\s+l${APOS}après-midi|du\\s+soir))?`;
  scan(
    text,
    rx(`(?:(à|a|vers)\\s+)?(${H.fr})\\s?(?:h|heures?)(?:\\s?(\\d{2}))?${RIGHT}${FR_FRACTION}${FR_DAYPART}`),
    (m) => {
      let h = num(m[2]);
      let min = m[3] ? parseInt(m[3], 10) : 0;
      if (m[4]) min = /quart/i.test(m[4]) ? 15 : 30;
      if (m[5]) {
        min = 45;
        h -= 1;
      }
      const dp = /(du\s+matin|après-midi|du\s+soir)\s*$/i.exec(m[0]);
      // "ça a duré 2h" is a length, so without "à" it needs a date beside it.
      add(m, h, min, { marker: explicit(m[2], h), part: dp ? partOf(dp[1]) : undefined, weak: !m[1] });
    }
  );
  scan(text, rx(`à\\s+midi${RIGHT}`), (m) => add(m, 12, 0, { marker: '24' }));

  // German: "um 17 Uhr", "um 9", "17:30 Uhr", "halb fünf", "Viertel nach fünf"
  const DE_DAYPART = '(?:\\s+(?:morgens|früh|vormittags|nachmittags|abends|nachts))?';
  scan(
    text,
    rx(`(?:(um|gegen|ab)\\s+)?(${H.de})${RIGHT}(?:[:.](\\d{2})${RIGHT})?(?:\\s*(uhr)${RIGHT}(?:\\s*(\\d{2})${RIGHT})?)?${DE_DAYPART}${NOT_AN_HOUR}`),
    (m) => {
      if (!m[1] && !m[4]) return; // a bare number is not a time
      const h = num(m[2]);
      const min = m[3] ? parseInt(m[3], 10) : m[5] ? parseInt(m[5], 10) : 0;
      const dp = /(morgens|früh|vormittags|nachmittags|abends|nachts)\s*$/i.exec(m[0]);
      const part = dp ? partOf(dp[1].replace(/s$/, '')) : undefined;
      const bare = !m[3] && !m[4] && !part;
      add(m, h, min, { marker: explicit(m[2], h), part, weak: bare && isWordNumber(m[2]) });
    }
  );
  scan(text, rx(`(?:um\\s+)?halb\\s+(${H.de})${RIGHT}`), (m) => add(m, num(m[1]) - 1, 30));
  scan(text, rx(`(?:um\\s+)?viertel\\s+(nach|vor)\\s+(${H.de})${RIGHT}`), (m) => {
    const h = num(m[2]);
    if (/vor/i.test(m[1])) add(m, h - 1, 45);
    else add(m, h, 15);
  });

  // Portuguese: "às 17h", "às 5 da tarde", "às 5 e meia", "ao meio-dia"
  const PT_FRACTION = `(?:\\s+e\\s+(meia|um\\s+quarto|\\d{1,2}))?`;
  const PT_DAYPART = `(?:\\s+da\\s+(?:manhã|tarde|noite|madrugada))?`;
  scan(
    text,
    rx(`(às|as|pelas|para\\s+as)\\s+(${H.pt})${RIGHT}(?:[:.h]\\s?(\\d{2})${RIGHT}|\\s?(h)${RIGHT})?${PT_FRACTION}${PT_DAYPART}${NOT_AN_HOUR}`),
    (m) => {
      const h = num(m[2]);
      let min = m[3] ? parseInt(m[3], 10) : 0;
      const plus = lower(m[5]);
      if (plus) min = plus === 'meia' ? 30 : /quarto/.test(plus) ? 15 : parseInt(plus, 10);
      const dp = /da\s+(manhã|tarde|noite|madrugada)\s*$/i.exec(m[0]);
      // Unaccented "as" is also an English word ("as 5 people"), so it needs a date beside it.
      add(m, h, min, { marker: explicit(m[2], h), part: dp ? partOf(dp[1]) : undefined, weak: lower(m[1]) === 'as' });
    }
  );
  scan(text, rx(`ao\\s+meio-dia${RIGHT}`), (m) => add(m, 12, 0, { marker: '24' }));

  return hits;
}

/** Turn the spoken hour into a 24-hour one. */
function resolveHour(t: TimeHit, datePart: Part | undefined): number {
  const h = t.hour;
  if (t.marker === '24') return h;
  if (t.marker === 'pm') return h < 12 ? h + 12 : h;
  if (t.marker === 'am') return h === 12 ? 0 : h;
  const part = t.part ?? datePart;
  if (part === 'morning') return h;
  if (part === 'afternoon' || part === 'evening') return h < 12 ? h + 12 : h;
  if (part === 'night') return h >= 6 && h < 12 ? h + 12 : h;
  return h >= 1 && h <= 6 ? h + 12 : h;
}

// ---------------------------------------------------------------- assembly

/** Widest match wins an overlap, so "alle 4 e un quarto" beats a bare "4". */
function dropOverlaps<T extends { start: number; end: number }>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: T[] = [];
  for (const s of sorted) {
    if (kept.some((k) => s.start < k.end && k.start < s.end)) continue;
    kept.push(s);
  }
  return kept.sort((a, b) => a.start - b.start);
}

/**
 * Every date and time in `text`, resolved against `ref` (when it was recorded).
 * An hour is attached to the date it belongs to in the same sentence, and both
 * spans then carry the same combined value.
 */
export function findDateSpans(text: string, ref: Date = new Date()): DateSpan[] {
  if (!text) return [];
  const tagged = dropOverlaps<(DateHit & { t: 'd' }) | (TimeHit & { t: 't' })>([
    ...collectDates(text, ref).map((d) => ({ ...d, t: 'd' as const })),
    ...collectTimes(text).map((h) => ({ ...h, t: 't' as const })),
  ]);
  const dates = tagged.filter((x): x is DateHit & { t: 'd' } => x.t === 'd');
  const times = tagged.filter((x): x is TimeHit & { t: 't' } => x.t === 't');

  // Sentence number of each position. A full stop inside a match ("3. Oktober",
  // "p.m.") is not the end of a sentence.
  const inside = (i: number) => tagged.some((s) => i >= s.start && i < s.end);
  const breaks: number[] = [];
  for (let i = 0; i < text.length; i++) if ('.!?;\n'.includes(text[i]) && !inside(i)) breaks.push(i);
  const sentence = (pos: number) => {
    let n = 0;
    while (n < breaks.length && breaks[n] < pos) n++;
    return n;
  };

  const out: DateSpan[] = [];
  const timeOfDate = new Map<DateHit, { hour: number; minute: number }>();
  for (const t of times) {
    const s = sentence(t.start);
    const same = dates.filter((d) => sentence(d.start) === s);
    const before = same.filter((d) => d.end <= t.start).pop();
    const after = same.find((d) => d.start >= t.end && d.start - t.end <= 12);
    const d = before ?? after;
    if (!d && t.weak) continue;

    const hour = resolveHour(t, d?.part);
    if (d) {
      if (!timeOfDate.has(d)) timeOfDate.set(d, { hour, minute: t.minute });
      out.push({
        start: t.start,
        end: t.end,
        kind: 'time',
        when: { year: d.year, month: d.month, day: d.day, hour, minute: t.minute, dateSaid: true },
      });
      continue;
    }
    // An hour on its own: the recording day, or the next one if already past.
    const passed = hour < ref.getHours() || (hour === ref.getHours() && t.minute <= ref.getMinutes());
    out.push({
      start: t.start,
      end: t.end,
      kind: 'time',
      when: { ...addDays(ref, passed ? 1 : 0), hour, minute: t.minute, dateSaid: false },
    });
  }
  for (const d of dates) {
    const time = timeOfDate.get(d);
    if (!time && d.needsTime) continue;
    out.push({
      start: d.start,
      end: d.end,
      kind: 'date',
      when: { year: d.year, month: d.month, day: d.day, ...(time ?? {}), dateSaid: true },
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The first date or time in a short quote, for callers that hold only the quote. */
export function resolveQuote(quote: string, ref: Date = new Date()): When | undefined {
  return findDateSpans(quote, ref)[0]?.when;
}

// =====================================================================
// What a tap does
// =====================================================================

export interface ButlerIntent {
  action: string;
  data?: string;
  extra: Record<string, string | number | boolean>;
}

/** An hour with no day said goes to the clock; everything else to the calendar. */
export function isAlarm(entity: ActionableEntity): boolean {
  return entity.type === 'time' && !entity.when?.dateSaid;
}

/**
 * The Android intent for a tapped highlight, with the date and hour filled in.
 *
 * Extra names are the values of CalendarContract.EXTRA_EVENT_BEGIN_TIME,
 * EXTRA_EVENT_END_TIME, EXTRA_EVENT_ALL_DAY and AlarmClock.EXTRA_HOUR,
 * EXTRA_MINUTES, EXTRA_MESSAGE, EXTRA_SKIP_UI, read out of the SDK's android.jar.
 * expo-intent-launcher sends a number above the int range as a long, which is
 * what beginTime has to be.
 *
 * An all-day event starts at midnight UTC, as CalendarContract.Events asks; a
 * timed one is in the phone's own zone and lasts an hour (that length is a
 * default of ours, the calendar screen lets it be changed).
 */
export function intentFor(entity: ActionableEntity, title: string): ButlerIntent {
  const w = entity.when;
  if (isAlarm(entity)) {
    const extra: ButlerIntent['extra'] = {
      'android.intent.extra.alarm.MESSAGE': title,
      'android.intent.extra.alarm.SKIP_UI': false,
    };
    if (w && w.hour !== undefined) {
      extra['android.intent.extra.alarm.HOUR'] = w.hour;
      extra['android.intent.extra.alarm.MINUTES'] = w.minute ?? 0;
    }
    return { action: 'android.intent.action.SET_ALARM', extra };
  }

  const extra: ButlerIntent['extra'] = { title, description: `"${entity.quote}"` };
  if (w && w.hour !== undefined) {
    const begin = new Date(w.year, w.month - 1, w.day, w.hour, w.minute ?? 0).getTime();
    extra.beginTime = begin;
    extra.endTime = begin + 60 * 60 * 1000;
  } else if (w) {
    const begin = Date.UTC(w.year, w.month - 1, w.day);
    extra.beginTime = begin;
    extra.endTime = begin + 24 * 60 * 60 * 1000;
    extra.allDay = true;
  }
  return { action: 'android.intent.action.INSERT', data: 'content://com.android.calendar/events', extra };
}
