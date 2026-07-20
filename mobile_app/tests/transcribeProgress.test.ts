import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createProgressTracker, formatSecondsLeft, describeProgress } from '../utils/transcribeProgress.ts';

/** Replay a whole transcription at a given real duration, on an injected clock. */
function replay(totalSeconds: number, warmupSeconds = 4, tickSeconds = 0.5) {
  let clock = 0;
  const tracker = createProgressTracker(() => clock * 1000);
  clock += warmupSeconds;
  const readings = [];
  for (let t = 0; t <= totalSeconds; t += tickSeconds) {
    clock = warmupSeconds + t;
    readings.push({ ...tracker.update((t / totalSeconds) * 100), actualLeft: totalSeconds - t });
  }
  return readings;
}

test('estimate is within 25% at halfway, on both a fast and a slow device', () => {
  for (const total of [12, 240]) {
    const r = replay(total).find((x) => x.percent >= 50 && x.secondsLeft !== null);
    assert.ok(r, `no estimate by halfway for ${total}s`);
    assert.ok(
      Math.abs((r!.secondsLeft as number) - r!.actualLeft) <= r!.actualLeft * 0.25,
      `${total}s: said ${r!.secondsLeft}, truth ${r!.actualLeft}`
    );
  }
});

test('model warmup is not charged to the rate', () => {
  // 25s of warmup before any progress; the estimate must not treat it as work.
  const r = replay(240, 25, 2).find((x) => x.percent >= 50 && x.secondsLeft !== null);
  assert.ok(r && (r.secondsLeft as number) < r.actualLeft * 1.3);
});

test('percent never goes backwards and no estimate is shown before there is signal', () => {
  const run = replay(120);
  assert.equal(run[0].secondsLeft, null);
  assert.ok(run.every((r, i) => i === 0 || r.percent >= run[i - 1].percent));
  assert.ok(run.every((r) => r.secondsLeft === null || r.secondsLeft >= 0));
});

test('formatSecondsLeft renders m:ss and h:mm:ss', () => {
  assert.equal(formatSecondsLeft(42), '0:42');
  assert.equal(formatSecondsLeft(130), '2:10');
  assert.equal(formatSecondsLeft(3900), '1:05:00');
});

test('describeProgress shows label alone, then percent, then the full line', () => {
  assert.equal(describeProgress('Transcribing...', null), 'Transcribing...');
  assert.equal(describeProgress('Transcribing...', { percent: 5, secondsLeft: null }), 'Transcribing... 5%');
  assert.equal(
    describeProgress('Transcribing...', { percent: 42, secondsLeft: 130 }),
    'Transcribing... 42% - 2:10'
  );
});
