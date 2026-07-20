/**
 * Date/time detection for transcript highlighting - PURE, no model, no native
 * modules, so it's unit-testable in plain Node.
 *
 * Extracted from LLMEngine so the logic that decides what gets highlighted (and
 * caused the "highlights words that make no sense" bug) has a test net. The
 * engine calls sanitiseEntities/mergeEntities; the screens call findHighlights.
 */

export interface ActionableEntity {
  quote: string;
  name: string;
  type: 'date' | 'time';
}

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
    if (out.length >= 5) break; // don't litter a transcript with highlights
  }
  return out;
}

/**
 * Month names in the languages the app speaks, so "15 luglio" is found without
 * asking the model anything.
 */
const MONTH_ALT = [
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
  'november', 'december',
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre',
  'ottobre', 'novembre', 'dicembre',
  'enero', 'febrero', 'abril', 'mayo', 'junio', 'julio', 'septiembre', 'octubre', 'noviembre',
  'diciembre',
  'janvier', 'février', 'mars', 'avril', 'juin', 'juillet', 'août', 'décembre',
  'januar', 'februar', 'märz', 'juni', 'juli', 'oktober', 'dezember',
  'janeiro', 'fevereiro', 'março', 'setembro', 'outubro', 'novembro', 'dezembro',
].join('|');

/** "e un quarto", "y media", "et demie" - the spoken half/quarter hour. */
const FRACTION =
  "(?:\\s+(?:e\\s+(?:un\\s+quarto|mezza|mezzo|tre\\s+quarti|meia)|y\\s+(?:cuarto|media)|" +
  "et\\s+(?:quart|demie)|meno\\s+un\\s+quarto|menos\\s+cuarto))?";

const DATE_PATTERNS = [
  // "15 luglio", "15th of July", "12 de septiembre", "3. Oktober"
  new RegExp(`\\b\\d{1,2}(?:º|°|\\.|st|nd|rd|th)?\\s+(?:of\\s+|de\\s+|di\\s+|du\\s+)?(?:${MONTH_ALT})\\b(?:\\s+\\d{4})?`, 'gi'),
  // "July 15", "settembre 12"
  new RegExp(`\\b(?:${MONTH_ALT})\\s+\\d{1,2}(?:º|°|st|nd|rd|th)?\\b(?:,?\\s+\\d{4})?`, 'gi'),
  // 15/07, 15/07/2026. Slashes only: "3-4 people" must not become a date.
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g,
  // 15.07.2026 / 15-07-2026 - dots and dashes only count with a year attached.
  /\b\d{1,2}[.-]\d{1,2}[.-]\d{2,4}\b/g,
];

const TIME_PATTERNS = [
  new RegExp(`\\b\\d{1,2}\\s*[:.]\\s*\\d{2}\\b${FRACTION}`, 'gi'),
  /\b\d{1,2}\s*(?:am|pm|a\.m\.|p\.m\.)\b/gi,
  // "alle 4 e un quarto", "at 4", "a las 5", "alle 16:15". The minutes are
  // optional but must be swallowed here, or the wider "alle 16" wins the
  // overlap against "16:15" and the highlight loses the :15.
  new RegExp(`\\b(?:alle|all'|at|um|às|as|a\\s+las)\\s+\\d{1,2}(?:\\s*[:.]\\s*\\d{2})?\\b${FRACTION}`, 'gi'),
];

type Span = { start: number; end: number; type: 'date' | 'time' };

/**
 * Find dates and times by pattern rather than by asking the model.
 *
 * The model is prompted in English, so on an Italian note it tends to answer
 * "15th July" for a transcript that says "15 luglio" - a quote that cannot be
 * highlighted because it isn't in the text. A regex sliced straight out of the
 * transcript is verbatim by construction, in whatever language it was spoken.
 */
function collectSpans(transcript: string): Span[] {
  const spans: Span[] = [];
  const push = (re: RegExp, type: 'date' | 'time') => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(transcript)) !== null) {
      if (!m[0].trim()) {
        re.lastIndex++; // zero-width match, don't spin forever
        continue;
      }
      spans.push({ start: m.index, end: m.index + m[0].length, type });
    }
  };
  DATE_PATTERNS.forEach((re) => push(re, 'date'));
  TIME_PATTERNS.forEach((re) => push(re, 'time'));

  // Widest match wins an overlap, so "alle 4 e un quarto" beats bare "4".
  spans.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: Span[] = [];
  for (const s of spans) {
    if (kept.some((k) => s.start < k.end && k.start < s.end)) continue;
    kept.push(s);
  }
  return kept.sort((a, b) => a.start - b.start);
}

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
 * Pattern matches first (they always highlight), then any model entity the
 * patterns missed - "tomorrow", "next week" and other wordy ones the model is
 * genuinely better at spotting.
 */
export function mergeEntities(modelEntities: ActionableEntity[], transcript: string): ActionableEntity[] {
  const out: ActionableEntity[] = [];
  const overlaps = (a: string, b: string) => a.includes(b) || b.includes(a);

  for (const span of collectSpans(transcript)) {
    const quote = transcript.slice(span.start, span.end).trim();
    if (!quote) continue;
    const lower = quote.toLowerCase();
    // Reuse the model's title when it spotted the same moment - it names things
    // better than the surrounding words do.
    const named = modelEntities.find((e) => overlaps(e.quote.toLowerCase(), lower));
    out.push({ quote, name: named?.name || nameFromContext(transcript, span), type: span.type });
    if (out.length >= 5) return out;
  }

  for (const e of modelEntities) {
    // Belt and braces: sanitiseEntities already dropped these, but a quote that
    // isn't in the text can never highlight, so it must never reach the list.
    if (!transcript.toLowerCase().includes(e.quote.toLowerCase())) continue;
    if (out.some((o) => overlaps(o.quote.toLowerCase(), e.quote.toLowerCase()))) continue;
    out.push(e);
    if (out.length >= 5) break;
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
export function findHighlights(text: string, stored: ActionableEntity[] = []): ActionableEntity[] {
  if (!text) return [];
  return mergeEntities(stored, text);
}
