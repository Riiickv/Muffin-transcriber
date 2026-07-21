import { test } from 'node:test';
import assert from 'node:assert/strict';

import { waveformBars } from '../utils/waveform.ts';

test('waveformBars is deterministic, sized, and in range', () => {
  const a = waveformBars('item-123', 44);
  const b = waveformBars('item-123', 44);
  assert.deepEqual(a, b, 'same seed gives the same bars');
  assert.equal(a.length, 44, 'returns the requested count');
  assert.ok(a.every((v) => v >= 0.2 && v <= 1), 'every bar is a visible 0.2..1 height');
});

test('waveformBars differs by seed', () => {
  const a = waveformBars('item-123', 44);
  const c = waveformBars('item-999', 44);
  assert.notDeepEqual(a, c, 'a different recording gets a different shape');
});
