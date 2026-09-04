import { test } from 'node:test';
import assert from 'node:assert/strict';

import { grammarFor, instructionFor, type OutputShape } from '../utils/outputShape.ts';

test('auto constrains nothing', () => {
  assert.equal(grammarFor('auto'), undefined);
  assert.equal(instructionFor('auto'), '');
});

test('bullets and paragraph both produce a grammar and an instruction', () => {
  for (const shape of ['bullets', 'paragraph'] as OutputShape[]) {
    const g = grammarFor(shape);
    assert.ok(g && g.length > 0, `${shape} has no grammar`);
    assert.ok(g.startsWith('root ::='), `${shape} grammar must start at root`);
    assert.ok(instructionFor(shape).length > 0, `${shape} has no instruction`);
  }
});

// The whole reason this file constrains structure and not characters: a
// whitelist of letters would have to name every accented character six
// languages use, and any omission makes the model unable to spell.
test('no grammar enumerates letters, so accents cannot be excluded', () => {
  for (const shape of ['bullets', 'paragraph'] as OutputShape[]) {
    const g = grammarFor(shape)!;
    assert.ok(
      !/\[a-z/i.test(g),
      `${shape} enumerates a letter range - accented characters would be unrepresentable`,
    );
    assert.ok(g.includes('[^\\n]'), `${shape} should allow any non-newline character`);
  }
});

test('bullets are bounded at both ends, so a loop cannot run away', () => {
  const g = grammarFor('bullets')!;
  const required = (g.match(/ item(?![?])/g) || []).length;
  const optional = (g.match(/item\?/g) || []).length;
  assert.ok(required >= 2, 'a summary answered with one bullet is not a list');
  assert.ok(optional > 0, 'there must be room for more than the minimum');
  assert.ok(
    !/item\+|item\*/.test(g),
    'an unbounded repeat is how "- same line" x200 gets through',
  );
});

test('paragraph forbids line breaks, which is what stops it becoming a list', () => {
  const g = grammarFor('paragraph')!;
  assert.ok(!g.includes('"\\n"'), 'a paragraph grammar must not emit newlines');
});

test('every shape is handled, so a new one cannot silently mean auto', () => {
  const shapes: OutputShape[] = ['auto', 'bullets', 'paragraph'];
  for (const s of shapes) {
    assert.doesNotThrow(() => grammarFor(s));
    assert.doesNotThrow(() => instructionFor(s));
  }
});
