# Chat: measured, rebuilt, measured again

Written 2026-11-15, rewritten the same day after the rebuild. Everything here was run on
the PC. **Nothing in this document was checked on a phone.**

Status words: **read** (source opened this session), **measured** (command run this
session, number from its output), **not tested**, **mine** (my judgement, not forced by
any source).

**Section 14 replaces the answer step described in sections 2, 4 and 10** (versionCode
116, after the chat failed on the phone). Read it first.

## 1. Answer

The old chat got **5 of 17** realistic requests right and claimed actions it never took.
It was rebuilt. On 24 requests written after the last change to the prompts and run once
per model (**measured**):

| model | old chat, 17 requests | rebuilt, same 17 | rebuilt, 24 unseen | commands | answer from a note | answer is not in the notes |
|---|---|---|---|---|---|---|
| Qwen 2.5 1.5B Q4_0 (the "Balanced" text model) | 5 | 16 | **21** | 11/11 | 8/8 | 1/4 |
| Llama 3.2 1B Q4_K_M (chat model) | 5 | 15 | **19** | 10/11 | 7/8 | 1/4 |
| Phi-3 Mini 4K Q4 (chat model) | gibberish, 7 of 7 tried | 17 | **21** | 10/11 | 8/8 | 3/4 |

What that means in use:
- **Orders work.** Change a setting, open a screen, delete, rename: 31 of 33 across the
  three models on the unseen set. The two misses are the same order, "delete these two
  notes", where the model deleted one.
- **Questions whose answer is in a note work** (23 of 24).
- **Questions whose answer is in no note are the weak point.** The two small models make
  one up three times out of four (a price, a hotel name, a train number). Phi-3 Mini says
  it cannot find it three times out of four. This is the reason the beta warning stays.
- Phi-3 Mini was unusable before (section 5) and is the best of the three now.

## 2. What was built

Files: `mobile_app/utils/chatPlan.ts` (new, pure, tested by
`mobile_app/tests/chatPlan.test.ts`, fixtures in `tests/chatFixtures.ts`),
`utils/ChatEngine.ts` (rewritten below the model loading), `utils/appCapabilities.ts`
(settings table only), `app/(tabs)/chat.tsx` and `components/InlineSettingControl.tsx`
(small changes), `app/setup.tsx` (helper model moved under the chat models).

The message goes one of two ways. The choice is made **in code**, not by the model.

**An order.** `commandGuess` reads the message: lead-ins are dropped ("please", "puoi",
"kannst du"), then a verb in first position plus the kind of word that goes with it (a
setting word, a screen word, "note") in the six languages. A message that opens with a
question word is not an order, except "where/how do I change X". Messages joined by "and"
are read clause by clause.
- Opening a screen is decided there, with no model call.
- Otherwise `commandRequest` builds a short instruction and a JSON schema: one branch per
  action that this message can mean, the action name fixed, the setting key fixed to the
  real keys, the value typed per key (true/false or the listed options), notes named by
  short aliases N1..N6 that exist only for the notes the search found. llama.cpp compiles
  the schema to a grammar, so the model can only write a valid action list or "none".
  It cannot say "done" without writing the action, because the action is all it can write.
- A delete or rename that matches no note returns an action with no target, which the
  screen draws as "Couldn't do that". It does not guess a note.

**Anything else.** `answerSystem` builds a short prompt: who it is, today's date, how
many notes exist and which is newest, saved facts about the user, then only the notes
that match the message, then four rules at the end (reply in the user's language, one or
two sentences, name the note, use only what is written). No list of every note name and
nothing about actions.

Prompt sizes (**measured** with each model's tokenizer): 122 to 467 tokens for an order,
234 to 728 for an answer. The old prompt was 2,447 to 3,260 before the user typed
anything and grew with every saved note. Worst case built on purpose (300 long notes, 50
saved facts, long earlier turns): 2,327 to 2,453 tokens unfitted. `chatStream` counts the
prompt with the model's own tokenizer and shrinks it in four steps (less of each note,
then fewer notes and fewer earlier turns) until it is under the budget for that model.

Search (`searchNotes`), replacing `searchTranscripts`:
- words split on separators, accents folded, a crude stemmer, so "dentista?" matches
  "dentista" and plurals match;
- a stop list in the six languages, including the words every question is framed with
  (cost, time, name, number); without them "costa" pulled the gym note into a question
  about a ceramics course (**measured**);
- BM25 ranking with a bonus for the note's name; no substring matching;
- "newest", "today", "yesterday" understood; the newest note is no longer forced in;
- a note is shown only if it scores at least half of the best one (0.3 let noise in);
- a follow-up with no content words of its own ("E cosa devo portare?") searches with the
  previous user message;
- the passage cut from a long note is centred on the sentences that matched, so the
  plumber's price at the end of a 1,369-character note is in the prompt. A full stop ends
  a sentence only when a space follows, so "1.350 euro" stays whole (found by a unit test).

Context size at load: 4096, then 2048 if that fails; Phi-3 Mini gets 2048 only. It was
8192, 4096, 2048. Reasons in sections 5 and 6.

## 3. How it was measured

Engine: llama.cpp server b12387 on the PC, context 4096, one run per request, fixed seed.
The model files are the ones the app downloads. The harness (`chat_new.mjs`, scratchpad,
not in the repo) imports `utils/chatPlan.ts` and the test fixtures directly, so the
prompts and schemas are the app's own. The fitting loop in the harness is a copy of the
one in `chatStream`, not the same code.

Library: 10 made-up notes (8 Italian, 1 English, 1 long), 2 saved facts, default settings.

Three sets of requests:
- **old 17**: the requests the old chat was measured on.
- **development, 36**: written during the rebuild. The prompts and the gate were changed
  while looking at these, so their scores flatter the result. Not quoted above.
- **unseen, 24**: written after the last prompt change and run once per model. 11 orders,
  8 answerable questions, 4 questions whose answer is in no note, 1 greeting.

