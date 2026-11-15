# Making transcription faster: research and measurements

Date: 2026-11-14. Author: Claude, for Ricky. Sections 2 to 5 were written before any engine change. After Ricky
approved a phone test the same day, the test build was prepared (section 6) and two more things were measured on the
PC: the Auto-Detect fix (4.2) and a speed-up for Improve (section 14).

Every claim below says how it is known: **measured** (run on this PC today), **read** (source opened today, listed
in section 12), **from notes** (my July measurements on the Pixel, in the memory notes, not re-run today) or
**estimate** (my arithmetic, not observed). Nothing is cited from memory.

## 1. Answer first

1. **A different speech model is 5 to 40 times faster than Most accurate (Whisper Turbo) at about the same
   accuracy in Italian, and the engine library the app already uses supports it.** The model is NVIDIA Parakeet TDT
   0.6B v3. `whisper.rn` added it in 0.7.0 (the app is on 0.6.0). Measured on this PC, CPU only, 4 threads: a 6 second
   Italian clip takes 0.6 s against 10 to 26 s, and a 3 minute clip takes 11 s against 77 to 138 s. Word errors on
   the 3 minute clip: 3.1% against 2.6% (12 errors against 10 in 383 words, which is not a real difference at this
   sample size).
2. **Whisper with the language on Auto-Detect runs its slow step twice on the first 30 seconds.** Read in the source
   and measured: a 6 second clip took 25.8 s on Auto and 10.0 s with the language set. Skipping the second pass gives
   the same text, so it is a free halving of every short recording made on Auto-Detect, which is the app's default.
   The fix is written and checked on this PC: byte-identical text in 10 of 10 comparisons, and a 6 second clip on
   Most accurate went from 22 s to 10 s (section 4.2).
3. **Parakeet gets slower per second the longer the recording is, unless the audio is cut into pieces.** Cutting at
   pauses every 30 s halved the time on the 3 minute clip and cost no accuracy. The app already finds pauses (VAD).

4. **Improve spends 80% of its time writing the text out one token at a time, and most of that text is a copy of
   the transcript.** Letting the engine guess the next words from the transcript and check them in one batch made
   generation 2.6 times faster on the Balanced model here (19.5 s to 7.5 s), changing 1 word in 391, which is less
   than the 4 to 8 words that change between two ordinary runs. The engine library the app uses does not expose
   this yet, in any version. Section 14.

**Phone result, 2026-11-14 (section 15):** on the Pixel 9 Pro XL, one run each on the same 116 s recording, Parakeet
q4_0 took 11.1 s and Most accurate 65.7 s, so 5.9 times faster, and the Auto-Detect fix is confirmed running on the
phone. Ricky read both texts and called Parakeet's "better, way better" (2026-11-15), so both halves of the go
criterion are met and it is now a normal model, "Fast", suggested on phones set to one of its languages (section
15.1). Improve (point 4) has still not been run on a phone.

## 2. What was measured, and how

- **Machine:** this PC, Intel Core i9-12900K, Windows 11. CPU only (`-ng`), **4 threads**, the same thread count the
  Pixel uses (from notes). It is a much faster CPU than a phone's and a different architecture (x86, not ARM), so
  **the ratios between engines are the evidence, not the seconds.**
- **Engine build:** whisper.cpp release `b5454` (2026-10-06), `whisper-bin-x64.zip`, which contains both
  `whisper-cli.exe` and `parakeet-cli.exe`. Same build for both models.
- **Models:** `ggml-parakeet-tdt-0.6b-v3-q4_0.bin` (355.6 MB), `ggml-parakeet-tdt-0.6b-v3-q8_0.bin` (668.8 MB),
  and the three Whisper files the mobile app ships: `ggml-large-v3-turbo-q8_0.bin` (874.2 MB),
  `ggml-small-q8_0.bin` (264.5 MB), `ggml-tiny-q8_0.bin` (43.5 MB).
- **Audio:** a public domain LibriVox reading in Italian, "Il giornalino di Gian Burrasca", chapter file
  `gianburrasca_003_vamba_64kb.mp3` (3:01), converted to 16 kHz mono WAV. Clips of 6 s, 37 s and 107 s were cut from
  second 20 of it, to match the lengths measured on the Pixel in July. One reader, clean read speech. **It is not a
  voice note**: no noise, no hesitation, no phone microphone.
- **Whisper settings:** beam 1, best-of 1, timestamps on, like the app. Language `auto` unless stated.
- **Timing:** wall clock of the whole process (so it includes loading the model), best of 2 runs for the first
  table, 1 run for the later ones. The tools' own `encode` and `decode` timings are quoted where they matter.
- **Accuracy:** word error rate against the book's text on Italian Wikisource (page "Il giornalino di Gian
  Burrasca/6 ottobre", 383 words after normalising: lower case, punctuation removed, digits 1 to 10 spelled out).
  The recording has a LibriVox notice before and after the chapter, so the reference is aligned inside each
  transcript and the notice costs nothing. If the reader's edition differs from Wikisource's, every model pays the
  same.
