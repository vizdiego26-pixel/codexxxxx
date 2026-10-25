/**
 * Local, deterministic grading for the terminology in the supplied answer key.
 * This is intentionally conservative: it accepts spelling variation, not a
 * general claim to understand arbitrary medical explanations.
 */

const OPTIONAL_WORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del',
  'al', 'en', 'es', 'son', 'se', 'trata', 'corresponde', 'a', 'tipo',
]);

const INFLECTIONS = {
  bandas: 'banda', celulas: 'celula', crestas: 'cresta', neurales: 'neural',
  miofibrillas: 'miofibrilla', osteocitos: 'osteocito', osteoblastos: 'osteoblasto',
  osteoclastos: 'osteoclasto', fibroblastos: 'fibroblasto', canaliculos: 'canaliculo',
  semanas: 'semana', dias: 'dia', paralelas: 'paralela', paralelos: 'paralela',
  paralelo: 'paralela', somitos: 'somito', somitas: 'somita',
  esbozos: 'esbozo', miembros: 'miembro', rayos: 'rayo', discos: 'disco',
};

export function normalizeAnswer(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokens(value) {
  return normalizeAnswer(value)
    .split(' ')
    .filter((word, index, words) => word && (
      // "a" can be a preposition, but in banda A it is the identification.
      (word === 'a' && /^bandas?$/.test(words[index - 1] || ''))
      || !OPTIONAL_WORDS.has(word)
    ))
    .map(word => INFLECTIONS[word] || word);
}

function canonical(value) {
  return tokens(value).join(' ');
}

// Equivalences are curated from this subject and the wording in the PDF. They
// don't turn examples of a derivative into equivalents of an entire system.
const EQUIVALENCES = [
  ['Matriz interterritorial', 'matriz cartilaginosa interterritorial'],
  ['Miofibrillas', 'miofibrilla'],
  ['Bandas A', 'banda A'],
  ['Célula de las crestas neurales', 'célula de la cresta neural', 'células de la cresta neural', 'cresta neural', 'crestas neurales'],
  ['Compacto', 'hueso compacto', 'tejido óseo compacto'],
  ['Esponjoso', 'hueso esponjoso', 'tejido óseo esponjoso', 'hueso trabecular'],
  ['Zona proliferativa', 'zona de proliferación', 'zona de proliferación condrocitaria'],
  ['Pared corporal', 'pared del cuerpo'],
  ['Ectodermo no neural', 'ectodermo superficial', 'ectodermo cutáneo'],
  ['Zona de hipertrofia', 'zona hipertrófica'],
  ['Sistema urogenital', 'sistema genitourinario', 'aparato urogenital', 'aparato genitourinario'],
  ['Tejido conjuntivo laxo', 'tejido conectivo laxo', 'conjuntivo laxo', 'conectivo laxo'],
  ['Osificación membranosa', 'osificación intramembranosa', 'intramembranosa', 'membranosa'],
  ['BMP-4', 'BMP4', 'proteína morfogenética ósea 4'],
  ['Esbozo de miembro inferior', 'esbozo del miembro inferior', 'brote de miembro inferior', 'yema de miembro inferior'],
  ['Cartílago fibroso', 'fibrocartílago'],
  ['Hernia umbilical fisiológica', 'herniación umbilical fisiológica', 'herniación fisiológica del intestino'],
  ['3 semanas', 'tres semanas', '3', 'tercera semana', '3 sem'],
  ['Músculo estriado esquelético', 'músculo esquelético', 'tejido muscular estriado esquelético'],
  ['7 semanas', 'siete semanas', '7', 'séptima semana', '7 sem'],
  ['Zona de actividad polarizante', 'zona de actividad polarizadora', 'ZAP'],
  ['Zona de reserva', 'zona de reposo', 'zona de cartílago de reserva'],
  ['Osificación endocondral', 'endocondral'],
  ['Segundo arco faríngeo', '2 arco faríngeo', '2do arco faríngeo', 'segundo arco branquial'],
  ['6 semanas', 'seis semanas', '6', 'sexta semana', '6 sem'],
  ['Colágeno tipo II', 'colágeno II', 'colágeno 2', 'colágeno tipo 2'],
  ['Somito', 'somita'],
  ['Conducto de Volkmann', 'canal de Volkmann', 'conducto perforante de Volkmann'],
  ['SNP', 'sistema nervioso periférico'],
  ['5 semanas', 'cinco semanas', '5', 'quinta semana', '5 sem'],
  ['Zona de invasión vascular', 'zona de invasión de vasos sanguíneos'],
  ['21-22 días', '21 a 22 días', 'entre 21 y 22 días', '21 a 22', '21-22', 'veintiuno a veintidós días'],
  ['Conducto de Havers', 'canal de Havers', 'conducto central de Havers'],
  ['Cresta ectodérmica apical', 'cresta ectodermal apical', 'CEA'],
  ['Shh', 'sonic hedgehog'],
  ['Núcleo pulposo', 'núcleo pulposo del disco intervertebral'],
  ['Disco intercalar', 'disco intercalado'],
];

const equivalentAnswers = new Map();
for (const group of EQUIVALENCES) {
  for (const answer of group) equivalentAnswers.set(canonical(answer), group);
}

// A real neighbouring term must never pass as a spelling mistake. The nearest
// known term also disambiguates misspellings such as "osteoclsto".
const vocabulary = new Set(tokens([
  ...EQUIVALENCES.flat(),
  'osteocito osteoblasto osteoclasto condrocito condroblasto fibroblasto fibrocito',
  'endodermo ectodermo mesodermo neuroectodermo',
  'territorial interterritorial pericelular capsular',
  'hialino fibroso elástico compacto esponjoso inmaduro maduro',
  'placa tubo surco pliegue cresta neural primitivo',
  'miotomo dermatomo esclerotomo dermomiotomo',
  'mesodermo lateral somático esplácnico paraxial intermedio axial',
  'músculo esquelético cardíaco liso',
  'zona reserva proliferativa hipertrofia calcificación invasión vascular',
  'banda línea sarcómero disco intercalar',
  'mesénquima región progreso',
  'primer segundo tercer cuarto quinto sexto arco faríngeo',
  'epidermis dermis intestino esqueleto pared corporal centro señalizador',
].join(' ')).filter(word => word.length >= 4));

function distance(a, b) {
  // Optimal string alignment (Levenshtein plus adjacent transposition).
  const rows = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) rows[i][0] = i;
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

function tokenDistance(input, expected) {
  if (input === expected) return 0;
  // Numbers, units abbreviated to a few letters, band labels and molecular
  // abbreviations have no fuzzy interpretation.
  if (/\d/.test(input + expected) || input.length <= 3 || expected.length <= 3) return Infinity;
  if (input === 'no' || expected === 'no' || vocabulary.has(input)) return Infinity;
  const budget = expected.length >= 11 ? 2 : 1;
  if (Math.abs(input.length - expected.length) > budget) return Infinity;
  const edits = distance(input, expected);
  if (edits > budget) return Infinity;
  for (const other of vocabulary) {
    if (other !== expected && Math.abs(input.length - other.length) <= edits && distance(input, other) <= edits) {
      return Infinity;
    }
  }
  return edits;
}

function sameWords(input, expected) {
  return [...input].sort().join(' ') === [...expected].sort().join(' ');
}

function fuzzyMatch(input, expected) {
  if (input.length !== expected.length) return false;
  let edits = 0;
  const remaining = [...expected];
  // Remove exact matches first, then match the (at most a handful) typo tokens.
  const unmatched = input.filter(word => {
    const index = remaining.indexOf(word);
    if (index < 0) return true;
    remaining.splice(index, 1);
    return false;
  });
  for (const word of unmatched) {
    const choices = remaining.map((candidate, index) => ({ index, edits: tokenDistance(word, candidate) }));
    choices.sort((a, b) => a.edits - b.edits);
    const best = choices[0];
    if (!best || !Number.isFinite(best.edits)) return false;
    edits += best.edits;
    if (edits > 2) return false;
    remaining.splice(best.index, 1);
  }
  return edits > 0;
}

/** @returns {{correct: boolean, match: 'exact'|'equivalent'|'typo'|'incorrect'|'empty', message: string}} */
export function gradeAnswer(input, card) {
  const rawInput = String(input ?? '');
  // These cards ask for short identifications. Bound work before normalization
  // or edit-distance evaluation when invoked outside the text field UI.
  if (rawInput.length > 500) {
    return { correct: false, match: 'incorrect', message: 'Escribe una respuesta breve, de hasta 500 caracteres.' };
  }
  const normalized = normalizeAnswer(rawInput);
  if (!normalized || !tokens(input).length) {
    return { correct: false, match: 'empty', message: 'Escribe tu respuesta para comprobarla.' };
  }
  const answer = String(card?.answer ?? '');
  if (!answer.trim()) {
    return { correct: false, match: 'incorrect', message: 'Esta tarjeta no tiene una respuesta configurada.' };
  }
  if (normalized === normalizeAnswer(answer)) {
    return { correct: true, match: 'exact', message: '¡Correcto! Lo identificaste.' };
  }
  const alternatives = [...new Set([
    answer,
    ...(equivalentAnswers.get(canonical(answer)) || []),
    ...(Array.isArray(card?.aliases) ? card.aliases : []),
  ])];
  const inputTokens = tokens(input);
  for (const alternative of alternatives) {
    const expected = tokens(alternative);
    // Joining tolerates accidental spaces inside words; numeric boundaries are
    // preserved so that 21–22 never becomes an age of 2122 days.
    const sameSpacing = !/\d/.test(inputTokens.join('') + expected.join(''))
      && inputTokens.join('') === expected.join('');
    if (sameWords(inputTokens, expected) || sameSpacing) {
      return { correct: true, match: 'equivalent', message: '¡Correcto! Tu respuesta equivale a la pauta.' };
    }
  }
  for (const alternative of alternatives) {
    if (fuzzyMatch(inputTokens, tokens(alternative))) {
      return { correct: true, match: 'typo', message: '¡Correcto! Aceptamos los pequeños errores de escritura.' };
    }
  }
  return { correct: false, match: 'incorrect', message: 'Todavía no. Revisa la corrección e inténtalo otra vez.' };
}