Each request has an automatic check. The first automatic pass on Qwen accepted an invented
phone number and "Lista della spesa" as the answer to an unrelated question, so every
reply was then read by eye and the checks tightened. The numbers above are after that.

Limits of this measurement (**mine**): I wrote the notes, the requests and the checks, so
the sets are not independent of the design. One run per request, so a difference of one
or two requests between models is noise. The requests are mostly Italian and English.

The gate alone (`commandGuess`, no model): 33 of 33 on the set it was written around, 72
of 73 on a second set in six languages written before running it (**measured**; both sets
are mine). The known miss, kept as a test: "Change the summary of the Rome note" is read
as a setting order.

## 4. Failures, quoted (**measured**)

Unseen set:
- "Cancella la nota sul viaggio a Roma e quella del pesto": Llama and Phi-3 deleted one
  note of the two. Qwen deleted both.
- "Che numero ha il treno per Roma?" (no train number in the note): all three answered
  with the departure time, "8:10".
- "Quanto costa il weekend alle terme?": Qwen and Llama "circa 150 euro per persona".
  Phi-3 said it is not in the notes.
- "Come si chiama l'hotel a Roma?": Llama invented "Hotel Santa Maria dei Miracoli". Qwen
  dodged with the hotel's location. Phi-3 said it is not in the notes.
- "Entro quando devo decidere per l'assicurazione?": Llama gave a date that is in the note
  but belongs to something else.
- "Buongiorno!" on Phi-3: it greeted, then repeated the same sentence about the newest
  note, separated by "===", until the 400-token limit. **Open, not fixed.**

Development set, things worth knowing:
- Llama 3.2 1B is weak at reading: 3 of 8 answerable questions. It swaps the two insurance
  prices (480 and 520), answers a neighbouring fact, and once answered in English with a
  sentence about the accountant. On the unseen set it got 7 of 8, so the real figure is
  somewhere between. Qwen 2.5 1.5B is the better reader of Italian of the two small ones.
- Qwen refuses "Dammi tre idee regalo per mia mamma basandoti sulle mie note" although the
  note is in the prompt ("non riesco a trovare informazioni"). The "use only what is
  written" rule costs this one.
- "Il boiler va cambiato?" (the note says it is to be decided): Qwen says yes, Llama no.

## 5. Phi-3 Mini breaks on long prompts (**measured** on the PC engine)

With the old chat prompt Phi-3 Mini wrote letter salad on all 7 requests tried, for
example "orlocimepicks. notheatohveithenisiwehetheroketaskoversievehopitizenipostype".
Prompts were 2,937 to 3,205 tokens. Context 4096 and 8192 gave the same output.

Probe (`phi_probe.mjs`): the same question with a growing pile of notes in front.

| prompt tokens | 951 | 1,375 | 1,602 | 1,834 | 2,019 | 2,217 | 2,608 |
|---|---|---|---|---|---|---|---|
| reply | correct | correct | correct | correct | correct | correct | garbage |

File metadata (**read** from the GGUF with `gguf_meta.py`): `phi3.context_length = 4096`,
`embedding_length = 3072`, `block_count = 32`, `head_count_kv = 32`, no sliding-window
key, a chat template with no system role, `add_bos_token = True`.

**The cause is not identified.** I remember reading of a Phi-3 attention-window problem
in llama.cpp; that is recall, I did not open a source for it, and the metadata has no
window key to support it. **Not tested:** whether the engine inside the app (llama.rn
0.12.5, an older llama.cpp) does the same. If chat with Phi-3 Mini printed nonsense on
the phone before this build, this is why.

What the code does about it (**mine**): Phi-3 prompts are held to 1,500 tokens
(`promptBudget`), which leaves a wide margin under the 2,217 that still worked. The
worst-case library fitted to 1,317 tokens at the third step and the reply was sensible.

## 6. Memory against context size (**measured**, PC, private memory of the engine)

| model | 2048 | 4096 | 8192 |
|---|---|---|---|
| Phi-3 Mini 4K | 2,145 MiB | 2,916 | 4,460 |
| Qwen 2.5 1.5B | | 1,005 | 1,121 |
| Llama 3.2 1B | | 741 | 873 |

The model file is memory-mapped and not counted, so these are the extra cost. The old
first choice of 8192 cost Phi-3 about 2.3 GB more than 2048 for a window it cannot use,
on top of a 2.3 GB file. The rebuilt prompts fit 4096 with room (budget 3,596), so 8192
buys nothing for the other two either. Phone memory was **not measured**; the ratio
between sizes should carry over, the absolute numbers will not.

## 7. Tried and rejected

- **One step that picks an action or "answer"** under a grammar: every question became an
  action as well (a question about the plumber became a delete).
- **The model as the judge of "order or question"**: 15 of 33, and 23 of 33 with examples
  given as earlier turns. It says "order" every time. Hence the gate in code.
- **A list of every note name in the answer prompt**: the model answered with the first
  name on the list. Removed; the prompt now gives a count and the newest note only.
- **A stricter "do not invent" rule** (variant B): on Qwen, questions with no answer went
  from 5 of 8 to 5 of 8 on the development set and 1 of 4 to 0 of 4 on the unseen set.
  Wording does not fix invention at this size.
- **A "none" way out of the command step** for orders the gate got wrong: Qwen and Llama
  never used it on the known false positive. It is still in the schema (harmless); the
  comparison without it was not run.

## 8. Decisions that are mine

No source forces any of these: the 0.5 floor for shown notes; three notes at most, 1,600
characters for the best and 800 for the others; four earlier turns kept, cut to 400 and
1,000 characters; the 1,500-token cap for Phi-3; temperature 0 for orders and 0.3 for
answers; 400 new tokens for an answer; the helper-model fallback only when the keyword
search finds nothing and the message has two content words.

## 9. Not verified

