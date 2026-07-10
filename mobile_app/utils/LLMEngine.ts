import { Platform } from 'react-native';
import type { LlamaContext } from 'llama.rn';
import { loadSettings } from './settingsStore';
import { loadMemories, saveMemories } from './memoryStore';

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
      // Leave cores free for the system and for Whisper — background
      // formatting must not starve a transcription the user just started.
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

function extractFormatterOutput(output: string): string {
  let text = output;
  
  if (text.includes('... (truncated)')) {
    text = text.split('... (truncated)').pop() || text;
  } else if (text.includes('<|im_start|>assistant')) {
    text = text.split('<|im_start|>assistant').pop() || text;
  } else if (text.includes('<|start_header_id|>assistant<|end_header_id|>')) {
    text = text.split('<|start_header_id|>assistant<|end_header_id|>').pop() || text;
  } else if (text.includes('<|assistant|>')) {
    text = text.split('<|assistant|>').pop() || text;
  }
  
  const markers = [
    "[ Prompt:", "Exiting...", "<|im_end|>", "<|end|>", "<|eot_id|>", "<|endoftext|>",
    "<|start_header_id|>", "<|im_start|>", "ggml_cuda_init:", "```"
  ];
  
  for (const marker of markers) {
    if (text.includes(marker)) {
      text = text.split(marker)[0];
    }
  }
  
  return text.trim();
}

function looksUnstable(formatted: string, raw: string): boolean {
  if (!formatted) return true;
  const lower = formatted.toLowerCase();
  const suspicious = ['fromnowformat', 'reface', 'takect', 'obey obey', 'ipsumudo'];
  if (suspicious.some((m) => lower.includes(m))) return true;
  if (formatted.length > Math.max(3000, raw.length * 3)) return true;
  return false;
}

export async function formatTranscript(transcript: string, modelPath: string, modelFile: string): Promise<string> {
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

  const systemPrompt = `You are a specialized text processing assistant. Your task is to process the following transcript according to these instructions:\n\n${taskInstruction}${memoryContext}\n\nCRITICAL RULES:\n1. You must reply ${languageInstruction}.\n2. Reply ONLY with the final processed text. Do not add any conversational text, pleasantries, or formatting tags. Do not wrap the output in quotes.`;
  const userPrompt = `Clean this transcript ${languageInstruction}:\n\n${transcript}`;
  
  const prompt = buildChatPrompt(modelFile, systemPrompt, userPrompt);
  
  const result = await llamaContext.completion({
    prompt,
    n_predict: Math.max(512, Math.min(3072, Math.floor(transcript.length / 3) + 256)),
    temperature: 0.0,
  });

  const formatted = extractFormatterOutput(result.text);
  // Default formatting only adds punctuation/casing, so output far shorter than
  // the input means the model got cut off — fall back to raw. Skip for custom
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

  const systemPrompt = `You are a highly capable summarization assistant. Your task is to process the following transcript according to these instructions:\n\n${taskInstruction}${memoryContext}\n\nCRITICAL RULES:\n1. You must reply ${languageInstruction}.\n2. Reply ONLY with the final processed text. Do not add any conversational text, pleasantries, or formatting tags. Do not wrap the output in quotes.`;
  const userPrompt = `Summarize this transcript ${languageInstruction}:\n\n${transcript}`;
  
  const prompt = buildChatPrompt(modelFile, systemPrompt, userPrompt);
  
  const result = await llamaContext.completion({
    prompt,
    n_predict: 1024,
    temperature: 0.3,
  });
  
  return extractFormatterOutput(result.text) || "Summary failed.";
}

export async function extractMemories(transcript: string, modelPath: string, modelFile: string): Promise<void> {
  const settings = await loadSettings();
  if (!settings.enableContextLearning) return;
  
  await loadLLM(modelPath);
  if (!llamaContext) return;
  
  const systemPrompt = `You are a user profiling engine. Extract ONLY specific data related to the user, their preferences, likes, dislikes, habits, and important factual details about their life from the text.
CRITICAL RULES:
1. Ignore common words, transcription artifacts (like "transcription" or "test"), greetings, and general conversation.
2. Only extract information that would be useful to remember as a personal profile of the user (e.g., "likes black coffee", "allergic to peanuts", "works in marketing").
3. Return ONLY a valid JSON array of strings, like ["likes black coffee", "works in marketing"]. Do not add any conversational text. If nothing uniquely valuable about the user is found, return [].`;
  const userPrompt = `Extract user preferences and profile facts from:\n${transcript}`;
  const prompt = buildChatPrompt(modelFile, systemPrompt, userPrompt);
  
  try {
    const result = await llamaContext.completion({
      prompt,
      n_predict: 256,
      temperature: 0.0,
    });
    
    const output = extractFormatterOutput(result.text);
    const parsed = parseModelJson<any[]>(output);

    if (Array.isArray(parsed) && parsed.length > 0) {
      const current = await loadMemories();
      let next = [...current];
      let added = false;
      for (const item of parsed) {
        if (typeof item === 'string' && item.trim().length > 2) {
          const trimmed = item.trim();
          if (!next.some(m => m.text.toLowerCase() === trimmed.toLowerCase())) {
            next.unshift({
              id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
              text: trimmed
            });
            added = true;
          }
        }
      }
      if (added) {
        await saveMemories(next);
      }
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

export async function extractActionableEntities(transcript: string, modelPath: string, modelFile: string): Promise<ActionableEntity[]> {
  await loadLLM(modelPath);
  if (!llamaContext) return [];
  
  const systemPrompt = `You are a precise data extraction engine. Extract dates, times, or specific event occurrences (e.g. "tomorrow at 5pm", "September 12th").
CRITICAL RULES:
1. Return ONLY a valid JSON array of objects.
2. Each object must have exactly 3 keys:
   - "quote": The exact substring from the text containing the date/time. MUST match exactly.
   - "name": A short 2-4 word suggested title for a calendar event based on the surrounding context.
   - "type": Either "date" (if it's a full day event) or "time" (if a specific hour is mentioned).
3. Do not add any conversational text. If no dates or times are found, return [].`;
  
  const userPrompt = `Extract dates and times from:\n${transcript}`;
  const prompt = buildChatPrompt(modelFile, systemPrompt, userPrompt);
  
  try {
    const result = await llamaContext.completion({
      prompt,
      n_predict: 512,
      temperature: 0.0,
    });
    
    const output = extractFormatterOutput(result.text);
    const parsed = parseModelJson<any[]>(output);

    if (Array.isArray(parsed)) {
      return parsed.filter(item => item.quote && item.name && item.type);
    }
    return [];
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
  
  const systemPrompt = `You are a titling assistant. Read the provided text and generate a short, descriptive title for it (maximum 4 words).
CRITICAL RULES:
1. Return ONLY the title string. Do not use quotes, brackets, or conversational text.
2. The title must reflect the main topic or context of the text.
3. If the text is incomprehensible, return "Audio Memo".`;
  const userPrompt = `Generate a short title for this text:\n\n${transcript}`;
  
  const prompt = buildChatPrompt(modelFile, systemPrompt, userPrompt);
  
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
      const newMemories = parsed.map((text: string) => ({
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
