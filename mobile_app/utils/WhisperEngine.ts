import { Platform } from 'react-native';
import type { WhisperContext } from 'whisper.rn';
import { loadSettings } from './settingsStore';
import { loadMemories } from './memoryStore';
import { createSegmentAccumulator } from './segmentAccumulator';
import { getOptimalThreads } from './cpuThreads';
import { ensureVadModel } from './speechTrim';
import { readAudioInfo, describeAudio } from './audioInfo';
import { startRun, noteModelLoad } from './perfLog';

export { createSegmentAccumulator };



let initWhisper: any;
function getInitWhisper() {
  if (!initWhisper && Platform.OS !== 'web') {
    initWhisper = require('whisper.rn').initWhisper;
  }
  return initWhisper;
}

export interface Segment {
  t0: number; // Start time in 10ms ticks (or frames depending on the wrapper)
  t1: number; // End time
  text: string;
}

let whisperContext: WhisperContext | null = null;
let currentModelPath = '';
let loadPromise: Promise<void> | null = null;

export async function loadWhisper(modelPath: string): Promise<void> {
  if (whisperContext && currentModelPath === modelPath) {
    return;
  }

  // Coalesce concurrent loads (same pattern as LLMEngine): two init() calls
  // while the context is still null orphan the first native context.
  while (loadPromise) {
    try {
      await loadPromise;
    } catch {
      // A failed background preload (partial download, corrupt file) must not
      // doom this attempt - fall through and try our own load.
    }
    if (whisperContext && currentModelPath === modelPath) return;
  }

  const startedLoading = Date.now();
  const p = (async () => {
    if (whisperContext) await unloadWhisper();
    const init = getInitWhisper();
    // No flash attention: whisper.rn recommends it only when a GPU backend is
    // available (iOS). On Android's CPU path it slows decoding down.
    whisperContext = await init({ filePath: modelPath });
    currentModelPath = modelPath;
    // Timed for the same reason llama's load is: every clip in the first real
    // report cost ~33s no matter how short it was, and the two candidates for
    // that - paying for an 874 MB model again, or the encoder always chewing a
    // padded 30s window - are told apart by whether this number is big.
    noteModelLoad(Date.now() - startedLoading);
  })();
  loadPromise = p;

  try {
    await p;
  } catch (error) {
    console.error('Failed to load whisper model:', error);
    throw error;
  } finally {
    if (loadPromise === p) loadPromise = null;
  }
}

// Cold-start warm-up: kick off the (multi-second) model load while the user is
// still looking at the screen, so tapping Transcribe doesn't pay it. Only when
// nothing is loaded or loading - never swaps a live context out from under a
// running transcription.
/**
 * Is this exact model already resident?
 *
 * Needed because swapping models is not cheap: loadWhisper unloads whatever is
 * there first, so asking for a small model while a large one is warm throws the
 * large one away and pays for it twice. Anything that might swap should check.
 */
export function isWhisperLoaded(modelPath: string): boolean {
  return !!whisperContext && currentModelPath === modelPath;
}

export function preloadWhisper(modelPath: string): void {
  if (whisperContext || loadPromise) return;
  loadWhisper(modelPath).catch(() => {});
}

/**
 * @param audioPath  Absolute path to a 16 kHz mono WAV/PCM file.
 * @param languageCode  ISO 639-1 code (`en`, `it`, ...) or `auto` for detect.
 *                      Do NOT pass display names like "Italian" - call
 *                      `toLanguageCode()` from utils/languages.ts first.
 */
/** Set while a transcription is decoding, so it can be interrupted. */
let stopCurrentTranscription: (() => Promise<void>) | null = null;

/**
 * Abort the transcription in flight, if any. The context stays loaded, so a
 * new one can start straight away.
 */
export async function stopWhisperWork(): Promise<void> {
  try {
    await stopCurrentTranscription?.();
  } catch (e) {
    console.warn('Could not stop the transcription:', e);
  }
}

