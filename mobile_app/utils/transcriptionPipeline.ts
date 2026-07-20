import {
  formatTranscript,
  summarizeTranscript,
  generateTitle,
  extractActionableEntities,
  extractMemories,
  ActionableEntity,
} from './LLMEngine';
import { generateEmbedding } from './EmbeddingEngine';

export type EnrichmentStage = 'formatting' | 'summarizing' | 'analyzing';

export interface EnrichmentOptions {
  rawText: string;
  modelPath: string;
  modelFile: string;
  format: boolean;
  summarize: boolean;
  title: boolean;
  embedding: boolean;
  entities: boolean;
  memories: boolean;
  onStage?: (stage: EnrichmentStage) => void;
  onFormatted?: (text: string) => void;
  onSummarized?: (text: string) => void;
  /** Partial output as the model generates it, for the live typewriter. */
  onFormatPartial?: (text: string) => void;
  onSummaryPartial?: (text: string) => void;
}

export interface EnrichmentResult {
  formatted?: string;
  summarized?: string;
  title?: string;
  embedding?: number[];
  extractedDates?: ActionableEntity[];
}

// Shared post-transcription LLM pipeline used by the Home and Record screens.
//
// CRITICAL: format, summarize, title and entity-extraction all run on the SINGLE
// shared llama.rn context, whose base completion() has no internal queue. Running
// any two of them concurrently (the old Promise.all) makes one decode corrupt or
// abort the other, and the swallowed .catch hides it. So every llama step here is
// awaited sequentially. Embedding uses a SEPARATE native context, so it is kicked
// off up front and awaited at the end to overlap with the llama work safely.
//
// Whole invocations are serialized too: enrichment runs in the background, so a
// user can start a second recording before the first one's enrichment finishes.
let enrichmentQueue: Promise<unknown> = Promise.resolve();

export function runEnrichment(opts: EnrichmentOptions): Promise<EnrichmentResult> {
  const run = enrichmentQueue.then(() => runEnrichmentNow(opts));
  // Keep the chain alive even when a run rejects.
  enrichmentQueue = run.catch(() => {});
  return run;
}

async function runEnrichmentNow(opts: EnrichmentOptions): Promise<EnrichmentResult> {
  const { rawText, modelPath, modelFile } = opts;
  const result: EnrichmentResult = {};

  if (opts.format) {
    opts.onStage?.('formatting');
    result.formatted = await formatTranscript(rawText, modelPath, modelFile, opts.onFormatPartial).catch(
      () => undefined
    );
    if (result.formatted) opts.onFormatted?.(result.formatted);
  }

  if (opts.summarize) {
    opts.onStage?.('summarizing');
    result.summarized = await summarizeTranscript(rawText, modelPath, modelFile, opts.onSummaryPartial).catch(
      () => undefined
    );
    if (result.summarized) opts.onSummarized?.(result.summarized);
  }

  // Memories run on rawText like format/summarize above - keeping the rawText
  // tasks adjacent maximizes the shared-prefix KV reuse in buildTaskPrompt.
  if (opts.memories) {
    await extractMemories(rawText, modelPath, modelFile).catch((e) => console.warn(e));
  }

  const textForAnalysis = result.formatted || rawText;

  if (opts.embedding || opts.entities || opts.title) {
    opts.onStage?.('analyzing');
  }

  // Embedding runs on its own context - overlap it with the sequential llama steps.
  const embeddingPromise = opts.embedding
    ? generateEmbedding(textForAnalysis).catch(() => null)
    : Promise.resolve(null);

  if (opts.entities) {
    // rawText, not textForAnalysis: a highlight works by finding the quote in
    // the transcript on screen, and the Raw tab is what opens by default.
    // Formatting rewords things, so quotes taken from it often aren't in raw.
    const dates = await extractActionableEntities(rawText, modelPath, modelFile).catch(
      () => [] as ActionableEntity[]
    );
    result.extractedDates = dates.length > 0 ? dates : undefined;
  }

  if (opts.title) {
    result.title = await generateTitle(textForAnalysis, modelPath, modelFile).catch(() => undefined);
  }

  const embedding = await embeddingPromise;
  if (embedding) result.embedding = embedding;

  return result;
}
