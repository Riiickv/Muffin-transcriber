import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatDuration, formatEta, formatHistoryDate, formatRelativeTime } from '../utils/format.ts';

test('formatDuration is MM:SS, and H:MM:SS past an hour', () => {
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(5), '00:05');
  assert.equal(formatDuration(65), '01:05');
  assert.equal(formatDuration(600), '10:00');
  assert.equal(formatDuration(5400), '1:30:00'); // a 90-minute lecture, not "90:00"
  assert.equal(formatDuration(3661), '1:01:01');
});

test('formatDuration coerces junk to zero', () => {
  assert.equal(formatDuration(-5), '00:00');
  assert.equal(formatDuration(NaN), '00:00');
  assert.equal(formatDuration(Infinity), '00:00');
});

test('formatEta reads as a rough countdown, "..." when unknown', () => {
  assert.equal(formatEta(45), '45s');
  assert.equal(formatEta(125), '2m 5s');
  assert.equal(formatEta(-1), '...');
  assert.equal(formatEta(NaN), '...');
});

test('formatRelativeTime buckets recent times', () => {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  assert.equal(formatRelativeTime(ago(20 * 1000)), 'now'); // <1 min
  assert.equal(formatRelativeTime(ago(5 * 60000)), '5m');
  assert.equal(formatRelativeTime(ago(3 * 3600 * 1000)), '3h');
  assert.equal(formatRelativeTime(ago(2 * 86400 * 1000)), '2d');
  assert.equal(formatRelativeTime('not-a-date'), ''); // invalid guarded
});

test('formatHistoryDate produces a non-empty dated string and does not throw', () => {
  const s = formatHistoryDate('2026-01-05T15:04:00.000Z');
  assert.equal(typeof s, 'string');
  assert.ok(s.length > 0 && /\d/.test(s));
});
