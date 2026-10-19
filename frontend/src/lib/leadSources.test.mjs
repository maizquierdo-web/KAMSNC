import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEAD_SOURCE_OPTIONS, normalizeLeadSources, leadOriginGroups, isPushLead } from './leadSources.mjs';

test('Otros with or without free text is PUSH in existing records', () => {
  for (const source of ['otros', 'otros:Prospección propia', 'otros:Reunión: sector', ' OTROS: contacto ']) {
    assert.equal(isPushLead([source]), true);
    assert.deepEqual(leadOriginGroups([source]), ['push']);
  }
  assert.equal(LEAD_SOURCE_OPTIONS.find(o => o.value === 'otros').group, 'push');
});

test('PULL, mixed origins and undefined data retain their classification', () => {
  assert.deepEqual(leadOriginGroups(['canal_naturgy']), ['pull']);
  assert.deepEqual(leadOriginGroups(['otros:Captación', 'canal_naturgy']), ['push', 'pull']);
  for (const sources of [null, [], 'otros', [null, 3], ['desconocido']]) assert.deepEqual(leadOriginGroups(sources), []);
  const sources = ['otros:Captación', 'evento', 'otros'];
  assert.deepEqual(normalizeLeadSources(sources), ['otros', 'evento']);
  assert.deepEqual(sources, ['otros:Captación', 'evento', 'otros']);
});