- **Noise in the timings:** Whisper's times on this PC varied a lot between runs (Turbo on the 3 minute clip: 76.6 s
  once, 138.1 s once). This CPU mixes fast and slow cores and the 4 threads were not pinned, which is my explanation
  and was not tested. Parakeet's two quantisations were run back to back and agreed. Treat every Whisper figure as
  plus or minus 50%.

The scripts are in `scripts/speed-bench/` (`bench.py`, `chunked.py`, `wer.py`). Section 13 says how to re-run them.

## 3. Results

### 3.1 Time, whole clip, 4 threads, CPU (seconds, lower is better)

| Clip | Parakeet q4_0 | Parakeet q8_0 | Whisper Turbo q8 | Whisper Small q8 | Whisper Tiny q8 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 6 s | 0.62 | 1.26 | 19.1 / 25.8 | 4.18 | 0.56 |
| 37 s | 2.48 | 4.06 | 28.3 / 33.4 | 6.73 | 0.87 |
| 107 s | 10.9 | 11.6 | 57.7 / 70.4 | 15.1 | 2.07 |
| 181 s | 23.6 | 23.4 | 76.6 / 138.1 | 17.2 / 27.0 | 3.82 / 4.41 |

Two values in a cell are two separate runs. All measured.

### 3.2 Whisper Turbo, language Auto against language set to Italian (measured, 1 run each)

| Clip | Auto | Italian | Encoder time, Auto | Encoder time, Italian |
| --- | ---: | ---: | ---: | ---: |
| 6 s | 25.8 s | 10.0 s | 24.5 s | 9.1 s |
| 37 s | 33.4 s | 20.1 s | 31.3 s | 18.2 s |
| 107 s | 70.4 s | 62.4 s | 64.8 s | 56.4 s |

The gap is one extra pass of the encoder (9 to 15 s on this PC) whatever the clip length, so it matters most on
short clips. The transcripts were the same in both columns for the part I compared (the first 260 characters).
**Not checked:** that the full texts are identical character for character.

### 3.3 Accuracy on the 181 s Italian clip (measured, 383 reference words)

| Model | Word error rate | Errors |
| --- | ---: | ---: |
| Whisper Turbo q8 | 2.6% | 10 |
| Parakeet q8_0, whole clip | 3.1% | 12 |
| Parakeet q8_0, cut at pauses every 30 s | 3.1% | 12 |
| Parakeet q4_0, cut at pauses every 30 s | 3.4% | 13 |
| Parakeet q4_0, whole clip | 3.9% | 15 |
| Parakeet q4_0, cut every 30 s wherever it lands | 4.2% | 16 |
| Whisper Small q8 | 6.0% | 23 |
| Whisper Tiny q8 | 29.2% | 112 |

One recording, one speaker, 383 words: differences of two or three errors mean nothing. What it does show: Parakeet
is in Turbo's class and clearly ahead of Small, and the 4-bit file is not obviously damaged by quantisation.

Published figures for the full-precision model, read from NVIDIA's model card: FLEURS word error rate Italian 3.0,
Spanish 3.45, Portuguese 4.76, English 4.85, German 5.04, French 5.15; CoVoST2 Italian 3.69. From the technical
report: across 24 languages Parakeet v3 averages 9.7% against 9.9% for Whisper large-v3, and 5.3% against 5.8% on
the six-language common subset. Note the comparison there is with large-v3, not with the Turbo variant the app
ships, and the report does not say in the part I read which six languages those are.

### 3.4 Parakeet on the 181 s clip, cut into pieces (measured; compute time only, model load excluded)

| How it was cut | q4_0 | q8_0 |
| --- | ---: | ---: |
| Not cut (one 181 s piece) | 22.9 s | 22.6 s |
| At pauses, about every 60 s | 12.9 s | 19.0 s |
| At pauses, about every 30 s | 11.0 s | 17.3 s |
| At pauses, about every 15 s | 10.1 s | 15.9 s |
| Every 30 s wherever it lands | 11.2 s | 16.9 s |

Pauses were found with ffmpeg's `silencedetect` (noise -35 dB, 0.25 s), standing in for the app's VAD.

## 4. The three findings in detail

### 4.1 Parakeet has no fixed cost per recording

From notes: on the Pixel, Turbo took 33.6 s for 6 s of audio and 41.1 s for 37 s, because Whisper's encoder always
processes a padded 30 second window. That fixed cost is the reason short voice notes feel slow, and the only known
fix (`audio_ctx`) broke the output and is disabled.

Parakeet's encoder runs on the audio's real length. Read in the whisper.cpp example output: an 11 s file is
processed as `total_frames=1101, chunk_size=1101`. Measured: 6 s of audio costs 0.29 s of encoding, 37 s costs
2.1 s.

Parakeet q4_0 is as fast as Whisper **Tiny** on a 6 second clip (0.62 s against 0.56 s) while making about an eighth
of Tiny's errors on the long clip (13 to 15 against 112).

### 4.2 Auto-Detect encodes the first window twice

Read in the app's bundled engine (`node_modules/whisper.rn/cpp/whisper.cpp`, the 0.6.0 copy):

- line 6826: when the language is `auto`, `whisper_full_with_state` calls
  `whisper_lang_auto_detect_with_state(ctx, state, 0, ...)`;
