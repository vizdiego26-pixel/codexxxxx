import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeAnswer, normalizeAnswer } from '../src/lib/grading.js';

function accepts(answer, inputs) {
  for (const input of inputs) {
    assert.equal(gradeAnswer(input, { answer }).correct, true, `Should accept ${JSON.stringify(input)} for ${answer}`);
  }
}

function rejects(answer, inputs) {
  for (const input of inputs) {
    assert.equal(gradeAnswer(input, { answer }).correct, false, `Should reject ${JSON.stringify(input)} for ${answer}`);
  }
}

test('case, accents, punctuation and whitespace do not affect correctness', () => {
  accepts('Cartílago hialino', ['  CARTILAGO   HIALINO ', 'cartílago, hialino.', 'cartilago\nhialino']);
  accepts('Osteocito', ['osteo cito', 'osteocito.']);
  assert.equal(normalizeAnswer('  LÍNEA\n Z! '), 'linea z');
});

test('omitted or misplaced spaces do not hide negations or change band labels', () => {
  accepts('Matriz interterritorial', ['matrizinterterritorial', 'mat riz inter territorial']);
  accepts('Cartílago hialino', ['cartilagohialino', 'cartil ago hial ino']);
  accepts('Bandas A', ['bandaa']);
  accepts('Banda I', ['bandai']);
  rejects('Bandas A', ['bandai', 'noesbandaa', 'nobandaa']);
  rejects('Banda I', ['bandaa']);
  rejects('Osteocito', ['noesosteocito', 'no osteo cito', 'osteocitoyosteoblasto']);
});

test('uses explicit equivalents and harmless articles and inflections', () => {
  accepts('Compacto', ['hueso compacto', 'el tejido óseo compacto', 'es un hueso compacto']);
  accepts('Célula de las crestas neurales', ['celula de la cresta neural', 'células de la cresta neural']);
  accepts('Tejido conjuntivo laxo', ['tejido conectivo laxo', 'conjuntivo laxo']);
  accepts('Colágeno tipo II', ['colageno de tipo II', 'colageno II', 'colageno tipo 2']);
  accepts('Cartílago fibroso', ['fibrocartilago']);
  accepts('Somito', ['somita']);
  accepts('Osificación membranosa', ['osificacion intramembranosa']);
  accepts('SNP', ['sistema nervioso periferico']);
});

test('accepts spelling mistakes and adjacent transpositions', () => {
  accepts('Osteocito', ['osteosito', 'ostecito', 'osteocitto']);
  accepts('Miofibrillas', ['miofibrilas', 'miofibrilals']);
  accepts('Cartílago hialino', ['cartilgo hialino', 'cartilago hailino']);
  accepts('Matriz interterritorial', ['matriz interteritorial']);
});

test('keeps nearby scientific terms distinct, including misspelled wrong terms', () => {
  rejects('Osteoblasto', ['osteocito', 'osteoclasto', 'osteoclsto', 'osteoclassto']);
  rejects('Osteoclasto', ['osteoblasto', 'osteobasto', 'osteoblsto']);
  rejects('Matriz territorial', ['matriz interterritorial', 'matriz interteritorial']);
  rejects('Mesodermo', ['ectodermo', 'endodermo', 'ectoderma']);
  rejects('Mesodermo lateral somático', ['mesodermo lateral esplacnico', 'mesodermo paraxial', 'somatopleura']);
  rejects('Surco neural', ['tubo neural', 'placa neural', 'surco primitivo']);
  rejects('Miotomo', ['dermomiotoma', 'dermomiotomo', 'dermatomo']);
});

test('band identifiers, molecular signals and numbers are never fuzzy matched', () => {
  accepts('Bandas A', ['banda A', 'las bandas A']);
  rejects('Bandas A', ['banda I', 'banda Z', 'banda', 'bandas']);
  rejects('Banda I', ['banda A', 'banda II']);
  rejects('Línea Z', ['linea I', 'banda Z']);
  accepts('BMP-4', ['BMP4', 'bmp 4']);
  rejects('BMP-4', ['bmp2', 'bmp-2', 'BMP', 'shh']);
  rejects('Colágeno tipo II', ['colageno tipo I', 'colageno 3', 'colageno tipo III']);
});

test('ages accept equivalent formatting and written numbers but keep ranges and units', () => {
  accepts('3 semanas', ['tres semanas', '3', 'tercera semana']);
  rejects('3 semanas', ['5 semanas', '3 dias', '13 semanas', 'dos semanas']);
  accepts('21-22 días', ['21 a 22 dias', '21–22 días', 'entre 21 y 22 días', '21-22']);
  rejects('21-22 días', ['20-21 dias', '21 dias', '22 dias', '2122 dias', '21-22 semanas']);
});

test('rejects negatives, multiple guesses, substrings, vague answers and unrelated prose', () => {
  rejects('Osteocito', ['no es osteocito', 'no osteocito', 'osteocito u osteoblasto', 'osteocito y osteoblasto', 'celula', 'oste', 'la imagen muestra un osteocito pero no estoy seguro']);
  rejects('Cartílago hialino', ['cartilago', 'hialino o elastico', 'no cartilago hialino']);
  accepts('Ectodermo no neural', ['ectodermo no neural', 'ectodermo superficial']);
  rejects('Ectodermo no neural', ['ectodermo neural', 'no es ectodermo superficial']);
});

test('supports per-card aliases and reports useful result kinds', () => {
  assert.equal(gradeAnswer('otra forma', { answer: 'Una respuesta', aliases: ['otra forma'] }).match, 'equivalent');
  assert.equal(gradeAnswer('Osteocito', { answer: 'Osteocito' }).match, 'exact');
  assert.equal(gradeAnswer('osteosito', { answer: 'Osteocito' }).match, 'typo');
  assert.equal(gradeAnswer('incorrecta', { answer: 'Osteocito' }).match, 'incorrect');
  assert.equal(gradeAnswer(' ', { answer: 'Osteocito' }).match, 'empty');
  assert.equal(gradeAnswer('---', { answer: 'Osteocito' }).match, 'empty');
  assert.equal(gradeAnswer('algo', {}).correct, false);
});

test('bounds unusually long input before fuzzy comparison', () => {
  const result = gradeAnswer('a'.repeat(10_000), { answer: 'Matriz interterritorial' });
  assert.equal(result.correct, false);
  assert.equal(result.match, 'incorrect');
  assert.match(result.message, /500/);
  rejects('Osteocito', ['osteocito' + ' '.repeat(500)]);
});
