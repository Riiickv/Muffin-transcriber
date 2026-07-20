import { Platform } from 'react-native';
import type { LlamaContext } from 'llama.rn';
import { loadSettings } from './settingsStore';
import { loadMemories, saveMemories, suggestMemories } from './memoryStore';
// Relative, matching this file - mixing '@/utils/x' and './x' for the same
// module makes Metro load it twice, which is what split the language state.
import { t } from './i18n';
import { languageNameFromCode } from './languages';

// Strips the markdown code fences an LLM may wrap JSON in, then parses. Returns
// null on any failure so callers can fall back gracefully.
export function parseModelJson<T = any>(raw: string): T | null {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

let initLlama: any;
function getInitLlama() {
  if (!initLlama && Platform.OS !== 'web') {
    initLlama = require('llama.rn').initLlama;
  }
  return initLlama;
}

let llamaContext: LlamaContext | null = null;
let currentModelPath = '';
let loadPromise: Promise<void> | null = null;

export async function loadLLM(modelPath: string): Promise<void> {
  if (llamaContext && currentModelPath === modelPath) return;

  // Coalesce concurrent loads. Two init() calls while context is still null
  // orphan the first native context (100s of MB + KV cache) and can OOM the device.
  while (loadPromise) {
    await loadPromise;
    if (llamaContext && currentModelPath === modelPath) return;
  }

  const p = (async () => {
    if (llamaContext) await unloadLLM();
    const init = getInitLlama();
    llamaContext = await init({
      n_ctx: 4096,
      model: modelPath,
      // Leave cores free for the system and for Whisper - background
      // formatting must not starve a transcription the user just started.
      // NOTE: do NOT add cache_type_k/v or flash_attn_type here - on
      // Snapdragon flagships llama.rn auto-offloads to the Adreno GPU via
      // OpenCL, whose flash-attention path rejects quantized KV caches and
      // the whole context init hard-fails (verified against llama.rn 0.12.5
      // + ggml-opencl sources).
      n_threads: 4,
    });
    currentModelPath = modelPath;
  })();
  loadPromise = p;

  try {
    await p;
  } catch (error) {
    console.error("Failed to load LLM:", error);
    throw error;
  } finally {
    if (loadPromise === p) loadPromise = null;
  }
}

/**
 * Abort whatever the model is generating, without unloading it.
 *
 * The context stays alive and warm, so the next task starts immediately. The
 * aborted call resolves with whatever it had produced, which callers discard.
 */
export async function stopLlamaWork(): Promise<void> {
  try {
    await llamaContext?.stopCompletion();
  } catch (e) {
    console.warn('Could not stop the model:', e);
  }
}

export async function unloadLLM(): Promise<void> {
  if (llamaContext) {
    try {
      await llamaContext.release();
    } catch (e) {
      console.warn("Error releasing llama context", e);
    }
    llamaContext = null;
    currentModelPath = '';
  }
}

function buildChatPrompt(modelFile: string, systemPrompt: string, userPrompt: string): string {
  const lower = modelFile.toLowerCase();
  if (lower.includes('llama-3')) {
    return `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n${systemPrompt}<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n${userPrompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n`;
  }
  if (lower.includes('phi-3')) {
    return `<|system|>\n${systemPrompt}<|end|>\n<|user|>\n${userPrompt}<|end|>\n<|assistant|>\n`;
  }
  return `<|im_start|>system\n${systemPrompt}<|im_end|>\n<|im_start|>user\n${userPrompt}<|im_end|>\n<|im_start|>assistant\n`;
}

// All enrichment tasks share ONE prompt shape: identical preamble + transcript
// first, task instruction last. llama.rn reuses the KV cache for the longest
// common prompt prefix across completions on the same context, so each source
// text is prefilled once and reused by every task that runs on it (format/
// summarize/memories share the raw transcript; entities/title share the
// formatted one) - the dominant LLM cost. Don't "improve" individual task
// prompts by moving text before the transcript; that breaks the shared prefix.
function buildTaskPrompt(modelFile: string, sourceText: string, task: string): string {
  const systemPrompt = `You are a precise text-processing assistant. You will be given a transcript, then a task about it.

TRANSCRIPT:
${sourceText}

RULES:
1. Work ONLY with the transcript above.
2. Reply ONLY with the final result - no conversational text, no pleasantries, no markdown code fences or formatting tags, and do not wrap the output in quotes.`;
  return buildChatPrompt(modelFile, systemPrompt, task);
}

/**
 * Belt-and-suspenders against a small model looping. Even with a repetition
 * penalty a tiny model can get stuck repeating a line ("- I have eaten breakfast
 * for lunch." x200). This drops a line once it has repeated a few times in a row,
 * and if the SAME line dominates the whole output it cuts there entirely, so a
 * runaway never reaches the user as a wall of the same sentence.
 */
function capRunawayRepetition(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let prevNorm = '';
  let run = 0;
  for (const line of lines) {
    const norm = line.trim().toLowerCase();
    if (norm && norm === prevNorm) {
      run++;
      if (run >= 2) continue; // keep at most 2 identical lines in a row
    } else {
      run = 0;
      prevNorm = norm;
    }
    out.push(line);
  }
  return out.join('\n').trim();
}

/**
 * Appended to every format/summary task, custom prompts included.
 *
 * A custom prompt REPLACES the task, so without this a user's "summarize for
 * my boss" quietly drops every guardrail and the model reverts to sounding
 * like a chat assistant: advice, opinions, "please follow these steps".
 * Bullets are allowed because they read fine as plain text; headings and bold
 * are not, because nothing in the app renders markdown and they arrive on
 * screen as literal # and * characters.
 */
/**
 * Phrased as instructions to FOLLOW, not things to avoid, per Anthropic's
 * formatting guidance ("Tell Claude what to do instead of what not to do",
 * whose own example is 'Instead of: "Do not use markdown in your response"').
 * The first version here was four "no"/"never" clauses and got exactly the
 * markdown it forbade.
 *
 * Written as prose with no bullet characters for the same reason the docs give:
 * "removing markdown from your prompt can reduce the volume of markdown in the
 * output". A bulleted rule list is a worked example of the format we don't want.
 *
 * Split in two on purpose. Evaluation-driven work on Llama 3 8B and Qwen 2.5 7B
 * (arXiv 2601.22025) measured generic rule wrappers DROPPING task accuracy ~10%
 * and grounding ~13%, the cause being "generic rules conflicting with
 * task-specific constraints". A custom prompt is a task-specific constraint, so
 * it gets the grounding rule only - telling someone who asked for bullets to
 * write plain sentences is precisely the conflict that measurement describes.
 */
const GROUNDING_RULE =
  'Every statement must come from the transcript. Begin with the first word of the result itself.';
const PLAIN_TEXT_RULE = 'Write plain sentences with ordinary punctuation.';

/**
 * Last line of defence for the rules above: a small model will still emit a
 * "## Heading" now and then, and the transcript box draws plain text, so the
 * markup would be shown to the user exactly as typed.
 */
function stripMarkdownArtifacts(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s*/, '') // "## Main Ideas" -> "Main Ideas"
        .replace(/^(\s*)\*\s+/, '$1- ') // "* item" -> "- item"
        .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
        .replace(/__([^_]+)__/g, '$1')
        .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1$2') // italics
        .replace(/`{1,3}([^`]*)`{1,3}/g, '$1') // code ticks
        .trimEnd()
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Guarantee the basics of formatting, whatever the model did.
 *
 * The default Format prompt asks for punctuation and capitalization, and on a
 * real Italian note the model handed the text back essentially unchanged: no
 * leading capital, no final stop, one word quietly swapped. So the minimum is
 * DONE here rather than hoped for. Deterministic, language-agnostic, and it
 * cannot invent or alter words - it only touches case and a trailing mark.
 */
export function ensureBasicPunctuation(text: string): string {
  let out = text.trim();
  if (!out) return out;

  // First letter of the text, and of anything following a sentence end.
  out = out.replace(/(^|[.!?]\s+|\n\s*)(\p{Ll})/gu, (_m, lead: string, ch: string) => lead + ch.toUpperCase());

  if (!/[.!?:;)\]"'’”]$/.test(out)) out += '.';
  return out;
}

/**
 * Strip a label the model prefixed to its answer ("Summary note:", "Riassunto:").
 * The rules ask it to begin with the result itself; small models add one anyway.
 */
export function stripLeadingLabel(text: string): string {
  const lines = text.split('\n');
  const first = lines[0]?.trim() ?? '';
  // A short line that is only a heading and a colon.
  if (lines.length > 1 && /^[\p{L} ]{1,24}:$/u.test(first)) {
    return lines.slice(1).join('\n').trim();
  }
  return text;
}

/**
 * True when a "summary" is really the transcript handed back.
 *
 * An Italian custom prompt made the model echo its input verbatim - a failure
 * dressed as success, since the user gets their own words under a Summary tab.
 * Measured by word overlap, not equality, because a near-copy is the same
 * problem.
 */
export function looksLikeCopy(output: string, source: string): boolean {
  const words = (x: string) =>
    x.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  const out = words(output);
  const src = words(source);
  if (out.length < 8 || src.length < 8) return false;
  // A real summary is shorter. Only suspect it when it's near full length.
  if (out.length < src.length * 0.6) return false;
  const srcSet = new Set(src);
  return out.filter((w) => srcSet.has(w)).length / out.length > 0.9;
}

function extractFormatterOutput(output: string): string {
  let text = output;

  // If the model echoed its own chat template, keep only what came AFTER the
  // assistant turn (pop = last segment = the reply).
  for (const prefix of [
    '... (truncated)',
    '<|im_start|>assistant',
    '<|start_header_id|>assistant<|end_header_id|>',
    '<|assistant|>',
  ]) {
    if (text.includes(prefix)) {
      text = text.split(prefix).pop() || text;
      break;
    }
  }

  // Cut a trailing special token and everything after it, but ONLY when there's
  // real content before it (idx > 0). Splitting on a leading token used to empty
  // the string, and an empty result makes the caller fall back to the raw
  // transcript - the "formatting did nothing" bug.
  const trailing = [
    '[ Prompt:', 'Exiting...', '<|im_end|>', '<|end|>', '<|eot_id|>',
    '<|endoftext|>', '<|start_header_id|>', '<|im_start|>', 'ggml_cuda_init:',
  ];
  for (const marker of trailing) {
    const i = text.indexOf(marker);
    if (i > 0) text = text.slice(0, i);
  }

  // Small models love wrapping the whole answer in a markdown code fence. The
  // old code split on ``` and kept text[0], which is EMPTY when the fence is at
  // the start - the single biggest cause of formatting returning the raw text.
  // Strip a surrounding fence instead of nuking everything.
  text = text.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```[^\n]*\n?/, '').replace(/\n?```\s*$/, '');
  }

  return text.trim();
}

