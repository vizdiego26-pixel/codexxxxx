import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY, createProgress, loadProgress, saveProgress, recordReview, getCardStatus,
} from '../src/lib/storage.js';

const now = Date.parse('2026-10-25T12:00:00.000Z');
const DAY = 86400000;
const memoryStorage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

test('progress survives a full browser-storage round trip including session position', () => {
  const storage = memoryStorage();
  const progress = recordReview({ ...createProgress(), session: { queue: ['L01', 'L02'], index: 1, mode: 'review' } }, 'L01', true, now);
  assert.equal(saveProgress(progress, storage), true);
  assert.deepEqual(loadProgress(storage), progress);
});

test('unavailable, full, or corrupt storage leaves the study workflow usable', () => {
  const broken = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };
  assert.deepEqual(loadProgress(broken), createProgress());
  assert.equal(saveProgress(createProgress(), broken), false);
  assert.deepEqual(loadProgress(null), createProgress());
  assert.equal(saveProgress(createProgress(), null), false);
  assert.deepEqual(loadProgress({ getItem: () => '{broken json' }), createProgress());
  assert.deepEqual(loadProgress({ getItem: () => JSON.stringify({ version: 999 }) }), createProgress());
});

test('untrusted stored counters and incomplete data cannot corrupt progress calculations', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify({
    version: 1,
    cards: { L01: { attempts: -2, correct: '12', mistakes: null, dueAt: 'invalid', streak: 0 } },
    session: { queue: ['L01', null, 3], index: 100, mode: 'ordered' },
  }));
  const progress = loadProgress(storage);
  assert.deepEqual(progress.session, { queue: ['L01'], index: 1, mode: 'ordered' });
  assert.equal(progress.cards.L01.attempts, 0);
  assert.equal(progress.cards.L01.correct, 0);
  assert.equal(progress.cards.L01.dueAt, null);
  assert.equal(recordReview(progress, 'L01', true, now).cards.L01.attempts, 1);
});

test('a wrong answer stays on the same card and is immediately due again', () => {
  const original = { ...createProgress(), session: { queue: ['L01', 'L02'], index: 0 } };
  const next = recordReview(original, 'L01', false, now);
  assert.deepEqual(next.session, original.session);
  assert.deepEqual(next.cards.L01, {
    attempts: 1, correct: 0, mistakes: 1, streak: 0,
    lastReviewed: new Date(now).toISOString(), dueAt: new Date(now).toISOString(),
  });
  assert.deepEqual(original.cards, {});
  assert.equal(getCardStatus(next.cards.L01, now), 'learning');
});

test('correct answers extend review intervals and an error resets that schedule', () => {
  let progress = createProgress();
  for (const interval of [1, 3, 7, 14, 30, 30]) {
    progress = recordReview(progress, 'L01', true, now);
    assert.equal(Date.parse(progress.cards.L01.dueAt) - now, interval * DAY);
  }
  assert.equal(progress.cards.L01.attempts, 6);
  assert.equal(progress.cards.L01.correct, 6);
  progress = recordReview(progress, 'L01', false, now);
  assert.equal(progress.cards.L01.streak, 0);
  assert.equal(progress.cards.L01.correct, 6);
  assert.equal(progress.cards.L01.mistakes, 1);
  progress = recordReview(progress, 'L01', true, now);
  assert.equal(Date.parse(progress.cards.L01.dueAt) - now, DAY);
  assert.equal(progress.cards.L01.attempts, 8);
});

test('status reflects new, learning, future review and overdue cards', () => {
  assert.equal(getCardStatus(undefined, now), 'new');
  assert.equal(getCardStatus({}, now), 'new');
  assert.equal(getCardStatus({ attempts: 1, streak: 0, dueAt: new Date(now).toISOString() }, now), 'learning');
  const card = recordReview(createProgress(), 'L01', true, now).cards.L01;
  assert.equal(getCardStatus(card, now), 'learned');
  assert.equal(getCardStatus(card, now + DAY), 'due');
  assert.equal(getCardStatus(card, now + 2 * DAY), 'due');
});
