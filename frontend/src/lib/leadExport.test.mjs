import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLeadSummary, summarizeLeadHistory } from './leadExport.mjs';

test('lead history counts only forward movements as advances', () => {
  const result = summarizeLeadHistory(
    { pipeline_stage: 'proposal', pipeline_stage_changed_at: '2026-10-04T10:00:00Z' },
    [
      { from_stage: 'lead', to_stage: 'first_contact', created_at: '2026-10-01T10:00:00Z' },
      { from_stage: 'first_contact', to_stage: 'proposal', created_at: '2026-10-02T10:00:00Z' },
      { from_stage: 'proposal', to_stage: 'first_contact', created_at: '2026-10-03T10:00:00Z' },
      { from_stage: 'first_contact', to_stage: 'proposal', created_at: '2026-10-04T10:00:00Z' },
    ],
  );

  assert.equal(result.initialStage, 'lead');
  assert.equal(result.highestStage, 'proposal');
  assert.equal(result.changeCount, 4);
  assert.equal(result.advancementCount, 3);
  assert.equal(result.hasAdvanced, true);
  assert.equal(result.firstAdvanceAt, '2026-10-01T10:00:00Z');
});

test('missing history is reported as unverified instead of inventing an advance', () => {
  const result = summarizeLeadHistory({ pipeline_stage: 'active', pipeline_stage_changed_at: '2026-10-05T10:00:00Z' });

  assert.equal(result.historyAvailable, false);
  assert.equal(result.hasAdvanced, false);
  assert.equal(result.advancementCount, 0);
  assert.equal(result.highestStage, 'active');
  assert.equal(result.lastStageChangeAt, '2026-10-05T10:00:00Z');
});

test('summary separates verified advances, conversions and closures', () => {
  const rows = [
    { pipeline_stage: 'active', status: 'activo', _leadHistory: { hasAdvanced: true, historyAvailable: true } },
    { pipeline_stage: 'onboarding', status: 'en_proceso_alta', _leadHistory: { hasAdvanced: true, historyAvailable: true } },
    { pipeline_stage: 'lead', status: 'pendiente_contacto', _leadHistory: { hasAdvanced: false } },
    { pipeline_stage: 'closed_no_deal', status: 'cierre_sin_acuerdo', _leadHistory: { hasAdvanced: false } },
  ];

  assert.deepEqual(buildLeadSummary(rows), {
    total: 4,
    advanced: 2,
    withoutVerifiedAdvance: 2,
    withHistoryNoAdvance: 0,
    withoutHistory: 2,
    onboardingOrActive: 2,
    active: 1,
    closed: 1,
  });
});
