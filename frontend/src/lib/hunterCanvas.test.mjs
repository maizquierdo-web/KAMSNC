import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUNTER_BLOCKS, MEETING_BLOCKS, hunterSystem, documentRequest, parseHunterDocument, documentText } from './hunterCanvas.mjs';
import { hunterFileName, createHunterDocx } from './hunterDocx.mjs';

const fixture = headings => ({ summary: 'Oportunidad por cualificar.', sections: headings.map(title => ({ title, items: [{ text: 'Información pendiente de contrastar.', kind: 'gap', source: 'Aportación del KAM; sin fecha' }] })) });

test('both document formats preserve complete structure and evidence labels', () => {
  for (const [kind, headings] of [['canvas', HUNTER_BLOCKS], ['meeting', MEETING_BLOCKS]]) {
    const parsed = parseHunterDocument(JSON.stringify(fixture(headings)), kind);
    assert.equal(parsed.sections.length, headings.length);
    const text = documentText(parsed, 'CUENTA DE PRUEBA', '2026-10-18', kind);
    assert.match(text, /GAP pendiente de confirmar/);
    assert.match(text, /Generado con asistencia de IA/);
    assert.match(text, /Fuente:/);
    assert.ok(!text.includes('THERMABEAD'));
  }
});

test('reject incomplete, unlabelled, reordered, oversized and malformed AI responses', () => {
  const missing = fixture(HUNTER_BLOCKS.slice(1));
  assert.throws(() => parseHunterDocument(JSON.stringify(missing), 'canvas'));
  const unlabelled = fixture(HUNTER_BLOCKS); unlabelled.sections[0].items[0].kind = 'confirmed';
  assert.throws(() => parseHunterDocument(JSON.stringify(unlabelled), 'canvas'));
  const wrong = fixture(HUNTER_BLOCKS); wrong.sections.reverse();
  assert.throws(() => parseHunterDocument(JSON.stringify(wrong), 'canvas'));
  assert.throws(() => parseHunterDocument('not JSON', 'canvas'));
  assert.throws(() => parseHunterDocument('x'.repeat(40001), 'canvas'));
  assert.deepEqual(parseHunterDocument('```json\n' + JSON.stringify(fixture(HUNTER_BLOCKS)) + '\n```', 'canvas'), fixture(HUNTER_BLOCKS));
});

test('prompt distinguishes business lines and never promises financial or automatic actions', () => {
  const prompt = hunterSystem('CANAL CONTEXTO');
  for (const value of ['CAEs', 'mayorista', 'comunidades solares', '[Hipótesis]', '[GAP]', 'no son evidencia primaria', 'no ejecutes acciones automáticamente', 'CANAL CONTEXTO']) assert.ok(prompt.includes(value));
  assert.match(documentRequest('meeting'), /Guion de la reunión/);
});

test('safe Word filenames and a genuine OOXML zip file', async () => {
  assert.equal(hunterFileName('Cuenta / á & ..', '2026-10-18', 'canvas'), 'Hunter_Canvas_Cuenta_a__2026-10-18.docx');
  const blob = await createHunterDocx({ draft: fixture(HUNTER_BLOCKS), name: 'CUENTA DE PRUEBA', date: '2026-10-18', kind: 'canvas' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(String.fromCharCode(...bytes.slice(0, 2)), 'PK');
  assert.ok(bytes.length > 1000);
});
