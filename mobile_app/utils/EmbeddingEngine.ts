import { Platform } from 'react-native';
import type { LlamaContext } from 'llama.rn';
import { ModelManager, EMBEDDING_MODELS } from './ModelManager';
import { meanVector, piecesForEmbedding } from './chatPlan';

// Search by meaning. The helper model turns a text into a list of numbers
// (a vector); two texts about the same thing get vectors that point the same
// way. The measurements behind every number here are in
// docs/chat-research.md, sections 12 and 13.

/**
 * The helper model in use. Stored next to every vector it makes, because
 * vectors from two different models have the same length and compare to
 * nonsense without any error.
 */
export const EMBEDDING_ID = EMBEDDING_MODELS[0].id;

// How multilingual-e5 was trained (its model card): every text starts with
// one of these two words, in any language.
const NOTE_PREFIX = 'passage: ';
const QUESTION_PREFIX = 'query: ';
// The model reads 512 tokens and the engine refuses a longer text outright,
// so a note goes in as pieces, each cut to this with room for the prefix.
const PIECE_TOKENS = 480;
const PIECE_CHARS = 1000;
const MAX_PIECES = 4;
/** Left loaded this long after its last use, then released: it is 132 MB next to the other models. */
const IDLE_MS = 30000;

let initLlama: any;
function getInitLlama() {
  if (!initLlama && Platform.OS !== 'web') {
    initLlama = require('llama.rn').initLlama;
  }
  return initLlama;
}

let embeddingContext: LlamaContext | null = null;
let currentModelPath: string | null = null;
let loadPromise: Promise<boolean> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
// A model the phone's engine cannot open fails the same way every time; after
// two tries it is left alone until the app restarts.
let failedLoads = 0;
const MAX_FAILED_LOADS = 2;

/** Whether the helper model's file is on the phone. */
export function helperInstalled(): Promise<boolean> {
  return ModelManager.isModelDownloaded(EMBEDDING_ID);
}

export async function loadEmbeddingModel(): Promise<boolean> {
  const modelDef = EMBEDDING_MODELS[0];
  const isDownloaded = await ModelManager.isModelDownloaded(modelDef.id);

  if (!isDownloaded || failedLoads >= MAX_FAILED_LOADS) {
    return false;
  }

  const modelPath = ModelManager.getModelPath(modelDef.id);

  if (embeddingContext && currentModelPath === modelPath) {
    return true;
  }

  while (loadPromise) {
    await loadPromise;
    if (embeddingContext && currentModelPath === modelPath) return true;
  }

  const p = (async (): Promise<boolean> => {
    if (embeddingContext) {
      await embeddingContext.release();
      embeddingContext = null;
      currentModelPath = null;
    }
    const init = getInitLlama();
    if (!init) return false; // web / unsupported platform
    embeddingContext = await init({
      model: modelPath,
      // Without this the engine refuses every text ("Embedding is not
      // enabled", llama.rn cpp/jsi/RNLlamaJSI.cpp). It was missing until
      // versionCode 115, so no phone build before that ever made a vector.
      embedding: true,
      // On the processor, never the graphics chip: the model is small enough
      // (12 layers) and this kind of model on the phone's GPU path is untested.
      n_gpu_layers: 0,
      n_threads: 4,
      n_ctx: 512,
      n_batch: 512,
      pooling_type: 'mean', // one vector per text: the mean over its tokens, as the model was trained
    });
    currentModelPath = modelPath;
    return true;
  })();
  loadPromise = p;

  try {
    return await p;
  } catch (e) {
    failedLoads++;
    console.error("Failed to load embedding model:", e);
    return false;
  } finally {
    if (loadPromise === p) loadPromise = null;
  }
}

async function unloadEmbeddingModel(): Promise<void> {
  const context = embeddingContext;
  embeddingContext = null;
  currentModelPath = null;
  if (context) {
    try {
      await context.release();
    } catch (e) {
      console.warn('Error releasing embedding context', e);
    }
  }
}

// One text at a time: a note being indexed and a question being asked must
// not be inside the same engine context together.
let turn: Promise<unknown> = Promise.resolve();
function inTurn<T>(work: () => Promise<T>): Promise<T> {
  const run = turn.then(work, work);
  turn = run.catch(() => {});
  return run;
}

function releaseWhenIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    void inTurn(unloadEmbeddingModel);
  }, IDLE_MS);
}

/** One text through the model, shortened first if it would not fit. */
async function embedOne(context: LlamaContext, text: string): Promise<number[] | null> {
  let piece = text;
  for (let i = 0; i < 4; i++) {
    let size = 0;
    try {
      size = (await context.tokenize(piece)).tokens.length;
    } catch {
      // No count available: two characters per token, on the safe side for Latin text.
      size = Math.ceil(piece.length / 2);
    }
    if (size <= PIECE_TOKENS) break;
    piece = piece.slice(0, Math.floor((piece.length * (PIECE_TOKENS - 20)) / size));
  }
  const result = await context.embedding(piece);
  return result.embedding?.length ? result.embedding : null;
}

/**
 * A note's vector: the mean of its pieces. Null when the helper model is not
 * installed or could not read the text. Store it with EMBEDDING_ID.
 */
export function generateEmbedding(text: string): Promise<number[] | null> {
  return inTurn(async () => {
    if (!(await loadEmbeddingModel()) || !embeddingContext) return null;
    const context = embeddingContext;
    try {
      const vectors: number[][] = [];
      for (const piece of piecesForEmbedding(text, PIECE_CHARS, MAX_PIECES)) {
        const vector = await embedOne(context, NOTE_PREFIX + piece);
        if (vector) vectors.push(vector);
      }
      return vectors.length ? meanVector(vectors) : null;
    } catch (e) {
      console.error("Failed to generate embedding:", e);
      return null;
    } finally {
      releaseWhenIdle();
    }
  });
}

/** A question's vector, to compare with the notes'. Null when the helper model is not installed. */
export function embedQuestion(text: string): Promise<number[] | null> {
  return inTurn(async () => {
    if (!(await loadEmbeddingModel()) || !embeddingContext) return null;
    try {
      return await embedOne(embeddingContext, QUESTION_PREFIX + text.trim().slice(0, 600));
    } catch (e) {
      console.error("Failed to embed the question:", e);
      return null;
    } finally {
      releaseWhenIdle();
    }
  });
}
