# Butler: what it did, what it does now, and how that was checked

Written 2026-11-15. Scope: the mobile app (`mobile_app/`). The PC app is not touched.

Status words used below, on every claim that matters:
- **read**: the source was opened in this session and the line is quoted or named.
- **measured**: a command was run in this session and the number comes from its output.
- **not checked on a phone**: true of everything here. There is no emulator on this PC.
- **mine**: a design decision of this work, not something a source forces.

## 1. What the Butler was

The Butler is the feature that underlines dates and times in a transcript; a tap offers
"Add to Calendar" or "Add to Alarms" (`components/EntityActionDialog.tsx`).

Found by reading the code at the start of this work (all **read**):

1. **Nothing was ever resolved.** `utils/entityExtraction.ts` located the words "15 luglio"
   or "alle 4" and stored `{quote, name, type}`. No code turned them into a day or an hour.
   The calendar intent carried only `title` and `description`, so the calendar opened on
   today, now. The alarm intent carried only a message, so the clock opened with no hour.
2. **The alarm half most likely never worked at all.** The Android guide says: "To invoke
   the ACTION_SET_ALARM intent, your app must have the SET_ALARM permission"
   (developer.android.com/guide/components/intents-common, **read**). Neither `app.json`
   nor `android/app/src/main/AndroidManifest.xml` declared
   `com.android.alarm.permission.SET_ALARM` (**read**). The expected result is the
   "Action failed" dialog on every tapped time. **Not checked on a phone.**
3. **A date and its hour were two unrelated highlights.** "il 17 luglio ... alle 4 e un
   quarto" gave a calendar highlight and a separate alarm highlight.
4. **"Domani", "lunedì", "tra due settimane" were found only by the text model**, so only
   with a text model installed, and still not resolved.
5. **Only the History detail showed highlights.** The Muffin! tab, where a new transcript
   first appears, showed plain text.
6. **Five highlights at most.**
7. **The setup screen's "Butler!" section offers the wrong model.** `app/setup.tsx` lists
   `EMBEDDING_MODELS` (MiniLM, "Smart search") under the Butler title. The Butler uses
   patterns plus the text model (`utils/transcriptionPipeline.ts`, `opts.entities` calls
   `extractActionableEntities`, **read**); the embedding model is for chat search. Not
   changed here: the copy and the grouping are Ricky's to decide.

## 2. What was built

All uncommitted, in versionCode 112.

- `utils/entityExtraction.ts`, second half ("Reading dates and times"): a pure reader that
  finds date and time expressions in the six app languages and resolves them to a real
  day and hour against the moment the note was recorded. An hour is attached to the date
  it belongs to in the same sentence. Entry points: `findDateSpans(text, ref)`,
  `resolveQuote(quote, ref)`; `mergeEntities` and `findHighlights` take the recording
  date as a third argument and return entities with a `when`.
- `intentFor(entity, title)` in the same file builds the Android intent: calendar with
  `beginTime`, `endTime` and `allDay`; clock with hour and minutes.