/** Serializes work on the single shared whisper context. */
let whisperChain: Promise<unknown> = Promise.resolve();
function whisperQueue<T>(job: () => Promise<T>): Promise<T> {
  const run = whisperChain.then(job);
  whisperChain = run.catch(() => {});
  return run;
}

export type TranscribeCallbacks = {
  /** 0-100, straight from whisper. Fires many times a second, so throttle in the UI. */
  onProgress?: (progress: number) => void;
  /**
   * The transcript so far, growing as whisper finishes each window of audio.
   *
   * This is why we don't split long recordings into one-minute files: whisper
   * already works through the audio in windows and hands back each one as it
   * lands, so the text can stream out with the audio left whole. Cutting a
   * 10-minute lecture into 10 files would slice ~9 boundaries mid-word and
   * throw away the context across each join, for the same visible result.
   */
  onPartialText?: (text: string) => void;
};

/**
 * How long the audio was, from where whisper says the last segment ended.
 *
 * Costs nothing - the segments are already in hand - and it is the length
 * whisper actually processed, which is the right denominator for a realtime
 * factor. Centiseconds, per whisper.cpp's convention for segment times.
 */
function endOfLastSegment(segments?: Array<{ t1: number }>): number | undefined {
  const last = segments?.[segments.length - 1];
  const t1 = Number(last?.t1);
  return Number.isFinite(t1) && t1 > 0 ? t1 / 100 : undefined;
}

/**
 * What whisper's own VAD decided, captured from its native log.
 *
 * The report can say "silence trimmed by whisper" but not how much was trimmed,
 * and without that number the interesting question is unanswerable: Tiny got
 * SLOWER once VAD started working (9.1s untrimmed against 17.7s and 45.0s
 * trimmed), which should be impossible if trimming removes work. Either VAD is
 * keeping nearly everything, or it is inflating the audio, or the difference is
 * something else entirely and VAD is innocent. Guessing between those is how
 * this session already lost a build.
 *
 * whisper.cpp prints both numbers at INFO (whisper.cpp:6683 and :6708) and the
 * macro is compiled in, so nothing needs patching. whisper.rn just has to be
 * asked to forward them.
 */
let vadKeptSeconds: number | null = null;
let vadSegmentCount: number | null = null;
let nativeLogArmed = false;

function armNativeLog(): void {
  if (nativeLogArmed) return;
  nativeLogArmed = true;
  try {
    const w = require('whisper.rn');
    void w.toggleNativeLog(true);
    w.addNativeLogListener((_level: string, text: string) => {
      // Cheap on purpose: this sees every native log line, including the noisy
      // ones during a model load, so it must do almost nothing for a non-match.
      if (typeof text !== 'string' || text.indexOf('speech segments') < 0) return;
      const kept = /total duration of speech segments:\s*([\d.]+)/.exec(text);
      if (kept) vadKeptSeconds = parseFloat(kept[1]);
      const count = /detected (\d+) speech segments/.exec(text);
      if (count) vadSegmentCount = parseInt(count[1], 10);
    });
  } catch {
    // Diagnostics are never worth failing a transcription over.
  }
}

/** The one phrase describing what happened to the silence, for the report. */
function vadNote(usedVad: boolean, reading: string, failure: string): string {
  if (usedVad) {
    return reading ? `silence trimmed by whisper: ${reading}` : 'silence trimmed by whisper';
  }
  return failure || 'no silence trim, Silero not downloaded yet';
}

/** Reads and clears, so one run's numbers can never be reported by the next. */
function takeVadReading(): string {
  const kept = vadKeptSeconds;
  const count = vadSegmentCount;
  vadKeptSeconds = null;
  vadSegmentCount = null;
  if (kept === null && count === null) return '';
  const parts: string[] = [];
  if (kept !== null) parts.push(`${kept.toFixed(1)}s of speech kept`);
  if (count !== null) parts.push(`${count} speech spans`);
  return parts.join(' in ');
}

