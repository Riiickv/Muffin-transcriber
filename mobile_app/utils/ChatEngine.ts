import { Platform } from 'react-native';
import { recordLlm } from './perfLog';
import type { LlamaContext } from 'llama.rn';
import { loadSettings, Settings } from './settingsStore';
import { loadHistory, HistoryItem } from './historyStore';
import { loadMemories } from './memoryStore';
import { holdIndexing, indexNotes, noteByMeaning } from './searchIndex';
import { SETTINGS_REGISTRY } from './appCapabilities';
import {
  answerSystem, asksNoteCount, commandGuess, commandRequest, contentStems, isSmallTalk, notesForTurns, readCommandReply, sourceOf, talkSystem,
  toolCallText, turnsForAnswer,
  wrapPrompt, promptBudget, ANSWER_SIZES, ANSWER_TOKENS, STOP_TOKENS,
} from './chatPlan';
import type { CommandGuess, PlanNote, PlanSetting } from './chatPlan';
import { t } from '@/utils/i18n';
import { speechBusy, unloadWhisper } from './WhisperEngine';
import { llamaBusy, queueLlama } from './transcriptionPipeline';
import { unloadLLM } from './LLMEngine';

let initLlama: any;
function getInitLlama() {
  if (!initLlama && Platform.OS !== 'web') {
    initLlama = require('llama.rn').initLlama;
  }
  return initLlama;
}

let llamaContext: LlamaContext | null = null;
let currentModelPath = '';
let currentContextSize = 0;
let loadPromise: Promise<void> | null = null;

export async function loadChatLLM(modelPath: string): Promise<void> {
  if (llamaContext && currentModelPath === modelPath) return;

  // Coalesce concurrent loads so we never init the native context twice
  // (a double-init leaks the first, hundreds-of-MB context).
  while (loadPromise) {
    await loadPromise;
    if (llamaContext && currentModelPath === modelPath) return;
  }

  const p = (async () => {
    if (llamaContext) await unloadChatLLM();

    // Free the OTHER resident engines first. warmWhisperIfReady deliberately
    // keeps Whisper loaded (up to ~874 MB) and LLMEngine keeps the formatter
    // after enrichment (up to ~1.1 GB) - so without this, the chat model is
    // the THIRD model stacked into native heap, and llama.cpp's weight
    // allocation can fail with the same bare "Failed to load model" a broken
    // file produces. Chat is what the user is doing right now; idle engines
    // reload on their next use (Whisper re-warms when Record gains focus).
    //
    // The text model is left alone while it is working. Unloading it then
    // was called rare; it is what happens every time someone records a note
    // and opens the chat straight after, and the note lost its Improve,
    // summary and title without a word. If the chat model then does not fit
    // next to it, the load below waits for that work to end and tries again.
    // The speech model is left alone too while it is transcribing.
    if (!speechBusy()) {
      try { await unloadWhisper(); } catch {}
    }
    const textModelKept = llamaBusy();
    if (!textModelKept) {
      try { await unloadLLM(); } catch {}
    }

    const init = getInitLlama();

    // 4096 first, 2048 if the device will not give the memory for it.
    //
    // This used to start at 8192, because the old single prompt measured about
    // 3,000 tokens before the user had typed anything and grew with every saved
    // note. The prompts built by chatPlan.ts are bounded whatever the library
    // size and chatStream trims them to a token budget, so 8192 would only buy
    // a KV cache twice as large, allocated up front, on top of a model of up to
    // 2.3 GB. It bought nothing for Phi-3 Mini either, which stops making sense
    // past about 2,200 tokens whatever the window (docs/chat-research.md).
    //
    // Phi-3 Mini gets 2048 outright: its prompts are held to 1,500 tokens plus
    // a 400-token answer, and its cache is the expensive one (measured on PC:
    // about 0.77 GB per 2,048 tokens of window, against 0.06 GB for the 1.5B
    // text model), so the old 8192 cost it 2.3 GB it could never use.
    const sizes = modelPath.toLowerCase().includes('phi-3') ? [2048] : [4096, 2048];
    let lastError: unknown;
    const tryLoad = async (): Promise<boolean> => {
      for (const n_ctx of sizes) {
        try {
          llamaContext = await init({
            n_ctx,
            model: modelPath,
            // Bounded threads, same as LLMEngine. See the note there before
            // adding cache/flash-attn options: they hard-fail init on OpenCL
            // devices.
            n_threads: 4,
          });
          if (n_ctx !== sizes[0]) {
            console.warn(`Chat LLM: ${sizes[0]} context failed, running at ${n_ctx}.`);
          }
          currentModelPath = modelPath;
          currentContextSize = n_ctx;
          return true;
        } catch (e) {
          lastError = e;
          llamaContext = null;
        }
      }
      return false;
    };
    if (await tryLoad()) return;
    if (textModelKept) {
      // No room next to the working text model: let it finish, then free it.
      await queueLlama(async () => {
        try { await unloadLLM(); } catch {}
      });
      if (await tryLoad()) return;
    }
    // Every size failed, so this is not about memory: the file itself did not
    // load. The classic cause is a truncated download from before downloads
    // went through .part files - it passes the existence check but llama.cpp
    // rejects it. Tell the user the way out instead of just the symptom.
    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(
      (t('chat.modelLoadFailed') ||
        'The chat model file looks incomplete or damaged. Delete it in Settings > Models, then download it again.') +
        ' (' + detail + ')'
    );
  })();
  loadPromise = p;

  try {
    await p;
  } catch (error) {
    console.error("Failed to load Chat LLM:", error);
    throw error;
  } finally {
    if (loadPromise === p) loadPromise = null;
  }
}

