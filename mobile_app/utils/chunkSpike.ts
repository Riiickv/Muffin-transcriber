import { Platform } from 'react-native';
import { getOptimalThreads } from './cpuThreads';

/**
 * THROWAWAY. Delete this file once it has answered its question.
 *
 * The question: does splitting one audio file across SEVERAL whisper contexts
 * running at once beat handing the whole file to one context?
 *
 * Why it might. cpuThreads.ts already establishes that ggml synchronises every
 * thread at each graph node, which is why more threads than performance cores
 * makes inference slower rather than faster. Separate contexts do not
 * synchronise with each other at all, so N contexts of T threads should pay
 * less of that tax than one context of N*T threads.
 *
 * Why it might not, and this is the whole reason to measure rather than build:
 * whisper on a phone may be memory-BANDWIDTH bound rather than compute bound.
 * If it is, N contexts push N times the weight traffic through one bus, the
 * arithmetic units wait either way, and the extra RAM buys nothing. Nothing in
 * this codebase or the library docs says which regime a Tensor G4 is in. An
 * hour here decides whether a week of chunking work is worth starting.
 *
 * Three numbers that have to be read together:
 *   whole        one context, whole file. The baseline.
 *   sequential   one context, same file in N slices via offset/duration.
 *                Isolates what slicing ALONE costs: whisper conditions each
 *                segment on the previous one and a boundary throws that away,
 *                so this should be slightly WORSE than whole. If it is much
 *                worse, boundaries are expensive and chunking is in trouble
 *                before parallelism even enters the picture.
 *   parallel     N contexts, N slices at once. The one that matters.
 *
 * Threads are DIVIDED between the parallel contexts, not handed to each, so
 * the comparison is honest: one core budget, arranged two ways. Giving every
 * context the full count would oversubscribe the cores and measure something
 * nobody would ship.
 */

export type SpikeRun = {
  label: string;
  wallMs: number;
  loadMs: number;
  threadsPerContext: number;
  contexts: number;
  text: string;
};

export type SpikeResult = {
  audioSeconds: number;
  optimalThreads: number;
  runs: SpikeRun[];
  error?: string;
};

function initWhisper() {
  return require('whisper.rn').initWhisper as (o: { filePath: string }) => Promise<any>;
}

async function loadContext(modelPath: string): Promise<{ ctx: any; loadMs: number }> {
  const t0 = Date.now();
  const ctx = await initWhisper()({ filePath: modelPath });
  return { ctx, loadMs: Date.now() - t0 };
}

/** Shared decoding options, so the only variable between runs is the shape. */
function opts(threads: number, language: string, extra?: Record<string, unknown>) {
  return {
    language: language || 'auto',
    translate: false,
    beamSize: 1,
    bestOf: 1,
    maxThreads: threads,
    ...extra,
  };
}

/**
 * @param audioPath  a real recording, not a synthetic tone. Boundary quality
 *                   only means anything on real speech.
 * @param modelPath  use a SMALL model. Three copies of large-v3-turbo is about
 *                   2.5GB of native memory, which is how you freeze a phone.
 * @param chunks     2 or 3. Beyond that every slice is shorter than whisper's
 *                   own 30s window and the measurement stops meaning anything.
 */
