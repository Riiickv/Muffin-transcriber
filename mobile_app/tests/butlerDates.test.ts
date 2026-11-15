import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findDateSpans, findHighlights, intentFor, isAlarm, mergeEntities, resolveQuote } from '../utils/entityExtraction.ts';
import type { When } from '../utils/entityExtraction.ts';
import { formatWhen } from '../utils/format.ts';

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (w: When) =>
  `${w.year}-${pad(w.month)}-${pad(w.day)}` + (w.hour === undefined ? '' : ` ${pad(w.hour)}:${pad(w.minute ?? 0)}`);

/** One event per sentence: every span found must agree on the same value. */
function check(ref: Date, cases: Record<string, [string, string | null][]>) {
  for (const [lang, list] of Object.entries(cases)) {
    for (const [text, want] of list) {
      const got = [...new Set(findDateSpans(text, ref).map((s) => fmt(s.when)))];
      assert.deepEqual(got, want === null ? [] : [want], `${lang}: ${text}`);
    }
  }
}

// The set the reader was written against. Recorded Sunday 2026-11-15 10:00.
test('voice-note sentences resolve to the day and hour meant, six languages', () => {
  check(new Date(2026, 10, 15, 10, 0, 0), {
    it: [
      ['Domani alle 16:30 ho il dentista.', '2026-11-16 16:30'],
      ['Domani alle quattro e mezza ho il dentista.', '2026-11-16 16:30'],
      ['Domani alle 4 e mezza ho il dentista.', '2026-11-16 16:30'],
      ['Il 15 luglio devo comprare le patate.', '2027-07-15'],
      ['Lunedì prossimo riunione alle 9.', '2026-11-16 09:00'],
      ['Venerdì alle 18 aperitivo con Marco.', '2026-11-20 18:00'],
      ['Tra due settimane parto per Roma.', '2026-11-29'],
      ['Dopodomani pomeriggio passo in banca.', '2026-11-17'],
      ['Stasera alle 8 cena da mamma.', '2026-11-15 20:00'],
      ['Il 3 marzo 2027 alle 10 e un quarto ho la visita.', '2027-03-03 10:15'],
      ['Giovedì mattina chiamo il commercialista.', '2026-11-19'],
      ['Ricordami di chiamare Luca fra tre giorni.', '2026-11-18'],
      ['Appuntamento il 20/11 alle 15.', '2026-11-20 15:00'],
      ['Ci vediamo a mezzogiorno.', '2026-11-15 12:00'],
      ['Sono due settimane che non scrivo una parola.', null],
      ['Eravamo in 3-4 persone e costava 15 euro.', null],
      ['Ho 25 anni e abito al numero 12.', null],
    ],
    en: [
      ['Tomorrow at 5pm I have a meeting with Sarah.', '2026-11-16 17:00'],
      ['Next Friday at 9 I am seeing the dentist.', '2026-11-20 09:00'],
      ['On July 15th I need to renew the passport.', '2027-07-15'],
      ['In two weeks I fly to Rome.', '2026-11-29'],
      ['The day after tomorrow I pick up the car.', '2026-11-17'],
      ['Tonight at eight dinner with mum.', '2026-11-15 20:00'],
      ['Call the bank at half past four.', '2026-11-15 16:30'],
      ['Monday morning I call the accountant.', '2026-11-16'],
      ['The meeting is on 11/20 at 3 pm.', '2026-11-20 15:00'],
      ['I may go, there were 3-4 people and it cost 15 dollars.', null],
      ['I am 25 years old and it took me a second.', null],
    ],
    es: [
      ['Mañana a las 5 de la tarde tengo reunión.', '2026-11-16 17:00'],
      ['El 12 de septiembre tengo que renovar el pasaporte.', '2027-09-12'],
      ['El próximo lunes a las 9 voy al dentista.', '2026-11-16 09:00'],
      ['Pasado mañana recojo el coche.', '2026-11-17'],
      ['Dentro de dos semanas viajo a Roma.', '2026-11-29'],
      ['Esta noche a las 8 cena con mamá.', '2026-11-15 20:00'],
      ['El viernes por la mañana llamo al gestor.', '2026-11-20'],
      ['Éramos 3-4 personas y costaba 15 euros.', null],
    ],
    fr: [
      ["Demain à 17h j'ai une réunion.", '2026-11-16 17:00'],
      ['Le 12 septembre je dois renouveler le passeport.', '2027-09-12'],
      ['Lundi prochain à 9h je vais chez le dentiste.', '2026-11-16 09:00'],
      ['Après-demain je récupère la voiture.', '2026-11-17'],
      ['Dans deux semaines je pars à Rome.', '2026-11-29'],
      ['Ce soir à 20h dîner chez maman.', '2026-11-15 20:00'],
      ["Vendredi matin j'appelle le comptable.", '2026-11-20'],
      ['On était 3-4 personnes et ça coûtait 15 euros.', null],
    ],
    de: [
      ['Morgen um 17 Uhr habe ich ein Meeting.', '2026-11-16 17:00'],
      ['Am 12. September muss ich den Pass verlängern.', '2027-09-12'],
      ['Nächsten Montag um 9 Uhr gehe ich zum Zahnarzt.', '2026-11-16 09:00'],
      ['Übermorgen hole ich das Auto ab.', '2026-11-17'],
      ['In zwei Wochen fliege ich nach Rom.', '2026-11-29'],
      ['Heute Abend um 8 Abendessen bei Mama.', '2026-11-15 20:00'],
      ['Freitag Vormittag rufe ich den Steuerberater an.', '2026-11-20'],
      ['Um halb fünf rufe ich die Bank an.', '2026-11-15 16:30'],
      ['Wir waren 3-4 Leute und es kostete 15 Euro.', null],
    ],
    pt: [
      ['Amanhã às 17h tenho reunião.', '2026-11-16 17:00'],
      ['Dia 12 de setembro tenho de renovar o passaporte.', '2027-09-12'],
      ['Na próxima segunda às 9 vou ao dentista.', '2026-11-16 09:00'],
      ['Depois de amanhã vou buscar o carro.', '2026-11-17'],
      ['Daqui a duas semanas viajo para Roma.', '2026-11-29'],
      ['Hoje à noite às 8 jantar com a mãe.', '2026-11-15 20:00'],
      ['Sexta de manhã ligo ao contabilista.', '2026-11-20'],
      ['Éramos 3-4 pessoas e custava 15 euros.', null],
    ],
  });
});