// Fragments that only ever appear in OUR prompt, never in a real transcript.
// A small model handed a short or meaningless transcript sometimes has nothing
// to do and drifts into reciting its own instructions instead - and the user
// then reads the prompt in the "Formatted" tab, which looks like the app is
// broken (it is). Checked case-insensitively against the model's output.
const PROMPT_ECHO_MARKERS = [
  'work only with the transcript above',
  'reply only with the final result',
  'process the transcript now',
  'summarize the transcript now',
  'you are a precise text-processing assistant',
  'ensure you use the correct spelling and context',
  'do not wrap the output in quotes',
  'act as a user profiling engine',
];

/**
 * The few-shot examples in the memory-extraction prompt.
 *
 * Named, because they are ALSO the blocklist. Given a transcript with nothing
 * personal in it, the model happily returns these three examples verbatim as
 * "the user's memories" - and they then get saved and injected into every
 * future format/summarize prompt as if they were facts about the user. Keep
 * the prompt and the filter reading from this one list so they can't drift.
 */
export const PROMPT_EXAMPLE_MEMORIES = [
  'likes black coffee',
  'allergic to peanuts',
  'works in marketing',
];

/**
 * The compression prompt's own example output. Same trap as
 * PROMPT_EXAMPLE_MEMORIES: hand a small model an example and it will eventually
 * hand it back, and this one would land in the user's profile as a fact.
 */