- line 4025 onwards: that function runs the encoder at that offset ("run the encoder");
- line 7031: the main loop then calls `whisper_encode_internal(*ctx, *state, seek, ...)` with `seek` starting at
  the same offset 0.

So the first 30 seconds are encoded for detection, the result is thrown away, and the same 30 seconds are encoded
again to transcribe them. Upstream whisper.cpp `master`, fetched today, still has both calls and no skip.

The fix is a small native patch, now written (`patches/whisper.rn+0.7.4.patch`, the `whisper.cpp` part): a flag is
set when detection has just encoded offset 0, and the first loop iteration skips its own encode when the offset is
0 and the audio context is the one detection ran with. Two details found while writing it, both read in the source:
detection always runs at offset 0 whatever `offset_ms` says, and it runs with the audio context left over from the
previous call, because `exp_n_audio_ctx` is only updated from the parameters further down. The patch checks both.

**Measured, on this PC.** I built two small desktop programs from the exact sources the app compiles
(`node_modules/whisper.rn/cpp` at 0.7.4, MSVC, AVX2, 4 threads): one with the patch and one with the two hunks
reverted. Same decoding settings as the app, language Auto.

| Model | Clip | Without | With | Text |
| --- | --- | ---: | ---: | --- |
| Turbo q8 | 6 s | 22.7 s, 22.0 s | 11.2 s, 10.0 s | identical |
| Turbo q8 | 37 s | 27.3 s, 27.3 s | 19.6 s, 18.7 s | identical |
| Small q8 | 6 s, 37 s, 107 s, 181 s | 4.5, 8.8, 20.8, 29.8 s | 3.2, 7.0, 19.7, 33.7 s | identical, all four |
| Tiny q8 | 6 s, 37 s, 107 s, 181 s | 0.64, 1.37, 5.47, 10.2 s | 0.38, 1.41, 5.58, 8.9 s | identical, all four |

Text was compared byte for byte (`cmp`): 10 of 10 identical. The Small and Tiny timings were taken while another
benchmark was running, so only their text result is reliable; the Turbo timings were taken alone, twice each. The
saving is one encoder pass per recording, so it is large on short clips and disappears into the noise on long ones.

**Not verified:** the same on ARM (there is no reason for it to differ, the change is in portable code), and the
case of several processors (`nProcessors` above 1), which the app does not use. On the phone the Speed report now
prints `detect pass reused` on a run where it happened.

Estimate for the Pixel: the 6 s clip that took 33.6 s (from notes) would take about 17 s. That is arithmetic from
the PC ratio, not a phone measurement.

This also explains a July observation I recorded without an explanation: "6 times the audio for 22% more time".
Both clips paid the doubled first window.

### 4.3 Parakeet must be fed in pieces

The whole-clip encode time grows faster than the audio: 0.056 s per second of audio at 37 s, 0.095 at 107 s, 0.125
at 181 s (measured). The model attends over the whole clip at once, so cost grows with the square of the length;
NVIDIA's card says full attention handles up to 24 minutes on an 80 GB GPU, which a phone is not. A long recording
as one piece would be slow and would likely run out of memory. **Not measured:** memory use.

Cutting at pauses fixes this, costs no accuracy in the test, and has two side effects the app needs anyway:
`whisper.rn`'s Parakeet call has no progress callback and no partial results (read in its `index.ts`:
`ParakeetTranscribeOptions` is only `maxThreads` and `audioCtx`), so pieces are also how the progress bar and the
typewriter effect would keep working.

On this PC q4_0 was faster than q8_0 on short pieces (11.0 s against 17.3 s) and equal on the whole clip. On ARM
the app's engine has different fast paths for the two (from notes: q4_0 and q8_0 fast, q5 slow), so which file is
faster on a phone is **unknown** and has to be measured there.

## 5. What Parakeet cannot do

All read from the `whisper.rn` 0.7.4 README, its `index.ts` and the model card.

- **25 European languages only:** en, es, fr, de, bg, hr, cs, da, nl, et, fi, el, hu, it, lv, lt, mt, pl, pt, ro,
  sk, sl, sv, ru, uk. No Chinese, Japanese, Arabic, Hindi, Turkish and so on. Whisper has to stay for those.
- **No way to set the language.** It always detects. The Language option would do nothing for this model.
- **No prompt.** The "context learning" feature works by passing remembered terms as Whisper's prompt. Parakeet's
  API has no prompt, so that feature would not apply.
- **No progress, no partial text** from the library (see 4.3).
- **Input must be 16 kHz mono 16-bit WAV.** The app already converts to that for Whisper.
- **Licence CC BY 4.0**, which requires credit. NVIDIA would need a line in `NOTICES.md` and in the app's licences.
- **Size:** 356 MB (q4_0) or 669 MB (q8_0). Turbo is 874 MB, so it is not a bigger download.

## 6. What the switch needs, and the experiment that decides it

Read from the `whisper.rn` releases and the 0.7.4 sources:

- The app is on `whisper.rn` 0.6.0. Parakeet arrived in 0.7.0 (2026-07-19). Latest stable is 0.7.4 (2026-08-27);
  0.8.0 is at rc.3.