export async function runChunkSpike(
  audioPath: string,
  modelPath: string,
  chunks: number = 2,
  language: string = 'auto',
): Promise<SpikeResult> {
  if (Platform.OS === 'web') {
    return { audioSeconds: 0, optimalThreads: 0, runs: [], error: 'not on web' };
  }

  const optimalThreads = await getOptimalThreads();
  const perContext = Math.max(1, Math.floor(optimalThreads / chunks));
  const runs: SpikeRun[] = [];
  let audioSeconds = 0;

  try {
    // ---- 1. whole file, one context --------------------------------------
    {
      const { ctx, loadMs } = await loadContext(modelPath);
      const t0 = Date.now();
      const { promise } = ctx.transcribe(audioPath, opts(optimalThreads, language));
      const res = await promise;
      const wallMs = Date.now() - t0;
      // t1 is centiseconds, as endOfLastSegment in WhisperEngine notes.
      const last = res.segments?.[res.segments.length - 1];
      audioSeconds = last ? last.t1 / 100 : 0;
      runs.push({
        label: 'whole',
        wallMs,
        loadMs,
        threadsPerContext: optimalThreads,
        contexts: 1,
        text: res.result || '',
      });
      await ctx.release();
    }

    if (audioSeconds <= 0) {
      return {
        audioSeconds,
        optimalThreads,
        runs,
        error: 'no segments, could not measure audio length',
      };
    }

    const sliceMs = Math.floor((audioSeconds * 1000) / chunks);
    const slices = Array.from({ length: chunks }, (_, i) => ({
      offset: i * sliceMs,
      duration: i === chunks - 1 ? Math.ceil(audioSeconds * 1000) - i * sliceMs : sliceMs,
    }));

    // ---- 2. the same slices, one context, one after another ---------------
    {
      const { ctx, loadMs } = await loadContext(modelPath);
      const t0 = Date.now();
      const parts: string[] = [];
      for (const s of slices) {
        const { promise } = ctx.transcribe(audioPath, opts(optimalThreads, language, s));
        const r = await promise;
        parts.push(((r.result || '') as string).trim());
      }
      runs.push({
        label: 'sequential x' + chunks,
        wallMs: Date.now() - t0,
        loadMs,
        threadsPerContext: optimalThreads,
        contexts: 1,
        text: parts.join(' '),
      });
      await ctx.release();
    }

    // ---- 3. the one that matters: N contexts, all at once ------------------
    {
      const t0load = Date.now();
      const ctxs = await Promise.all(slices.map(() => loadContext(modelPath)));
      const loadMs = Date.now() - t0load;
      const t0 = Date.now();
      const parts = await Promise.all(
        slices.map((s, i) => {
          const { promise } = ctxs[i].ctx.transcribe(audioPath, opts(perContext, language, s));
          return promise.then((r: any) => ((r.result || '') as string).trim());
        }),
      );
      runs.push({
        label: 'parallel x' + chunks,
        wallMs: Date.now() - t0,
        loadMs,
        threadsPerContext: perContext,
        contexts: chunks,
        text: parts.join(' '),
      });
      await Promise.all(ctxs.map((c) => c.ctx.release()));
    }
  } catch (e: any) {
    return { audioSeconds, optimalThreads, runs, error: String(e?.message || e) };
  }

  return { audioSeconds, optimalThreads, runs };
}

/** Columns, because this is numbers to compare, not prose. */
export function formatSpike(r: SpikeResult): string {
  if (r.error && r.runs.length === 0) return 'spike failed: ' + r.error;
  const base = r.runs.find((x) => x.label === 'whole')?.wallMs ?? 0;
  const lines: string[] = [
    'audio ' + r.audioSeconds.toFixed(1) + 's   threads ' + r.optimalThreads,
    '',
    'shape            infer    load   xRT   vs whole',
  ];
  for (const run of r.runs) {
    const rt = r.audioSeconds > 0 ? r.audioSeconds / (run.wallMs / 1000) : 0;
    const vs = base > 0 ? (base / run.wallMs).toFixed(2) + 'x' : '-';
    lines.push(
      run.label.padEnd(16) +
        (run.wallMs / 1000).toFixed(1).padStart(5) +
        's ' +
        (run.loadMs / 1000).toFixed(1).padStart(6) +
        's ' +
        rt.toFixed(2).padStart(5) +
        ' ' +
        vs.padStart(9),
    );
  }
  if (r.error) lines.push('', 'stopped early: ' + r.error);
  lines.push('', '-- text, to check the slice boundaries --');
  for (const run of r.runs) lines.push('', '[' + run.label + '] ' + run.text.slice(0, 400));
  return lines.join('\n');
}
