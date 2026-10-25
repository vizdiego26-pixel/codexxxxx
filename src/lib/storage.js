/** Local, account-free progress. A blocked/full browser store never prevents studying. */
export const STORAGE_KEY = 'lamina.progress.v1';
const DAY = 24 * 60 * 60 * 1000;
const INTERVALS = [1, 3, 7, 14, 30];

export function createProgress() {
  return {
    version: 1,
    cards: {},
    session: { queue: [], index: 0 },
    lastStudied: null,
  };
}

function browserStorage() {
  try { return globalThis.localStorage; } catch { return undefined; }
}

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;

function normalizeCard(value) {
  const card = isObject(value) ? value : {};
  return {
    attempts: count(card.attempts),
    correct: count(card.correct),
    mistakes: count(card.mistakes),
    lastReviewed: timestamp(card.lastReviewed),
    dueAt: timestamp(card.dueAt),
    streak: count(card.streak),
  };
}

function normalizeProgress(value) {
  if (!isObject(value) || value.version !== 1) return createProgress();
  const entries = isObject(value.cards) ? Object.entries(value.cards) : [];
  const cards = Object.fromEntries(entries.filter(([id]) => id.length > 0).map(([id, card]) => [id, normalizeCard(card)]));
  const rawSession = isObject(value.session) ? value.session : {};
  const queue = Array.isArray(rawSession.queue)
    ? rawSession.queue.filter(id => typeof id === 'string' && id.length > 0)
    : [];
  return {
    ...value,
    version: 1,
    cards,
    session: { ...rawSession, queue, index: Math.min(count(rawSession.index), queue.length) },
    lastStudied: timestamp(value.lastStudied),
  };
}

export function loadProgress(storage = browserStorage()) {
  try {
    if (!storage || typeof storage.getItem !== 'function') return createProgress();
    const value = storage.getItem(STORAGE_KEY);
    return value ? normalizeProgress(JSON.parse(value)) : createProgress();
  } catch {
    return createProgress();
  }
}

export function saveProgress(progress, storage = browserStorage()) {
  try {
    if (!storage || typeof storage.setItem !== 'function') return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

/** Record an attempt without moving the session's current card. */
export function recordReview(progress, id, isCorrect, now = Date.now()) {
  const base = isObject(progress) ? progress : createProgress();
  const previous = normalizeCard(base.cards?.[id]);
  const correct = isCorrect === true;
  const streak = correct ? previous.streak + 1 : 0;
  const reviewedAt = new Date(now).toISOString();
  const nextReview = correct ? now + INTERVALS[Math.min(streak - 1, INTERVALS.length - 1)] * DAY : now;
  return {
    ...base,
    version: 1,
    cards: {
      ...base.cards,
      [id]: {
        attempts: previous.attempts + 1,
        correct: previous.correct + (correct ? 1 : 0),
        mistakes: previous.mistakes + (correct ? 0 : 1),
        lastReviewed: reviewedAt,
        dueAt: new Date(nextReview).toISOString(),
        streak,
      },
    },
    lastStudied: reviewedAt,
  };
}

export function getCardStatus(cardProgress, now = Date.now()) {
  if (!cardProgress || !count(cardProgress.attempts)) return 'new';
  if (!count(cardProgress.streak)) return 'learning';
  const dueAt = Date.parse(cardProgress.dueAt);
  if (!Number.isFinite(dueAt) || dueAt <= now) return 'due';
  return 'learned';
}