- `components/EntityActionDialog.tsx` shows the resolved value ("Fri, Jul 17, 2026,
  16:15") above the quoted words, and opens the calendar or clock already filled in.
- `components/HighlightedText.tsx` (moved out of the History detail) is now also used on
  the Muffin! tab, so highlights appear on a transcript that has just been made. It
  replaces the read-only text field only when there is something to tap.
- `com.android.alarm.permission.SET_ALARM` added to `app.json` and the manifest. It will
  show up in the Play listing's permission list.
- Cap raised from 5 to 12 highlights; identical quotes are listed once.
- `utils/format.ts` `formatWhen`.

What a tap does now (**mine**):
- a date, with or without an hour: calendar event (all day, or one hour long);
- an hour with no day said: alarm at that hour, as before but filled in.

`when` is never stored. It is recomputed from the text and the note's `timestampISO`
every time, so "domani" in a note from Monday stays Tuesday, and old notes benefit
without a migration.

## 3. The experiment that decided the design: a library, or our own reader

The obvious choice was chrono-node 2.10.3 (MIT, no dependencies; `package.json` on
master **read**). Its README says, **read**: "In addition to English, Chrono supports the
following languages: ar, fi, fr, id, it, ja, nl, ru, uk, and vi. We also have partial
support for de, es, ko, pt, sv, zh.hans, and zh.hant." Three of our six are "partial".

It was installed in the scratchpad and run on two sets of voice-note sentences, with the
strict rule that a sentence passes only if exactly the intended day and hour come back
(or nothing, for sentences with no date). `forwardDate: true`, each language with its own
locale. **Measured**:

| set | sentences | chrono-node | our reader |
|---|---|---|---|
| A, written before our reader | 61 | 40 | 61 |
| B, written after our reader, before running it | 71 | 36 | 71 |

Per language on set A, chrono-node: it 10/17, en 8/11, es 5/8, fr 6/8, de 7/9, pt 4/8.

The failures that ruled it out are wrong answers, not misses:
- "Pasado mañana", "Après-demain", "Depois de amanhã" came back as tomorrow.
- "Mañana a las 5 de la tarde" came back as 05:00.
- "Appuntamento il 20/11 alle 15" came back as 15 November at 11:00.
- "3-4 personnes" came back as 03:00 tomorrow; "25 anni" as the year 2051.
- "Domani alle 4 e mezza" came back as 04:00.

**Limits of this measurement, said plainly.** Both sets were written by the same author
as the reader, in one session. Set A is the development set, so 61/61 is expected and
proves little. Set B was written afterwards and passed on its first run with no change to
the reader, which is better evidence, but its phrasing comes from the same head. Nobody
else's sentences were used. The reader was also run on three real Italian transcripts
(Whisper and Parakeet output of a LibriVox recording, 0.5 to 2.5 thousand characters):
the only matches were the genuine "6 ottobre" (**measured**).

Both sets are now `tests/butlerDates.test.ts`. Twelve deliberate breaks of single rules
were tried against the tests (`mutants.py` in the scratchpad); two real gaps were found
and closed (an hour choosing between a date before and a date after it; a stale stored
date being trusted), and one "survivor" was a badly written break (removing the quantity
guard properly fails two tests). **Measured.**

## 4. Rules in the reader that are judgement calls (**mine**)

No source forces these. They are choices, and the dialog shows the result before anything
is created.

- **A bare hour from 1 to 6 is the afternoon.** "Alle 4" is 16:00. With "di mattina",
  "am", "du matin" and so on, or written as "04:00", it is taken as said. 7 to 12 are
  taken as said.
- **A weekday is its next occurrence after the recording day**, never the same day.
  "Next Friday" is treated the same as "Friday".
- **A day and month with no year** is this year if still ahead, otherwise next year.
  A diary note that says "6 ottobre" about the past is therefore read as a future date.
- **An hour with no day** is the recording day, or the next day if that hour had already
  passed when the note was recorded.
- **"Oggi", "today", "stasera"** and the like are shown only when an hour comes with them.
- **"Scorso", "last", "pasado", "dernier", "letzten", "passada"** next to a weekday mean the
  past: not shown.
- **Ambiguous hours need a date beside them**: a spoken number with no marker ("at
  eight"), "14h" with no "à", unaccented Portuguese "as 8".
- **Day first for 5/4**, month first only when nothing else fits ("11/20").
- **Timed events last one hour.**

## 5. Android facts the action relies on

- Calendar: `ACTION_INSERT` on `Events.CONTENT_URI` with `EXTRA_EVENT_BEGIN_TIME`,
  `EXTRA_EVENT_END_TIME` (milliseconds since epoch), `EXTRA_EVENT_ALL_DAY` (boolean),
  `TITLE`, `DESCRIPTION` (Android guide, **read**).
- The string values of those constants (`beginTime`, `endTime`, `allDay`, `title`,
  `description`, `android.intent.extra.alarm.HOUR`, `.MINUTES`, `.MESSAGE`, `.SKIP_UI`)
  were read out of the SDK's own `android-36/android.jar` with `javap -constants`
  (**measured**), not remembered.
- `expo-intent-launcher` 57.0.0 turns a JS number above the int range into a `long` and
  smaller ones into an `int` (`IntentLauncherModule.kt`, **read**). `beginTime` must be a
  long and the alarm hour an int, so both arrive in the right type.
- All-day events: "If allDay is set to 1 eventTimezone must be UTC and the time must
  correspond to a midnight boundary" (CalendarContract.Events reference, **read**). That
  sentence is about writing to the provider. Whether the Google Calendar app reads the
  intent's `beginTime` the same way is **not verified**: its source is closed, and the
  AOSP calendar source could not be fetched (the file path returned "not found"). In
  Italy (UTC+1, UTC+2) both readings land on the right day; west of UTC a local-time
  reading would show the day before. Open risk for users in the Americas.

## 6. Not done, on purpose or for lack of evidence

- **Day numbers spoken as words** ("il quindici luglio"). Both speech models wrote the
  date in digits in the one recording available ("6 ottobre", **measured**, one sample).
  Hours as words are read ("alle quattro e mezza").
- **How the Fast model (Parakeet) writes spoken hours** is unknown. No Italian voice is
  installed on this PC to synthesise a test, and no recording with spoken hours exists
  here. Whisper wrote "alle 4 e un quarto del pomeriggio" in Ricky's own note.
- **Phone numbers, addresses, to-dos.** Not started. To-dos would need the text model.
- **A visible list of found dates.** The highlights are still inline only.
- **Google ML Kit entity extraction** was considered and not pursued: it would bring a
  Google SDK into an app whose promise is that nothing leaves the phone. Its data
  disclosure page was downloaded but **not read**, so this is a caution, not a finding.
- **The PC app** has the same old behaviour and the same setup copy.

## 7. To confirm on the phone (versionCode 112)

1. Record or open a note with a date and an hour; the words are underlined on the Muffin!
   tab as well as in History.
2. Tap a date: the dialog shows the right day; "Open App" opens the calendar on that day,
   title filled in. Check an all-day one lands on the right day.
3. Tap an hour with no day: the clock opens with that hour. This is the path that needed
   the new permission.
4. A note recorded on an earlier day that says "domani": the dialog shows the day after
   the recording, not after today.
