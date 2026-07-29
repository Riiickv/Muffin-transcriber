import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  splitForModel,
  FORMAT_CHUNK_CHARS,
  SUMMARY_CHUNK_CHARS,
} from '../utils/textCleanup.ts';

// The point of these: a chunk that comes out longer than the budget is the one
// failure this whole thing exists to prevent. Over the window, llama.rn either
// generates nothing at all or throws away the front of the prompt, so "usually
// fits" is not good enough.

test('text within the budget is left alone', () => {
  const text = 'One sentence. Another one.';
  assert.deepEqual(splitForModel(text, 100), [text]);
});

test('no chunk ever exceeds the budget', () => {
  const sentence = 'This is a sentence of a fairly ordinary length. ';
  const text = sentence.repeat(500); // ~24,000 chars, a long lecture
  for (const max of [200, 1000, FORMAT_CHUNK_CHARS, SUMMARY_CHUNK_CHARS]) {
    for (const chunk of splitForModel(text, max)) {
      assert.ok(chunk.length <= max, `chunk of ${chunk.length} exceeded ${max}`);
    }
  }
});

test('nothing is lost or duplicated', () => {
  const text = 'Alpha. Beta! Gamma? Delta. Epsilon.'.repeat(40);
  const joined = splitForModel(text, 120).join('');
  assert.equal(joined, text);
});

test('splits on sentence ends, not mid-word', () => {
  const text = 'First sentence here. Second sentence here. Third sentence here.';
  for (const chunk of splitForModel(text, 25)) {
    // Every chunk that is not the tail should finish a sentence.
    assert.ok(!/\s\w{1,2}$/.test(chunk.trim()) || /[.!?]$/.test(chunk.trim()));
  }
});

test('a single sentence longer than the budget is still cut to fit', () => {
  // Unpunctuated whisper output of a long monologue looks exactly like this.
  const runOn = 'word '.repeat(2000); // 10,000 chars, no full stop anywhere
  const chunks = splitForModel(runOn, 500);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) assert.ok(chunk.length <= 500);
  assert.equal(chunks.join(''), runOn);
});

test('a two hour lecture becomes a workable number of chunks', () => {
  // ~150 wpm for 120 minutes at ~5.5 chars a word.
  const lecture = 'word '.repeat(150 * 120);
  const forFormat = splitForModel(lecture, FORMAT_CHUNK_CHARS);
  const forSummary = splitForModel(lecture, SUMMARY_CHUNK_CHARS);
  assert.ok(forFormat.length > 10, 'a lecture should not fit in one pass');
  assert.ok(forSummary.length < forFormat.length, 'summary chunks are bigger');
  // And the whole thing survives, which is the bug being fixed: before this,
  // everything past the window was silently dropped.
  assert.equal(forFormat.join('').length, lecture.length);
});

test('empty and whitespace input do not produce junk chunks', () => {
  assert.deepEqual(splitForModel('', 100), ['']);
  for (const chunk of splitForModel('   \n  ', 2)) {
    assert.equal(typeof chunk, 'string');
  }
});