- 0.7.4's Android build still compiles only the plain `armv8.2-a+fp16` variant. The app's patch that adds the
  `dotprod` and `i8mm` variants (`patches/whisper.rn+0.6.0.patch`) is not upstream, so it had to be redone.
- **Done 2026-11-14:** `whisper.rn` is pinned at exactly 0.7.4 and the patch is redone as
  `patches/whisper.rn+0.7.4.patch` (four files, 8 KB). What it carries: the two extra ARM builds and the loader that
  picks them; the VAD options passed through to whisper; `audioCtx` for Whisper (0.7.4 reads that option for
  Parakeet only, which I first misread as upstream having added it); and the Auto-Detect fix. What it no longer
  needs: the dangling string pointer fix, because 0.7.4 fixed that itself (`bindStringParams`). The old patch file
  was 9.8 MB because it had swallowed build folders; that is gone.
- The JS calls the app uses (`initWhisper`, `transcribe`, the native log listener) are unchanged in 0.7.4 (read in
  its `index.ts`; type check passes). **Not checked until the phone runs it:** behaviour.
- The release APK builds (versionCode 109, 136 MB) and contains all four speech engine variants, including
  `librnwhisper_v8fp16_dotprod_i8mm.so` (checked by listing the APK).
- 0.8.0-rc adds an experimental Qualcomm Hexagon (NPU) backend. It does not help a Pixel (Tensor, not Qualcomm) and
  is a release candidate.

**The experiment that could kill this:** a test build for the Pixel with `whisper.rn` 0.7.4 and the ARM patch
redone, Parakeet q4_0 and q8_0 downloadable from a hidden entry, audio cut at pauses, and the existing speed
report extended to time it. Run the same 107 s file used in July on Turbo and on both Parakeet files.

**How the test build does it (versionCode 109).** Holding the version line at the bottom of Settings turns the test
models on (a `+` appears after the version); the Models screen then shows a "Test" group with the two Parakeet
files, and once downloaded they can be picked like any transcription model. `utils/WhisperEngine.ts` routes by
file name to `utils/ParakeetEngine.ts`, which reads the WAV a piece at a time, cuts each piece at the quietest
100 ms between 20 and 30 s (`utils/pauseCut.ts`, unit tested), and reports progress and partial text per piece. The
cut is by loudness, the same kind of cut the PC measurement used (ffmpeg `silencedetect`), not by the Silero
model. The Speed report line for such a run reads `parakeet, cut at pauses, N pieces, median, slowest, threads`.
No draft pass is run for Parakeet. With the switch off, nothing in the app differs from before except the engine
version and the Auto-Detect fix.

- **Go** if Parakeet is at least 3 times faster than Turbo on that file and the Italian text is as good to read.
- **Stop** if it is not: ggml's ARM code may handle Parakeet's convolution layers worse than x86 does, and nothing
  measured today can rule that out.

Estimate if the PC ratio holds on the phone (Turbo about 9 s per 30 s window here, Parakeet q4_0 about 1.8 s per
30 s piece): the Pixel's 16 to 17 s per Turbo window becomes about 3 s per 30 s of audio, and a 6 second note
about 1 s instead of 33. This is the number the experiment exists to check.

Order I recommend:

1. The Auto-Detect patch (4.2). Small, cannot change the text, helps every Whisper user on every language.
2. The Parakeet test build above. Measure. Decide.
3. If it passes: make it a normal model in the catalogue for the 25 languages, keep Whisper for the rest and for
   context learning, and bring the same model to the PC app (the PC build of whisper.cpp already ships
   `parakeet-cli.exe`; the PC engines zip would need rebuilding).

## 7. Alternatives considered