export const COMPRESS_EXAMPLE_OUTPUTS = ['Coffee/espresso drinker'];

/** True if the model regurgitated the prompt instead of doing the work. */
export function echoesPrompt(output: string): boolean {
  const lower = output.toLowerCase();
  return PROMPT_ECHO_MARKERS.some((m) => lower.includes(m));
}

function looksUnstable(formatted: string, raw: string): boolean {
  if (!formatted) return true;
  const lower = formatted.toLowerCase();
  const suspicious = ['fromnowformat', 'reface', 'takect', 'obey obey', 'ipsumudo'];
  if (suspicious.some((m) => lower.includes(m))) return true;
  if (formatted.length > Math.max(3000, raw.length * 3)) return true;
  // The old size check couldn't catch this: an echoed prompt is neither huge
  // nor obviously garbled, so it sailed through and got shown to the user.
  if (echoesPrompt(formatted)) return true;
  return false;
}

export async function formatTranscript(
  transcript: string,
  modelPath: string,
  modelFile: string,
  onPartial?: (text: string) => void,
  /** Whisper's detected code ("it"), so the prompt can name the language. */
  sourceLanguage?: string
): Promise<string> {
  // Nothing to punctuate in a handful of words, and a model given a degenerate
  // transcript ("TRASH!") has no work to do - which is exactly when it starts
  // reciting the prompt back. summarizeTranscript already refused short input;
  // formatting never did.
  if (transcript.trim().split(/\s+/).length < 4) return transcript;

  await loadLLM(modelPath);
  if (!llamaContext) throw new Error("LLM not loaded");
  
  const settings = await loadSettings();
  // Naming the language beats describing it. "in the original language of the
  // text" left a small model reading an otherwise-English prompt to answer in
  // English on an Italian note; "strictly in Italian" does not. sourceLanguage
  // is whisper's own detection, which the app used to discard.
  const detected = languageNameFromCode(sourceLanguage);
  const languageInstruction =
    settings.formatLanguage === "Auto-Detect / Original"
      ? detected
        ? `strictly in ${detected} (DO NOT translate)`
        : "in the original language of the text"
      : `strictly in ${settings.formatLanguage} (DO NOT translate to English)`;
    
  const customFormat = settings.customFormatSystemPrompt;
  // Positive phrasing, same reasoning as the rules above: "keep every word and
  // add only punctuation" says the same thing as the old list of five "do not"s
  // and gives the model something to follow rather than avoid.
  // "Word for word" made Format useless. On "perché se no poi fare tardi" -
  // which is not grammatical Italian - the only honest output under that rule
  // was the same broken sentence back. Speech-to-text produces exactly this:
  // run-together words ("se no" for "sennò") and wrong verb forms ("fare" for
  // "fai"). Cleaning those up IS the job.
  //
  // The line it must not cross is inventing content, so the instruction asks
  // for corrections to what was said and nothing added. That's a real
  // trade: a model allowed to change words can change meaning, and the
  // grounding rule below is what holds it.
  const taskInstruction =
    customFormat ||
    'Write the transcript out as correct, readable text in its own language. Put commas where the sentence needs them, full stops at the ends of sentences, and capital letters on names of people, places and brands. Fix clear speech-to-text errors such as wrong verb forms, wrong agreement, and words split or joined incorrectly. Keep the speaker\'s wording where it is already correct, keep the meaning exactly, and add nothing that was not said.';
  
  let memoryContext = "";
  if (settings.enableContextLearning) {
    const memories = await loadMemories();
    if (memories.length > 0) {
      memoryContext = `\n\nEnsure you use the correct spelling and context for the following terms:\n${memories.map(m => "- " + m.text).join('\n')}`;
    }
  }

  const task = `TASK: ${taskInstruction}${memoryContext}\n\n${GROUNDING_RULE}\n\nYou must reply ${languageInstruction}. Process the transcript now.`;
  const prompt = buildTaskPrompt(modelFile, transcript, task);
  
  const result = await llamaContext.completion(
    {
      prompt,
      n_predict: Math.max(512, Math.min(3072, Math.floor(transcript.length / 3) + 256)),
      temperature: 0.0,
      // Small models loop without a repetition penalty - they repeat the same line
      // until the token budget runs out. Penalise recently-seen tokens to break it.
      penalty_repeat: 1.15,
      penalty_last_n: 256,
    },
    makeTokenStreamer(onPartial)
  );

  const formatted = ensureBasicPunctuation(
    stripMarkdownArtifacts(capRunawayRepetition(extractFormatterOutput(result.text)))
  );
  // Default formatting only adds punctuation/casing, so output far shorter than
  // the input means the model got cut off - fall back to raw. Skip for custom
  // prompts, which may intentionally shorten (e.g. "remove filler words").
  const isDefaultFormatting = !customFormat.trim();
  if (looksUnstable(formatted, transcript) || (isDefaultFormatting && formatted.length < transcript.length * 0.7)) {
    // Even the fallback gets the basics, so Format is never a no-op.
    return isDefaultFormatting ? ensureBasicPunctuation(transcript) : transcript;
  }
  return formatted;
}

