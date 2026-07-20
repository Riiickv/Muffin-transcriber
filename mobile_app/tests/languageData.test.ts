import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LANGUAGES,
  toLanguageCode,
  languageNameFromCode,
  LANGUAGE_VALUES,
  FORMAT_LANGUAGE_VALUES,
} from '../utils/languageData.ts';

test('the language table has no duplicate codes, names, or empty fields', () => {
  const codes = LANGUAGES.map((l) => l.code);
  const names = LANGUAGES.map((l) => l.name);
  assert.equal(new Set(codes).size, codes.length, 'duplicate whisper code(s)');
  assert.equal(new Set(names).size, names.length, 'duplicate name(s)');
  assert.ok(LANGUAGES.every((l) => l.code && l.name && l.endonym), 'a row has an empty field');
  // Whisper codes are 2-3 lowercase letters.
  assert.ok(LANGUAGES.every((l) => /^[a-z]{2,3}$/.test(l.code)), 'a code is malformed');
});

test('the app-UI languages round-trip name -> code -> name', () => {
  const appLanguages = ['English', 'Italian', 'Spanish', 'French', 'German', 'Portuguese'];
  const expectedCodes: Record<string, string> = {
    English: 'en',
    Italian: 'it',
    Spanish: 'es',
    French: 'fr',
    German: 'de',
    Portuguese: 'pt',
  };
  for (const name of appLanguages) {
    const code = toLanguageCode(name);
    assert.equal(code, expectedCodes[name], `${name} -> ${code}`);
    assert.equal(languageNameFromCode(code), name, `${code} -> back to ${name}`);
  }
});

test('toLanguageCode falls back to auto for unknown, empty, and the Auto-Detect row', () => {
  assert.equal(toLanguageCode('Auto-Detect'), 'auto');
  assert.equal(toLanguageCode('Klingon'), 'auto');
  assert.equal(toLanguageCode(''), 'auto');
  assert.equal(toLanguageCode(null), 'auto');
  assert.equal(toLanguageCode(undefined), 'auto');
});

test('languageNameFromCode returns null for auto/unknown/empty so prompts fall back cleanly', () => {
  assert.equal(languageNameFromCode('it'), 'Italian');
  assert.equal(languageNameFromCode('auto'), null);
  assert.equal(languageNameFromCode('zz'), null);
  assert.equal(languageNameFromCode(null), null);
  assert.equal(languageNameFromCode(undefined), null);
});

test('the value lists start with the Auto-Detect row and cover every language', () => {
  assert.equal(LANGUAGE_VALUES[0], 'Auto-Detect');
  assert.equal(FORMAT_LANGUAGE_VALUES[0], 'Auto-Detect / Original');
  assert.equal(LANGUAGE_VALUES.length, LANGUAGES.length + 1);
  assert.equal(FORMAT_LANGUAGE_VALUES.length, LANGUAGES.length + 1);
});