// Written after the reader, and passed on the first run without changes to it.
// Recorded Wednesday 2026-03-11 14:20.
test('a second set, different phrasing and a different recording day', () => {
  check(new Date(2026, 2, 11, 14, 20, 0), {
    it: [
      ["Ricordati che giovedì alle 11 c'è il colloquio con la maestra.", '2026-03-12 11:00'],
      ['La bolletta scade il 28 marzo.', '2026-03-28'],
      ['Il 2 febbraio parto per Londra.', '2027-02-02'],
      ['Sabato sera cena con i colleghi alle 20:30.', '2026-03-14 20:30'],
      ['Domani mattina alle 7 e mezza porto la macchina dal meccanico.', '2026-03-12 07:30'],
      ["Ho l'aereo il 5/4 alle 6 del mattino.", '2026-04-05 06:00'],
      ["Fra un mese scade l'assicurazione.", '2026-04-11'],
      ['Alle 3 meno un quarto devo prendere i bambini.', '2026-03-11 14:45'],
      ['Verso le 5 passo da te.', '2026-03-11 17:00'],
      ['Ho comprato 3 chili di mele e 2 litri di latte.', null],
      ['Il film dura 2 ore e 10.', null],
      ['Mi ha chiamato lunedì scorso.', null],
      ['Nel 2024 abbiamo speso 1.200 euro.', null],
      ['Oggi ho mangiato troppo.', null],
      ['La riunione è stata spostata a martedì prossimo alle 14.', '2026-03-17 14:00'],
      ['Dopodomani alle 18 e 45 ho il treno.', '2026-03-13 18:45'],
    ],
    en: [
      ['Remind me to call the vet on Thursday at 11.', '2026-03-12 11:00'],
      ['The bill is due on March 28th.', '2026-03-28'],
      ['I fly to London on the 2nd of February.', '2027-02-02'],
      ['Dinner with the team Saturday evening at 8:30.', '2026-03-14 20:30'],
      ['Tomorrow morning at 7:30 I drop the car at the garage.', '2026-03-12 07:30'],
      ['In a month the insurance expires.', '2026-04-11'],
      ['Pick up the kids at quarter to three.', '2026-03-11 14:45'],
      ['I bought 3 pounds of apples at 4 dollars each.', null],
      ['He called me last Monday.', null],
      ['Today I ate too much.', null],
      ['The meeting moved to next Tuesday at 2 pm.', '2026-03-17 14:00'],
      ['We spent 1,200 dollars in 2024.', null],
      ["Let's meet at 10 o'clock tomorrow.", '2026-03-12 10:00'],
    ],
    es: [
      ['Recuérdame llamar al veterinario el jueves a las 11.', '2026-03-12 11:00'],
      ['La factura vence el 28 de marzo.', '2026-03-28'],
      ['El 2 de febrero viajo a Londres.', '2027-02-02'],
      ['El sábado por la noche cena con el equipo a las 8 y media.', '2026-03-14 20:30'],
      ['Mañana por la mañana a las 7 y media llevo el coche al taller.', '2026-03-12 07:30'],
      ['Dentro de un mes vence el seguro.', '2026-04-11'],
      ['Me llamó el lunes pasado.', null],
      ['Hoy he comido demasiado.', null],
      ['Compré 3 kilos de manzanas a 4 euros.', null],
      ['La reunión pasó al martes que viene a las 14.', '2026-03-17 14:00'],
    ],
    fr: [
      ["Rappelle-moi d'appeler le vétérinaire jeudi à 11h.", '2026-03-12 11:00'],
      ['La facture est due le 28 mars.', '2026-03-28'],
      ['Le 2 février je pars à Londres.', '2027-02-02'],
      ["Samedi soir dîner avec l'équipe à 20h30.", '2026-03-14 20:30'],
      ['Demain matin à 7h30 je dépose la voiture au garage.', '2026-03-12 07:30'],
      ["Dans un mois l'assurance expire.", '2026-04-11'],
      ["Il m'a appelé lundi dernier.", null],
      ["Aujourd'hui j'ai trop mangé.", null],
      ["J'ai acheté 3 kilos de pommes à 4 euros.", null],
      ['La réunion est reportée à mardi prochain à 14h.', '2026-03-17 14:00'],
    ],
    de: [
      ['Erinnere mich, am Donnerstag um 11 Uhr den Tierarzt anzurufen.', '2026-03-12 11:00'],
      ['Die Rechnung ist am 28. März fällig.', '2026-03-28'],
      ['Am 2. Februar fliege ich nach London.', '2027-02-02'],
      ['Samstagabend Essen mit dem Team um 20:30 Uhr.', '2026-03-14 20:30'],
      ['Morgen früh um halb acht bringe ich das Auto in die Werkstatt.', '2026-03-12 07:30'],
      ['In einem Monat läuft die Versicherung ab.', '2026-04-11'],
      ['Er hat mich letzten Montag angerufen.', null],
      ['Heute habe ich zu viel gegessen.', null],
      ['Ich habe 3 Kilo Äpfel für 4 Euro gekauft.', null],
      ['Das Meeting wurde auf nächsten Dienstag um 14 Uhr verschoben.', '2026-03-17 14:00'],
      ['Guten Morgen, ich wollte nur kurz Bescheid sagen.', null],
    ],
    pt: [
      ['Lembra-me de ligar ao veterinário na quinta às 11.', '2026-03-12 11:00'],
      ['A fatura vence no dia 28 de março.', '2026-03-28'],
      ['No dia 2 de fevereiro viajo para Londres.', '2027-02-02'],
      ['Sábado à noite jantar com a equipa às 20h30.', '2026-03-14 20:30'],
      ['Amanhã de manhã às 7 e meia levo o carro à oficina.', '2026-03-12 07:30'],
      ['Daqui a um mês vence o seguro.', '2026-04-11'],
      ['Ele ligou-me na segunda passada.', null],
      ['Hoje comi demais.', null],
      ['Comprei 3 quilos de maçãs a 4 euros.', null],
      ['A reunião passou para a próxima terça às 14.', '2026-03-17 14:00'],
      ['É a segunda vez que isto acontece.', null],
    ],
  });
});

