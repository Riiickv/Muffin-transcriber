import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mergeEntities, sanitiseEntities, findHighlights } from '../utils/entityExtraction.ts';

const quotes = (r: { quote: string }[]) => r.map((e) => e.quote);

// Ricky's real notes, copied from the device screenshots this was built against.
const noteOne = 'Ciao Simone, il 15 luglio devo comprare le patate.';
const noteTwo =
  'Ciao Martina, il 15 luglio devo comprare le patate e il 17 luglio devo andare dal dottore alle 4 e un quarto del pomeriggio .';

test('finds an Italian date with no model help, and names it from context', () => {
  const r = mergeEntities([], noteOne);
  assert.ok(quotes(r).includes('15 luglio'));
  assert.match(r[0].name, /patate/);
});

test('finds both dates and the spoken time, correctly typed', () => {
  const r = mergeEntities(
    [
      { quote: '15th July', name: 'Buy potatoes', type: 'date' as const }, // model answered in English
      { quote: '17th July', name: 'Doctor', type: 'date' as const },
    ],
    noteTwo
  );
  assert.ok(quotes(r).includes('15 luglio'));
  assert.ok(quotes(r).includes('17 luglio'));
  assert.equal(r.find((e) => e.quote.startsWith('alle 4'))?.type, 'time');
  assert.equal(r.find((e) => e.quote === '15 luglio')?.type, 'date');
  assert.ok(quotes(r).every((q) => noteTwo.includes(q)), 'every quote is verbatim');
  assert.ok(!quotes(r).some((q) => /th July/.test(q)), 'unusable English quotes dropped');
});

test('reuses the model title when it named the same moment (in the transcript language)', () => {
  const r = mergeEntities([{ quote: '17 luglio', name: 'Visita dal dottore', type: 'date' as const }], noteTwo);
  assert.equal(r.find((e) => e.quote === '17 luglio')?.name, 'Visita dal dottore');
});

test('does not treat quantities as dates', () => {
  const r = mergeEntities([], 'Servono 3-4 persone e circa 2.5 chili.');
  assert.ok(!quotes(r).some((q) => q.includes('3-4') || q.includes('2.5')));
});

test('works across languages', () => {
  const cases: [string, string[]][] = [
    ['Remember the dentist on July 15 and the review at 5pm.', ['July 15', '5pm']],
    ['El 12 de septiembre a las 5 tengo cita.', ['12 de septiembre', 'a las 5']],
    ['Am 3. Oktober um 9 habe ich einen Termin.', ['3. Oktober', 'um 9']],
    ['Le 14 juillet à 17:30 je pars.', ['14 juillet', '17:30']],
    ['No dia 5 de novembro as 8 tenho consulta.', ['5 de novembro', 'as 8']],
  ];
  for (const [text, want] of cases) {
    const got = quotes(mergeEntities([], text));
    assert.ok(
      want.every((w) => got.some((g) => g.includes(w) || w.includes(g))),
      `${text} -> ${JSON.stringify(got)}`
    );
  }
});

test('swallows optional minutes so "alle 16:15" keeps the :15', () => {
  const summary = '- Comprare le patate il 15 luglio\n- Visita dal dottore il 17 luglio alle 16:15';
  const r = mergeEntities([{ quote: 'alle 4 e un quarto', name: 'Dottore', type: 'time' as const }], summary);
  assert.ok(quotes(r).some((q) => q.includes('16:15')));
  assert.ok(!quotes(r).includes('alle 4 e un quarto'), 'raw-only phrasing dropped on the summary tab');
});

test('caps at 5 highlights', () => {
  const many = '1 luglio, 2 luglio, 3 luglio, 4 luglio, 5 luglio, 6 luglio, 7 luglio';
  assert.equal(mergeEntities([], many).length, 5);
});

test('findHighlights is empty for empty text', () => {
  assert.equal(findHighlights('', []).length, 0);
});

test('sanitiseEntities rejects hallucinated, non-temporal, and duplicate quotes', () => {
  const transcript =
    'Ok so remember the dentist tomorrow at 5pm, and the project review on September 12. Standup is at 09:30.';
  const r = sanitiseEntities(
    [
      { quote: 'tomorrow at 5pm', name: 'Dentist', type: 'date' }, // valid -> retyped time
      { quote: 'September 12', name: 'Review', type: 'time' }, // valid -> retyped date
      { quote: 'next Thursday at 4', name: 'Invented', type: 'date' }, // not in transcript
      { quote: 'the meeting', name: 'Meeting', type: 'date' }, // not temporal
      { quote: 'tomorrow at 5pm', name: 'Dupe', type: 'date' }, // duplicate
    ],
    transcript
  );
  assert.equal(r.length, 2);
  assert.equal(r.find((e) => e.quote === 'tomorrow at 5pm')?.type, 'time');
  assert.equal(r.find((e) => e.quote === 'September 12')?.type, 'date');
});
