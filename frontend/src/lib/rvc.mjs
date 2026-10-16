const PUSH = new Set(['evento', 'congreso', 'webinar', 'linkedin_sales_navigator', 'asociacion_sectorial', 'paginas_empleo']);
const STATUSES = new Set(['pendiente_contacto', 'en_desarrollo', 'en_evaluacion', 'rechazado', 'cierre_sin_acuerdo', 'en_proceso_alta', 'activo']);

export function semesterRange(offset = 0, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'Europe/Madrid', year: 'numeric', month: 'numeric' }).formatToParts(now).map(p => [p.type, p.value]));
  const index = Number(parts.year) * 2 + (Number(parts.month) >= 7 ? 1 : 0) + offset;
  const year = Math.floor(index / 2);
  const half = index % 2;
  const from = new Date(half ? `${year}-07-01T00:00:00+02:00` : `${year}-01-01T00:00:00+01:00`);
  const until = new Date(half ? `${year + 1}-01-01T00:00:00+01:00` : `${year}-07-01T00:00:00+02:00`);
  return { from, until, to: new Date(until.getTime() - 1), label: `${half ? '2º' : '1º'} semestre ${year}` };
}

// Stop only on an empty page: an API cap smaller than pageSize must not truncate data.
export async function fetchAllRows(queryFactory, pageSize = 500) {
  const rows = [];
  for (;;) {
    const { data, error } = await queryFactory().order('id', { ascending: true }).range(rows.length, rows.length + pageSize - 1);
    if (error) throw error;
    if (!data?.length) return rows;
    rows.push(...data);
  }
}

export function visitDecision(visit, history = []) {
  if (visit.is_gps_verified !== true || visit.checkin_lat == null || visit.checkin_lng == null
      || !Number.isFinite(Number(visit.checkin_lat)) || !Number.isFinite(Number(visit.checkin_lng))
      || Math.abs(Number(visit.checkin_lat)) > 90 || Math.abs(Number(visit.checkin_lng)) > 180) return 'no_gps';
  let status = visit.channel_status_at_checkin;
  let inferred = false;
  if (!STATUSES.has(status)) {
    const time = Date.parse(visit.checkin_at);
    const events = history.filter(h => h.channel_id === visit.channel_id && Number.isFinite(Date.parse(h.created_at)))
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || String(a.id).localeCompare(String(b.id)));
    // History is an inference, never presented as an immutable snapshot.
    const before = events.filter(h => Date.parse(h.created_at) <= time).at(-1);
    const after = events.find(h => Date.parse(h.created_at) > time);
    if (before && after && before.to_stage !== after.from_stage) return 'unknown';
    if (before && events.some(h => h.created_at === before.created_at && h.to_stage !== before.to_stage)) return 'unknown';
    const stage = before ? before.to_stage : after?.from_stage;
    const stages = { lead: 'pendiente_contacto', first_contact: 'en_desarrollo', proposal: 'en_desarrollo', negotiation: 'en_desarrollo', onboarding: 'en_proceso_alta', active: 'activo', closed_no_deal: 'cierre_sin_acuerdo' };
    status = stages[stage];
    inferred = true;
  }
  if (!STATUSES.has(status)) return 'unknown';
  if (status === 'activo' || status === 'en_proceso_alta') return inferred ? 'inferred_excluded' : 'excluded';
  return inferred ? 'inferred_eligible' : 'eligible';
}

export function calculateRvc(channels, activeChannels, visits, history, managerId = null) {
  const own = (rows, key) => [...new Map(rows.filter(r => !managerId || r[key] === managerId).map(r => [r.id, r])).values()];
  const leads = own(channels, 'assigned_to').filter(c => Array.isArray(c.lead_source) && c.lead_source.some(s => PUSH.has(s)));
  const converted = leads.filter(c => c.status === 'activo').length;
  const decisions = own(visits, 'kam_id').map(v => visitDecision(v, history));
  return {
    leads: leads.length, converted, successRate: leads.length ? (converted / leads.length * 100).toFixed(1) : '0.0',
    visits: decisions.filter(d => d === 'eligible' || d === 'inferred_eligible').length,
    pending: decisions.filter(d => d === 'unknown').length,
    inferred: decisions.filter(d => d.startsWith('inferred_')).length,
    volumes: own(activeChannels, 'assigned_to').reduce((totals, c) => {
      const amount = Number(c.volume_amount);
      if (c.volume_unit && Number.isFinite(amount)) totals[c.volume_unit] = (totals[c.volume_unit] || 0) + amount;
      return totals;
    }, {}),
  };
}