const recorded = new Date(2026, 5, 1, 9, 0, 0); // Monday 1 June 2026, 09:00
const noteTwo =
  'Ciao Martina, il 15 luglio devo comprare le patate e il 17 luglio devo andare dal dottore alle 4 e un quarto del pomeriggio .';

test("Ricky's note: the hour joins the date it belongs to, not the first one", () => {
  const r = findHighlights(noteTwo, [], recorded);
  const of = (q: string) => r.find((e) => e.quote.startsWith(q));
  assert.equal(fmt(of('15 luglio')!.when!), '2026-07-15');
  assert.equal(fmt(of('17 luglio')!.when!), '2026-07-17 16:15');
  assert.equal(fmt(of('alle 4')!.when!), '2026-07-17 16:15');
  // Same event, so the hour carries the date's title rather than its own.
  assert.equal(of('alle 4')!.name, of('17 luglio')!.name);
});

test('an hour belongs to the date before it, even with another date right after', () => {
  const r = findDateSpans('Il 15 luglio alle 9, il 17 luglio niente.', recorded).map((s) => fmt(s.when));
  assert.deepEqual(r, ['2026-07-15 09:00', '2026-07-15 09:00', '2026-07-17']);
  // With no date before it, a date right after is the one ("at 5pm tomorrow").
  assert.equal(fmt(findDateSpans('Call her at 5pm tomorrow.', recorded)[0].when), '2026-06-02 17:00');
});

test('two hours on one day are two events on that day', () => {
  const r = findDateSpans('Lunedì alle 9 riunione e alle 15 dentista.', recorded).map((s) => fmt(s.when));
  assert.deepEqual(r, ['2026-06-08 09:00', '2026-06-08 09:00', '2026-06-08 15:00']);
});

