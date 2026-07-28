import * as FileSystemLegacy from 'expo-file-system/legacy';

/**
 * How many threads the engines should use.
 *
 * ggml synchronises every thread at each graph node, so a little core stalls
 * the big ones for the whole node: more threads than performance cores makes
 * inference SLOWER, not faster. This counts the cores running within 20% of the
 * fastest core's max frequency, which is what separates a big cluster from a
 * little one on every Android SoC we care about.
 *
 * Clamped to [2, 5]. Above five the synchronisation cost outweighs the extra
 * arithmetic on phone-class memory bandwidth, and two is the floor at which
 * anything is worth parallelising at all.
 *
 * Lives here rather than in WhisperEngine because llama needs the same answer:
 * it had a flat 4 hardcoded, which under-uses a Snapdragon big cluster.
 */
let cached: number | null = null;

export async function getOptimalThreads(): Promise<number> {
  if (cached !== null) return cached;

  let threads = 4;
  try {
    const possible = await FileSystemLegacy.readAsStringAsync('file:///sys/devices/system/cpu/possible');
    const m = possible.trim().match(/(\d+)-(\d+)/);
    const nCpu = m ? parseInt(m[2], 10) + 1 : 8;

    const freqs: number[] = [];
    for (let i = 0; i < Math.min(nCpu, 16); i++) {
      try {
        const f = await FileSystemLegacy.readAsStringAsync(
          `file:///sys/devices/system/cpu/cpu${i}/cpufreq/cpuinfo_max_freq`
        );
        const v = parseInt(f.trim(), 10);
        if (isFinite(v) && v > 0) freqs.push(v);
      } catch {}
    }

    if (freqs.length >= 2) {
      const max = Math.max(...freqs);
      const perfCores = freqs.filter((f) => f >= max * 0.8).length;
      threads = Math.max(2, Math.min(5, perfCores));
    }
  } catch {}

  cached = threads;
  return threads;
}