export async function transcribeFile(
  audioPath: string,
  languageCode: string = 'auto',
  callbacks?: TranscribeCallbacks
): Promise<{ text: string; segments: Segment[]; language?: string }> {
  if (!whisperContext) {
    throw new Error('Whisper not loaded. Call loadWhisper first.');
  }

  const settings = await loadSettings();

  // Whisper's encoder always processes a full 30s window (1500 frames), so a
  // 10s voice note spends two thirds of the encode on padding. Shrinking the
  // context for short clips was worth roughly 3x on those, and the code that
  // did it is still patched into whisper.rn.
  //
  // DISABLED. Shrinking it broke the output in two ways that both read as the
  // app being broken rather than fast: an Italian recording came back as
  // French, and clips ended in a sentence repeated four times over. Whisper's
  // encoder was trained at the full 1500-frame context and its language
  // detection reads that same encoder output, so a truncated context degrades
  // the representation everything downstream depends on.
  //
  // Re-enabling this needs measured evidence per model tier, not a proportional
  // formula: Tiny has the least headroom to lose and is exactly where it showed.
  const audioCtx = 0; // 0 = whisper default (1500)

  let initialPrompt = undefined;
  if (settings.enableContextLearning) {
    const memories = await loadMemories();
    if (memories.length > 0) {
      // The prompt is re-processed for EVERY ~30s audio window, so an unbounded
      // memory list slows the whole transcription. Cap it to the most recent
      // entries and ~400 chars.
      const memoryText = memories.slice(0, 15).map(m => m.text).join(', ').slice(0, 400);
      initialPrompt = `The following transcript contains these specific terms: ${memoryText}.`;
    }
  }

  const handleNewSegments = createSegmentAccumulator((text) => callbacks?.onPartialText?.(text));

  const options: any = {
    // Must be the literal string 'auto' - NOT undefined. whisper.rn's
    // docstring claims undefined means auto-detect, but the implementation
    // only assigns params.language when the JS value is a non-empty string:
    //     config.language = getStringProperty(runtime, options, "language");
    //     if (!config.language.empty()) { config.params.language = ...; }
    // (cpp/jsi/RNWhisperJSI.cpp). With `undefined` that assignment is skipped,
    // so whisper.cpp keeps its own default of "en" (`/*.language =*/ "en"`),
    // and auto-detect never runs - every recording was transcribed AS ENGLISH,
    // whatever was actually spoken. whisper.cpp only detects when language is
    // null, "" or "auto".
    language: languageCode || 'auto',
    // Keep transcription in the source language (don't translate to English).
    translate: false,
    // NOT greedy, whatever this comment used to claim. whisper.rn switches the
    // strategy to WHISPER_SAMPLING_BEAM_SEARCH whenever beamSize is above zero
    // (cpp/jsi/RNWhisperJSI.cpp:762-765), so beamSize 1 is a beam search with a
    // beam of one. That is near enough to greedy in what it PRODUCES, and it is
    // left alone because changing it changes decoding on every recording and
    // there is no device here to check it on. It is written down because the
    // old comment would have misled the next person measuring this.
    //
    // DO NOT separate these two lines. Under beam search, whisper.cpp resets
    // the decoder count to greedy.best_of for every temperature-fallback retry
    // past the first (whisper.cpp:7057-7062), and best_of defaults to 5. Drop
    // bestOf on its own, thinking it is a greedy-only knob, and each retry
    // quietly becomes five parallel decoders.
    beamSize: 1,
    bestOf: 1,
    // Temperature fallback stays at whisper.cpp's default. Turning it off
    // (temperatureInc 0) was a real speed win and an unusable one: the retry
    // is what CATCHES a degenerate decode, so without it Tiny returned
    // "bieno 150 deha" twice over with Japanese characters in the middle of a
    // French clip. Repetition and language-mixing are exactly the failure the
    // compression and logprob thresholds are checking for. Do not disable it
    // again; if the retries need to be cheaper, raise the increment so there
    // are three attempts instead of six rather than removing the recovery.
    // Match thread count to the device's performance cores.
    maxThreads: await getOptimalThreads(),
    // Shrunken encoder context for short clips (0 = default 1500).
    ...(audioCtx > 0 ? { audioCtx } : null),
    // Bias Whisper toward user-taught vocabulary; undefined when empty so we
    // don't prime the decoder with an empty string.
    prompt: initialPrompt,
    ...(callbacks?.onProgress ? { onProgress: callbacks.onProgress } : null),
    ...(callbacks?.onPartialText ? { onNewSegments: handleNewSegments } : null),
  };

  // Serialized on the ONE shared whisper context, for the same reason the llama
  // steps are: two transcriptions decoding at once corrupt each other. There is
  // no queue in whisper.rn, and the call sites are easy to miss - Re-transcribe
  // on a history entry, an imported file, and the recorder all land here - so
  // the guard lives at the engine where nothing can route around it.
  // Cut the silence out, but let WHISPER do it.
  //
  // Silence is worth removing twice over: whisper spends as long on a silent
  // 30s window as a full one, and silence is where it hallucinates, because
  // with nothing to transcribe it emits whatever its language model likes.
  //
  // This used to be done in JS, and the cost of doing it there was absurd. The
  // file was read off disk by detectSpeech in C++, read a SECOND time in JS as
  // base64, decoded character by character into bytes, cut, re-encoded to
  // base64, written back out as a new WAV, and then read a THIRD time by
  // transcribe. Around 30 MB of transient allocation crossed the Hermes heap
  // per recording, and the whole thing showed up as a flat 3 to 5 seconds on
  // every single run: on the Fastest model that was more than half the wait.
  //
  // whisper.cpp has always been able to do this itself. whisper_full_params
  // carries `vad`, `vad_model_path` and `vad_params` (whisper.h:588-591), and
  // whisper_full acts on them (whisper.cpp:7769) against the samples already in
  // memory. whisper.rn simply never read those fields, so the binding is
  // patched to pass them through. As a bonus it fixes a real defect: whisper
  // builds a mapping table so segment timestamps still point at the ORIGINAL
  // recording, where the JS trim silently shifted every timestamp by however
  // much silence it had cut out.
  //
  // The tuning below is deliberately the same as the JS path used, so this is a
  // change of where the work happens and not of what it does.
  const perf = startRun('transcribe', currentModelPath.split('/').pop() || 'whisper');

  // Header only, a few hundred bytes rather than the whole recording. Gives the
  // Speed report the true duration and the actual format, both of which it
  // previously had to guess at.
  const audio = await readAudioInfo(audioPath);

  // Null when the 0.8 MB Silero model has not been fetched yet, which is the
  // offline first-run case. Then whisper simply transcribes everything, which
  // is what it did before any of this existed.
  // stripped of its file:// scheme, which is NOT cosmetic.
  //
  // ModelManager builds every path from FileSystem.documentDirectory, so they
  // all arrive as file:///data/user/0/... URIs. whisper.rn strips that prefix
  // for the paths IT knows about (stripFileScheme, src/index.ts:105), but
  // vadModelPath is an option this app added, so nothing stripped it and the
  // C++ side handed "file:///data/..." to fopen, which cannot open it. The VAD
  // context failed to initialise, whisper_full returned -1, and the fallback
  // below quietly transcribed everything untrimmed. Every run on build 100
  // reported "VAD produced nothing" for this reason.
  armNativeLog();
  const vadModelUri = await ensureVadModel();
  const vadModelPath = vadModelUri?.startsWith('file://')
    ? vadModelUri.slice('file://'.length)
    : vadModelUri;
  perf.mark('probe');

  return whisperQueue(async () => {
    const attempt = (useVad: boolean) => {
      const opts = useVad
        ? {
            ...options,
            vadModelPath,
            // Whisper wants a moment of lead-in or it clips the first word, and
            // a gap shorter than this is a breath rather than the end of a
            // sentence. Both carried over from the JS implementation; whisper's
            // own defaults are 30ms and 100ms, which cut too close.
            vadSpeechPadMs: 200,
            vadMinSilenceDurationMs: 300,
          }
        : options;
      const { promise, stop } = whisperContext!.transcribe(audioPath, opts);
      stopCurrentTranscription = stop;
      return promise;
    };

    let usedVad = !!vadModelPath;
    // WHICH fallback fired, not merely that one did. Both paths used to write
    // the same sentence, so a report saying "VAD produced nothing" could mean
    // the model would not load OR that it genuinely heard silence. Those need
    // completely different fixes and it cost a build to tell them apart.
    let vadFailure = '';
    try {
      let result;
      try {
        result = await attempt(usedVad);
      } catch (e) {
        // whisper_full returns -1 outright when the VAD model cannot be
        // loaded, and whisper.rn turns a non-zero code into a thrown
        // "Transcription failed". Without VAD the recording still transcribes
        // perfectly well, it just keeps its silence, so a broken 0.8 MB helper
        // model must never cost somebody their transcription.
        //
        // A user-cancelled run does NOT come through here: whisper.rn checks
        // is_aborted before throwing, so an abort resolves normally with
        // isAborted set. Anything caught here is a genuine failure.
        if (!usedVad) throw e;
        usedVad = false;
        vadFailure = 'VAD could not start, retried without it';
        result = await attempt(false);
      }

      // Two ways VAD can cost someone their transcription, and the old JS path
      // survived both by construction: it returned null on any problem and the
      // original audio was transcribed. Native VAD is not so forgiving.
      // whisper_full returns -1 outright if the VAD model fails to load, and
      // returns an EMPTY result if the detector finds no speech at all. The
      // second case is the dangerous one, because "no speech found" also means
      // "the detector was wrong", and a blank transcript is indistinguishable
      // from a broken app.
      //
      // So on an empty result, run it once more with VAD off. That costs a
      // repeat of a transcription that produced nothing, and it restores
      // exactly the old behaviour: hand back whatever whisper makes of the
      // untouched recording.
      if (usedVad && !(result.result || '').trim() && !(result as any).isAborted) {
        usedVad = false;
        vadFailure = 'VAD found no speech, retried on the full recording';
        result = await attempt(false);
      }

      perf.mark('transcribe');
      void perf.finish({
        // The length of the RECORDING, read from its own header, so the
        // realtime factor answers the question the person waiting is actually
        // asking: how long was my voice message against how long did I wait.
        //
        // It used to be the trimmed length when the trim ran and the end of
        // whisper's last segment when it declined, so it silently changed
        // meaning between runs and, in the declined case, reported where
        // whisper stopped talking rather than where the audio stopped.
        // endOfLastSegment survives only for formats with no header this can
        // read.
        audioSeconds: audio?.durationSeconds ?? endOfLastSegment(result.segments),
        outputChars: (result.result || '').length,
        audioFormat: describeAudio(audio),
        notes: [
          // Read unconditionally, so a run that fell back cannot inherit the
          // previous run's numbers and report them as its own.
          vadNote(usedVad, takeVadReading(), vadFailure),
          // What whisper decided the language was. Free, already in hand, and
          // the only way to tell from a pasted report whether a bad
          // transcription was a slow model or auto-detect picking the wrong
          // language, which has happened here before.
          (result as any).language ? `heard ${(result as any).language}` : '',
          `${(result.segments || []).length} segments`,
        ]
          .filter(Boolean)
          .join(', '),
      });
      return {
        text: result.result,
        segments: result.segments || [],
        // Whisper's auto-detected language. Was thrown away; the LLM prompts
        // need it to name the output language explicitly, or a small model
        // reading an English prompt answers in English.
        language: (result as any).language,
      };
    } finally {
      stopCurrentTranscription = null;
      // A run that threw never reached finish, so the AppState listener it
      // opened would otherwise keep counting forever against a dead run.
      // Idempotent: harmless when finish already released it.
      perf.discard();
    }
  });
}

export async function unloadWhisper(): Promise<void> {
  if (whisperContext) {
    try {
      await whisperContext.release();
    } catch (e) {
      console.warn('Error releasing whisper context:', e);
    }
    whisperContext = null;
    currentModelPath = '';
  }
}
