import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createValueStore, readWithRescue, type KeyValue } from '../utils/valueStore.ts';

// The rule under test: a value that could not be read is never written over.
// Before it, a failed read came back as the starting value, and the next save
// stored that. For the transcriptions the starting value was an empty list.

function makeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const state = { failGet: false, failSet: false, gets: 0, sets: 0 };
  const storage: KeyValue = {
    async getItem(key) {
      state.gets++;
      // What Android answers for a value past 2,097,099 bytes (measured, docs/storage-research.md).
      if (state.failGet) throw new Error('Row too big to fit into CursorWindow requiredPos=0, totalRows=1');
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      state.sets++;
      if (state.failSet) throw new Error('database or disk is full (code 13 SQLITE_FULL)');
      data.set(key, value);
    },
  };
  return { storage, data, state };
}

const quiet = { log: () => {} };

test('a read that fails is not an empty value that may be saved', async () => {
  const stored = JSON.stringify([{ id: '1' }, { id: '2' }]);
  const { storage, data, state } = makeStorage({ list: stored });
  state.failGet = true;
  const store = createValueStore<{ id: string }[]>(storage, 'list', [], quiet);

  assert.deepEqual(await store.load(), [], 'the app still gets something to run on');
  assert.equal(store.readFailed(), true);

  // What the old code did next: add the new item to the "empty" list and save it.
  await store.save([{ id: '3' }]);
  assert.equal(data.get('list'), stored, 'the two stored items are still there');
  assert.equal(state.sets, 0);
  assert.deepEqual(store.get(), [{ id: '3' }], 'the session carries on in memory');
});

test('stored text that is not what was saved is kept too', async () => {
  const { storage, data } = makeStorage({ list: '[{"id":"1"},{"id' });
  const store = createValueStore<{ id: string }[]>(storage, 'list', [], quiet);
  assert.deepEqual(await store.load(), []);
  assert.equal(store.readFailed(), true);
  await store.save([]);
  assert.equal(data.get('list'), '[{"id":"1"},{"id');
});

test('a hydrate that throws counts as unreadable, not as empty', async () => {
  const { storage, data } = makeStorage({ k: '{"a":1}' });
  const store = createValueStore<{ a: number }>(storage, 'k', { a: 0 }, {
    ...quiet,
    hydrate: () => {
      throw new Error('unexpected shape');
    },
  });
  assert.deepEqual(await store.load(), { a: 0 });
  await store.save({ a: 5 });
  assert.equal(data.get('k'), '{"a":1}');
});

test('nothing stored is nothing stored: the starting value, and saves go through', async () => {
  const { storage, data } = makeStorage();
  const store = createValueStore<string[]>(storage, 'k', [], quiet);
  assert.deepEqual(await store.load(), []);
  assert.equal(store.readFailed(), false);
  await store.save(['a']);
  assert.equal(data.get('k'), '["a"]');
});

test('the ordinary round trip, with hydrate and the first-load call', async () => {
  const { storage, data, state } = makeStorage({ k: '{"a":2}' });
  let first: unknown = null;
  const store = createValueStore<{ a: number; b: number }>(storage, 'k', { a: 0, b: 0 }, {
    ...quiet,
    hydrate: (parsed) => ({ a: 0, b: 7, ...parsed }),
    onFirstLoad: (value) => {
      first = value;
    },
  });
  assert.equal(store.get(), null);
  const [one, two] = await Promise.all([store.load(), store.load()]);
  assert.deepEqual(one, { a: 2, b: 7 });
  assert.equal(one, two);
  assert.equal(state.gets, 1, 'two loads at once read storage once');
  assert.deepEqual(first, { a: 2, b: 7 });

  const seen: unknown[] = [];
  const stop = store.subscribe((v) => seen.push(v));
  await store.save({ a: 3, b: 7 });
  stop();
  await store.save({ a: 4, b: 7 });
  assert.deepEqual(seen, [{ a: 3, b: 7 }]);
  assert.equal(data.get('k'), '{"a":4,"b":7}');
  assert.deepEqual(await store.load(), { a: 4, b: 7 });
  assert.equal(state.gets, 1);
});

test('a save that fails does not throw, and the value stays in memory', async () => {
  const { storage, data, state } = makeStorage({ k: '[1]' });
  const store = createValueStore<number[]>(storage, 'k', [], quiet);
  await store.load();
  state.failSet = true;
  await store.save([1, 2]);
  assert.deepEqual(store.get(), [1, 2]);
  assert.equal(data.get('k'), '[1]');
});

// --- reading in pieces when the ordinary read throws -----------------------

const TOO_BIG = 'Row too big to fit into CursorWindow requiredPos=0, totalRows=1';

function reads(stored: string | null, opts: { firstFails?: boolean; rescue?: 'text' | 'null' | 'throws' | 'none' } = {}) {
  const calls = { first: 0, rescue: 0 };
  const first = async (_key: string) => {
    calls.first++;
    if (opts.firstFails) throw new Error(TOO_BIG);
    return stored;
  };
  const kind = opts.rescue ?? 'text';
  const rescue =
    kind === 'none'
      ? null
      : async (_key: string) => {
          calls.rescue++;
          if (kind === 'throws') throw new Error('The value did not come back exactly as stored');
          return kind === 'null' ? null : stored;
        };
  return { read: readWithRescue(first, rescue, quiet.log), calls };
}

test('the ordinary read is used when it works, and nothing else is tried', async () => {
  for (const stored of ['[1]', null]) {
    const { read, calls } = reads(stored);
    assert.equal(await read('k'), stored);
    assert.deepEqual(calls, { first: 1, rescue: 0 });
  }
});

test('a value too large to read at once is read in pieces, and then saved like any other', async () => {
  const stored = JSON.stringify([{ id: '1' }, { id: '2' }]);
  const { read, calls } = reads(stored, { firstFails: true });
  assert.equal(await read('k'), stored);
  assert.equal(calls.rescue, 1);

  const data = new Map([['k', stored]]);
  const store = createValueStore<{ id: string }[]>(
    { getItem: read, setItem: async (key, value) => void data.set(key, value) },
    'k',
    [],
    quiet,
  );
  assert.deepEqual(await store.load(), [{ id: '1' }, { id: '2' }]);
  assert.equal(store.readFailed(), false);
  await store.save([{ id: '1' }, { id: '2' }, { id: '3' }]);
  assert.equal(data.get('k'), '[{"id":"1"},{"id":"2"},{"id":"3"}]');
});

test('when reading in pieces fails, finds nothing, or is not there, the value is still unreadable and kept', async () => {
  for (const rescue of ['throws', 'null', 'none'] as const) {
    const stored = '[{"id":"1"}]';
    const { read } = reads(stored, { firstFails: true, rescue });
    await assert.rejects(read('k'), { message: TOO_BIG }, `${rescue}: the first error is the one reported`);

    const data = new Map([['k', stored]]);
    const store = createValueStore<{ id: string }[]>(
      { getItem: read, setItem: async (key, value) => void data.set(key, value) },
      'k',
      [],
      quiet,
    );
    assert.deepEqual(await store.load(), []);
    assert.equal(store.readFailed(), true, rescue);
    await store.save([]);
    assert.equal(data.get('k'), stored, `${rescue}: not written over`);
  }
});
