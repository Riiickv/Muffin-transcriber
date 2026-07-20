/**
 * Text tidy-up for LLM output - PURE, no model, no native modules, so it's
 * unit-testable in plain Node.
 *
 * Extracted from LLMEngine. These are the guards that decide what reaches the
 * user's screen: strip the chat template, cap a looping model, remove markdown
 * the app can't render, guarantee basic punctuation, and catch the model
 * reciting its own prompt or echoing the transcript. Every one of them fixed a
 * real bug this project hit, which is exactly why they deserve a test net.
 */

/**
 * Belt-and-suspenders against a small model looping. Even with a repetition
 * penalty a tiny model can get stuck repeating a line ("- I have eaten breakfast
 * for lunch." x200). This drops a line once it has repeated a few times in a row,
 * so a runaway never reaches the user as a wall of the same sentence.
 */
export function capRunawayRepetition(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let prevNorm = '';
  let run = 0;
  for (const line of lines) {
    const norm = line.trim().toLowerCase();
    if (norm && norm === prevNorm) {
      run++;
      if (run >= 2) continue; // keep at most 2 identical lines in a row
    } else {
      run = 0;
      prevNorm = norm;
    }
    out.push(line);
  }
  return out.join('\n').trim();
}

/**
 * A small model will still emit a "## Heading" now and then, and the transcript
 * box draws plain text, so the markup would be shown to the user exactly as typed.
 */
export function stripMarkdownArtifacts(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s*/, '') // "## Main Ideas" -> "Main Ideas"
        .replace(/^(\s*)\*\s+/, '$1- ') // "* item" -> "- item"
        .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
        .replace(/__([^_]+)__/g, '$1')
        .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1$2') // italics
        .replace(/`{1,3}([^`]*)`{1,3}/g, '$1') // code ticks
        .trimEnd()
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Guarantee the basics of formatting, whatever the model did.
 *
 * The default Format prompt asks for punctuation and capitalization, and on a
 * real Italian note the model handed the text back essentially unchanged: no
 * leading capital, no final stop. So the minimum is DONE here rather than hoped
 * for. Deterministic, language-agnostic, and it cannot invent or alter words -
 * it only touches case and a trailing mark.
 */
export function ensureBasicPunctuation(text: string): string {
  let out = text.trim();
  if (!out) return out;

  // First letter of the text, and of anything following a sentence end.
  out = out.replace(/(^|[.!?]\s+|\n\s*)(\p{Ll})/gu, (_m, lead: string, ch: string) => lead + ch.toUpperCase());

  if (!/[.!?:;)\]"'’”]$/.test(out)) out += '.';
  return out;
}

/**
 * Strip a label the model prefixed to its answer ("Summary note:", "Riassunto:").
 * The rules ask it to begin with the result itself; small models add one anyway.
 */
export function stripLeadingLabel(text: string): string {
  const lines = text.split('\n');
  const first = lines[0]?.trim() ?? '';
  // A short line that is only a heading and a colon.
  if (lines.length > 1 && /^[\p{L} ]{1,24}:$/u.test(first)) {
    return lines.slice(1).join('\n').trim();
  }
  return text;
}

/**
 * True when a "summary" is really the transcript handed back.
 *
 * An Italian custom prompt made the model echo its input verbatim - a failure
 * dressed as success, since the user gets their own words under a Summary tab.
 * Measured by word overlap, not equality, because a near-copy is the same
 * problem.
 */
export function looksLikeCopy(output: string, source: string): boolean {
  const words = (x: string) =>
    x.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  const out = words(output);
  const src = words(source);
  if (out.length < 8 || src.length < 8) return false;
  // A real summary is shorter. Only suspect it when it's near full length.
  if (out.length < src.length * 0.6) return false;
  const srcSet = new Set(src);
  return out.filter((w) => srcSet.has(w)).length / out.length > 0.9;
}

/**
 * Pull the real reply out of raw model output: drop an echoed chat template, cut
 * a trailing special token, and unwrap a surrounding markdown code fence.
 */
export function extractFormatterOutput(output: string): string {
  let text = output;

  // If the model echoed its own chat template, keep only what came AFTER the
  // assistant turn (pop = last segment = the reply).
  for (const prefix of [
    '... (truncated)',
    '<|im_start|>assistant',
    '<|start_header_id|>assistant<|end_header_id|>',
    '<|assistant|>',
  ]) {
    if (text.includes(prefix)) {
      text = text.split(prefix).pop() || text;
      break;
    }
  }

  // Cut a trailing special token and everything after it, but ONLY when there's
  // real content before it (idx > 0). Splitting on a leading token used to empty
  // the string, and an empty result makes the caller fall back to the raw
  // transcript - the "formatting did nothing" bug.
  const trailing = [
    '[ Prompt:', 'Exiting...', '<|im_end|>', '<|end|>', '<|eot_id|>',
    '<|endoftext|>', '<|start_header_id|>', '<|im_start|>', 'ggml_cuda_init:',
  ];
  for (const marker of trailing) {
    const i = text.indexOf(marker);
    if (i > 0) text = text.slice(0, i);
  }

  // Small models love wrapping the whole answer in a markdown code fence. The
  // old code split on ``` and kept text[0], which is EMPTY when the fence is at
  // the start - the single biggest cause of formatting returning the raw text.
  // Strip a surrounding fence instead of nuking everything.
  text = text.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```[^\n]*\n?/, '').replace(/\n?```\s*$/, '');
  }

  return text.trim();
}

// Fragments that only ever appear in OUR prompt, never in a real transcript.
// A small model handed a short or meaningless transcript sometimes has nothing
// to do and drifts into reciting its own instructions instead - and the user
// then reads the prompt in the "Formatted" tab, which looks like the app is
// broken (it is). Checked case-insensitively against the model's output.
const PROMPT_ECHO_MARKERS = [
  'work only with the transcript above',
  'reply only with the final result',
  'process the transcript now',
  'summarize the transcript now',
  'you are a precise text-processing assistant',
  'ensure you use the correct spelling and context',
  'do not wrap the output in quotes',
  'act as a user profiling engine',
];

/** True if the model regurgitated the prompt instead of doing the work. */
export function echoesPrompt(output: string): boolean {
  const lower = output.toLowerCase();
  return PROMPT_ECHO_MARKERS.some((m) => lower.includes(m));
}

/** True if formatted output is garbled, absurdly long, or an echoed prompt. */
export function looksUnstable(formatted: string, raw: string): boolean {
  if (!formatted) return true;
  const lower = formatted.toLowerCase();
  const suspicious = ['fromnowformat', 'reface', 'takect', 'obey obey', 'ipsumudo'];
  if (suspicious.some((m) => lower.includes(m))) return true;
  if (formatted.length > Math.max(3000, raw.length * 3)) return true;
  // The old size check couldn't catch this: an echoed prompt is neither huge
  // nor obviously garbled, so it sailed through and got shown to the user.
  if (echoesPrompt(formatted)) return true;
  return false;
}
