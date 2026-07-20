import { useSyncExternalStore } from 'react';

import type { ProgressReading } from './transcribeProgress';

export type AiJobKind = 'transcribe' | 'retranscribe' | 'format' | 'summarize';

export type AiJob = {
  kind: AiJobKind;
  /** Human name of the action, for the "starting X will stop Y" prompt. */
  label: string;
  /** History item this belongs to, so a screen knows if the job is its own. */
  itemId?: string;
  /** Output so far. Empty while the model is still loading. */
  partial: string;
  /** Whisper only; the LLM reports no percentage. */
  progress: ProgressReading | null;
};

/**
 * The one AI job running, app-wide.
 *
 * Everything about the job lives here, not just its name, because the screens
 * that display it are transient. History kept `isProcessing`, the partial text
 * and the progress in component state, so leaving mid-run and returning showed
 * idle buttons and no output - the work carried on invisibly. That was most
 * obvious while a model was still LOADING, when there is no text yet to hint
 * anything is happening.
 *
 * The engines are serialized (queueLlama, whisperQueue), so one job at a time
 * is the truth rather than a simplification.
 */
let job: AiJob | null = null;
/** Identifies a run, so a finishing job can only ever end ITSELF. */
let token = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function startAiJob(next: Omit<AiJob, 'partial' | 'progress'>): number {
  job = { ...next, partial: '', progress: null };
  emit();
  return ++token;
}

/** Merge in new output/progress. No-op once the job has ended. */
export function updateAiJob(patch: Partial<Pick<AiJob, 'partial' | 'progress'>>): void {
  if (!job) return;
  job = { ...job, ...patch };
  emit();
}

/**
 * Ends the job. Pass the token from startAiJob: handlers release the UI as
 * soon as their visible result exists AND again in a finally, so without the
 * check the second call could clear a job someone else had since started.
 */
export function endAiJob(forToken?: number): void {
  if (!job) return;
  if (forToken !== undefined && forToken !== token) return;
  job = null;
  emit();
}

export function getAiJob(): AiJob | null {
  return job;
}

/** Re-renders when the running job changes. */
export function useAiJob(): AiJob | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getAiJob,
    getAiJob
  );
}
