# Summary and format eval set

A fixed set of notes to record before shipping a change to the summary or format
prompts, so a prompt tweak is validated instead of assumed.

The reason this file exists: evaluation-driven work on Llama 3 8B and Qwen 2.5 7B
(arXiv 2601.22025) found that *intuitive* prompt improvements measurably hurt
task performance. Generic rule wrappers dropped extraction accuracy ~10% and
grounding ~13%, because generic rules conflict with task-specific constraints.
Our models are smaller than the ones in that study, so we are more exposed, not
less. A prompt change that "obviously reads better" is not evidence.

Keep the same notes every time. The point is comparison across builds, so
changing the inputs destroys the value.

## How to run

Record each note, run Summarize, and check it against the criteria. Note the
build number. If a criterion fails, keep the output: the text of a failure is
worth more than a description of it.

---

## 1. Christmas shopping (the v30 regression case)

> "I need to go Christmas shopping, I was thinking maybe the twelfth of October
> but that might be too early, otherwise I'll go later when it's actually the
> holiday season."

- [ ] No `#` characters anywhere
- [ ] Shorter than the note
- [ ] No section headings invented (no "Main Ideas", no "Actionable Items")
- [ ] Nothing that is not in the recording. There is no Amazon, no Thanksgiving,
      no New Year, no prices
- [ ] Nobody is addressed: no "you should", no "please follow these steps"

## 2. Two dates, Italian

> "Ciao Martina, il 15 luglio devo comprare le patate e il 17 luglio devo andare
> dal dottore alle 4 e un quarto del pomeriggio."

- [ ] Summary is in Italian
- [ ] Title is in Italian (this is the known open bug: it comes out English)
- [ ] Both dates and the time survive
- [ ] Highlights appear on Raw, Formatted and Summary

## 2b. Format must actually fix the text

Record something with a real speech-to-text error in it. The known case:

> "...perché se no poi fare tardi"

`se no ... fare` is not grammatical Italian; a person would write
`perché sennò poi fai tardi`.

- [ ] First letter capitalized, sentence ends with a full stop
- [ ] Run-together/split words corrected (`se no` to `sennò`)
- [ ] Wrong verb forms corrected (`fare` to `fai`)
- [ ] Meaning unchanged, and NOTHING added that wasn't said
- [ ] Still Italian

The last two are the risk. Allowing the model to change words is what lets it
fix grammar, and also what lets it drift. If it starts inventing, the
instruction has gone too far and needs pulling back.

## 3. Nothing to do

> "Just thinking out loud about the colours for the poster, the blue one felt
> too cold and the orange one felt too loud, that's it really."

- [ ] No actions, next steps or recommendations are invented
- [ ] No advice about poster design

## 4. Custom prompt

Custom prompt: `Bullet points, max 100 words`

Use note 1. Custom prompts replace the task, which is why they used to lose
every guardrail.

- [ ] The requested bullet format is respected (the app must not override it)
- [ ] Still invents nothing
- [ ] Still does not address the reader

## 5. Too short

> "Test test."

- [ ] Returns the localized "too short" message, in the app's language
- [ ] Not the English string, not a hallucinated summary

## 6. Long note

Any recording over about three minutes.

- [ ] Summary is clearly shorter than the transcript
- [ ] It does not trail off mid-sentence (the token budget is proportional to
      input length, so this is the ceiling most likely to need tuning)
- [ ] Progress showed a percentage and an estimate that did not jump around

---

## Results log

| Build | Date | Failures |
| ----- | ---- | -------- |
| v30   |      | *(prompts rewritten to positive phrasing in v31, untested)* |
