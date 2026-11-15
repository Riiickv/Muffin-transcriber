import { Platform } from 'react-native';
import { getOptimalThreads } from './cpuThreads';
import { parseWav } from './wavHeader';
import { readAudioInfo, describeAudio } from './audioInfo';
import { startRun, noteModelLoad } from './perfLog';
import { findQuietCut, nextRead, describePieces } from './pauseCut';

/**
 * NVIDIA Parakeet TDT 0.6B v3, through the same native library as Whisper
 * (whisper.rn 0.7 added it). This is the "Fast" speech model. The reasoning,
 * the PC numbers and the phone run that promoted it are in
 * docs/speed-research.md.
 *
 * What it cannot do, so nobody wires these by reflex: it has no language
 * option (it detects on its own, 25 European languages), no prompt (so
 * "context learning" does not reach it), and the library reports no progress
 * and no partial text for it. Progress and partial text here come from feeding
 * it the recording in pieces.
 *
 * WhisperEngine owns the routing, the queue and the public surface. Nothing
 * else should import this file.
 */

type PieceSegment = { t0: number; t1: number; text: string };

let context: any = null;
let currentPath = '';
let loading: Promise<void> | null = null;

/** Set while a piece is decoding. */
let stopPiece: (() => Promise<void>) | null = null;
/** Bumped by a stop, so the loop between pieces notices too. */
let stopTicket = 0;

function getFileClass(): any {
  try {
    return require('expo-file-system').File;
  } catch {
    return null;
  }
}

export function isParakeetLoaded(modelPath?: string): boolean {
  return !!context && (modelPath === undefined || currentPath === modelPath);
}

export function isParakeetLoading(): boolean {
  return !!loading;
}

/** Resolves once no load is in flight, whether it worked or not. */
export async function whenParakeetSettled(): Promise<void> {
  while (loading) {
    try {
      await loading;
    } catch {
      // Its failure belongs to whoever started it.
    }
  }
}

export async function loadParakeet(modelPath: string): Promise<void> {
  if (context && currentPath === modelPath) return;
  while (loading) {
    try {
      await loading;
    } catch {
      // Someone else's failed load is not this caller's failure.
    }
    if (context && currentPath === modelPath) return;
  }
  if (Platform.OS === 'web') throw new Error('Parakeet is not available on web');

  const started = Date.now();
  const p = (async () => {
    if (context) await unloadParakeet();
    const { initParakeet } = require('whisper.rn');
    // CPU, stated rather than left to the default: the PC measurement this
    // test is checking against was CPU only, and a GPU path that half works on
    // one phone would make the two numbers incomparable.
    context = await initParakeet({ filePath: modelPath, useGpu: false });
    currentPath = modelPath;
    noteModelLoad(Date.now() - started);
  })();
  loading = p;
  try {
    await p;
  } finally {
    if (loading === p) loading = null;
  }
}

export async function unloadParakeet(): Promise<void> {
  if (!context) return;
  try {
    await context.release();
  } catch (e) {
    console.warn('Error releasing parakeet context:', e);
  }
  context = null;
  currentPath = '';
}

export async function stopParakeetWork(): Promise<void> {
  stopTicket++;
  try {
    await stopPiece?.();
  } catch (e) {
    console.warn('Could not stop the transcription:', e);
  }
}

function joinText(parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Transcribe a 16 kHz mono 16-bit WAV, in pieces cut at pauses.
 *
 * The file is read a piece at a time, so a two hour lecture holds about a
 * megabyte in memory rather than a quarter of a gigabyte. Anything that is not
 * the format the app converts to is handed to the library whole, which is
 * slower on long audio but still correct.
 */
export async function transcribeWithParakeet(
  audioPath: string,
  callbacks?: { onProgress?: (p: number) => void; onPartialText?: (text: string) => void },
): Promise<{ text: string; segments: PieceSegment[]; language?: string }> {
  if (!context) throw new Error('Parakeet not loaded. Call loadWhisper first.');

  const modelFile = currentPath.split('/').pop() || 'parakeet';
  const perf = startRun('transcribe', modelFile);
  const ticket = stopTicket;
  const maxThreads = await getOptimalThreads();
  const audio = await readAudioInfo(audioPath);
  perf.mark('probe');

  const texts: string[] = [];
  // Times are in 10 ms units like Whisper's (read in whisper.rn's parakeet.cpp:
  // mel frames at a hop of 160 samples). The library returns ONE segment per
  // call, from 0 to the end of the piece, so a segment here is a whole piece of
  // 20 to 30 s, not a sentence.
  const segments: PieceSegment[] = [];
  const pieceMs: number[] = [];
  let how = 'cut at pauses';

  const run = async (start: () => { promise: Promise<any>; stop: () => Promise<void> }, offsetCs: number) => {
    const t0 = Date.now();
    const { promise, stop } = start();
    stopPiece = stop;
    const result = await promise;
    pieceMs.push(Date.now() - t0);
    if (result?.isAborted) return false;
    texts.push(result?.result || '');
    for (const s of result?.segments || []) {
      segments.push({ t0: s.t0 + offsetCs, t1: s.t1 + offsetCs, text: s.text });
    }
    return true;
  };

  try {
    let handle: any = null;
    let wav: ReturnType<typeof parseWav> = null;
    try {
      const FileClass = getFileClass();
      if (FileClass) {
        const file = new FileClass(audioPath);
        const size = file.size ?? 0;
        if (size > 44) {
          handle = file.open();
          wav = parseWav(handle.readBytes(Math.min(64 * 1024, size)), size);
        }
      }
    } catch {
      wav = null;
    }

    if (handle && wav && wav.sampleRate === 16000 && wav.channels === 1) {
      const totalSamples = Math.floor(wav.dataLength / 2);
      let done = 0;
      try {
        while (done < totalSamples && stopTicket === ticket) {
          const { samples, whole } = nextRead(totalSamples - done, wav.sampleRate);
          handle.offset = wav.dataOffset + done * 2;
          const bytes: Uint8Array = handle.readBytes(samples * 2);
          const got = bytes.byteLength >> 1;
          if (got === 0) break;
          // A copy, so the Int16 view starts on an even byte whatever the
          // native side handed back, and so the piece owns its own buffer.
          const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + got * 2) as ArrayBuffer;
          const take = whole || got < samples ? got : findQuietCut(new Int16Array(buffer), wav.sampleRate);
          const piece = take === got ? buffer : buffer.slice(0, take * 2);
          const ok = await run(
            () => context.transcribeData(piece, { maxThreads }),
            Math.round((done / wav.sampleRate) * 100),
          );
          if (!ok) break;
          done += take;
          callbacks?.onProgress?.(Math.min(100, Math.round((done / totalSamples) * 100)));
          callbacks?.onPartialText?.(joinText(texts));
        }
      } finally {
        try {
          handle.close();
        } catch {
          // Already closed, or never really open. Nothing to release.
        }
      }
    } else {
      try {
        handle?.close();
      } catch {
        // As above.
      }
      how = 'whole file, not the expected 16 kHz mono WAV';
      await run(() => context.transcribe(audioPath, { maxThreads }), 0);
      callbacks?.onProgress?.(100);
    }

    const text = joinText(texts);
    perf.mark('transcribe');
    void perf.finish({
      audioSeconds: audio?.durationSeconds,
      outputChars: text.length,
      audioFormat: describeAudio(audio),
      notes: ['parakeet', how, describePieces(pieceMs), `${maxThreads} threads`].join(', '),
    });
    return { text, segments };
  } finally {
    stopPiece = null;
    perf.discard();
  }
}