- **Everything on the phone**: speed, that the grammar step works in llama.rn (its source
  was **read**: `json-schema-to-grammar.cpp` handles `anyOf`, `const`, `enum`; `completion`
  passes `response_format` for raw prompts; the summariser already ships with the same
  option), that `tokenize` returns counts, that Phi-3 loads and talks at 2048.
- **Search by meaning on the phone.** Measured on the PC since (section 12); the phone
  engine's behaviour with long notes is not.
- **Longer conversations.** One follow-up case was tested, nothing deeper.
- **Chinese, Japanese, Thai notes.** The search splits on spaces and punctuation.
- **The start of the Llama 3 prompt.** The template writes its own begin token and the
  engine may add another. It was like this before; not looked into.
- Theme and accent option names in the chat's setting control are English only.

## 10. Check on the phone, per installed chat model

1. "Attiva la copia automatica": the setting control appears and the switch is on.
2. "Apri la cronologia": the screen opens at once.
3. "Elimina la nota ..." with a real note: the delete dialog names that note. With a note
   that does not exist: "Couldn't do that".
4. A question whose answer is in a note: one or two sentences, with the note's name.
5. Phi-3 Mini: it loads, and replies are words.
6. Speed report: paste the chat lines; a command and an answer are logged separately.

## 11. Do not

- Do not put the list of note names, the settings list or tool syntax back in the answer
  prompt.
- Do not raise Phi-3 above 1,500 prompt tokens or back to a larger window without
  repeating the probe on the phone engine.
- Do not let the model decide whether a message is an order.
- Do not move the rules above the notes in the answer prompt: notes first, rules last was
  the order that stopped the replies drifting.
- Do not go back to a plain similarity floor for search by meaning (section 12).

## 12. Search by meaning, measured (added 2026-11-15, after Ricky approved the download)

The helper model is `all-MiniLM-L6-v2-q4_k_m.gguf` from `Mungert/all-MiniLM-L6-v2-GGUF`,
the file the app downloads. It is **21.3 MB** (21,273,376 bytes, **measured**); the
catalog said 14 MB and now says 21.

Its model card (`sentence-transformers/all-MiniLM-L6-v2`, **read**): `language: en`;
384 numbers per text; "a sentence and short paragraph encoder"; "input text longer than
256 word pieces is truncated".

Test (`embed_test.mjs`, llama.cpp server b12387 with `--embedding --pooling mean`, window
512 as `EmbeddingEngine.ts` sets): each of the 10 notes embedded whole, as
`transcriptionPipeline.ts` does, then 24 questions that share no word with the note that
answers them: 10 Italian, 6 English, 1 Spanish, 1 German, and 6 with no answer in any
note. 20 of the 24 reach the fallback in the app (keyword search finds nothing).

**Results (measured):**
- Right note ranked first: **9 of 18**. Italian question on Italian notes: 3 of 10, and
  those three won by 0.01 to 0.04.
- Any two Italian texts score 0.40 to 0.55 whatever they are about. "Che tempo farà
  domani pomeriggio?" scored 0.53 against the accountant note. The model does not read
  Italian; it sees that both texts are Italian.
- English question on the English note: 2 of 2, at 0.42 against 0.18 and 0.16 for the
  runner-up.
- English question on an Italian note: right note first in 3 of 4, but at 0.11 to 0.33.
- With the 0.35 floor first shipped in vc113: right note shown 7 of 18, **only wrong notes
  shown 6 of 18**, and for the 6 questions with no answer a note was shown **4 times**.
  A wrong note in the prompt is what the small models invent answers from (section 4).
- No floor separates right from wrong: top score when right 0.11 to 0.48, when wrong 0.09
  to 0.55.
- **Long notes get no embedding at all.** The 1,369-character Italian note is 478 tokens
  (Italian is cut into many pieces by an English vocabulary, about 0.35 tokens per
  character). Twice that text, 954 tokens, is refused by the PC engine: "input (954
  tokens) is too large to process". `generateEmbedding` catches the error and stores
  nothing. So an Italian note past roughly 1,450 characters, about a minute and a half of
  speech, can never be found by meaning. **Not tested** on the phone engine.

**What the code does now (mine):** `clearestByMeaning` in `chatPlan.ts` shows one note,
and only when its score is at least 0.30 and at least 0.12 ahead of the runner-up, with
at least three embedded notes. On the 24 questions that passes three, all correct
("teeth checkup", "artwork", "launch deadline"), and nothing else: no wrong note, nothing
for the six unanswerable ones. The margins it was set from: 0.18 to 0.26 when the model
understood, 0.07 at most otherwise. Small sample, one library, thresholds chosen after
seeing the data, so read it as "fails safe", not as "tuned".

**What this means:** with the MiniLM helper, search by meaning does nothing for Italian,
Spanish, French, German or Portuguese notes. versionCode 114 said so on screen ("Chat
search by meaning. English only."). **Superseded in versionCode 115:** Ricky asked for a
multilingual helper, MiniLM is gone, and section 13 is the current state.

**Correction to what stood here before:** this section named
`cstr/multilingual-e5-small-GGUF` as a candidate from its file list alone. Downloaded and
run, that file does not load in llama.cpp at all (section 13.2). A file list is not a
feasibility check.

**Found on the way, not fixed:** the keyword search still shows notes for some questions
it should not. "Quando posso andare ad allenarmi?" brought up the plumber note (the verb
"andare"), and "Chi ha vinto la partita ieri sera?" brought up three notes ("partita IVA",
"partiamo", and the notes recorded the day before).

## 13. Multilingual helper model (added 2026-11-15, versionCode 115)

Ricky, 2026-11-15: "put it and have it in the setup and the settings so people who don't
only speak english can enjoy it". Every statement below is marked **measured** (run in
this piece of work, on the PC), **read** (source opened in this piece of work) or
**not verified**. Nothing in this section was tested on a phone.

### 13.1 Answer

