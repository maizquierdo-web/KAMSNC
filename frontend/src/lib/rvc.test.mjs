import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRvc, fetchAllRows, semesterRange, visitDecision } from './rvc.mjs';

const visit = { id: 'v1', channel_id: 'c1', kam_id: 'judith', checkin_at: '2026-07-10T12:00:00Z', is_gps_verified: true, checkin_lat: 0, checkin_lng: 0, channel_status_at_checkin: 'en_desarrollo' };

test('snapshot counts potential visits despite later activation or administrative close', () => {
  assert.equal(visitDecision({ ...visit, administrative_closed_by: 'coordinator', checkout_at: null }, [{ channel_id: 'c1', created_at: '2026-08-01', to_stage: 'active' }]), 'eligible');
  assert.equal(calculateRvc([], [], [visit, visit], [], 'judith').visits, 1);
  assert.equal(calculateRvc([], [], [visit], [], 'coordinator').visits, 0);
});

test('only eligible statuses and actual verified GPS coordinates count', () => {
  for (const status of ['activo', 'en_proceso_alta']) assert.equal(visitDecision({ ...visit, channel_status_at_checkin: status }), 'excluded');
  for (const status of ['rechazado', 'cierre_sin_acuerdo', 'pendiente_contacto']) assert.equal(visitDecision({ ...visit, channel_status_at_checkin: status }), 'eligible');
  for (const change of [{ is_gps_verified: false }, { checkin_lat: null }, { checkin_lng: 181 }]) assert.equal(visitDecision({ ...visit, ...change }), 'no_gps');
});

test('history reconstruction is explicit; missing historical state never uses current state', () => {
  const old = { ...visit, channel_status_at_checkin: null };
  assert.equal(visitDecision(old), 'unknown');
  assert.equal(visitDecision(old, [{ id: 'h1', channel_id: 'c1', created_at: '2026-08-01', from_stage: 'negotiation', to_stage: 'active' }]), 'inferred_eligible');
  assert.equal(visitDecision(old, [{ id: 'h1', channel_id: 'c1', created_at: '2026-07-10T12:00:00Z', to_stage: 'active' }]), 'inferred_excluded');
  assert.equal(visitDecision(old, [{ id: 'h1', channel_id: 'c1', created_at: '2026-07-01', to_stage: 'lead' }, { id: 'h2', channel_id: 'c1', created_at: '2026-08-01', from_stage: 'onboarding', to_stage: 'active' }]), 'unknown');
});

test('each gestor receives their own leads, conversions, visits and active volumes', () => {
  const channels = [{ id: 1, assigned_to: 'judith', lead_source: ['evento', 'congreso'], status: 'activo' }, { id: 2, assigned_to: 'egoitz', lead_source: ['webinar'], status: 'en_desarrollo' }, { id: 3, assigned_to: 'judith', lead_source: ['canal_naturgy'], status: 'activo' }];
  const active = [{ id: 1, assigned_to: 'judith', volume_amount: '2.5', volume_unit: 'caes' }, { id: 3, assigned_to: 'judith', volume_amount: 100, volume_unit: 'solar' }];
  const own = calculateRvc(channels, active, [visit], [], 'judith');
  assert.equal(own.leads, 1); assert.equal(own.converted, 1); assert.equal(own.successRate, '100.0'); assert.equal(own.volumes.caes, 2.5);
  const team = calculateRvc(channels, active, [visit], []);
  assert.equal(team.leads, 2); assert.equal(team.successRate, '50.0');
  assert.equal(calculateRvc(channels, active, [visit], [], 'egoitz').visits, 0);
  assert.equal(calculateRvc([], [], [], []).successRate, '0.0');
});

test('semester boundaries use Madrid even when the browser is elsewhere', () => {
  const r = semesterRange(0, new Date('2026-06-30T22:00:00Z'));
  assert.equal(r.label, '2º semestre 2026'); assert.equal(r.from.toISOString(), '2026-06-30T22:00:00.000Z');
  assert.equal(r.until.toISOString(), '2026-12-31T23:00:00.000Z');
  assert.equal(semesterRange(-1, r.from).from.toISOString(), '2025-12-31T23:00:00.000Z');
});

test('Otros counts once per gestor for leads and active conversions, including stored descriptions', () => {
  const channels = [
    { id: 'a', assigned_to: 'judith', lead_source: ['otros:Prospección propia'], status: 'activo' },
    { id: 'b', assigned_to: 'judith', lead_source: ['otros', 'evento'], status: 'en_desarrollo' },
    { id: 'c', assigned_to: 'egoitz', lead_source: ['otros:Captación'], status: 'activo' },
    { id: 'd', assigned_to: 'judith', lead_source: ['canal_naturgy'], status: 'activo' },
    { id: 'e', assigned_to: 'judith', lead_source: null, status: 'activo' },
  ];
  const judith = calculateRvc([...channels, channels[0]], [], [], [], 'judith');
  assert.equal(judith.leads, 2);
  assert.equal(judith.converted, 1);
  assert.equal(judith.successRate, '50.0');
  const egoitz = calculateRvc(channels, [], [], [], 'egoitz');
  assert.equal(egoitz.leads, 1);
  assert.equal(egoitz.converted, 1);
  const team = calculateRvc(channels, [], [], []);
  assert.equal(team.leads, 3);
  assert.equal(team.converted, 2);
  assert.equal(team.successRate, '66.7');
});

test('pagination handles an API cap smaller than requested page and propagates errors', async () => {
  const all = Array.from({ length: 7 }, (_, id) => ({ id }));
  const factory = () => ({ order() { return this; }, async range(start) { return { data: all.slice(start, start + 2), error: null }; } });
  assert.deepEqual(await fetchAllRows(factory, 5), all);
  await assert.rejects(fetchAllRows(() => ({ order() { return this; }, range() { return { data: null, error: new Error('denied') }; } })), /denied/);
});
