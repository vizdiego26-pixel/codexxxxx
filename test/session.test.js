import test from 'node:test';
import assert from 'node:assert/strict';
import { SESSION_SIZES, createEmptySession, createStudySession } from '../src/lib/session.js';

const cards = Array.from({ length: 70 }, (_, index) => ({ id: `L${String(index + 1).padStart(2, '0')}`, number: index + 1 }));

test('each offered size draws exactly that many unique existing cards', () => {
  assert.deepEqual(SESSION_SIZES, [10, 15, 30, 40, 70]);
  const available = new Set(cards.map(card => card.id));
  for (const count of SESSION_SIZES) {
    const session = createStudySession(cards, count, { random: () => 0.37 });
    assert.equal(session.queue.length, count);
    assert.equal(new Set(session.queue).size, count);
    assert.ok(session.queue.every(id => available.has(id)));
  }
});

test('a complete session includes all 70 cards exactly once', () => {
  const session = createStudySession(cards, 70, { random: () => 0 });
  assert.deepEqual([...session.queue].sort(), cards.map(card => card.id).sort());
  assert.notDeepEqual(session.queue, cards.map(card => card.id));
});

test('fresh random draws change both the selection and its order without mutating the bank', () => {
  const original = structuredClone(cards);
  const first = createStudySession(cards, 10, { random: () => 0 });
  const second = createStudySession(cards, 10, { random: () => 0.999 });
  assert.notDeepEqual(first.queue, second.queue);
  assert.notDeepEqual([...first.queue].sort(), [...second.queue].sort());
  assert.deepEqual(cards, original);
});

test('the two-minute clock only starts when the selected session is created', () => {
  const empty = createEmptySession();
  assert.deepEqual(empty, { queue: [], index: 0, deadline: 0, paused: true, remaining: 120, feedback: null });
  const now = Date.UTC(2026, 9, 25, 12);
  const started = createStudySession(cards, 15, { now, random: () => 0.5 });
  assert.equal(started.deadline, now + 120_000);
  assert.equal(started.remaining, 120);
  assert.equal(started.index, 0);
  assert.equal(started.paused, false);
  assert.equal(started.feedback, null);
  empty.queue.push('L01');
  assert.deepEqual(createEmptySession().queue, []);
});

test('single-card practice remains supported without repeating its card', () => {
  assert.deepEqual(createStudySession([cards[5]], 1).queue, ['L06']);
});

test('invalid counts, empty pools and duplicate or missing IDs cannot create misleading sessions', () => {
  for (const count of [0, -1, 71, 2.5, NaN, '10', undefined]) {
    assert.throws(() => createStudySession(cards, count), RangeError);
  }
  for (const pool of [[], null, {}, [{ id: 'L01' }, { id: 'L01' }], [{ id: '' }], [{}]]) {
    assert.throws(() => createStudySession(pool, 1), TypeError);
  }
  assert.throws(() => createStudySession(cards, 10, { now: NaN }), TypeError);
  assert.throws(() => createStudySession(cards, 10, { random: null }), TypeError);
  for (const draw of [-1, 1, NaN, Infinity]) {
    assert.throws(() => createStudySession(cards, 10, { random: () => draw }), RangeError);
  }
});