- The helper model is now `multilingual-e5-small-q8_0.gguf`, 132,439,008 bytes, from
  `TwinSunsLLC/multilingual-e5-small-gguf`, MIT. It replaces MiniLM; there is one helper
  model, not two. Listed on the setup screen (third step) and in Settings > Models as
  "132 MB · Chat search by meaning. All languages."
- **Measured on the PC:** the right note is first for 28 of 32 questions in Italian,
  English, Spanish, German, French and Portuguese (MiniLM: 9 of 18, Italian 3 of 10).
  With the rule the app ships, the right note is shown for 54 to 68 in 100 questions that
  have one, a wrong note for at most 3 in 100, and a note for a question with no answer
  at most 4 in 100.
- **Found while checking the phone engine (read, section 13.5):** every phone build up to
  versionCode 114 created the helper's context without `embedding: true`, and the engine
  refuses every text in that case. Search by meaning has therefore never returned
  anything on a phone, with any model. Fixed in 115. This is from reading the engine's
  source, **not from a phone**.
- **Not verified:** that the phone engine loads this file, how long a note takes on the
  phone, and how much memory the helper takes there.

### 13.2 Choosing the file

Model: `intfloat/multilingual-e5-small`. Card **read** (saved as `cards/e5_small.md`):
MIT, 12 layers, 384 dimensions, 100 languages (the XLM-R word list), reads at most 512
tokens, and every text must start with `query: ` or `passage: `, in any language. The card
also says its cosine scores sit between 0.7 and 1.0 by design.

GGUF files looked at:

| File | Result | How known |
|---|---|---|
| `cstr/multilingual-e5-small-GGUF` q4_k, 121,008,128 bytes | **Rejected.** llama.cpp b12387 refuses it: "bert model needs to define token type count"; its header says `tokenizer.ggml.model = llama`. Made for another program (CrispEmbed) | **measured** (downloaded, run) |
| `TwinSunsLLC/multilingual-e5-small-gguf` q8_0, 132,439,008 bytes | **Chosen.** Standard header: `general.architecture = bert`, `tokenizer.ggml.model = t5`, `token_type_count = 2`, `bert.context_length = 511`, `pooling_type = 1`. Loads and answers | **measured** (header read with range requests, then downloaded and run) |
| `keisuke-miyako` q8_0 | Skipped: header says `tokenizer.ggml.model = bert`, which is the wrong word-splitter for this model | **read** (header only) |
| `mykor/paraphrase-multilingual-MiniLM-L12-v2.gguf` Q4_K_M, 124.8 MB | Not downloaded. A different model, apache-2.0, standard format | **read** (file list only), **not tested** |

The TwinSuns card (**read**, saved as `cards/e5_twinsuns.md`): MIT, converted for an iOS
app that runs it through llama.cpp with mean pooling; q8_0 matches f16 to three decimals
on its six test pairs; it too notes that unrelated text scores 0.737 and says not to use
an absolute threshold. Only q8_0 is published there. A q4 would save about 11 MB of 132,
because the word list is most of the file (my estimate from the cstr q4_k size, not a
measurement of a working q4).

The download address is pinned to revision `b6cac9615d4ecce28d7f22539b7322d695fc2886`
(**measured**: that address answers 200 with 132,439,008 bytes, and the SHA-256 of the
file I tested starts `e011debc1208e31b`, the same as the repository lists). The file
people download is the file measured, even if the repository changes.

### 13.3 What was measured, and how

Script: `scratchpad/butler/embed_test2.mjs` (not in the repository), llama.cpp b12387
server with `--embedding --pooling mean`. Ten notes (the same ones as section 3, Italian
and English), 44 questions written by me: 32 with an answer in one note (Italian,
English, Spanish, German, French, Portuguese, most of them sharing no word with the
note), 12 with no answer anywhere. Notes go in as `passage: ` + text, questions as
`query: ` + text. The script imports the app's own `piecesForEmbedding`, `meanVector`,
`packVector` and `clearestByMeaning` from `utils/chatPlan.ts`, so the last table below is
the shipped code, not a copy of it.

**Ranking (measured).** Right note first: 27 of 32 on raw cosine, 28 of 32 once the
library's mean vector is subtracted ("centred"), 31 of 32 in the first two.

**Raw scores cannot decide whether to show anything (measured).** Best raw cosine per
question: 0.792 to 0.880 when the right note is first, 0.774 to 0.829 when a wrong one
is, 0.730 to 0.852 when there is nothing to find. The three ranges overlap completely.
After centring: right note first 0.149 to 0.500, wrong note first 0.095 to 0.311, nothing
to find 0.060 to 0.180.

**Rules on the full library of ten (measured):**

| Rule | Right shown (of 32) | Wrong shown | Shown for nothing (of 12) |
|---|---|---|---|
| raw, gap to runner-up >= 0.03 | 17 | 0 | 0 |
| centred, score >= 0.20 | 23 | 1 | 0 |
| centred, score >= 0.22 | 20 | 1 | 0 |
| centred, score >= 0.25 | 18 | 1 | 0 |

**Smaller libraries (measured).** 60 random subsets of the ten notes per size; a question
whose note was left out counts as one with no answer, which is the hard kind. Percent of
questions:

| Notes | raw gap >= 0.03 | centred >= 0.20 | **shipped: centred >= 0.22** | centred >= 0.25 |
|---|---|---|---|---|
| 3 | right 77, wrong 1, nothing 29 | 64, 0, 4 | **54, 0, 2** | 39, 0, 0 |
| 4 | 76, 1, 15 | 72, 1, 3 | **65, 1, 2** | 52, 1, 1 |
| 6 | 67, 1, 8 | 73, 2, 7 | **68, 2, 4** | 58, 2, 2 |
| 8 | 59, 1, 2 | 73, 3, 6 | **65, 2, 4** | 58, 2, 2 |
| 10 | 53, 0, 0 | 72, 3, 0 | **63, 3, 0** | 56, 3, 0 |

