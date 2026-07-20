import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSegmentAccumulator } from '../utils/segmentAccumulator.ts';

test('accumulates each new-segment burst into the growing transcript', () => {
  const seen: string[] = [];
  const push = createSegmentAccumulator((t) => seen.push(t));
  push({ result: ' Buongiorno a tutti.' });
  push({ result: ' Oggi parliamo di storia.' });
  push({ result: ' La lezione inizia adesso.' });

  assert.equal(seen.length, 3);
  assert.ok(seen.every((s, i) => i === 0 || s.startsWith(seen[i - 1])), 'text only grows');
  assert.equal(seen[0], 'Buongiorno a tutti.');
  assert.equal(seen[2], 'Buongiorno a tutti. Oggi parliamo di storia. La lezione inizia adesso.');
  // The bug this guards: treating `result` as cumulative would show the newest
  // chunk alone, so the box appears to wipe itself.
  assert.ok(!seen[2].startsWith('La lezione'));
});

test('ignores empty and malformed callbacks, and keeps working after them', () => {
  const seen: string[] = [];
  const push = createSegmentAccumulator((t) => seen.push(t));
  push(null);
  push(undefined);
  push({});
  push({ result: '' });
  push({ result: '   ' });
  assert.equal(seen.length, 0);
  push({ result: ' Ciao.' });
  assert.deepEqual(seen, ['Ciao.']);
});

test('two runs keep separate state', () => {
  const a: string[] = [];
  const b: string[] = [];
  const one = createSegmentAccumulator((t) => a.push(t));
  const two = createSegmentAccumulator((t) => b.push(t));
  one({ result: ' First recording.' });
  two({ result: ' Second recording.' });
  assert.equal(b[0], 'Second recording.');
});