export async function summarizeTranscript(
  transcript: string,
  modelPath: string,
  modelFile: string,
  onPartial?: (text: string) => void,
  sourceLanguage?: string
): Promise<string> {
  const wordCount = transcript.trim().split(/\s+/).length;
  if (wordCount < 15) return t('historyDetail.summaryTooShort') || 'Too short to summarize.';
  
  await loadLLM(modelPath);
  if (!llamaContext) throw new Error("LLM not loaded");
  
  const settings = await loadSettings();
  const detected = languageNameFromCode(sourceLanguage);
  const languageInstruction =
    settings.formatLanguage === "Auto-Detect / Original"
      ? detected
        ? `strictly in ${detected} (DO NOT translate)`
        : "in the original language of the text"
      : `strictly in ${settings.formatLanguage}`;

  // Fall back to the format prompt so the Home/Detail "Custom Prompt" field
  // (which only edits customFormatSystemPrompt) still affects Summarize.
  const customSummary = settings.customSummarySystemPrompt || settings.customFormatSystemPrompt;
  // The old default asked for "main ideas, key bullet points and actionable
  // items ... in clear markdown", so the model dutifully produced "## Main
  // Ideas", "### Key Bullet Points" and an empty "#### Actionable Items:" on a
  // note about Christmas shopping. Ask for a summary, not a report template.
  const taskInstruction =
    customSummary ||
    'Summarize the transcript in a few short sentences, shorter than the transcript itself. Write it as a note the speaker is leaving for themselves, covering what it is about and anything that needs doing.';

  // Our own default owns the format, so it gets both rules. A custom prompt
  // sets its own format and gets grounding only.
  const rules = customSummary ? GROUNDING_RULE : `${PLAIN_TEXT_RULE} ${GROUNDING_RULE}`;
  
  let memoryContext = "";
  if (settings.enableContextLearning) {
    const memories = await loadMemories();
    if (memories.length > 0) {
      memoryContext = `\n\nEnsure you use the correct spelling and context for the following terms:\n${memories.map(m => "- " + m.text).join('\n')}`;
    }
  }

  const task = `TASK: ${taskInstruction}${memoryContext}\n\n${rules}\n\nYou must reply ${languageInstruction}. Summarize the transcript now.`;
  const prompt = buildTaskPrompt(modelFile, transcript, task);

  const result = await llamaContext.completion(
    {
      prompt,
      // Budget tied to the input, not a flat 1024. A short note given a big
      // budget is an invitation to pad, which is how a 20-second voice memo came
      // back longer than itself with invented advice about Thanksgiving.
      n_predict: Math.max(128, Math.min(1024, Math.floor(transcript.length / 3))),
      temperature: 0.3,
      // A summary is where the loop showed up worst ("- I have eaten breakfast for
      // lunch." x200). Stronger penalty than formatting - a summary shouldn't repeat.
      penalty_repeat: 1.2,
      penalty_last_n: 256,
    },
    makeTokenStreamer(onPartial)
  );

  const summary = stripLeadingLabel(
    stripMarkdownArtifacts(capRunawayRepetition(extractFormatterOutput(result.text)))
  );
  // Same failure as formatting: better to say the summary failed than to print
  // our own instructions and call them a summary.
  // A summary that's just the transcript back is a failure wearing a success
  // costume - saying so beats handing the user their own words.
  if (!summary || echoesPrompt(summary) || looksLikeCopy(summary, transcript))
    return t('historyDetail.summaryFailed') || "Couldn't summarize this one.";
  return summary;
}