The shipped column was run twice in the same pass: once on full-precision vectors and
once through the real `clearestByMeaning` on vectors rounded to four decimals as stored.
The two are identical in every cell, so the rounding costs nothing here.

Also measured and dropped: centring on the vector of an empty passage instead of the
library's mean (no better than raw), and adding a gap condition on top of the centred
score (loses right notes, removes no false ones).

**Speed on the PC (measured):** 8 to 17 ms for a short note, 62 ms for the 1,369-character
note (2 pieces), 168 ms and 308 ms in two runs for a 5,479-character note (4 pieces).

### 13.4 What was built

- `utils/modelCatalog.ts`, `utils/deviceTierData.ts`: the helper entry and the three tier
  suggestions point at the new file. `utils/ModelManager.ts` lists the MiniLM file as
  obsolete, so it is deleted from phones that have it.
- `utils/EmbeddingEngine.ts`: `embedding: true` (section 13.5); processor only
  (`n_gpu_layers: 0`); a note is cut into up to 4 pieces of about 1,000 characters at
  sentence ends, each fitted to 480 tokens with the model's own tokenizer, and the note's
  vector is the mean of the pieces; a question gets the `query: ` prefix; one text at a
  time; the model is released 30 seconds after its last use; after two failed loads it is
  left alone until the app restarts.
- `utils/chatPlan.ts`: `clearestByMeaning(question, notes)` does the centring and applies
  `MEANING_LEAST = 0.22` with at least `MEANING_MIN_NOTES = 3` notes.
- `utils/searchIndex.ts` (new): the vectors live in their own file,
  `search-index.json` in the app's documents folder, keyed by note, with the model's name
  and a mark of the text each vector was made from. See 13.6 for why.
- `utils/ChatEngine.ts`, `app/(tabs)/chat.tsx`: when the chat tab is opened, notes the
  helper has not read (or whose text changed) are read in the background, paused while an
  answer is being written. Search by meaning uses whatever has been read so far.
- The transcription pipeline no longer loads the helper model after a recording
  (`transcriptionPipeline.ts`, `RecordingProvider.tsx`, `history/[id].tsx`).
- `NOTICES.md` credits the model. Strings in six languages.

### 13.5 The missing `embedding: true` (read)

