import { Platform } from 'react-native';
import type { LlamaContext } from 'llama.rn';
import { ModelManager, EMBEDDING_MODELS } from './ModelManager';

// llama.rn is a native module - importing it at top level crashes the web
// bundle. Guard behind a lazy require, same pattern as ChatEngine/LLMEngine.
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

export async function loadEmbeddingModel(): Promise<boolean> {
  const modelDef = EMBEDDING_MODELS[0];
  const isDownloaded = await ModelManager.isModelDownloaded(modelDef.id);

  if (!isDownloaded) {
    console.log("Embedding model not downloaded yet.");
    return false;
  }

  const modelPath = ModelManager.getModelPath(modelDef.id);

  if (embeddingContext && currentModelPath === modelPath) {
    return true;
  }

  // Coalesce concurrent loads so we never init the native context twice.
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
    console.log("Loading embedding model...");
    const init = getInitLlama();
    if (!init) return false; // web / unsupported platform
    embeddingContext = await init({
      model: modelPath,
      n_ctx: 512,
      n_batch: 512,
      pooling_type: 'mean' // critical for BERT/MiniLM models
    });
    currentModelPath = modelPath;
    console.log("Embedding model loaded successfully.");
    return true;
  })();
  loadPromise = p;

  try {
    return await p;
  } catch (e) {
    console.error("Failed to load embedding model:", e);
    return false;
  } finally {
    if (loadPromise === p) loadPromise = null;
  }
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const isLoaded = await loadEmbeddingModel();
  if (!isLoaded || !embeddingContext) return null;

  try {
    const result = await embeddingContext.embedding(text);
    return result.embedding;
  } catch (e) {
    console.error("Failed to generate embedding:", e);
    return null;
  }
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
