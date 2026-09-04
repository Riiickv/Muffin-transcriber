/**
 * The shape the user asked the output to take, as a grammar the model cannot
 * escape.
 *
 * Why this exists. "Use bullet points, max 100 words" is the placeholder in the
 * custom prompt box, and a 0.6B model treats it as a suggestion. Every repair
 * function in LLMEngine is downstream of the same problem. llama.cpp can compile
 * a grammar and refuse to sample any token that breaks it, which turns the
 * request into a guarantee.
 *
 * Why it is a PICKER and not detected from the prompt text. The obvious version
 * reads the custom prompt and looks for "bullet". That prompt is free text in
 * six languages - "usa elenchi puntati", "en viñetas", "sous forme de liste" -
 * and the same matching that catches "use bullet points" catches "don't use
 * bullet points". Silently forcing a shape on someone who asked for the
 * opposite is worse than ignoring them. An explicit choice cannot misfire.
 *
 * What these grammars deliberately do NOT constrain: which characters may
 * appear inside a line. GBNF is a whitelist, so a grammar that enumerated the
 * permitted letters would have to name every accented character six languages
 * use, and any omission makes the model unable to spell. These constrain line
 * STRUCTURE only, and let the content be any character that is not a newline.
 */

export type OutputShape = 'auto' | 'bullets' | 'paragraph';

/**
 * `[^\n]` rather than a letter class: everything except a line break is
 * allowed, so è, ñ, ¿ and any script whisper produced all pass through.
 */
const LINE = '[^\\n]';

/**
 * Between three and eight bullets, each starting "- " and running to the end
 * of its line.
 *
 * The count is bounded at both ends on purpose. A lower bound stops a model
 * answering a summary request with one bullet; an upper bound is the thing that
 * actually kills runaway repetition, which is the failure this codebase has
 * already been bitten by ("- I have eaten breakfast for lunch." x200). A
 * grammar that permits `item+` permits two hundred of them.
 */
const BULLETS = [
  'root ::= item item item item? item? item? item? item?',
  `item ::= "- " ${LINE}${LINE}* "\\n"`,
].join('\n');

/**
 * One to four sentences of prose, no line breaks at all, which is what stops
 * the model turning a "short paragraph" into a list or a heading.
 */
const PARAGRAPH = [
  'root ::= sentence sentence? sentence? sentence?',
  `sentence ::= ${LINE}${LINE}* [.!?] " "?`,
].join('\n');

/** The GBNF for a shape, or undefined when the model should be left alone. */
export function grammarFor(shape: OutputShape): string | undefined {
  if (shape === 'bullets') return BULLETS;
  if (shape === 'paragraph') return PARAGRAPH;
  return undefined;
}

/**
 * A line of instruction to match the grammar.
 *
 * The grammar guarantees the shape; it cannot tell the model that a shape was
 * wanted. Without this the model writes prose that the grammar then forces into
 * bullet-shaped fragments, which is technically compliant and reads like a
 * ransom note. Constrain AND ask, never one alone.
 */
export function instructionFor(shape: OutputShape): string {
  if (shape === 'bullets') return 'Answer as a short bulleted list, one point per line, each line starting with "- ".';
  if (shape === 'paragraph') return 'Answer as one short paragraph of plain sentences, with no line breaks and no lists.';
  return '';
}
