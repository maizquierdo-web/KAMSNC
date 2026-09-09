import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNextBestActionSystemPrompt, INSUFFICIENT_MESSAGE, parseNextBestAction } from '../src/lib/nextBestAction.js';

test('parses a concrete recommendation and limits evidence', () => {
  const result = parseNextBestAction(JSON.stringify({
    status: 'recommendation',
    action: 'Llamar para resolver la objeción económica',
    timeframe: 'Esta semana',
    why: 'La propuesta se envió hace 12 días y no consta contacto posterior.',
    evidence: ['Propuesta enviada', 'Objeción económica', 'Sin contacto posterior', 'Dato sobrante'],
  }));

  assert.equal(result.status, 'recommendation');
  assert.equal(result.action, 'Llamar para resolver la objeción económica');
  assert.equal(result.evidence.length, 3);
});

test('accepts JSON wrapped in a markdown fence', () => {
  const result = parseNextBestAction(`\`\`\`json
{"status":"insufficient","action":"","timeframe":"","why":"otra frase","evidence":[]}
\`\`\``);
  assert.equal(result.status, 'insufficient');
  assert.equal(result.why, INSUFFICIENT_MESSAGE);
});

test('rejects incomplete recommendations', () => {
  assert.throws(
    () => parseNextBestAction('{"status":"recommendation","action":"Hacer seguimiento"}'),
    /recomendación válida/,
  );
});

test('rejects generic recommendations even when they have a rationale', () => {
  assert.throws(
    () => parseNextBestAction('{"status":"recommendation","action":"Hacer seguimiento","why":"Han pasado varios días","evidence":[]}'),
    /demasiado genérica/,
  );
});

test('prompt protects the registered action and business scope', () => {
  const prompt = buildNextBestActionSystemPrompt({ context: 'CANAL DE PRUEBA', benchmarkProfile: 'new_business' });
  assert.match(prompt, /no sustituye ni modifica la siguiente acción registrada/i);
  assert.match(prompt, /No uses datos específicos de CAEs para un canal de Nuevos Negocios/i);
  assert.match(prompt, /CANAL DE PRUEBA/);
});
