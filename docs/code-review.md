# Code review (post-launch, 2026-07-20)

A pass over the codebase before wider release. Records what was reviewed, the
verdicts, the test net that now exists, and what's deliberately left.

## How to run the checks

From `mobile_app/`:

- `npm run lint` - ESLint (0 errors; ~19 style warnings are the backlog below)
- `npm run typecheck` - the app, React-Native only
- `npm run typecheck:tests` - the test files, under Node types
- `npm test` - 42 unit tests over the pure logic, zero extra dependencies
  (Node's built-in `--test` with type stripping)

CI (`.github/workflows/ci.yml`) runs all four on every push and PR. None needs
a device or emulator - which is exactly the gap that let this project's bugs
surface on a phone instead of in a check.

## What the tests cover

The correctness-critical logic was **extracted into pure, native-free modules**
so it could be tested at all (the engine files import `llama.rn` / `whisper.rn`
and can't run in Node). Each module below fixed a real bug this project hit:

| Module | Guards against |
| --- | --- |
| `entityExtraction` | wrong/hallucinated date highlights, the `alle 16:15` minute-swallow, quantities mistaken for dates |
| `textCleanup` | markdown reaching the screen, the code-fence-empties bug, the model reciting its prompt or echoing the transcript |
| `transcribeProgress` | a wrong ETA; warmup being charged to the rate |
| `streamingDrip` | frozen/jittery typewriter pacing |
| `segmentAccumulator` | the transcript box wiping itself (cumulative-vs-new) |
| `languageData` | **integrity**: a duplicate Whisper code, a language that stops round-tripping |
| `format` | `90:00` instead of `1:30:00` for long audio |
| `deviceTierData` | **integrity**: a recommended model id that isn't in the catalog (silent no-highlight at first run); wrong RAM->tier boundaries |

The three integrity tests are the important ones - they catch the silent
data-drift a catalog-driven app is prone to, which ships quietly and mistranslates
or misguides a real user.

## Reviewed, no bug found

- **Concurrency (the shipping paths).** All transcription goes through the whisper
  queue at the engine; all main-context LLM work goes through `queueLlama`;
  History's Format/Summarize/Re-Transcribe route through it too. Safe by
  construction.
- `downloadManager`, `modelPresence`, `setup.tsx`, `appCapabilities` - read clean
  (one doc fix: download speed is instantaneous, not smoothed).

## Findings (not fixed - flagged)

1. **Chat runs a second model context** (`app/(tabs)/chat.tsx`, flagged in-code).
   `extractMemories` there runs on the MAIN context while chat generates on a
   SEPARATE one, so the model can load twice (RAM/OOM) and the call is unqueued.
   Only reachable with **both** chat-beta **and** context-learning on (both
   default off). The fix is a design call: run it on the chat context, or skip
   memory extraction while chatting.
2. **`appCapabilities` registry** could drift from the real `Settings` type / the
   auto-delete option values. Beta-chat only. Same integrity-test pattern as
   `deviceTierData` would guard it.

## Deliberately not done

- **De-duplicating the two transcript screens** (`index.tsx` + `history/[id].tsx`,
  ~1500 lines with heavy overlap - where most of this project's hard bugs lived).
  It's the biggest structural win left, but the tests don't cover screen wiring
  and it can't be verified without a device. Do it with a device or a tester in
  the loop.
- **The 19 lint warnings** (`exhaustive-deps`, `set-state-in-effect`) - mostly
  deliberate patterns; "fixing" them blind can introduce render loops. Review
  case by case.
- **ESLint gating in CI** - held until the warnings are triaged, so CI doesn't go
  red on pre-existing style debt.

## The one thing worth more than all of the above

Closed testing on real hardware. Nearly every bug this project found came from
one person on one phone. The net now catches logic regressions automatically;
real devices catch the rest.
