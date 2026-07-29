import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Wall-clock timings for the two things that make people wait: transcription
 * and the LLM.
 *
 * This exists because the performance plan set a gate - "measure, then decide
 * whether to invest further" - and the ARM kernel and audio_ctx work shipped
 * without ever passing it. There is no baseline, so nobody can say whether any
 * of it helped, and every further idea is an argument rather than a number.
 *
 * Deliberately tiny: no library, no upload, no identifiers. It writes to the
 * same AsyncStorage everything else uses, keeps the last few runs, and is read
 * back by Settings. Nothing leaves the phone, which is the whole point of this
 * app.
 */

const KEY = 'muffin.perf.runs';
const MAX_RUNS = 20;

/**
 * How long the model that is about to run took to load, or 0 if it was warm.
 *
 * Lives here rather than in LLMEngine because LLMEngine already imports this
 * module; putting it the other way round would make the two import each other,
 * and a cycle through Metro leaves one side holding an undefined function at
 * call time.
 */
let pendingLoadMs = 0;

export function noteModelLoad(ms: number): void {
  pendingLoadMs = ms;
}

/**
 * Reads the pending load and clears it, so exactly one run is marked cold.
 *
 * Whichever run finishes next claims it. The engines are serialized, so that is
 * the run that paid for it - but it is a diagnostic, not an accounting system,
 * and a mislabelled COLD is cheaper than plumbing the value through every call.
 */
function takePendingLoad(): number {
  const ms = pendingLoadMs;
  pendingLoadMs = 0;
  return ms;
}

export type PerfStage = {
  name: string;
  ms: number;
};

export type PerfRun = {
  at: string;
  /** 'transcribe' | 'improve' | 'summarize' | 'chat' */
  kind: string;
  /** The model that did the work, so runs are comparable. */
  model: string;
  /** Length of the audio in seconds, when there was audio. */
  audioSeconds?: number;
  /** Characters produced, a cheap stand-in for token count. */
  outputChars?: number;
  totalMs: number;
  stages: PerfStage[];
};

/**
 * Times a set of named stages for one user-visible operation.
 *
 * Usage is deliberately blunt - `const t = startRun('transcribe', model)`, then
 * `t.mark('load')` after each stage, then `await t.finish({...})` - because a
 * timing helper nobody can read at a glance is a timing helper nobody uses.
 */
export function startRun(kind: string, model: string) {
  const began = Date.now();
  let last = began;
  const stages: PerfStage[] = [];

  return {
    mark(name: string) {
      const now = Date.now();
      stages.push({ name, ms: now - last });
      last = now;
    },
    async finish(extra?: { audioSeconds?: number; outputChars?: number }) {
      const loadMs = takePendingLoad();
      if (loadMs > 0) stages.push({ name: 'COLD - model loaded this run', ms: loadMs });
      const run: PerfRun = {
        at: new Date().toISOString(),
        kind,
        model,
        totalMs: Date.now() - began,
        stages,
        ...extra,
      };
      await record(run);
      return run;
    },
  };
}

async function record(run: PerfRun): Promise<void> {
  try {
    const runs = await loadRuns();
    runs.unshift(run);
    await AsyncStorage.setItem(KEY, JSON.stringify(runs.slice(0, MAX_RUNS)));
  } catch {
    // A timing that cannot be stored must never break the thing it was timing.
  }
  // Outside the try above: the trimmed list and the running average are two
  // stores, and losing one is no reason to skip the other.
  await updateAverage(run);
}

export async function loadRuns(): Promise<PerfRun[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PerfRun[]) : [];
  } catch {
    return [];
  }
}

export async function clearRuns(): Promise<void> {
  try {
    // The averages go with them. Leaving them behind would make Clear a lie,
    // and would strand numbers nobody can see the runs behind any more.
    await AsyncStorage.multiRemove([KEY, AVG_KEY]);
  } catch {
    // Nothing to do; the next write trims the list anyway.
  }
}

/**
 * The runs as text, for reading in a dialog or pasting into a message.
 *
 * Realtime factor is the number that actually matters for transcription: how
 * many seconds of audio get done per second of waiting. A 2-hour lecture at
 * 4x is half an hour; at 0.8x it is longer than the lecture.
 */
export function formatRuns(runs: PerfRun[]): string {
  if (runs.length === 0) return 'No runs recorded yet.';

  return runs
    .map((r) => {
      const head = `${r.at.slice(0, 19).replace('T', ' ')}  ${r.kind}  ${r.model}`;
      const total = `total ${(r.totalMs / 1000).toFixed(1)}s`;
      const rtf =
        r.audioSeconds && r.audioSeconds > 0
          ? `  ${(r.audioSeconds / (r.totalMs / 1000)).toFixed(2)}x realtime  (${r.audioSeconds.toFixed(0)}s audio)`
          : '';
      const rate =
        r.outputChars && r.totalMs > 0
          ? `  ${Math.round((r.outputChars / r.totalMs) * 1000)} chars/s`
          : '';
      const parts = r.stages.map((s) => `${s.name} ${(s.ms / 1000).toFixed(1)}s`).join(', ');
      return `${head}\n  ${total}${rtf}${rate}\n  ${parts}`;
    })
    .join('\n\n');
}

