import { Platform } from 'react-native';
import type { LlamaContext } from 'llama.rn';
import { loadSettings } from './settingsStore';
import { loadMemories, saveMemories, suggestMemories } from './memoryStore';
// Relative, matching this file - mixing '@/utils/x' and './x' for the same
// module makes Metro load it twice, which is what split the language state.
import { t } from './i18n';
import { languageNameFromCode } from './languages';
import { mergeEntities, sanitiseEntities } from './entityExtraction';
import type { ActionableEntity } from './entityExtraction';
import {
  capRunawayRepetition,
  stripMarkdownArtifacts,
  ensureBasicPunctuation,
  stripLeadingLabel,
  looksLikeCopy,
  extractFormatterOutput,
  echoesPrompt,
  looksUnstable,
} from './textCleanup';
// Re-exported so existing importers of these from LLMEngine keep working.
export { findHighlights } from './entityExtraction';
export type { ActionableEntity } from './entityExtraction';
export { echoesPrompt, ensureBasicPunctuation } from './textCleanup';

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
      // NOT 0.0. Greedy decoding on a rewrite task makes a small model lazy: the
      // single likeliest continuation of "rewrite this" is to reproduce the
      // input, so it copied the transcript back and only ensureBasicPunctuation
      // touched it. The SAME model at 0.3 (Summarize) actually applied commas,
      // proper nouns and verb fixes to this exact note. A little randomness is
      // what lets it commit to the transformation instead of echoing.
      temperature: 0.3,
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
  // echoesPrompt always applies: printing our own instructions is a failure
  // whatever the prompt was.
  if (!summary || echoesPrompt(summary))
    return t('historyDetail.summaryFailed') || "Couldn't summarize this one.";
  // looksLikeCopy only guards the DEFAULT summary, which is meant to be shorter.
  // A custom prompt owns its output: "fix the grammar" or "rewrite formally"
  // legitimately returns near-full-length, high-overlap text, and flagging that
  // as a copy is why custom prompts were erroring with "couldn't summarize".
  const isCustomSummary = !!customSummary.trim();
  if (!isCustomSummary && looksLikeCopy(summary, transcript))
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
    // A weak model handed a short or odd transcript sometimes recites the prompt
    // instead of doing the work ("...Process the transcript now"). The FINAL
    // result already falls back to raw via looksUnstable, but the streaming
    // partial is what the user watches - and freezes on if they open fullscreen
    // mid-stream. Hold the last good frame rather than typing the prompt out.
    if (cleaned && !echoesPrompt(cleaned)) onPartial(cleaned);
  };
}

export async function extractActionableEntities(
  transcript: string,
  modelPath: string,
  modelFile: string,
  sourceLanguage?: string
): Promise<ActionableEntity[]> {
  await loadLLM(modelPath);
  // The patterns don't need the model, so a failed load costs naming, not highlights.
  if (!llamaContext) return mergeEntities([], transcript);

  // "name" becomes the calendar event title the user sees, so it has to be in
  // their language too - same fix as the note title.
  const detected = languageNameFromCode(sourceLanguage);
  const nameLanguage = detected ? ` Write it in ${detected}.` : ' Write it in the transcript\'s language.';
  const task = `TASK: Extract dates, times, or specific event occurrences (e.g. "tomorrow at 5pm", "September 12th") from the transcript.
1. Return ONLY a valid JSON array of objects.
2. Each object must have exactly 3 keys:
   - "quote": The exact substring from the transcript containing the date/time. MUST match exactly.
   - "name": A short 2-4 word suggested title for a calendar event based on the surrounding context.${nameLanguage}
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

export async function generateTitle(
  transcript: string,
  modelPath: string,
  modelFile: string,
  sourceLanguage?: string
): Promise<string> {
  // Localized, not "Short Audio"/"Audio Memo": these are SHOWN as the note's
  // name in History, so an English fallback lands in an otherwise Italian list.
  const fallback = t('transcribe.noTitle') || 'Voice Memo';
  const wordCount = transcript.trim().split(/\s+/).length;
  if (wordCount < 4) return fallback;

  await loadLLM(modelPath);
  if (!llamaContext) throw new Error("LLM not loaded");

  // The title prompt had NO language instruction at all, which is why an
  // Italian note came back as "Patent's 15th and 17th of July" - the most
  // visible text in History, in the wrong language.
  const detected = languageNameFromCode(sourceLanguage);
  const languageLine = detected
    ? `\n4. Write the title in ${detected}.`
    : '\n4. Write the title in the same language as the transcript.';
  const task = `TASK: Generate a short, descriptive title for the transcript (maximum 4 words).
1. Return ONLY the title string. No quotes, brackets, or conversational text.
2. The title must reflect the main topic or context of the transcript.
3. If the transcript is incomprehensible, return "${fallback}".${languageLine}`;
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
    return title.length > 0 ? title : fallback;
  } catch(e) {
    console.warn("Failed to generate title", e);
    return fallback;
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