export async function extractMemories(transcript: string, modelPath: string, modelFile: string): Promise<void> {
  const settings = await loadSettings();
  if (!settings.enableContextLearning) return;
  
  await loadLLM(modelPath);
  if (!llamaContext) return;
  
  const task = `TASK: Act as a user profiling engine. Extract ONLY specific data related to the user, their preferences, likes, dislikes, habits, and important factual details about their life from the transcript.
1. Ignore common words, transcription artifacts (like "transcription" or "test"), greetings, and general conversation.
2. Only extract information that would be useful to remember as a personal profile of the user (e.g., ${PROMPT_EXAMPLE_MEMORIES.map((m) => `"${m}"`).join(', ')}).
3. Return ONLY a valid JSON array of strings. If nothing uniquely valuable about the user is found, return [].
4. NEVER return the examples above unless the transcript genuinely says so.`;
  const prompt = buildTaskPrompt(modelFile, transcript, task);
  
  try {
    const result = await llamaContext.completion({
      prompt,
      n_predict: 256,
      temperature: 0.0,
    });
    
    const output = extractFormatterOutput(result.text);
    const parsed = parseModelJson<any[]>(output);

    if (Array.isArray(parsed) && parsed.length > 0) {
      const candidates: string[] = [];
      for (const item of parsed) {
        if (typeof item === 'string' && item.trim().length > 2) {
          const trimmed = item.trim();
          // Drop the prompt's own examples: the model returns them verbatim
          // when the transcript has nothing personal in it, and a fabricated
          // "fact" about the user is worse than no memory at all - it gets fed
          // to every later prompt as if it were true.
          const isExample = PROMPT_EXAMPLE_MEMORIES.some(
            (ex) => ex.toLowerCase() === trimmed.toLowerCase()
          );
          if (isExample || echoesPrompt(trimmed)) continue;
          candidates.push(trimmed);
        }
      }
      // SUGGEST, never save. These are guesses about a person's life, written
      // into their data and then fed to every later prompt - the one place in
      // this app where a wrong answer is both invisible and self-reinforcing.
      // The user approves them in Settings › Memories, or they stay guesses.
      if (candidates.length > 0) await suggestMemories(candidates);
    }
  } catch(e) {
    console.warn("Failed to extract or parse memories", e);
  }
}

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
function sanitiseEntities(parsed: unknown, transcript: string): ActionableEntity[] {
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
function mergeEntities(modelEntities: ActionableEntity[], transcript: string): ActionableEntity[] {
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
/**
 * Feeds partial output to the UI as the model generates it.
 *
 * The raw stream contains the chat template and whatever preamble the model
 * emitted, so each update goes through the same cleanup as the final result -
 * otherwise the first thing on screen is "<|im_start|>assistant". Throttled,
 * because a token callback fires far faster than a screen needs repainting.
 */
function makeTokenStreamer(onPartial?: (text: string) => void) {
  if (!onPartial) return undefined;
  let acc = '';
  let last = 0;
  return (data: { token?: string }) => {
    acc += data?.token ?? '';
    const now = Date.now();
    if (now - last < 60) return;
    last = now;
    const cleaned = stripMarkdownArtifacts(extractFormatterOutput(acc));
    if (cleaned) onPartial(cleaned);
  };
}

export function findHighlights(text: string, stored: ActionableEntity[] = []): ActionableEntity[] {
  if (!text) return [];
  return mergeEntities(stored, text);
}

export async function extractActionableEntities(transcript: string, modelPath: string, modelFile: string): Promise<ActionableEntity[]> {
  await loadLLM(modelPath);
  // The patterns don't need the model, so a failed load costs naming, not highlights.
  if (!llamaContext) return mergeEntities([], transcript);

  const task = `TASK: Extract dates, times, or specific event occurrences (e.g. "tomorrow at 5pm", "September 12th") from the transcript.
1. Return ONLY a valid JSON array of objects.
2. Each object must have exactly 3 keys:
   - "quote": The exact substring from the transcript containing the date/time. MUST match exactly.
   - "name": A short 2-4 word suggested title for a calendar event based on the surrounding context.
   - "type": Either "date" (if it's a full day event) or "time" (if a specific hour is mentioned).
3. If no dates or times are found, return [].`;
  const prompt = buildTaskPrompt(modelFile, transcript, task);
  
  try {
    const result = await llamaContext.completion({
      prompt,
      n_predict: 512,
      temperature: 0.0,
      // Without this a small model can emit the same entity over and over until
      // it runs out of tokens, which also truncates the JSON.
      penalty_repeat: 1.15,
      penalty_last_n: 256,
    });

    const output = extractFormatterOutput(result.text);
    const parsed = parseModelJson<any[]>(output);
    return mergeEntities(sanitiseEntities(parsed, transcript), transcript);
  } catch(e) {
    console.warn("Failed to extract actionable entities", e);
    return mergeEntities([], transcript);
  }
}

export async function generateTitle(transcript: string, modelPath: string, modelFile: string): Promise<string> {
  const wordCount = transcript.trim().split(/\s+/).length;
  if (wordCount < 4) return "Short Audio";
  
  await loadLLM(modelPath);
  if (!llamaContext) throw new Error("LLM not loaded");
  
  const task = `TASK: Generate a short, descriptive title for the transcript (maximum 4 words).
1. Return ONLY the title string. No quotes, brackets, or conversational text.
2. The title must reflect the main topic or context of the transcript.
3. If the transcript is incomprehensible, return "Audio Memo".`;
  const prompt = buildTaskPrompt(modelFile, transcript, task);
  
  try {
    const result = await llamaContext.completion({
      prompt,
      n_predict: 32,
      temperature: 0.3,
    });
    
    let title = extractFormatterOutput(result.text).trim();
    // remove quotes if the model hallucinated them
    title = title.replace(/^"|"$/g, '').trim();
    return title.length > 0 ? title : "Audio Memo";
  } catch(e) {
    console.warn("Failed to generate title", e);
    return "Audio Memo";
  }
}

export async function rollupMemories(modelPath: string, modelFile: string): Promise<boolean> {
  const memories = await loadMemories();
  if (memories.length < 5) return false;
  
  await loadLLM(modelPath);
  if (!llamaContext) throw new Error("LLM not loaded");
  
  const memoryList = memories.map(m => `- ${m.text}`).join('\n');
  
  const systemPrompt = `You are a memory profiling assistant. Your job is to compress a large list of facts about the user into a clean, highly dense, non-redundant Master Profile.
CRITICAL RULES:
1. Merge duplicates (e.g. "likes coffee" and "drinks espresso" -> "Coffee/espresso drinker").
2. Output the new profile as a strict JSON array of strings.
3. Output ONLY the JSON array. Do not output markdown code blocks or conversational text.`;

  const userPrompt = `Compress this list of facts:\n\n${memoryList}`;
  
  const prompt = buildChatPrompt(modelFile, systemPrompt, userPrompt);
  
  try {
    const result = await llamaContext.completion({
      prompt,
      n_predict: 1024,
      temperature: 0.1,
    });
    
    const output = extractFormatterOutput(result.text);
    const parsed = parseModelJson<string[]>(output);

    if (Array.isArray(parsed) && parsed.length > 0) {
      // This REPLACES the user's approved memories wholesale, so it has to be
      // more careful than the rest. Two ways it goes wrong: the model returns
      // this prompt's own examples ("Coffee/espresso drinker") and they become
      // facts about the user, or it returns junk and the whole approved list is
      // destroyed. Filter the first; refuse to save on the second.
      const cleaned = parsed
        .filter((text): text is string => typeof text === 'string' && text.trim().length > 2)
        .map((text) => text.trim())
        .filter((text) => !COMPRESS_EXAMPLE_OUTPUTS.some((ex) => ex.toLowerCase() === text.toLowerCase()))
        .filter((text) => !echoesPrompt(text));

      if (cleaned.length === 0) return false;

      const newMemories = cleaned.map((text) => ({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
        text,
      }));
      await saveMemories(newMemories);
      return true;
    }
    return false;
  } catch(e) {
    console.warn("Failed to rollup memories", e);
    return false;
  }
}