test('the same words resolve differently for a different recording day', () => {
  assert.equal(fmt(resolveQuote('domani alle 18', new Date(2026, 0, 31, 12, 0))!), '2026-02-01 18:00');
  assert.equal(fmt(resolveQuote('domani alle 18', new Date(2026, 11, 31, 12, 0))!), '2027-01-01 18:00');
  // A lone hour already past when it was said belongs to the next day.
  assert.equal(fmt(resolveQuote('alle 8', new Date(2026, 5, 1, 9, 0))!), '2026-06-02 08:00');
  assert.equal(fmt(resolveQuote('alle 11', new Date(2026, 5, 1, 9, 0))!), '2026-06-01 11:00');
});

test('impossible dates and quantities are not dates', () => {
  for (const text of [
    'Il 31 giugno non esiste.',
    'Il 45 marzo.',
    'Servono 3/4 di tazza di farina.',
    'Versione 2.10 del programma, alle 25.',
    'At one point I gave up. As 5 people said, it costs 4.50 at 7 percent.',
    'Ho letto il capitolo 12 alle 3 ragazze.',
    'Um 5 Euro teurer.',
    'Trabalhei 8h ontem. Ça a duré 2h.',
    'Esta mañana fui al banco. Am Morgen gehe ich laufen.',
  ]) {
    assert.deepEqual(findDateSpans(text, recorded), [], text);
  }
});

test('a model entity the patterns cannot read is kept, without a date', () => {
  const text = 'Ne parliamo dopo le vacanze di ferragosto.';
  const r = mergeEntities([{ quote: 'dopo le vacanze', name: 'Riparlarne', type: 'date' }], text, recorded);
  assert.equal(r.length, 1);
  assert.equal(r[0].when, undefined);
  // And a stored `when` is never trusted: it is worked out again from the quote.
  const stale = { quote: 'dopo le vacanze', name: 'x', type: 'date' as const, when: { year: 1999, month: 1, day: 1, dateSaid: true } };
  assert.equal(mergeEntities([stale], text, recorded)[0].when, undefined);
});

test('a tap opens the calendar or the clock already filled in', () => {
  const [date, time] = findHighlights('Il 17 luglio devo andare dal dottore alle 16:15.', [], recorded);
  const cal = intentFor(time, 'Dottore');
  assert.equal(isAlarm(time), false, 'an hour with a date is a calendar event');
  assert.equal(cal.action, 'android.intent.action.INSERT');
  assert.equal(cal.data, 'content://com.android.calendar/events');
  assert.equal(cal.extra.beginTime, new Date(2026, 6, 17, 16, 15).getTime());
  assert.equal(cal.extra.endTime, new Date(2026, 6, 17, 17, 15).getTime());
  assert.equal(cal.extra.allDay, undefined);
  assert.equal(cal.extra.title, 'Dottore');
  assert.equal(intentFor(date, 'Dottore').extra.beginTime, cal.extra.beginTime);

  const [day] = findHighlights('Il 15 luglio devo comprare le patate.', [], recorded);
  const allDay = intentFor(day, 'Patate');
  assert.equal(allDay.extra.allDay, true);
  assert.equal(allDay.extra.beginTime, Date.UTC(2026, 6, 15));
  assert.equal(allDay.extra.endTime, Date.UTC(2026, 6, 16));

  const [hour] = findHighlights('Alle 16:30 esco.', [], recorded);
  const alarm = intentFor(hour, 'Uscire');
  assert.equal(isAlarm(hour), true);
  assert.equal(alarm.action, 'android.intent.action.SET_ALARM');
  assert.equal(alarm.extra['android.intent.extra.alarm.HOUR'], 16);
  assert.equal(alarm.extra['android.intent.extra.alarm.MINUTES'], 30);
  assert.equal(alarm.extra['android.intent.extra.alarm.MESSAGE'], 'Uscire');

  // No resolved date (a wordy model entity): the calendar opens with the title only, as before.
  const bare = intentFor({ quote: 'dopo le vacanze', name: 'x', type: 'date' }, 'Riparlarne');
  assert.equal(bare.extra.beginTime, undefined);
});

test('formatWhen shows the hour in 24-hour digits', () => {
  assert.match(formatWhen({ year: 2026, month: 7, day: 17, hour: 16, minute: 15, dateSaid: true }), /2026.*16:15$/);
  assert.equal(formatWhen({ year: 2026, month: 6, day: 1, hour: 8, minute: 5, dateSaid: false }), '08:05');
  assert.doesNotMatch(formatWhen({ year: 2026, month: 7, day: 15, dateSaid: true }), /:/);
});
