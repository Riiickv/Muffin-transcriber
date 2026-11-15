# Where the transcriptions are stored, and why it changed

Written 2026-11-15. Covers the mobile app (`mobile_app/`, Expo SDK 57, React Native 0.86).

Every claim below carries one of these marks.

- **Measured**: run in this piece of work, with the command or script named.
- **Read**: the source file was opened in this piece of work, with the file named.
- **Not verified**: recalled or reasoned, not checked. Treat as a hypothesis.
- **Mine**: a design decision or my own arithmetic. No source forces it.

Nothing here was run on a phone. There is no emulator on this PC and the owner's phone is
production. Section 8 lists what that leaves open.

## 1. Short version

- All transcriptions were one value in AsyncStorage (key `muffin.history.v1`). On Android
  that value can be **written** at any size up to about 6 MB and can be **read** only up to
  2,097,099 bytes. One byte more and the read throws. (**Measured** on the PC with
  Android's own SQLite code, section 2.)
- The old loader turned that failed read into an empty list, and the next save wrote the
  empty list over the real one. Same for the automatic backup file. (**Read**, section 4.)
- A realistic library reaches the limit after roughly 20 to 29 hours of speech with
  Improve on. Builds that still stored a search vector inside each note reach it after
  about 185 to 250 notes of any length. (**Measured** inputs, **Mine** arithmetic,
  section 3.)
- Now: one file per transcription in the app's documents folder. A read that fails is
  never taken for "nothing there" and is never written over. The old value is copied note
  by note, each copy read back and compared, and it is removed one app start later.
  (Section 5. Tests and their limits: section 6.)
- A value already past the limit is read in pieces by a small Android module and moved
  like any other (section 5.7). The same second way in serves every other stored value,
  chats included. (**Measured** on Android's SQLite under Robolectric, not on a phone.)

## 2. What Android does when the value passes 2 MB

### 2.1 Which kind of evidence this is

The brief asked for one of two things: a plain Android SQLite unit test, or reading the
library and Android source. It is both, and they agree.

- **Measured** (unit test on the PC): Android 14's SQLite and cursor-window logic, run on
  Windows through Robolectric's native SQLite mode, with the same table, the same SQL and
  the same cursor calls as the storage library.
- **Read**: the storage library's Java and Android's source for the current main branch,
  Android 9 and Android 8.1.
- **Not verified**: a real phone, and Android 7 and 8 at run time (read only, see 2.4).

### 2.2 The probe

Source: `docs/storage-probe/` (`RowLimitProbe.java`, `build.gradle`). Results as printed:
`docs/storage-probe/results-2026-11-15.txt`.

- Gradle 9.3.1, JDK 21, JUnit 4.13.2, Robolectric 4.16.1, `android-all:14-robolectric-10818077`,
  `@Config(sdk = 34)`, `@SQLiteMode(NATIVE)`, Windows 11.
- To run it again: `androidx.test:monitor:1.8.0` is an `.aar`, which a plain Java build
  cannot use. Take `classes.jar` out of it and save it as `libs/monitor-classes.jar`, then
  `gradle test`. Do not pass `-q`, it hides the printed lines.
- The table is the library's: `CREATE TABLE catalystLocalStorage (key TEXT PRIMARY KEY,
  value TEXT NOT NULL)`, with `setMaximumSize(6 MB)`. Writes use `INSERT OR REPLACE INTO
  catalystLocalStorage VALUES (?, ?)` in a transaction. Reads use a cursor with
  `getCount()`, `moveToFirst()`, `getString(1)`. Key: `muffin.history.v1`.

What the probe environment reported (**Measured**):

| | |
|---|---|
| `config_cursorWindowSize` | 2048 KB |
| SQLite version | 3.32.2 |
| page size, max pages | 4096, 1536 (= 6,291,456 bytes, equal to `getMaximumSize()`) |
| journal mode | `memory` (a phone uses a journal file, see 2.5) |
| encoding | UTF-8 |

### 2.3 Results (**Measured**)

Reading and writing one value under the key `muffin.history.v1`:

| value size | write | read |
|---|---|---|
| 1,000,000 / 1,900,000 / 2,000,000 / 2,090,000 ASCII characters | ok | ok |
| 2,097,099 bytes | ok | ok (largest that reads) |
| 2,097,100 bytes | ok | throws |
| 2,097,152 / 2,200,000 / 3,000,000 / 5,000,000 | ok | throws |

- The exception is `android.database.sqlite.SQLiteBlobTooBigException: Row too big to fit
  into CursorWindow requiredPos=0, totalRows=1`.
- The limit counts UTF-8 bytes, not characters. The largest readable value was 1,048,549
  times "è" (2,097,098 bytes) and 699,033 times "€" (2,097,099 bytes).
- 2,097,152 minus 2,097,099 is 53 bytes of window overhead for this key (**Mine**: the
  subtraction. Which bytes they are, I did not work out. A longer key lowers the limit.)
- After the failed read, other keys in the same database still read and write.
- The cap on the whole database: the largest single value that could be written into an
  empty database was 6,264,525 bytes (found by halving, to within 1,024 bytes). The next
  size gives `SQLiteFullException: database or disk is full (code 13 SQLITE_FULL)`. With
  rows of 100,000 characters, 62 were written and the 63rd failed.
- Replacing a large value does not need room for two copies: a 5,500,000 character value
  was replaced twice without error. (Under `journal_mode=memory`. On a phone the journal
  is a separate file. **Not verified** that the result is the same there.)
- A value too big for the window can still be read in pieces with plain SQL:
  `SELECT length(value)` and then `SELECT substr(value, ?, 200000)`, 26 queries, gave back
  a 5,000,024 character value identical to what was written. This is the basis of a
  rescue, now built (section 5.7). The storage library offers no such call.

### 2.4 The source, and what it says per Android version (**Read**)

Storage library, `@react-native-async-storage/async-storage` 2.2.0, in
`android/src/main/java/com/reactnativecommunity/asyncstorage/`:

- `ReactDatabaseSupplier.java`: database `RKStorage` (line 25), table as above (line 35),
  size `BuildConfig.AsyncStorage_db_size * 1024 * 1024` (line 44) applied with
  `setMaximumSize` (line 104). `config.gradle` `getDatabaseSize()` defaults to 6 and can
  be raised with the Gradle property `AsyncStorage_db_size_in_MB`. The app sets neither
  that nor `AsyncStorage_useNextStorage`.
- `ReactDatabaseSupplier.ensureDatabase()` (lines 73 to 106): when opening the database
  fails, it tries a second time and **deletes the database first** (`deleteDatabase()`,
  line 84). Everything in AsyncStorage goes with it.
- `AsyncStorageModule.multiGet` (lines 94 to 159): `getCount()` at line 123,
  `moveToFirst()` at 130, `getString(1)` at 134, all inside `try`, with
  `catch (Exception e)` at 139 that reports the error to JavaScript.
- `src/AsyncStorage.native.ts`: `getItem` rejects its promise with that error.

So in JavaScript `AsyncStorage.getItem('muffin.history.v1')` **throws** (rejects). It does
not return `null` and it does not return a cut-off string.

Android itself (fetched from android.googlesource.com on 2026-11-15):

- `core/res/res/values/config.xml`: `config_cursorWindowSize` is 2048 in main and in
  `android-8.1.0_r1`. `CursorWindow.java` (main, lines 790 to 796) reads it and multiplies
  by 1024.
- `core/jni/android_database_SQLiteConnection.cpp`, main, lines 903 to 907: when a query
  has rows and none of them fits (`totalRows > 0 && addedRows == 0`), it throws
  `SQLITE_TOOBIG` with the text "Row too big to fit into CursorWindow requiredPos=%d,
  totalRows=%d". `android_database_SQLiteCommon.cpp` (lines 203 to 204) maps that to
  `SQLiteBlobTooBigException`. The probe printed exactly this text, which is how I know
  it ran this native code (**Mine**: an inference from the matching message. I did not
  read Robolectric's build to confirm how its native library is made.)
- The same check is in `android-9.0.0_r1` (1 match for the message) and is absent in
  `android-8.1.0_r1` and `android-8.1.0_r81` (0 matches).
- Android 7 and 8 (the app's `minSdkVersion` is 24): without that check the window comes
  back with no rows and no error. `getCount()` still says 1, and `getString(1)` then
  fails with `IllegalStateException` ("Couldn't read row %d, col %d from CursorWindow",
  `android_database_CursorWindow.cpp` in 8.1, lines 58 to 61). That exception is caught by
  the same `catch (Exception e)`, so JavaScript also gets a rejected promise. **Read
  only**: this path was followed in the source, not run.

### 2.5 Limits of this evidence

- The probe ran Android's code built for a PC, not a phone. Manufacturers can change
  `config_cursorWindowSize`. **Not verified** on any device.
- Robolectric's SQLite reported `journal_mode=memory`. Android's default is `TRUNCATE`
  with `synchronous=FULL` (**Read**: `db_default_journal_mode` and `db_default_sync_mode`
  in `config.xml`, main and 8.1). The library never turns on write-ahead logging
  (**Read**: no `enableWriteAheadLogging` in its Java). This matters for the size cap
  measurements, not for the read limit, which is decided in the cursor window.
- iOS was not looked at for this limit. The iOS side of AsyncStorage does not use a
  cursor window. **Not verified**.

## 3. How large a real library gets

### 3.1 Characters per hour of speech (**Measured**)

Source: the PC app's own library, `%LOCALAPPDATA%\MuffinTranscriber\history.json`. Only
totals were computed, no text was printed. Audio length is the last end time in each
note's subtitle track. Script: a few lines of Python, re-run on 2026-11-15 before writing
this.

| | |
|---|---|
| notes | 8 |
| audio | 2,100 s |
| raw text | 25,870 characters, 4,487 words |
| rate | 12.32 characters per second = 44,349 per hour, 128 words per minute |
| per note, min / median / max | 2.6 / 8.5 / 13.6 characters per second |
| UTF-8 bytes per character | 1.0143 (same once escaped as a JSON string) |
| improved text / raw text | 1.037 (one note only) |
| notes with a summary | 0 |
| search vector, 384 numbers, as JSON | 8,030 to 8,065 characters (3 notes) |

Two more points, from `docs/speed-research.md` (**Read** there, measured in that work):
181 s of Italian read aloud gave 2,481 characters (13.7 per second, about 49,300 per
hour), and a 116 s phone recording gave about 1,120 characters (about 9.7 per second,
about 34,900 per hour).

Weak spots: eight notes, one person, one language, one improved text, no summaries. The
range 35,000 to 50,000 characters per hour is the spread of these three sources, not a
population estimate.

### 3.2 When the old value stops being readable (**Mine**, from the numbers above)

Limit: 2,097,099 bytes for the whole list. Per note I assumed about 250 bytes of other
fields (id, date, file name, language): an estimate, not measured.

| what each note holds | 35,000 /h | 44,349 /h | 50,000 /h |
|---|---|---|---|
| raw text only | 59 h | 47 h | 41 h |
| raw plus improved (x 2.037) | 29 h | 23 h | 20 h |

A summary adds to this. Not measured, there were none in the sample.

With a search vector in every note (about 8,044 characters each), length matters much
less than the number of notes:

| note length | bytes per note | notes at the limit | speech at the limit |
|---|---|---|---|
| 30 s | about 9,060 | 231 | 1.9 h |
| 2 min | about 11,350 | 184 | 6.1 h |
| 10 min | about 23,570 | 88 | 14.7 h |
| (text of zero length) | 8,294 | 252 | |

Does a note carry a vector? **Read**: at commit `d52247f` (versionCode 108) every
recording stores `embedding` in its history item when the helper model is installed
(`components/RecordingProvider.tsx` lines 290 to 298, `app/history/[id].tsx` lines 367 to
376), and the model is `all-MiniLM-L6-v2` (`utils/ModelManager.ts` line 196), the same 384
numbers as on the PC. The current working tree moved vectors to `utils/searchIndex.ts`
(`docs/chat-research.md` 13.6). **Not verified**: which builds are on users' phones, and
the exact length of a vector as the phone writes it (assumed equal to the PC's).

So for anyone who recorded a few hundred notes on a build that stored vectors, the limit
is close or already passed. This is the part that makes the problem urgent.

## 4. How the notes were lost (**Read**)

`utils/persistentStore.ts` before this change:

1. `load()` called `AsyncStorage.getItem(key)` inside `try`. On any error it logged and
   returned the initial value. For the history that is `[]`.
2. The store cached that `[]` as the loaded value.
3. The next `save()` (a new recording, a rename, the audio clean-up at start) wrote the
   cached list back with `setItem`. `INSERT OR REPLACE` succeeds, and the real list is
   gone.

The same thing reached the backup. `utils/historyStore.ts` refreshed the user's backup
file (`utils/transcriptBackup.ts`, the "keep after uninstalling" option) after every save,
from the list in memory. After step 3 that file was rewritten with the near-empty list.
The one copy meant to survive the app was overwritten by the same event.

Two more hazards in the same database, both **Read** in section 2.4:

- The whole database is capped at about 6 MB. Past it, writes fail with `SQLITE_FULL`.
- When the database fails to open twice, the library deletes it.

## 5. What was built

### 5.1 Alternatives, and why they lost (**Mine**)

- **Raise `AsyncStorage_db_size_in_MB`.** Only moves the write cap. The 2 MB read limit
  is Android's cursor window and is untouched.
- **One row per note plus an index row, still in AsyncStorage.** Fixes the 2 MB limit for
  all but a single enormous note. Loses because the cap is on the whole database (about
  68 hours of speech with Improve, by the numbers of section 3, shared with chats and
  settings), and because the library deletes the database when it will not open. Notes
  should not live where one failed open erases everything.
- **AsyncStorage's other Android backend (`AsyncStorage_useNextStorage`).** **Not
  verified** how it reads large values. Switching it moves every store of the app at
  once, for a gain nobody measured.
- **A real SQLite library.** Would work. It is a new native dependency and a native
  build that cannot be tried here. Files need nothing new.
- **One file holding the whole list** (the shape of `utils/searchIndex.ts`). Every save
  rewrites every note, so every save puts the whole library at risk, and the file library
  cannot make a write all-or-nothing (5.3). Fine for an index that can be rebuilt, not
  for the notes.
- **Chosen: one file per note.** A write touches one note. Nothing grows towards a limit
  (a test stores a 3 MB note and a library past 6 MB). A damaged file costs one note at
  most, and section 5.2 is about making even that unlikely.

### 5.2 The store (`mobile_app/utils/noteStore.ts`)

Pure TypeScript with no native imports. The folder and the old value are passed in, so
every failure can be run on Node.

**Files.** Folder `documentDirectory/transcriptions/`. A note with id `1760000000001`
(ids are timestamps in digits) is `n1760000000001.json`. An id with any other character
is spelled out in hex with an `x` prefix, so an id can never be a path and two ids cannot
collide where the file system ignores case. Contents: `{"v":1,"note":{...}}`. Beside it
there can be `.tmp` (a write in progress), `.bak` (the spare copy) and `.gone` (a delete
marker, 5.2 "Deleting").

**Writing a note.** Write `.tmp`. If the current `.json` is a good copy and was not
written in this session, rename it to `.bak`. Rename `.tmp` to `.json`. So the `.bak` is
always the copy the note had when the app started, which is the copy most likely to be
safely on the disk (5.4). All file work goes through one queue, and a save writes the
note as it is when its turn comes, so two quick edits cannot land in the wrong order.

**Loading.** List the folder, then per note:

- a complete `.tmp` is the newest copy: it is put in place;
- a `.tmp` that is cut off or empty is dropped, the copy it was replacing is intact;
- a good `.json` is used;
- a cut-off `.json` falls back to a good `.bak`;
- an empty file counts as nothing there (that is what a power cut leaves of a file that
  never reached the disk);
- a file that will not open, or holds a format this build does not know, or is damaged
  with no good copy beside it, is **counted as unreadable and never touched again**:
  not shown, not overwritten, not deleted.

**A folder that cannot be listed** is not an empty library. The status says `failed`,
the listing is tried again at the next call, and new recordings are still written.

**Status.** `loaded`, `failed`, `unreadable` (count), `legacyKept`, `unsaved` (count).
`isComplete()` is true only when the list in memory is everything there is. Only then may
anything be written from the list over another copy (the backup, 5.5).

**Moving the old value** (`carryOver`):

1. Read `muffin.history.v1`. If the read throws, or the text is not a JSON list: leave it
   exactly as it is, set `legacyKept`, carry on with the files. There is no code path
   that writes to the old key. The interface the store is given has `read` and `remove`
   only.
2. For each element: a note that already has a file is skipped (the file is newer or
   equal), a note with a `.gone` marker is skipped, the rest are written as files. The old
   search vector (`embedding`) is dropped on the way.
3. Every file written is read back and compared, character for character, with what was
   written. A mismatch deletes the wrong file and keeps the old value.
4. An element that is not a note, or the same id twice, keeps the old value too.
5. The old value is removed only at a start where every note in it was found in a file
   and **nothing had to be written**. That is never the session that wrote the files.
   Reason in 5.4.
6. Any stop in between is harmless: the next start does the same steps again.

**Deleting.** While the old value may still exist, a delete first writes an empty
`<name>.gone`, then removes the note's files. Without the marker the next start would
find the note in the old value and bring it back. Markers are removed together with the
old value.

### 5.3 What the file library guarantees (**Read**)

`expo-file-system` 57.0.0, legacy API.

- Android, `FileSystemLegacyModule.kt`: `writeAsStringAsync` (lines 213 to 226) opens a
  `FileOutputStream`, which empties the file, and writes into it. There is no temporary
  file and no call that forces the data to disk. `moveAsync` (lines 267 to 284) is
  `File.renameTo`.
- iOS, `FileSystemLegacyModule.swift`: `writeAsStringAsync` writes with `.atomic` (lines
  102 and 112). `moveAsync` (lines 128 to 141) removes the destination first and then
  moves, so a stop between the two leaves no destination.

The store assumes exactly this and no more: a write can be cut off at any byte, a rename
is all-or-nothing, and on iOS a rename can leave the destination missing. All three are
in the tests (section 6).

### 5.4 The gap that cannot be closed from JavaScript, and how it is bounded

A file that was written and read back is in the system's memory. It is on the disk some
seconds later, and nothing in `expo-file-system` can force that. If the phone loses power
in between, a new file can come back empty (**Not verified** on a phone: this is the
usual behaviour of Android's file systems as I remember it, and the tests model the
pessimistic version of it, where every file not yet on disk is empty and every rename
has still happened).

Removing the old value, on the other hand, is a database commit, and with Android's
default settings a commit is forced to disk (**Read**: `synchronous=FULL`, section 2.5).

So "copy, read back, then remove" in one session could, with a power cut in the following
seconds, leave empty files and no old value. That is why the old value is removed one
start later (**Mine**). The same reasoning gives the `.bak` rule: the spare copy is the
one from before this session, and it is replaced once per session at most.

What remains: an edit made seconds before a power cut can be lost. The note itself is
not, as long as it was on disk when the app started. A note recorded seconds before a
power cut can be lost entirely. The old code had the second risk too; nothing in
JavaScript removes it.

### 5.5 The rule for every other store (`mobile_app/utils/valueStore.ts`)

`utils/persistentStore.ts` (settings, chats, memory, the hint flags) is now a thin layer
over `valueStore.ts`. One rule was added: **a value that could not be read is never
written over.** If `getItem` throws, or the text is not JSON, or `hydrate` throws, the
session runs on the starting value in memory and `save()` does not touch storage.
`readFailed()` reports it.

Backup and export:

- `utils/transcriptBackup.ts` and `utils/transcriptExport.ts` are unchanged.
- The automatic mirror in `utils/historyStore.ts` now runs only when the list is
  complete.
- Turning on "keep after uninstalling" (`app/(tabs)/settings.tsx`) refuses to write the
  first backup from an incomplete list, with the same message as the History screen.
- The manual export still exports whatever is in the list (section 8.6).

### 5.6 What the user sees

One new string, `history.unreadable`, in six languages: "Some transcripts could not be
read." It is shown above the History list when the list is known to be incomplete. "No
transcripts yet." is shown only when the library is known to be empty, not while the
first read is running and not together with the notice.

### 5.7 Reading a value that is already past the limit (`mobile_app/modules/storage-rescue`)

Added 2026-11-15, after the rest. Without it, a phone already past the limit would show the
notice for ever and never get its notes back.

**What it does.** `RowReader.java` opens the storage library's database (`RKStorage`) on its
own connection, **read only** (`OPEN_READONLY | NO_LOCALIZED_COLLATORS`), and reads one
value in pieces: `length(value)` and `length(CAST(value AS BLOB))` first, then
`substr(value, start, 200000)` until the end, then both lengths again. It returns the text
only when it has as many characters and as many UTF-8 bytes as SQLite says the value has,
and both counts are the same before and after. Anything else throws. No database means
`null`, and nothing is created.

Why these choices (**Mine**, with the facts each rests on):

- **200,000 characters per piece.** A character is at most 4 bytes in UTF-8, so a piece is
  at most 800,000 bytes, well inside the 2,048 KB window. SQLite counts characters, so a
  piece always ends between whole characters, emoji included (tested).
- **The byte count.** `length()` and `substr()` stop at a NUL character, so a value holding
  one would come back short and pass a character count. The byte count does not stop
  there (tested: such a value throws).
- **A connection of its own, read only,** rather than the library's
  (`ReactDatabaseSupplier`): the library's way to open the database deletes it after a
  second failure (2.4). A read-only connection cannot create, change or delete anything.
- **substr, not a bigger cursor window.** `CursorWindow(String, long)` only exists from
  Android 9 (**Not verified** against the source in this work; recalled), and the app
  runs from Android 7. `substr` needs nothing from the Android version.

**Where it is used.** `utils/valueStore.ts` `readWithRescue()` (pure, tested on Node)
wraps a read: when the ordinary `AsyncStorage.getItem` throws and the module is there, it
tries the pieces. Only text counts as rescued; when that fails too, the first error is
thrown, so the value is still treated as unreadable and kept. `utils/persistentStore.ts`
`readStoredValue` is that wrap around AsyncStorage. It is the read for the old
transcription value (`utils/noteFiles.ts` `legacyRow`) and for every small store
(settings, chats, memory). So:

- an old value of any size up to the database cap is moved to files like any other, read
  in pieces at the start that copies it and again at the start that removes it;
- a chat list past 2 MB still loads and saves (it would hit the 6 MB cap later: 8.7).

The module is Android only (`expo-module.config.json`) and looked up with
`requireOptionalNativeModule`, so iOS, the browser and older builds simply have no second
way in.

**Checked** (all **Measured** on 2026-11-15):

- `docs/storage-probe/src/test/java/probe/RowReaderTest.java`, in the probe environment of
  2.2 (Android 14 SQLite, Robolectric native mode), on a database made the way the
  library makes it and kept open the whole time: the library's own read of a 3,800,012
  byte list (Italian text, quotes, backslashes, emoji) throws "Row too big", and the reader
  returns it identical; a 6,000,000 character value; lengths 1, 199,999, 200,000,
  200,001, 400,000 and 600,001 of a 4-byte character; `[]` and the empty string; a missing
  key and a missing database (null, nothing created); a value with a NUL (throws); the
  library still reads and writes afterwards. 8 of 8 pass.
- Three deliberate bugs in the reader, each caught: pieces too large for the window, no
  byte check, last piece skipped. The before-and-after recheck has no test: nothing
  changes the value during these tests.
- The module compiled inside the app's own Android build (a copy of the prebuilt
  `mobile_app/android`, `gradlew :storage-rescue:compileReleaseKotlin
  :storage-rescue:compileReleaseJavaWithJavac`, JDK 21, offline): BUILD SUCCESSFUL.
  `npx expo-modules-autolinking resolve --platform android` lists
  `expo.modules.storagerescue.StorageRescueModule` exactly as it lists the audio converter,
  which is in the generated module list of the current app build.
- `tests/valueStore.test.ts` and `tests/noteStore.test.ts`: the rescue tried only after a
  throw; the first error kept when the rescue fails, finds nothing or is missing; an old
  value whose ordinary read throws moved over two starts through the rescue.
- The browser build still starts and moves an old value with the new import in place.

**Not verified:** the module on a phone (that it loads, how long a 6 MB read takes,
handing a string that size to JavaScript, and `JSON.parse` of it in Hermes); a database
left with a hot journal after a crash, which a read-only connection cannot roll back (the
read then fails, and the value stays kept, as before the module).

## 6. How it was checked, and what each check proves

All **Measured** on 2026-11-15, in `mobile_app/`.

| check | result |
|---|---|
| `npm test` | 204 pass, 0 fail (38 of them in `tests/noteStore.test.ts`, 9 in `tests/valueStore.test.ts`) |
| `npx tsc --noEmit` | no errors |
| `npx tsc -p tests/tsconfig.json` | no errors |
| `npm run lint` | 19 warnings, 0 errors (the baseline) |
| deliberate bugs, `docs/storage-probe/mutants.py` | 22 of 22 caught |
| the native reader | section 5.7 |

The tests use a folder kept in memory that can be told to fail, to damage what it is
given, to answer slowly, to stop the process at one chosen step, and to behave like a
power cut. The four that carry the most weight:

- **Stopped at every step** (twice: plain rename, and the iOS kind that deletes first).
  A first start that moves six old notes, then a recording, an edit, a delete and a second
  edit. The whole run is repeated once per file operation, dying at that operation, and
  the app is started again on what is left. No note may be lost, changed, doubled or
  brought back, and by the third start the old value must be gone.
- **A power cut at every step of the first start after the update.** Same idea with the
  power-cut model. No old note may be lost. This is the test that fails if the old value
  is removed in the session that wrote the files.
- **A power cut at every step of an ordinary session.** A note that was on disk when the
  app started is never lost.
- **A failed read followed by a save** (`valueStore.test.ts`): the stored value is still
  there, byte for byte. This is the old bug as a test.

The mutant script puts 22 single bugs into `noteStore.ts`, one at a time (no read-back,
old value removed too early, no temporary file, no delete marker, spare copy replaced on
every write, no write queue, and so on) and checks that at least one test fails for each.
The first run caught 12 of 14 and the two that got through were real gaps (two quick
edits could leave no copy that had reached the disk; nothing tested ordering under slow
writes). Both were fixed in the store, not in the tests. Run it from `mobile_app/`:
`python ../docs/storage-probe/mutants.py`. It restores the file when it ends.

**On screen**, in the browser build (`expo start --web`), where each "file" is one
storage key: five old-format notes became five keys, same order and text, no `embedding`
left; the old key was still there after the first start and gone after the second; with
one note cut short the notice appeared above the four readable notes and the damaged
text was untouched after a rename of another note; with the damage undone the notice
went away; an empty library showed "No transcripts yet."; an old value that was not
valid JSON showed the notice, no empty-state text, and was left as it was.

What none of this proves: that the phone's file library behaves as read in 5.3, that the
power-cut model matches a real phone, and how long loading takes (section 8).

## 7. Files

New: `mobile_app/utils/noteStore.ts`, `utils/noteFiles.ts` (the folder on the phone, one
storage key per file in the browser), `utils/valueStore.ts`, `tests/noteStore.test.ts`,
`tests/valueStore.test.ts`, `modules/storage-rescue/` (the Android reader),
`docs/storage-research.md`, `docs/storage-probe/` (the probe, the reader's test, the
mutant script).

Changed: `utils/historyStore.ts` (same exports, plus `historyIsComplete()` and
`useHistoryStatus()`), `utils/persistentStore.ts` (plus `readStoredValue`),
`app/(tabs)/history.tsx`,
`app/(tabs)/settings.tsx`, `constants/strings.ts` and the five translation files,
`package.json` (the two test files added to `npm test`), `docs/chat-research.md` (a
pointer in 13.6).

## 8. Not verified, and open

1. **A value that is already past the limit on someone's phone** is now read in pieces
   (5.7). Built, tested under Robolectric and compiled in the app's build; not run on a
   phone.
2. **Nothing was run on a phone.** To check on the first device build: the first start
   after the update keeps every note; the old key is gone after the second start; logcat
   shows "was read in pieces" only for a value past 2 MB; time
   from start to a filled History list with a few hundred notes (each note is one read
   through the bridge, eight at a time); time of the first-start copy (three calls per
   note, one after the other).
3. **The power-cut behaviour of the phone's file system** (5.4) is modelled, not measured.
4. **Android 7 and 8** follow a different path to the same rejected read (2.4). Read only.
5. **The notice stays** as long as an unreadable file or an unmovable old value exists.
   There is no screen to export or remove the damaged file. `unsaved` (a note that could
   not be written) is logged and counted, not shown.
6. **Manual export** exports the list as it is, without a warning when it is incomplete.
7. **Chats have the same shape as the old history**: one value that grows. Past 2 MB they
   are now read in pieces (5.7), and they are protected from being overwritten after a
   failed read (5.5). Past about 6 MB the database is full and saves fail. Sizes not
   measured. Moving chats to files the way notes moved is the lasting fix.
8. **Settings and the other small stores**, when unreadable, run on defaults for the
   session and do not save. Nothing tells the user.
9. **Two narrow cases, by design.** A `.tmp` that will not open is overwritten by the next
   save of that note (it was never put in place). A copied file that is later found cut
   off, while the old value still holds the note, shows the note from the old value and
   keeps the notice up, because the cut-off file could be a newer edit.
10. **iOS** has no 2 MB window that I know of (**Not verified**). The new store is the
    same on both systems.

## 9. Do not

- Do not remove the old value in the session that wrote the files (5.4).
- Do not add a way to write to `muffin.history.v1`.
- Do not turn a failed read into an empty value anywhere. Use `valueStore`.
- Do not write a backup or any other copy from a list that is not complete.
- Do not delete, overwrite or "repair" a file the store could not read.
- Do not replace the `.bak` on every write, and do not drop `.gone` markers while the old
  value may exist.
- Do not build a file name from an id without `noteStem()`.
- Do not let the reader in `modules/storage-rescue` open the database writable, or
  through the library's own opener, and do not drop its byte-count check.
- Do not put large or growing text back into AsyncStorage: 2,097,099 bytes per value to
  read, about 6 MB in all, and a database that is deleted when it will not open.

## 10. Sources opened in this work

| source | status |
|---|---|
| `@react-native-async-storage/async-storage` 2.2.0: `ReactDatabaseSupplier.java`, `AsyncStorageModule.java`, `AsyncLocalStorageUtil.java`, `AsyncStorageErrorUtil.java`, `config.gradle`, `build.gradle`, `src/AsyncStorage.native.ts` | read |
| AOSP main: `core/res/res/values/config.xml`, `CursorWindow.java`, `SQLiteCursor.java`, `android_database_SQLiteConnection.cpp`, `android_database_SQLiteCommon.cpp`, `android_database_CursorWindow.cpp`, `libs/androidfw/CursorWindow.cpp` | read |
| AOSP `android-8.1.0_r1`: the same files; `android-8.1.0_r81` and `android-9.0.0_r1`: `android_database_SQLiteConnection.cpp` | read |
| `expo-file-system` 57.0.0: `android/.../legacy/FileSystemLegacyModule.kt`, `ios/Legacy/FileSystemLegacyModule.swift` | read |
| Robolectric 4.16.1 native SQLite, SDK 34 | measured with (its internals not read) |
| `%LOCALAPPDATA%\MuffinTranscriber\history.json` | measured (totals only) |
| `docs/speed-research.md`, `docs/chat-research.md` 13.6 | read |
| app code at `d52247f` and in the working tree: `utils/historyStore.ts`, `utils/persistentStore.ts`, `utils/transcriptBackup.ts`, `utils/transcriptExport.ts`, `utils/searchIndex.ts`, `components/RecordingProvider.tsx`, `app/history/[id].tsx`, `utils/ModelManager.ts` | read |