export async function unloadChatLLM(): Promise<void> {
  if (llamaContext) {
    try {
      await llamaContext.release();
    } catch (e) {
      console.warn("Error releasing chat context", e);
    }
    llamaContext = null;
    currentModelPath = '';
    currentContextSize = 0;
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  // Stable key for list rendering; absent on messages loaded from older storage.
  id?: string;
}

// ---------------------------------------------------------------------------
// The chat, in two small steps. Both are planned in utils/chatPlan.ts, which is
// pure and tested; the measurements behind the design are in
// docs/chat-research.md.
//
//   An order for the app ("delete the gym note", "dark theme") is recognised in
//   code, then a step whose output is forced into a fixed shape picks the
//   action. The model cannot claim an action it did not write, because the
//   action is the only thing it is able to write.
//
//   Anything else gets a short prompt holding only the notes that match, and
//   nothing about actions.
//
// The old single prompt asked one small model to hold eight rules, a tool
// syntax, every setting and three notes at once: 5 of 17 requests correct.
// ---------------------------------------------------------------------------

const noteName = (h: HistoryItem) => h.sourceFileName.replace(/\.[^/.]+$/, '');

function settingsForPlan(settings: Settings, theme: { themeMode: string; accentColor: string }): PlanSetting[] {
  return SETTINGS_REGISTRY.map((s) => ({
    key: s.key,
    type: s.type,
    options: s.options,
    about: s.about,
    current: s.store === 'theme' ? (s.key === 'themeMode' ? theme.themeMode : theme.accentColor) : String((settings as any)[s.key]),
  }));
}

/** What the helper model reads of a note: the same text the chat shows. */
const noteText = (h: HistoryItem) => h.formattedTranscript || h.rawTranscript || '';

/**
 * Has the helper model read the notes it has not read yet, in the
 * background. Called when the chat opens; does nothing without the helper.
 */
export async function indexNotesForSearch(): Promise<void> {
  const history = await loadHistory();
  await indexNotes(history.map((h) => ({ id: h.id, text: noteText(h) })));
}

/**
 * The command step. Returns the reply (action blocks the chat screen runs), or
 * null when the model found no action in the message after all.
 */
async function runCommand(
  context: LlamaContext,
  modelFile: string,
  ask: string,
  guess: CommandGuess,
  notes: PlanNote[],
  settings: PlanSetting[],
  now: Date
): Promise<string | null> {
  // Opening a screen needs no model.
  if (guess.kinds.length === 1 && guess.kinds[0] === 'navigate' && guess.tab) {
    return toolCallText([{ action: 'NAVIGATE_TO', tab: guess.tab }]);
  }

  const request = commandRequest(ask, guess, notes, settings, now);
  if (!request) {
    // A delete or rename that matches no note. An action with no target draws
    // the "couldn't do that" chip; guessing would put a delete dialog for the
    // wrong note in front of the user.
    return toolCallText([{ action: guess.kinds.includes('delete') ? 'DELETE_TRANSCRIPT' : 'RENAME_TRANSCRIPT' }]);
  }

  try {
    const result = await context.completion({
      prompt: wrapPrompt(modelFile, request.system, [{ role: 'user', content: ask }]),
      n_predict: 200,
      temperature: 0.0,
      // Compiled to a grammar by llama.cpp: only a valid action list can come out.
      response_format: { type: 'json_schema', json_schema: { strict: true, schema: request.schema } },
    });
    void recordLlm('chat', modelFile, (result as any)?.timings, result.text.length);
    const actions = readCommandReply(result.text, request.ids);
    return actions.length ? toolCallText(actions) : null;
  } catch (error) {
    console.warn('Chat command step failed, answering instead:', error);
    return null;
  }
}

export async function chatStream(
  messages: ChatMessage[],
  modelPath: string,
  modelFile: string,
  onToken: (token: string) => void,
  appContext: { themeMode: string; accentColor: string } = { themeMode: 'system', accentColor: 'system' }
): Promise<string> {
  holdIndexing(true);
  try {
    return await answerStream(messages, modelPath, modelFile, onToken, appContext);
  } finally {
    holdIndexing(false);
  }
}

async function answerStream(
  messages: ChatMessage[],
  modelPath: string,
  modelFile: string,
  onToken: (token: string) => void,
  appContext: { themeMode: string; accentColor: string }
): Promise<string> {
  await loadChatLLM(modelPath);
  const context = llamaContext;
  if (!context) throw new Error("Chat LLM not loaded");

  const settings = await loadSettings();
  const history = await loadHistory();
  const notes: PlanNote[] = history.map((h) => ({
    id: h.id,
    name: noteName(h),
    // Improved text is the same words as the raw one, punctuated: the better
    // one to read. Raw is the fallback when Improve has not run.
    text: noteText(h),
    summary: h.summary,
    timestampISO: h.timestampISO,
  }));
  const now = new Date();
  const ask = messages[messages.length - 1].content;

  const guess = commandGuess(ask);
  if (guess) {
    const reply = await runCommand(context, modelFile, ask, guess, notes, settingsForPlan(settings, appContext), now);
    if (reply) {
      onToken(reply);
      return reply;
    }
  }

  const memories = settings.enableContextLearning ? (await loadMemories()).map((m) => m.text) : [];
  const found = notesForTurns(messages, notes, now, memories);
  // A greeting never goes looking for a note. Anything with a topic does:
  // by its words first, then by meaning. One topic word is enough ("the
  // note about money"); it used to need two, which skipped exactly that.
  const talk = isSmallTalk(ask);
  const topical = !talk && contentStems(ask).length >= 1;
  let shown = talk ? [] : found.shown;
  if (shown.length === 0 && topical) {
    const id = await noteByMeaning(ask, notes);
    const note = id ? notes.find((n) => n.id === id) : undefined;
    shown = note ? [note] : [];
  }
  // Asked about something no note holds: the app says so itself. Given no
  // note, a small model invents one (measured: 3 right of 15 on Llama 3.2
  // 1B, 8 of 15 on Qwen 2.5 1.5B).
  const missing = t('chat.notFound') || 'Not found in the notes.';
  if (shown.length === 0 && topical) {
    onToken(missing);
    return missing;
  }
  // A count is the app's to give, not the model's.
  if (shown.length === 0 && asksNoteCount(ask)) {
    const text = (t('chat.noteCount') || 'Transcriptions: {count}.').replace('{count}', String(notes.length));
    onToken(text);
    return text;
  }

  // Counted with the model's own tokenizer, and shrunk until it fits: less of
  // each note, then fewer notes and fewer earlier turns. The budget is per
  // model because Phi-3 Mini breaks far below its nominal window (measured).
  const budget = promptBudget(modelFile, currentContextSize);
  let prompt = '';
  for (const step of ANSWER_SIZES) {
    const system = shown.length
      ? answerSystem(shown.slice(0, step.notes), found.search, notes, memories, now, step.scale, missing)
      : talkSystem(ask, notes);
    prompt = wrapPrompt(modelFile, system, turnsForAnswer(messages, step.turns));
    let size = Infinity;
    try {
      size = (await context.tokenize(prompt)).tokens.length;
    } catch {
      // No count available: a rough three characters per token, on the safe side.
      size = Math.ceil(prompt.length / 3);
    }
    if (size <= budget) break;
  }

  let fullResponse = "";
  try {
    const chatResult = await context.completion(
      {
        prompt,
        n_predict: ANSWER_TOKENS,
        temperature: 0.3,
      },
      (data) => {
        const text = data.token;
        if (STOP_TOKENS.some(token => text.includes(token))) {
          return;
        }
        fullResponse += text;
        onToken(text);
      }
    );
    void recordLlm('chat', modelFile, (chatResult as any)?.timings, fullResponse.length);
  } catch (error) {
    // Re-throw so the caller (chat.tsx) can distinguish a real failure from a
    // short/empty response and show the "encountered an error" bubble.
    console.error("Chat streaming error:", error);
    throw error;
  }

  // The model is not asked to name the note; the app adds it, and the chat
  // screen turns the name into a link.
  const source = sourceOf(fullResponse, shown, missing);
  if (source) {
    const line = `\n\n${source.name}`;
    onToken(line);
    fullResponse += line;
  }
  return fullResponse.trim();
}
