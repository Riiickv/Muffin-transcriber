import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDrip, mixHex } from '../utils/streamingDrip.ts';

test('drip reveals the first burst over ~6s at speed 1', () => {
  let clock = 0;
  const drip = createDrip(() => clock, 1);
  clock = 25000;
  drip.reset();
  drip.push(200);
  let doneAt: number | null = null;
  for (let t = 0; t < 20000 && doneAt === null; t += 40) {
    clock = 25000 + t;
    if (drip.tick(false) >= 200) doneAt = t;
  }
  assert.ok(doneAt !== null && Math.abs(doneAt - 6000) < 1500, `doneAt=${doneAt}`);
});

test('speed multiplier makes it faster', () => {
  const finishAt = (speed: number) => {
    let clock = 0;
    const drip = createDrip(() => clock, speed);
    clock = 25000;
    drip.reset();
    drip.push(200);
    for (let t = 0; t < 20000; t += 40) {
      clock = 25000 + t;
      if (drip.tick(false) >= 200) return t;
    }
    return Infinity;
  };
  assert.ok(finishAt(5) < finishAt(2));
  assert.ok(finishAt(2) < finishAt(1));
});

test('mixHex blends, clamps, and falls back on non-hex', () => {
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(mixHex('#000000', '#ffffff', 5), '#ffffff');
  assert.equal(mixHex('not-hex' as unknown as string, '#123456', 0.3), '#123456');
});