`node_modules/llama.rn/cpp/jsi/RNLlamaJSI.cpp`, in the embedding call:
`if (ctx->params.embedding != true) throw std::runtime_error("Embedding is not enabled");`
and `cpp/jsi/JSIParams.cpp` sets `cparams.embedding` only when the option `embedding` is
passed to `initLlama`. The library's README shows the same (`initLlama({ ...params,
embedding: true })`). The committed `EmbeddingEngine.ts` passed `n_ctx`, `n_batch` and
`pooling_type` only, and caught the error and returned null. So on llama.rn 0.12.5 no
vector was ever made. **Not verified:** I did not see this fail on a phone, and I did not
check earlier llama.rn versions; older builds may have behaved differently.

Consequence for everything in section 12 and here: all the numbers are from the PC
engine. On the phone, search by meaning starts existing with versionCode 115.

### 13.6 Why the vectors left the history row

- **Read:** all transcriptions are one AsyncStorage value (`muffin.history.v1`,
  `utils/historyStore.ts`). The storage library (async-storage 2.2.0, Android) is one
  SQLite database capped at 6 MB (`ReactDatabaseSupplier.java`, `AsyncStorage_db_size =
  6`), read through a cursor. Android's cursor window is 2,048 KB (`config_cursorWindowSize`
  in AOSP `core/res/res/values/config.xml`).
- **Read:** `utils/persistentStore.ts` treats a failed read as an empty list, and the next
  save then writes that list back.
- A 384-number vector written as JSON at full precision is about 8 KB (my arithmetic:
  384 numbers of about 20 characters). Indexing every existing note into the history row
  would have added that to the row for each note.
- **Not verified:** what actually happens on a phone when the row passes 2 MB. I did not
  reproduce it. The decision does not need it: the 6 MB cap alone is reason enough not to
  put disposable data in that database.

So vectors are in a file, rounded to four decimals (about 3 KB per note), and old vectors
are dropped from history items when the history is loaded. The file can be lost at no
cost: the notes are read again.

**The same limits apply to the transcriptions themselves, and that is not fixed.** A row
of raw plus improved text grows with every recording. Not measured how large Ricky's is.
This deserves its own piece of work (one row per note, or a file).

**Update 2026-11-15:** done. What happens past 2 MB was measured (the read throws at
2,097,100 bytes), and the transcriptions now live in one file each. See
`docs/storage-research.md`.

### 13.7 Decisions that are mine

- One helper model, not a choice between two. Two models' vectors are both 384 long and
  compare to nonsense without an error.
- Threshold 0.22 rather than 0.20: about 8 in 100 fewer right notes shown, and a note for
  a question with no answer 2 to 4 in 100 instead of 3 to 7. I chose fewer false notes,
  because a small chat model answers from whatever note it is given. Nothing in the
  literature forces 0.22; it is read off the tables above.
- Subtracting the library's mean is my choice of fix for the high floor both cards
  describe. The cards say to rank and not to threshold; they do not propose centring.
- Indexing when the chat opens rather than after each recording, so a transcription never
  waits for the helper.
- Processor only for the helper.

### 13.8 Not verified

- The phone engine loading this file. What was read: `llama.rn/cpp/llama-vocab.cpp` maps
  `tokenizer_model == "t5"` to `LLAMA_VOCAB_TYPE_UGM`, and `llama-arch.cpp` has
  `LLM_ARCH_BERT`. Reading is not loading.
- Speed and memory on the phone. A library of several hundred notes is read once, in the
  background; how long that takes on a phone is unknown.
- Libraries larger than ten notes, and notes that are all about the same subject. With
  many similar notes the mean vector moves towards that subject and scores drop; the rule
  then shows nothing rather than something wrong (my reasoning, not measured).
- The questions are mine, 44 of them, and the thresholds were chosen after seeing the
  scores. Read the table as "behaves sensibly", not as an accuracy figure.
- The setup screen was not clicked through to its third step. It renders the same list
  component from the same catalog entry as Settings > Models, which was checked on screen
  in the browser preview.

### 13.9 Check on the phone

1. Settings > Models > Helper models: download the 132 MB model.
2. Open Chat with at least three notes and wait a few seconds.
3. Ask about a note in words the note does not contain (for a note about a plumber's
   quote: "quanto costa sistemare il bagno?"). The answer should come from that note.
4. Ask something no note covers. No note should be used.
5. If nothing ever comes from step 3: the helper is not loading. That is the unverified
   point above; the log line is "Failed to load embedding model".

### 13.10 Do not

- Do not compare raw cosine scores from this model against a fixed number.
- Do not drop the `query: ` / `passage: ` prefixes, or use the same prefix for both.
- Do not put vectors back into history items.
- Do not offer two helper models at once without storing which one made each vector
  (the index file does store it; the comparison must keep checking it).
- Do not switch to the cstr GGUF to save 11 MB: it does not load.
- Do not remove `embedding: true`.

## 14. The phone failure, and the answer step rebuilt (added 2026-11-15, versionCode 116)

Ricky, 2026-11-15, with a screenshot from versionCode 115 running Llama 3.2 1B: "If that's
what you meant, it's dogshit." In the same message: the NVIDIA speech model "should be
called 'Fast, High quality' or something like that", and then "some things don't work
anymore, like the thing that renames the notes automatically".

Status words as in the header. Everything measured here was measured on the PC (llama.cpp
server b12387, the model files the app downloads, temperature 0.3). **Nothing in this
section was checked on a phone.**

### 14.1 Answer

- The two replies in the screenshot are reproduced on the PC and no longer happen there.
  A greeting gets a greeting. A question about a note gets what the note says, and the
  app (not the model) writes the note's name under it.
- A question about something no note holds now gets a fixed line from the app,
  `chat.notFound`, with no model call. Before, the model was asked anyway and invented.
- Llama 3.2 1B is still the weakest of the three chat models by a wide margin
  (section 14.4). On notes named like files it now reads about two in three right, where
  Qwen 2.5 1.5B and Phi-3 Mini read nearly all of them. That is the model, not the
  prompt: three prompt variants were tried on it and none closed the gap (14.6).
- The speech model is renamed (14.8).
- The missing automatic titles are **not explained**. Two real collisions between the
  chat and the note's background work were found and fixed, but reading the title code
  shows they would rarely leave a note with its file name (14.7). The likeliest cause,
  unconfirmed, is that no text model is selected on the phone.

### 14.2 What happened on the phone, and why

Quoted from the screenshot:
- "Hey" -> "I cannot provide personal advice. Is there anything else I can help you with"
- "What does the note about money say?" -> `The note "PTT-20261106-WA0017" is about money`

The chain, each link **read** in the code as it was in versionCode 115:
1. "What does the note about money say?" has one topic word after the stop words
   ("money"). Search by meaning ran only for `contentStems(ask).length >= 2`, so it was
   skipped. My own phone checklist (13.9 step 3) told Ricky to ask exactly this kind of
   question; the gate I left in place made it fail.
2. With no note found, the prompt still handed the model the newest note's name. The
   model repeated it.
3. The answer prompt said "Say which note the answer comes from, by its exact name". For
   a note called `PTT-20261106-WA0017` a 1B model answers with the name and stops.
4. A greeting went through the same notes prompt, rules about notes included.

Reproduced (**measured**): on a library shaped like the phone's (14.3), the flow of
versionCode 115 on Llama 3.2 1B gave 6 right of 30 on "what does the note say" and 3 of 15
on questions no note answers.

### 14.3 The test set shaped like the phone

`chat_talk.mjs` (scratchpad, not in the repo). It imports `utils/chatPlan.ts`, so the
prompts are the app's own; the flow around them is a copy of `answerStream`.

- Library: 8 made-up notes, 6 named like files (`PTT-20261106-WA0017`,
  `AUD-20261111-WA0021`, `Recording 14`), spoken Italian and English.
- 30 messages: 15 talk (greetings, thanks, "how are you", "what can you do"), 5 that no
  note answers, 10 that one note answers. Half Italian, half English.
- Three seeds per message on Llama and Qwen (so 45, 15 and 30 runs), one seed on Phi-3
  (15, 5, 10) because it is much the slowest of the three on the PC.
- Each reply has an automatic check. The first talk check passed junk; it was tightened
  after reading the replies. The figure for the old flow's talk column was scored before
  that and is left out below.

Limits (**mine**): I wrote the notes, the messages and the checks. **Search by meaning is
simulated**: where the phone would have to find the note by meaning, the harness hands
over the right one. So "answers from a note" measures reading the note, not finding it.
Finding is section 13's measurement.

### 14.4 Measurements (**measured**)

Phone-like set, right answers:

| | talk | no note answers it | a note answers it |
|---|---|---|---|
| Llama 3.2 1B, flow of versionCode 115 | (not comparable) | 3/15 | 6/30 |
| Llama 3.2 1B, versionCode 116 | 39/45 | 15/15 | 22/30 |
| Qwen 2.5 1.5B, flow of versionCode 115 (see note) | (not comparable) | 8/15 | 27/30 |
| Qwen 2.5 1.5B, versionCode 116 | 43/45 | 15/15 | 30/30 |
| Phi-3 Mini, versionCode 116, one seed | 14/15 | 5/5 | 9/10 |

Notes on the table:
- The Qwen "before" run already let search by meaning run on one topic word, so it is
  kinder than versionCode 115 really was. The old prompt no longer exists in the code
  (`chatPlan.ts` was never committed), so it cannot be re-run.
- Phi-3 has no "before" on this set.
- Llama's 22/30 was 15/30 one build step earlier with the same questions and one rule
  different (14.6). The per-question results moved in both directions between the two
  runs, so read Llama as "half to two thirds", not as 22.
- "15/15" in the middle column is the app's fixed line, not the model.
- What the Llama replies look like when they pass: often the Italian note quoted back to
  an English question ("The note says \"Mamma ha la visita dal cardiologo ...\""). Right
  facts, wrong language.
- Talk misses that remain: Phi-3 answered "What can you do?" in Spanish; Llama fails
  "Cosa sai fare?" on all three seeds; Qwen missed "How are you?" and "ok" on one seed
  each. The check is still too kind in places: Qwen's "J'è confortabile." to "Come
  va?" counts as a pass.

The 77 older requests (section 3), re-run so nothing that worked broke. Old 17 /
development 36 / unseen 24:

| | versionCode 113 to 115 | versionCode 116 |
|---|---|---|
| Qwen 2.5 1.5B | 16 / 31 / 21 | 16 / 32 / 21 |
| Llama 3.2 1B | 15 / 24 / 19 | 17 / 27 / 16 |
| Phi-3 Mini | 17 / 34 / 21 | 17 / 32 / 22 |

The same run by kind of question, versionCode 116 (21 questions a note answers, 12 whose
answer is not in the note that is found; 2 of the 12 find no note at all and get the fixed
line):

| | a note answers it | the found note does not hold the answer |
|---|---|---|
| Qwen 2.5 1.5B | 20/21 | 8/12 |
| Llama 3.2 1B | 15/21 | 6/12 |
| Phi-3 Mini | 21/21 | 10/12 |

Reading these honestly:
- On this library the notes have real titles. Hiding the titles from the model changed
  nothing measurable for Qwen and Phi-3, and nothing overall for Llama (14/21 before,
  15/21 now), though Llama lost 3 on the unseen set and gained 3 on the development set
  and 1 on the old 17.
  One run per request: differences of one to three are noise.
- "Vorrei lo sfondo tutto nero" (a settings order the gate misses) now gets the fixed
  "not found" line on all three models and is counted as a failure. Before, the model
  answered it, and on Qwen it answered with a summary of the plumber's note because the
  word "tutto" matched it. Neither is right; the new one is at least not invented.
- "Come si chiama l'idraulico?": all three models answer "Ferri", which is the
  accountant's name from the saved facts ("Known about the user"). **Open**: a saved fact
  is quoted as if the note said it.
- "Che numero ha il treno per Roma?": all three still answer with the departure time.
- Phi-3's "Buongiorno!" loop (section 4) did not happen in this run: "Ciao, come posso
  aiutarti con il tuo appuntamento vocale?". One run; not proof that it is gone.

### 14.5 What was built

All in `utils/chatPlan.ts` (pure, unit-tested) and `utils/ChatEngine.ts`:

- `isSmallTalk(text)`: true when the message holds a greeting or thanks and every other
  word is a stop word. Such a message never looks for a note and gets `talkSystem`, a
  two-sentence prompt with no rules about notes.
- Search by meaning now runs for one topic word, not two.
- A message with a topic and no note (by words or by meaning) gets `chat.notFound` from
  the app. No model call.
- `asksNoteCount(text)`: "how many notes do I have", with no other topic, gets
  `chat.noteCount` from the app. Llama, told "The user has 10 voice notes", answered "Non
  ho note" (**measured**, one run).
- `answerSystem` shows the notes without their names: "The voice note, recorded Thu 12
  Nov 2026:" or "Voice note 1 ...", text in triple quotes, three rules after it.
- The last rule ends with a sentence to copy: `If the note does not give the answer,
  reply only: "<chat.notFound in the app's language>"`.
- `sourceOf(reply, shown, missing)`: the app picks the note a reply shares the most words
  with (numbers count double) and appends its name on a new line. The chat screen already
  turns a note's name into a link. No source when the reply holds the "not found"
  sentence or names the note itself.
- Stop words: "tomorrow" in six languages and "all / every" in six languages carry no
  topic. Both were producing false hits ("Che tempo fa domani?" matched a dinner list on
  "domani"; "tutto" matched the plumber's note).
- Strings in six languages: `chat.notFound`, `chat.noteCount`.

### 14.6 Tried and rejected (**measured**)

- **"If it does not answer the question, say so"** as the last rule. On the 12 questions
  whose answer is not in the found note: Qwen 4/12, Llama 5/12, with replies like "Il
  numero di telefono e 1234567890". Replaced by the sentence to copy: Qwen 8/12, Llama
  6/12, Phi-3 10/12. Cost seen: one wrong refusal on Llama ("Che cosa devo comprare per la
  lavatrice?" -> "Non trovato nelle note.", the note has it), none on Qwen or Phi-3 in the
  final run.
- **The same sentence as the first rule instead of the last** (run on Qwen and Llama,
  33 questions): Qwen 29/33 against 28/33, Llama 21/33 against 22/33. No difference; kept
  it last, where the other rules already are (section 11).
- **Answer wording "in your own words", without the "Today is" line**, on Llama: worse.
- **Temperature 0** on Llama: worse. (Both run on the phone-like set earlier in this
  piece of work; the outputs are in the scratchpad and the figures were not copied
  here.)
- **A talk prompt that lists what the app can do**: Llama acts it out ("I've opened a new
  note for you").
- **A talk prompt that mentions "the user's message"**: Llama describes the message.
- **Dropping a keyword hit that covers too little of the question.** Coverage does not
  separate right from wrong: right hits cover 0.50 to 1.00 of the question's topic words,
  false hits 0.00 to 0.67.

### 14.7 Notes that keep their file name

What the code does (**read**, `LLMEngine.generateTitle`, `transcriptionPipeline.ts`, the
two callers in `app/(tabs)/index.tsx` and `components/RecordingProvider.tsx`,
`modelSelection.ts`):
- The title is the last background step, after Improve, the summary, saved facts and
  dates.
- `generateTitle` returns the localized "Voice Memo" when the text has fewer than four
  words or the completion throws. A note keeps its file name only when the text model
  cannot be loaded at all, or when the step never runs.
- The step never runs when no text model is selected. `ensureModelSelections` sets the
  text model to empty when none of the four Qwen files is installed. Llama 3.2 1B and
  Phi-3 Mini are chat models only and never count. So a phone with a speech model and a
  chat model but no text model has a working chat and no titles, no Improve, no summary,
  with nothing on screen saying why. The lists and this rule are the same in the Play
  build (**read**, `git show HEAD`).
- The title code and its callers are unchanged since the Play build apart from the
  removed embedding step (**read**, `git diff`).

Two collisions found by reading, both fixed:
1. `ChatEngine.loadChatLLM` unloaded the text model whenever the chat model loaded,
   mid-work included. Now it checks `llamaBusy()` and leaves a working text model alone;
   if the chat model then does not fit, it waits for that work, unloads, and retries.
2. The chat's "remember this" step (`extractMemories`) ran outside the queue on the text
   model's context. It now goes through `queueLlama`.
Also found: `loadChatLLM` released the speech model even while it was transcribing.
`WhisperEngine.speechBusy()` now guards that.

What these do and do not explain (**mine**): they explain a note losing its Improve or
summary when the chat is opened right after recording or importing. They explain a lost
title poorly: after the unload, the title step reloads the text model and runs, or its
completion throws and the note is named "Voice Memo". Neither leaves the file name.

Two things that make "no text model" the likeliest cause, neither of them proof:
- The phone's copy of the app was first installed on 2026-11-14 at 22:33 (**measured**,
  `adb shell dumpsys package`, `firstInstallTime`), so it went through the setup screen
  that evening and holds only what was downloaded since.
- The setup screen moves to the next page whether or not a text model was downloaded
  (**read**, `app/setup.tsx`, `goNext`). Its own comment says "No Skip"; pressing Next
  is the skip.

Not known: which text model the phone has selected, if any. The release build is not
debuggable, the app wrote nothing to the phone's log during the capture, and the failed
steps logged nothing by design. From versionCode 116 each failed step writes a line
("Enrichment: title failed", "Enrichment skipped: no text model selected"), so the next
report can be read from the log.

### 14.8 The speech model's name

Parakeet is now "Fast, high quality" (`models.tierFastQuality`, six languages: "Veloce,
alta qualità", "Rápido, alta calidad", "Rapide, haute qualité", "Schnell, hohe Qualität",
"Rápido, alta qualidade"). It has its own key because `models.tierFast` is shared with a
text model and with Llama 3.2 1B. "Most accurate" still names Whisper Turbo.
**Not checked on screen**: the picker labels are one line with an ellipsis and the German
name is 22 characters.

### 14.9 Decisions that are mine

- The fixed "not found" line for any message with a topic and no note. It also answers
  "Tell me a joke" and "What is the capital of France?" with "Not found in the notes."
  (**read** from the code, probed without a model). Code cannot tell "what is the wifi
  password" from "what is the capital of France", and the measured cost of asking the
  model was an invented note 12 times in 15 on Llama.
- The "not found" sentence is in the app's language, not the language of the message.
- The source note is chosen by word overlap. A reply in English about an Italian note
  shares mostly numbers and names with it; with one note shown, one shared word is
  enough, with several, two.
- Keeping Llama 3.2 1B in the list. Its numbers are in 14.4; dropping or demoting it is
  Ricky's call.

### 14.10 Not verified, and open

- **Everything on the phone.**
- **The cause of the missing titles** (14.7).
- Keyword false hits that remain (**measured**, `coverage.mjs`): "Quando posso andare ad
  allenarmi?", "Chi ha vinto la partita ieri sera?", "Dove ho messo le chiavi della
  macchina?", "Quando ho la riunione di condominio?" each match a note on one shared word
  and the model then answers from it.
- A saved fact answered as if it were in the note ("Ferri").
- Questions about the whole library ("what notes do I have", "summarize all my notes")
  are not supported: the first goes to the talk prompt, the second gets "not found".
- A phone with little memory, with the chat model loading next to a working text model
  or a working speech model: the retry path is **not tested**.
- Whether releasing the speech model mid-transcription really failed the transcription
  was **not reproduced**; the guard was added from reading the code.
- Llama 3.2 1B answering in the note's language instead of the question's.
- One run per request on the 77; three seeds on the phone-like set for two models, one
  for Phi-3.

### 14.11 Check on the phone

1. Settings: which text model is selected. If none, that is the missing titles.
2. Record or import a short note, stay out of Chat for a minute, look at its name.
3. "Hey": a greeting back.
4. A question about a note, in words the note does not contain, with the helper model
   installed and at least three notes: what the note says, the note's name under it.
5. A question no note covers: "Not found in the notes."
6. If a title is still missing, the log has the reason:
   `adb logcat -s ReactNativeJS | grep Enrichment`. (That a release build of this app
   writes its console lines to the log is **remembered, not verified**: the capture
   showed such lines from another app, none from this one.)

### 14.12 Do not

- Do not show note names to the model in the answer prompt, and do not ask it to name
  its source. The app names the source.
- Do not send a message with a topic and no note to the model.
- Do not go back to "say so" for a missing answer; give the model the sentence.
- Do not describe the app's abilities in the talk prompt.
- Do not unload the text model or the speech model from the chat without checking
  `llamaBusy()` / `speechBusy()`.
- Do not run text-model work outside `queueLlama`.
- Do not name a harness variable `TEMP` on Windows (it is the temp folder; three runs
  were lost to a temperature of NaN).