| Option | Verdict | Basis |
| --- | --- | --- |
| Parakeet through a second library (sherpa-onnx, ONNX Runtime) | Not needed | `whisper.rn` already has it, so no second native engine. I fetched the sherpa-onnx model page and the npm entry for a React Native binding but **did not read them**; no claim here rests on them. |
| Shrinking Whisper's context (`audio_ctx`) | Stays off | From notes: it turned Italian into French and made endings repeat. Ricky declined re-enabling it. Parakeet removes the cost it was aimed at. |
| Picking a smaller Whisper model for short clips | Not proposed | Ricky declined it in July. Measured today: Small makes 2.3 times Turbo's errors, Tiny 11 times. |
| Phone NPUs | Still no | From notes, unchanged. The only new fact (read): whisper.rn 0.8-rc has an experimental Qualcomm-only backend. |
| GPU on the Pixel (Mali) | Not tested | Parakeet's `useGpu` option exists (read). Whether whisper.rn has any working GPU path on a Mali phone was not looked at. |
| Moonshine (another small speech model) | Not evaluated | Fetched its README, did not read it. |
| Canary 1B v2 (NVIDIA's larger sibling) | Not evaluated | The report says it is more accurate than Parakeet v3 (8.1% against 9.7% on 24 languages, read). It is not in whisper.rn. |

## 8. Corrected or refuted

- My July note said the cheap wins were "spent" and the question closed. That was wrong on two counts: the doubled
  first window on Auto-Detect was sitting in the measurements unexplained, and the library gained a new model ten
  days before that note was written.
- Balanced (Whisper Small) being slower than Most accurate on the Pixel (165 to 365 s against 76 s for 107 s, from
  notes) is **not** how these models behave here: on this PC Small is 3 to 4 times faster than Turbo. So the phone
  result is something going wrong on the phone, not Small being slow. Still unexplained. My guess, untested: Small
  spends a larger share of its time in the decoder (measured here on the 107 s and 181 s clips: 13% to 38% of
  compute time, against 1% to 8% for Turbo), and the decoder is many tiny steps where 4 threads can cost more in coordination than they return on a
  phone. A run with 2 threads would test it. If Parakeet passes, Balanced has no reason to exist and this stops
  mattering.

## 9. Open questions

1. ~~Parakeet's real speed on the Pixel~~ answered in section 15 for q4_0. Still open: q8_0 on the phone, and a
   short recording on the phone (both engines).
2. Parakeet's memory use on a long piece, and the longest piece that is safe on a mid-range phone.
3. How Parakeet handles real voice notes: noise, hesitations, a phone microphone, two languages in one recording,
   dialect. Today's test was an audiobook.
4. Whether the Auto-Detect patch is as safe as the two call sites suggest (4.2).
5. Whether `patches/whisper.rn+0.6.0.patch` ports to 0.7.4 and what else the upgrade breaks.
6. Improve was measured after this list was first written: section 14. Summarize was not; its output is not a copy
   of its input, so the same trick should help it much less. That is my reasoning, not a measurement.

## 10. Found on the way, not about the engine

- The icon font the app loaded at every start was 15.07 MB (`MaterialSymbolsRounded.ttf`). The icons are now vector
  paths (17 KB of source) and the font is gone, so the download is 15 MB smaller and start-up no longer waits on
  it. **Not measured:** the start-up time difference.
- Opening a transcript that still has its audio loads the whole Whisper model in the background
  (`useWhisperPreload` in `app/history/[id].tsx`), so that Re-Transcribe is ready. From notes that load is about
  2 s on the Pixel. **Not measured:** what it costs in memory and battery when Re-Transcribe is never pressed.

## 11. Must not do

- Do not make Parakeet the default, or remove any Whisper model, before the phone run in section 6.
- Do not route non-European languages to Parakeet.
- Do not re-enable `audio_ctx`.
- Do not ship the Auto-Detect patch without the before/after test showing identical text.
- Do not quote the seconds in section 3 as phone speeds. They are a desktop CPU.
- Do not upgrade `whisper.rn` without redoing the ARM kernel patch, or the phone silently drops to the slow build.
- Do not add a small "draft" text model to speed up Improve on a phone CPU. Measured in section 14: no gain.
- Do not change Improve's repetition penalty on the strength of section 14.3 alone. It is one transcript, and the
  penalty exists to stop the small models looping, which that test did not try to provoke.

## 12. Sources

All opened on 2026-11-14 unless marked.

| Source | Used for | Status |
| --- | --- | --- |
| github.com/mybigday/whisper.rn releases (API) | Versions, Parakeet added in 0.7.0, Hexagon in 0.8-rc | Read |
| whisper.rn `README.md` at tag v0.7.4 | `initParakeet`, model files and sizes, input format, 25 languages | Read |
| whisper.rn `src/index.ts` at v0.7.4 | `ParakeetTranscribeOptions` has only `maxThreads`, `audioCtx` | Read |
| whisper.rn `android/src/main/CMakeLists.txt` at v0.7.4 | Only fp16 ARM variant built upstream | Read |
| whisper.rn pull request 332 | Parakeet integration, "Tested on Android" | Read (title and description only) |
| ggml-org/whisper.cpp `examples/parakeet-cli/README.md` | CLI options, clip processed at its real length | Read |
| ggml-org/whisper.cpp `src/whisper.cpp`, master | Double encode still present upstream | Read (the call sites) |
| `node_modules/whisper.rn/cpp/whisper.cpp` (0.6.0) | Double encode in the app's engine, lines 4025, 6826, 7031 | Read (the call sites) |
| huggingface.co/nvidia/parakeet-tdt-0.6b-v3 model card | Languages, per-language error rates, licence, length limits | Read |
| arXiv 2509.14128, Canary-1B-v2 and Parakeet-TDT-0.6B-v3 report | Comparison with Whisper large-v3 | Read (abstract and section 6.1) |
| huggingface.co/ggml-org/parakeet-GGUF (API) | File names | Read; sizes measured from the downloads |
| ggml-org/whisper.cpp release b5454 | The binaries used | Downloaded and run |
| archive.org, LibriVox "Il giornalino di Gian Burrasca" | Test audio, public domain | Downloaded and used |
| it.wikisource.org, "Il giornalino di Gian Burrasca/6 ottobre" | Reference text | Downloaded and used |
| github.com/mybigday/llama.rn releases (API) | Speculative decoding lead | Read (release notes only) |
| expo-audio `Audio.types.d.ts` in node_modules | Player reports position every 500 ms by default | Read |
| k2-fsa sherpa-onnx model page; npm `react-native-sherpa-onnx`; Moonshine README | Nothing | Fetched, **not read** |
| ggml-org/llama.cpp `docs/speculative.md`, master | The n-gram and draft-model methods and their options | Read (the n-gram sections and the option list) |
| ggml-org/llama.cpp release b12387, `llama-server.exe` | Section 14 measurements | Downloaded and run |
| mybigday/llama.rn v0.13.0-rc.11 `src/types.ts`, `cpp/rn-completion.cpp` | Which speculative methods the library exposes | Read (the speculative parts) |
| `node_modules/llama.rn` 0.12.5 `src/NativeRNLlama.ts` | No speculative option in the installed version | Searched, one file only |
| Qwen 2.5 1.5B q4_0, Qwen 2.5 0.5B q4_k_m, Qwen3 0.6B q4_0 (Hugging Face, the app's own files) | Section 14 measurements | Downloaded and run |
| `node_modules/whisper.rn` 0.7.4 `cpp/whisper.cpp`, `cpp/jsi/RNWhisperJSI.cpp` | The patch and its checks in 4.2 and 6 | Read (the parts changed), compiled and run |
| My memory notes `mobile-perf-plan`, `on-device-ai-engine-facts` | Pixel timings from July | Re-read today; the measurements themselves were not repeated |

## 13. Re-running the measurements

Needs the whisper.cpp `b5454` Windows build unpacked to `<bench>/bin/Release`, the model files in `<bench>/models`
and the WAV clips in `<bench>/audio`.

```
python -I scripts/speed-bench/bench.py <bench> "parakeet:ggml-parakeet-tdt-0.6b-v3-q4_0.bin,whisper:ggml-large-v3-turbo-q8_0.bin" "it_6s.wav,it_181s.wav" 4 2
python -I scripts/speed-bench/chunked.py <bench> <ffmpeg.exe> ggml-parakeet-tdt-0.6b-v3-q4_0.bin it_181s.wav 30 silence
python -I scripts/speed-bench/wer.py <reference page text> <bench>/out/*.json
```

`WHISPER_FLAGS` overrides Whisper's options, for example `WHISPER_FLAGS="-l it -bs 1 -bo 1"` for table 3.2.

The Auto-Detect check (4.2): `scripts/speed-bench/wtest/` holds the test program and its CMake file. `revert.py`
writes the unpatched copy of `whisper.cpp`; build with `cmake -G "Visual Studio 17 2022" -A x64 -DRNW=<mobile_app/
node_modules/whisper.rn/cpp> -DORIG=<the reverted copy>`, then run `wtest_orig` and `wtest_patched` on the same
clip and compare the two text files.

The Improve measurements (section 14): `llmbench.py <dir> <transcript> <model> <label> <repeats> [llama-server
options]` with llama.cpp b12387 in `<dir>/bin` and the model in `<dir>/models`; `SEED` and `REP` set the seed and
the repetition penalty. `llmdiff.py` and `llmerr.py` compare the saved outputs with each other and with the input.

## 14. Improve: where the time goes, and a way to get most of it back

Added after the rest. Measured on this PC with llama.cpp b12387 (`llama-server.exe`, CPU build), 4 threads, context
4096, the app's exact prompt (rebuilt from `utils/LLMEngine.ts`: same preamble, same instruction per model size,
same rules) and the app's sampling (temperature 0.3, repetition penalty 1.15 over 256 tokens). Input: Whisper
Turbo's transcript of the 181 s Italian clip, 2,481 characters, 434 words, 925 prompt tokens with the instructions.
Two runs each unless noted; the two runs agreed to within 5%.

### 14.1 Time

| Model | Method | Reading the prompt | Writing the answer | Total |
| --- | --- | ---: | ---: | ---: |
| Balanced (Qwen 2.5 1.5B q4_0) | as shipped | 4.3 s (215 tok/s) | 19.5 s (632 tok, 32 tok/s) | 23.8 s |
| Balanced | guess from the transcript, `ngram-simple` | 4.3 s | 7.5 s (84 tok/s) | 11.8 s |
| Balanced | same, shorter match (4 tokens) | 4.2 s | 7.0 s (90 tok/s) | 11.1 s |
| Balanced | `ngram-map-k` | 4.2 s | 6.6 to 7.5 s | 10.7 to 11.8 s |
| Balanced | `ngram-mod` | 4.2 to 5.0 s | 8.0 to 8.2 s | 12.1 to 13.1 s |
| Balanced | small draft model (Qwen 2.5 0.5B) | 6.7 s | 19.8 to 21.0 s | 26.6 to 27.7 s |
| Fastest (Qwen3 0.6B q4_0) | as shipped | 1.7 s (518 tok/s) | 14.0 s (718 tok, 51 tok/s) | 15.6 s |
| Fastest | `ngram-simple` | 1.6 s | 8.7 s (82 tok/s) | 10.3 s |

How it works (read in llama.cpp's `docs/speculative.md`): the engine checks a batch of proposed tokens in about the
time it takes to produce one, and keeps them up to the first one it would not have chosen itself. The n-gram
methods propose by finding the last few tokens earlier in the text and offering what followed them there, which for
Improve is the transcript sitting in the prompt. No second model, no extra download. On the Balanced run 577 of
672 proposed tokens were accepted.

The draft-model method is the classic version of this and it lost: on a CPU the small model's own time eats the
gain. Refuted for this app.

### 14.2 Is the text the same?

Not byte for byte, and I expected it to be. With the same seed, the n-gram runs on Balanced differed from the plain
run by one word in 391 (the draft-model run was identical). To judge that one word I ran the plain version with
three other seeds: those differed from the first plain run by 4, 5 and 8 word spans. So the change the speed-up
introduces is smaller than the change between two ordinary runs of Improve. On Fastest it was one or two short
spans in 434 words. I did not find out why it is not identical; my guess, untested, is that checking tokens in a
batch gives very slightly different numbers from producing them one by one.

### 14.3 Something else the same runs showed: Improve damages correct words

Comparing each output with the input, word by word, on Balanced:

| Repetition penalty | Seeds | Words replaced, per run |
| --- | --- | --- |
| 1.15 (shipped) | 42, 7, 99, 1234 | 1, 4, 5, 7 |
| 1.05 | 42, 7, 99 | 1, 1, 2 |
| 1.0 (off) | 42, 7, 99 | 3, 1, 0 |

The replacements at 1.15 are mostly correct words turned into wrong ones (a past participle given the wrong
ending, an article fused to its noun, a verb turned into a form that does not exist). A repetition penalty pushes
the model away from tokens it has used recently, and a faithful copy of a transcript has to reuse them. No run at
any of the three values looped, and all outputs were the expected length, but this was one transcript on one
model, and looping is a small-model problem. Fastest at the shipped settings changed 8 spans in 434 words, at
least 5 of them into wrong words. In every Balanced run the model also dropped the 41 to 50 words of the recording
notice at the start, which is content going missing, not punctuation.

This is a quality finding, not a speed one. It is here because the same runs produced it. A lower penalty needs its
own test on the small tiers before it is changed.

### 14.4 Can the app use it?

Not today. Read in the sources:

- The installed llama.rn (0.12.5) has no speculative option in its interface (I searched `src/NativeRNLlama.ts`
  only; llama.cpp's `speculative.cpp` is in the bundle but nothing reaches it from JS that I found).
- llama.rn 0.13.0-rc.11 (2026-11-12, a release candidate) adds speculative decoding but only two methods:
  `draft-mtp` and `draft-simple`, both of which need a draft model. Its completion code only starts speculation
  when one of those two is requested (`shouldUseMTP`) and always creates a draft context first. The n-gram methods
  are compiled in with llama.cpp but nothing selects them.
- So the route is a native patch to llama.rn 0.13 (let the n-gram types through, skip the draft context for them),
  or asking upstream for it. Either is a few dozen lines against a release candidate. **Not attempted.**

Whether it pays on a phone depends on one ratio: how much faster the phone reads a prompt than it writes an answer.
On this PC that is 215 against 32 tokens per second, 6.7 to 1, and the speed-up was 2.6. From notes, the Pixel
reads at 87 to 104 tokens per second when cool; its writing speed is not in my notes and is in the Speed report.
If the Pixel's ratio is near 2 to 1 the gain mostly disappears. That number should be read before any work starts.

**Order I would do it in:** read the Pixel's ratio from an existing Speed report (free); if it is 4 to 1 or better,
patch llama.rn 0.13 in a test build and time Improve on the phone; only then decide.

## 15. Phone result: Pixel 9 Pro XL, 2026-11-14

The experiment from section 6, run by Ricky on the test build (versionCode 109) and pasted from the app's Speed
report. Everything in the table is copied from that paste; nothing here was measured by me.

Device line of the report: `CPU: fp16 + dotprod + i8mm, 4 threads`, `whisper: v8fp16_dotprod_i8mm`. So the ARM
patch survived the move to `whisper.rn` 0.7.4 and the phone loads the fastest build (section 6 could only check
that the file was in the APK).

| | Parakeet q4_0 | Most accurate (Whisper Turbo q8) |
| --- | ---: | ---: |
| Time of run | 22:03:49 | 22:05:46 |
| Audio | 116 s | 116 s (91.3 s kept after silence trimming, 31 speech spans) |
| Total | **11.1 s** | **65.7 s** |
| Realtime factor | 10.43x | 1.77x |
| Model load, cold, reported separately | 0.7 s | 1.6 s |
| Pieces or windows | 5 pieces, median 2.6 s, slowest 2.9 s | 5 windows, median 14.8 s, slowest 16.7 s |
| Output rate | 101 chars/s | 17 chars/s |
| Notes | `parakeet, cut at pauses, 4 threads` | `detect pass reused`, 15 segments |

**Ratio: 65.7 / 11.1 = 5.9 times faster.** The go line was 3.

What this settles:

- **The fear that could have killed it is refuted.** Section 6 said ggml's ARM code might handle Parakeet's layers
  much worse than x86 does. Phone against PC, per piece: Turbo 14.8 s against about 9 s (1.6 times slower on the
  phone); Parakeet 2.6 s for a piece of about 23 s against about 1.8 s for a 30 s piece (about 1.9 times slower,
  after scaling for piece length). ARM is slightly less kind to Parakeet than to Whisper, and it does not matter.
- **The estimate held.** Section 6 predicted about 3 s per 30 s of audio on the Pixel. Measured: 2.6 s per piece of
  about 23 s, which is about 3.4 s per 30 s.
- **The Auto-Detect fix runs on the phone.** The Turbo line carries `detect pass reused`, which the app only writes
  when the native log reports the reuse. First confirmation outside the PC.
- **Cutting at pauses works on a real recording:** 5 pieces for 116 s, none slower than 2.9 s.
- **Both texts are about the same length:** rate times total gives about 1,120 characters for each (rounded rates,
  so within a few percent). That says neither engine dropped a large part. It says nothing about which words are
  right.

What it does not settle, in the order I think matters:

1. ~~Whether the Italian reads as well.~~ Answered by Ricky on 2026-11-15, having read both transcripts of this
   recording: Parakeet's is "better, way better". That is his judgement of one recording in his own voice. I have
   still not seen either text, and it is not a word error rate.
2. **One run each, and not in a fair order.** Parakeet ran first; Turbo ran two minutes later on a phone that had
   just worked. From notes, heat alone moved a Turbo run from 26 s to 34 s in July, about 30%. Against that, Turbo
   was given 91 s of trimmed audio and Parakeet the full 116 s. Neither changes a 5.9 times gap into a 3 times one.
3. **A short recording was not run.** That is where Whisper's fixed cost hurts most and where section 6 predicted
   the largest gain (about 1 s against half a minute). Also where the Auto-Detect fix should show as a halving.
4. **q8_0 was not run.** On the PC it was 1.5 times slower than q4_0 when cut in pieces (section 3.4) for one or
   two fewer errors in 383 words (section 3.3), which is inside the noise.
5. **Memory, heat over many recordings, a mid-range phone, noisy voice notes, two languages in one recording.**
   Open questions 2 and 3 in section 9 are untouched.
6. **This is not the July file.** The July notes are for a 107 s recording (76 s on Turbo); this one is 116 s. So
   the 65.7 s here cannot be read as the Auto-Detect fix saving 10 s.

### 15.1 Decision, 2026-11-15, and what was built

Ricky's answers, asked directly: the text is better; make it the suggested model; call it "Fast".

Built in versionCode 111 (uncommitted at the time of writing):

- **A normal model.** `PARAKEET_MODELS` in `utils/modelCatalog.ts` holds the 4-bit file as "Fast" (the existing
  `models.tierFast` label, already in six languages), with one new string, "25 European languages only."
  `speechModels()` lists it just below Most accurate, which is download size ascending: 42, 252, 356, 874 MB.
  `WHISPER_MODELS` is deliberately left as Whisper only, because the draft pass, the silence-trim policy and the
  per-window time table are keyed on that list and none of them apply.
- **Suggested, with two conditions.** `recommendedForTier` returns Fast for speech when the phone's primary
  language is one of the 25 **and** the phone is in the mid or high memory tier. The language is the phone's, not
  the app's: the app falls back to English, so a Japanese phone would otherwise be pointed at a model that cannot
  do Japanese. **The low tier keeps Fastest, and that is my caution, not a measurement:** nobody has run the 356 MB
  file on a 4 GB phone (open question 2 in section 9).
- **Nobody's choice is changed.** `ensureModelSelections` never touches a selection that is still installed. People
  who have Most accurate keep it and see Fast offered in Models.
- **Languages.** With Fast selected, every transcription language picker offers Auto-Detect and the 25 only, and a
  stored language outside them goes back to Auto-Detect, the same way the English-only filter already worked.
  Picking one of the 25 changes nothing: the model always detects.
- **Time estimate.** `modelTimeEstimate.ts` gives Fast a weight of 1.2, set from this phone run (5.7 s for a
  minute). A bug found on the way: any speech file with "0.6b" in its name and no measured weight was being read
  as a 0.6 billion parameter text model and given a per-minute-of-transcript estimate. Such a file now gets none.
- **Credit.** `NOTICES.md` names NVIDIA and CC BY 4.0. **There is no licences screen in the app**, so that file is
  the only place the credit lives. Whether that is enough for CC BY I have not checked with anyone who would know.
- **The 8-bit file stays a hidden test model**, unmeasured on a phone.

Known gaps this leaves, none of them built:

- **Remembered terms do not reach Fast** (no prompt, section 5). The Memory screen says nothing about it.
- **One segment per piece.** Read in `parakeet.cpp`: each call returns a single segment from 0 to the end of the
  piece, in 10 ms units. So a Fast transcript has a time stamp every 20 to 30 s, not per sentence. Anything that
  wants sentence-level timing gets it from Whisper only. The tokens carry finer times natively; `whisper.rn` does
  not pass them up.
- **"Balanced" still says "The sweet spot for most voice notes."** With Fast beside it that is no longer the case
  on a phone, where Balanced measured slower than Most accurate (section 8). The wording is Ricky's to change.
- **The PC app** does not have the model. Section 6, step 3.
- Everything in the "does not settle" list above except point 1.
