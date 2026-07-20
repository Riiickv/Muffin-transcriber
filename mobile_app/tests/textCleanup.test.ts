import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ensureBasicPunctuation,
  stripLeadingLabel,
  looksLikeCopy,
  stripMarkdownArtifacts,
  extractFormatterOutput,
  echoesPrompt,
  capRunawayRepetition,
} from '../utils/textCleanup.ts';

test('ensureBasicPunctuation capitalizes and closes without changing words', () => {
  const raw =
    'domani mattina anche se non è niente da fare prova ad andare a cercare gli ordini su amazon perché se no poi fare tardi';
  const fixed = ensureBasicPunctuation(raw);
  assert.ok(fixed.startsWith('Domani'));
  assert.ok(fixed.endsWith('tardi.'));
  assert.equal(fixed.toLowerCase().replace(/\.$/, ''), raw.toLowerCase(), 'no word changed');
  assert.match(fixed, /perché/); // accents intact
});

test('ensureBasicPunctuation capitalizes after . ? and !, and leaves finished text alone', () => {
  assert.equal(ensureBasicPunctuation('ciao. come stai? bene! ok'), 'Ciao. Come stai? Bene! Ok.');
  assert.equal(ensureBasicPunctuation('Ciao Marco.'), 'Ciao Marco.');
  assert.equal(ensureBasicPunctuation('   '), '');
});

test('stripMarkdownArtifacts removes markup but keeps the text and prose', () => {
  const actual = '## Main Ideas\n- The dentist\n**bold** and *italic* and `code`';
  const cleaned = stripMarkdownArtifacts(actual);
  assert.ok(!cleaned.includes('#'));
  assert.ok(cleaned.includes('Main Ideas'));
  assert.ok(cleaned.includes('- The dentist'));
  assert.equal(stripMarkdownArtifacts('2 * 3 = 6'), '2 * 3 = 6', 'lone asterisk kept');
  assert.equal(stripMarkdownArtifacts('the file_name_here'), 'the file_name_here', 'snake_case kept');
});

test('stripLeadingLabel removes a prefixed heading, keeps a real first sentence', () => {
  assert.ok(!stripLeadingLabel('Summary note:\n\n- Check orders').startsWith('Summary note'));
  assert.ok(stripLeadingLabel('Riassunto:\n- uno\n- due').startsWith('- uno'));
  assert.ok(stripLeadingLabel('Domani mattina: controlla.\nAltro').startsWith('Domani'));
  assert.equal(stripLeadingLabel('Nota:'), 'Nota:', 'single line untouched');
});

test('looksLikeCopy catches an echoed transcript but not a genuine summary', () => {
  const raw = 'domani mattina vado da marco e poi torno a casa alle otto e mezza va bene ci sentiamo dopo ciao';
  assert.ok(looksLikeCopy(raw, raw), 'verbatim echo');
  assert.ok(!looksLikeCopy('Vado da Marco domani.', raw), 'short summary not flagged');
  assert.ok(!looksLikeCopy('Ciao', 'Ciao'), 'short texts never flagged');
});

test('extractFormatterOutput unwraps a leading code fence instead of emptying it', () => {
  assert.equal(extractFormatterOutput('```\nHello world\n```'), 'Hello world');
  assert.equal(extractFormatterOutput('<|im_start|>assistant\nThe reply'), 'The reply');
  assert.equal(extractFormatterOutput('Real content <|im_end|>trailing'), 'Real content');
});

test('echoesPrompt detects the model reciting our instructions', () => {
  assert.ok(echoesPrompt('You are a precise text-processing assistant that...'));
  assert.ok(!echoesPrompt('Domani devo comprare le patate.'));
});

test('capRunawayRepetition keeps at most two identical lines in a row', () => {
  const looped = ['a', 'a', 'a', 'a', 'a'].join('\n');
  const capped = capRunawayRepetition(looped).split('\n');
  assert.ok(capped.length <= 2);
});
