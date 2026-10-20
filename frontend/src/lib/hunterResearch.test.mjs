import { test } from 'node:test';
import assert from 'node:assert/strict';
import { researchRequest, parseResearch, researchContext } from './hunterResearch.mjs';
import { hunterSystem } from './hunterCanvas.mjs';

test('research sends only the public company name and no CRM context', () => {
  assert.deepEqual(researchRequest('Empresa Ejemplo'), { mode: 'hunter_research', company_name: 'Empresa Ejemplo', messages: [] });
});

test('web information requires enabled backend, completed output and safe citations', () => {
  assert.throws(() => parseResearch({ content: [] }), /servidor/);
  assert.throws(() => parseResearch({ hunter_web_search_enabled: true, content: [{ type: 'text', text: 'Sin fuentes' }] }), /fuentes/);
  assert.throws(() => parseResearch({ hunter_web_search_enabled: true, stop_reason: 'max_tokens' }), /completado/);
  const research = parseResearch({ hunter_web_search_enabled: true, content: [{ type: 'text', text: 'Actividad publicada en su web.', citations: [{ url: 'javascript:alert(1)' }, { url: 'https://example.com/', title: 'Web oficial' }] }] });
  assert.deepEqual(research.sources, [{ url: 'https://example.com/', title: 'Web oficial' }]);
  assert.match(researchContext(research), /https:\/\/example.com\//);
  assert.match(researchContext(research), /Consultada/);
});

test('one question per turn overrides the original multi-question instructions', () => {
  const prompt = hunterSystem('Contexto');
  assert.match(prompt, /UNA pregunta por turno/);
  assert.match(prompt, /No presentes cuestionarios/);
  assert.match(prompt, /sustituyen las indicaciones incompatibles/);
});
