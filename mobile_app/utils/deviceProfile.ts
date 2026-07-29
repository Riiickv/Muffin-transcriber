import * as FileSystemLegacy from 'expo-file-system/legacy';
import { getOptimalThreads } from './cpuThreads';

/**
 * Which CPU the engines actually got, and which build of them is running.
 *
 * Both whisper.rn and llama.rn ship several copies of their native library,
 * compiled for different ARM extensions, and pick one at load time from
 * /proc/cpuinfo. The fast ones use dotprod and i8mm - the instructions that
 * make quantized matmuls quick - and the fallback does not. That choice is the
 * single biggest factor in how fast a phone transcribes, and until now it was
 * invisible: a device that quietly loaded the plain build would just be "slow",
 * with no way to tell that from a slow model or a slow chip.
 *
 * So the speed report says which one it is. The same numbers mean different
 * things depending on the answer.
 *
 * Read from JS rather than added to the native side because the selection input
 * is a file, and cpuThreads.ts already proves these pseudo-files read fine
 * through expo-file-system. The logic below MIRRORS the Java in
 * RNWhisper.loadLibs / RNLlama.loadLibs, including the two spellings of each
 * feature: arm64 kernels write "fphp" and "asimddp" where the older names were
 * "fp16" and "dotprod". If either package changes its selection, this becomes
 * a plausible-looking lie, so it is reported as "would load", not "loaded".
 */

export type DeviceProfile = {
  threads: number;
  fp16: boolean;
  dotprod: boolean;
  i8mm: boolean;
  /** The whisper.rn build this CPU selects. */
  whisperLib: string;
  /** The llama.rn build this CPU selects, CPU-only variants. */
  llamaLib: string;
  /** False when /proc/cpuinfo could not be read; everything else is a guess. */
  known: boolean;
};

async function readCpuFeatures(): Promise<string> {
  try {
    const raw = await FileSystemLegacy.readAsStringAsync('file:///proc/cpuinfo');
    return raw
      .split('\n')
      .map((line) => line.toLowerCase())
      .filter((line) => line.startsWith('features') || line.startsWith('flags'))
      .map((line) => line.slice(line.indexOf(':') + 1).trim())
      .join(' ');
  } catch {
    return '';
  }
}

let cached: DeviceProfile | null = null;

export async function getDeviceProfile(): Promise<DeviceProfile> {
  if (cached) return cached;

  const features = await readCpuFeatures();
  const fp16 = features.includes('fp16') || features.includes('fphp');
  const dotprod = features.includes('dotprod') || features.includes('asimddp');
  const i8mm = features.includes('i8mm');

  // whisper.rn's ladder: fp16+dotprod+i8mm, then fp16+dotprod, then fp16, then
  // the plain v8 build.
  const whisperLib =
    fp16 && dotprod && i8mm
      ? 'v8fp16_dotprod_i8mm'
      : fp16 && dotprod
        ? 'v8fp16_dotprod'
        : fp16
          ? 'v8fp16_va_2'
          : 'v8';

  // llama.rn's ladder, minus the top rung: its fastest build also needs an
  // Adreno GPU and a Hexagon DSP, which are Snapdragon parts. Reporting that
  // rung would need a GPU probe, and its absence is not a fault - a Tensor
  // phone is meant to land on the CPU build below.
  const llamaLib =
    dotprod && i8mm
      ? 'v8_2_dotprod_i8mm'
      : dotprod
        ? 'v8_2_dotprod'
        : i8mm
          ? 'v8_2_i8mm'
          : 'v8_2';

  cached = {
    threads: await getOptimalThreads(),
    fp16,
    dotprod,
    i8mm,
    whisperLib,
    llamaLib,
    known: features.length > 0,
  };
  return cached;
}

/** One line for the top of the speed report. */
export function describeProfile(p: DeviceProfile): string {
  if (!p.known) {
    return `CPU: unreadable (threads ${p.threads}) - engine build unknown`;
  }
  const flags = [
    p.fp16 ? 'fp16' : null,
    p.dotprod ? 'dotprod' : null,
    p.i8mm ? 'i8mm' : null,
  ].filter(Boolean);
  const missing = !p.dotprod || !p.i8mm ? '  SLOW PATH' : '';
  return (
    `CPU: ${flags.length ? flags.join(' + ') : 'no accelerated int8'}, ${p.threads} threads${missing}\n` +
    `whisper: ${p.whisperLib}   llama: ${p.llamaLib}`
  );
}