/**
 * A model's running average, and how many runs it is made of.
 *
 * Separate from the run list on purpose. That list is capped at MAX_RUNS so the
 * Speed report stays readable, which meant an average taken from it silently
 * FORGOT: twenty transcriptions with one model would push another model's runs
 * off the end and its measured time would revert to a guess. This accumulates
 * instead, so the number gets better every single time the model is used and
 * never gets worse for having used a different one.
 */
export type ModelAverage = {
  /** Seconds - per recording for transcription, per minute for the LLM. */
  mean: number;
  /** How many runs are in it. Shown as confidence, and used to weight the mean. */
  runs: number;
};

const AVG_KEY = 'muffin.perf.modelAvg';

/**
 * What one run contributes, or null when it should not count.
 *
 * A cold run paid for a model load the next one will not, so folding it in would
 * pull the average toward a cost most runs never pay.
 */
function contributionOf(run: PerfRun): number | null {
  if (run.stages.some((s) => s.name.startsWith('COLD'))) return null;
  if (run.totalMs <= 0) return null;
  if (run.kind === 'transcribe') return run.totalMs / 1000;

  // LLM runs are quoted per minute of transcript, since their cost scales with
  // length where transcription's does not. outputChars is the only length kept;
  // ~14 characters a second of speech, from the session these are calibrated on.
  const minutes = (run.outputChars ?? 0) / 14 / 60;
  if (minutes < 0.15) return null; // too short to divide by safely
  return run.totalMs / 1000 / minutes;
}

/** Folds one finished run into its model's average. */
async function updateAverage(run: PerfRun): Promise<void> {
  const seconds = contributionOf(run);
  if (seconds === null) return;
  try {
    const all = await loadModelAverages();
    const prev = all[run.model];
    // An incremental mean, so nothing has to be stored per run: the new average
    // is the old one moved a fraction of the way toward this measurement.
    all[run.model] = prev
      ? { runs: prev.runs + 1, mean: prev.mean + (seconds - prev.mean) / (prev.runs + 1) }
      : { runs: 1, mean: seconds };
    await AsyncStorage.setItem(AVG_KEY, JSON.stringify(all));
  } catch {
    // A timing that cannot be stored must never break the thing it was timing.
  }
}

export async function loadModelAverages(): Promise<Record<string, ModelAverage>> {
  try {
    const raw = await AsyncStorage.getItem(AVG_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ModelAverage>) : {};
  } catch {
    return {};
  }
}

/** Just the means, which is what the Models screen asks for. */
export async function averageSecondsByModel(): Promise<Record<string, number>> {
  const all = await loadModelAverages();
  const out: Record<string, number> = {};
  for (const [model, avg] of Object.entries(all)) {
    if (avg && avg.runs > 0 && avg.mean > 0) out[model] = avg.mean;
  }
  return out;
}

/**
 * llama.rn reports its own timings, which are better than anything measured
 * from JS: it separates PREFILL (reading the prompt) from GENERATION (writing
 * the answer), and reports cache_n - the tokens it skipped because they matched
 * the previous prompt's prefix.
 *
 * That last number is the only direct evidence that the prompt layout in
 * buildTaskPrompt is doing its job. If cache_n is near zero on a second run,
 * the shared preamble is not being reused and the ordering is wrong.
 */
export async function recordLlm(
  kind: string,
  model: string,
  timings: any,
  outputChars?: number,
): Promise<void> {
  if (!timings) return;
  const promptMs = Number(timings.prompt_ms) || 0;
  const predictedMs = Number(timings.predicted_ms) || 0;

  const stages: PerfStage[] = [
    { name: `prefill ${Math.round(Number(timings.prompt_per_second) || 0)} tok/s (${timings.prompt_n || 0} tok)`, ms: promptMs },
    { name: `generate ${Math.round(Number(timings.predicted_per_second) || 0)} tok/s (${timings.predicted_n || 0} tok)`, ms: predictedMs },
  ];
  if (timings.cache_n) {
    stages.push({ name: `${timings.cache_n} tok reused from cache`, ms: 0 });
  }
  // A cold run and a warm one are not the same measurement. Loading is mmap, so
  // the weights page in from flash during prefill rather than before it, and a
  // cold prefill measured a quarter of the speed of the warm one right after.
  // Marked, so nobody averages the two together and tunes against the mean.
  const loadMs = takePendingLoad();
  if (loadMs > 0) {
    stages.push({ name: 'COLD - model loaded this run', ms: loadMs });
  }

  await record({
    at: new Date().toISOString(),
    kind,
    model,
    totalMs: promptMs + predictedMs,
    stages,
    outputChars,
  });
}
