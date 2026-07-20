import { Platform } from 'react-native';
import type { LlamaContext } from 'llama.rn';
import { loadSettings } from './settingsStore';
import { loadMemories, saveMemories, suggestMemories } from './memoryStore';

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

export async function formatTranscript(transcript: string, modelPath: string, modelFile: string): Promise<string> {
  // Nothing to punctuate in a handful of words, and a model given a degenerate
  // transcript ("TRASH!") has no work to do - which is exactly when it starts
  // reciting the prompt back. summarizeTranscript already refused short input;
  // formatting never did.
  if (transcript.trim().split(/\s+/).length < 4) return transcript;

  await loadLLM(modelPath);
  if (!llamaContext) throw new Error("LLM not loaded");
  
  const settings = await loadSettings();
  const languageInstruction = settings.formatLanguage === "Auto-Detect / Original" 
    ? "in the original language of the text" 
    : `strictly in ${settings.formatLanguage} (DO NOT translate to English)`;
    
  const customFormat = settings.customFormatSystemPrompt;
  const taskInstruction = customFormat || "Add only punctuation, capitalization, and paragraph breaks to the transcript. Do not translate, summarize, add facts, remove details, or continue beyond the transcript.";
  
  let memoryContext = "";
  if (settings.enableContextLearning) {
    const memories = await loadMemories();
    if (memories.length > 0) {
      memoryContext = `\n\nEnsure you use the correct spelling and context for the following terms:\n${memories.map(m => "- " + m.text).join('\n')}`;
    }
  }

  const task = `TASK: ${taskInstruction}${memoryContext}\n\nYou must reply ${languageInstruction}. Process the transcript now.`;
  const prompt = buildTaskPrompt(modelFile, transcript, task);
  
  const result = await llamaContext.completion({
    prompt,
    n_predict: Math.max(512, Math.min(3072, Math.floor(transcript.length / 3) + 256)),
    temperature: 0.0,
    // Small models loop without a repetition penalty - they repeat the same line
    // until the token budget runs out. Penalise recently-seen tokens to break it.
    penalty_repeat: 1.15,
    penalty_last_n: 256,
  });

  const formatted = capRunawayRepetition(extractFormatterOutput(result.text));
  // Default formatting only adds punctuation/casing, so output far shorter than
  // the input means the model got cut off - fall back to raw. Skip for custom
  // prompts, which may intentionally shorten (e.g. "remove filler words").
  const isDefaultFormatting = !customFormat.trim();
  if (looksUnstable(formatted, transcript) || (isDefaultFormatting && formatted.length < transcript.length * 0.7)) {
    return transcript;
  }
  return formatted;
}

export async function summarizeTranscript(transcript: string, modelPath: string, modelFile: string): Promise<string> {
  const wordCount = transcript.trim().split(/\s+/).length;
  if (wordCount < 15) return "Text is too short or lacks content to summarize.";
  
  await loadLLM(modelPath);
  if (!llamaContext) throw new Error("LLM not loaded");
  
  const settings = await loadSettings();
  const languageInstruction = settings.formatLanguage === "Auto-Detect / Original"
    ? "in the original language of the text"
    : `strictly in ${settings.formatLanguage}`;

  // Fall back to the format prompt so the Home/Detail "Custom Prompt" field
  // (which only edits customFormatSystemPrompt) still affects Summarize.
  const customSummary = settings.customSummarySystemPrompt || settings.customFormatSystemPrompt;
  const taskInstruction = customSummary || "Extract the main ideas, key bullet points, and actionable items from the transcript. Use clear markdown bullet points.";
  
  let memoryContext = "";
  if (settings.enableContextLearning) {
    const memories = await loadMemories();
    if (memories.length > 0) {
      memoryContext = `\n\nEnsure you use the correct spelling and context for the following terms:\n${memories.map(m => "- " + m.text).join('\n')}`;
    }
  }

  const task = `TASK: ${taskInstruction}${memoryContext}\n\nYou must reply ${languageInstruction}. Summarize the transcript now.`;
  const prompt = buildTaskPrompt(modelFile, transcript, task);
  
  const result = await llamaContext.completion({
    prompt,
    n_predict: 1024,
    temperature: 0.3,
    // A summary is where the loop showed up worst ("- I have eaten breakfast for
    // lunch." x200). Stronger penalty than formatting - a summary shouldn't repeat.
    penalty_repeat: 1.2,
    penalty_last_n: 256,
  });

  const summary = capRunawayRepetition(extractFormatterOutput(result.text));
  // Same failure as formatting: better to say the summary failed than to print
  // our own instructions and call them a summary.
  if (!summary || echoesPrompt(summary)) return "Summary failed.";
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

export async function extractActionableEntities(transcript: string, modelPath: string, modelFile: string): Promise<ActionableEntity[]> {
  await loadLLM(modelPath);
  if (!llamaContext) return [];
  
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
    return sanitiseEntities(parsed, transcript);
  } catch(e) {
    console.warn("Failed to extract actionable entities", e);
    return [];
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
