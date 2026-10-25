/** Session choices shown on entry; individual-card practice can use a smaller pool. */
export const SESSION_SIZES = Object.freeze([10, 15, 30, 40, 70]);

export function createEmptySession() {
  return {
    queue: [],
    index: 0,
    deadline: 0,
    paused: true,
    remaining: 120,
    feedback: null,
  };
}

/** Sample without replacement; the supplied cards and their order stay unchanged. */
export function createStudySession(cards, count, { now = Date.now(), random = Math.random } = {}) {
  if (!Array.isArray(cards) || cards.length === 0) {
    throw new TypeError('La sesión necesita al menos una lámina.');
  }
  if (!Number.isInteger(count) || count <= 0 || count > cards.length) {
    throw new RangeError('El tamaño debe ser un entero entre 1 y las láminas disponibles.');
  }
  const ids = cards.map(card => card?.id);
  if (ids.some(id => typeof id !== 'string' || id.trim().length === 0) || new Set(ids).size !== ids.length) {
    throw new TypeError('Cada lámina debe tener un identificador único y válido.');
  }
  if (!Number.isFinite(now) || typeof random !== 'function') {
    throw new TypeError('El reloj y el generador aleatorio deben ser válidos.');
  }
  for (let i = ids.length - 1; i > 0; i--) {
    const draw = random();
    if (!Number.isFinite(draw) || draw < 0 || draw >= 1) {
      throw new RangeError('El generador aleatorio debe devolver un valor entre 0 y 1, sin incluir 1.');
    }
    const j = Math.floor(draw * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return {
    queue: ids.slice(0, count),
    index: 0,
    deadline: now + 120_000,
    paused: false,
    remaining: 120,
    feedback: null,
  };
}
