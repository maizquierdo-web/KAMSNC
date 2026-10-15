import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../components/AuthProvider';
import { VOLUME_UNITS } from '../components/VolumeEditor';
import { semesterRange, fetchAllRows, calculateRvc, visitDecision } from '../lib/rvc.mjs';
import { Loader2, TrendingUp, Target, Building2, Zap, MapPin, Sun, ChevronLeft, ChevronRight } from 'lucide-react';

const EXCLUDED_RVC_USERS = new Set([
  'jf nieto',
  'manager test',
  'maria teruel',
  'oscar cubillo',
  'roberto franza',
]);

function normalizeUserName(name = '') {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

// ============ PÁGINA RVC ============
export default function RvcPage() {
  const { user, profile, isManager } = useAuthContext();
  const [semesterOffset, setSemesterOffset] = useState(0);
  const range = semesterRange(semesterOffset);
  const [selectedUser, setSelectedUser] = useState('all');
  const [availableUsers, setAvailableUsers] = useState([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [channels, setChannels] = useState([]);
  const [allActiveChannels, setAllActiveChannels] = useState([]);
  const [visits, setVisits] = useState([]);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [usersError, setUsersError] = useState('');
  const requestId = useRef(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && range?.from && range?.to && (!isManager || usersLoaded)) loadData();
  }, [user, semesterOffset, selectedUser, isManager, usersLoaded, availableUsers.length]);

  useEffect(() => {
    if (user && isManager) loadAvailableUsers();
    return () => { requestId.current += 1; };
  }, [user, isManager]);

  async function loadAvailableUsers() {
    setUsersLoaded(false);
    setUsersError('');
    try {
      const data = await fetchAllRows(() => supabase.from('profiles').select('id, full_name, role')
        .eq('is_active', true).in('role', ['kam', 'coordinator', 'manager', 'director']));
      setAvailableUsers(data.filter(item => !EXCLUDED_RVC_USERS.has(normalizeUserName(item.full_name)))
        .sort((a, b) => a.full_name.localeCompare(b.full_name, 'es')));
      setUsersLoaded(true);
    } catch (err) {
      setUsersError('No se pudo cargar la lista de gestores. Reintenta la consulta.');
      setLoading(false);
    }
  }

  async function loadData() {
    const request = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const fromISO = range.from.toISOString();
      const untilISO = range.until.toISOString();
      const ids = isManager ? (selectedUser === 'all' ? availableUsers.map(item => item.id) : [selectedUser]) : [user.id];
      if (!ids.length) {
        setChannels([]); setAllActiveChannels([]); setVisits([]); setHistory([]);
        return;
      }
      const scope = (query, key) => query.in(key, ids);

      // 1. Canales creados en el periodo (para KPIs 1, 2, 3)
      const channelsQuery = () => scope(supabase
        .from('channels')
        .select('id, assigned_to, status, volume_amount, volume_unit, lead_source, created_at')
        .gte('created_at', fromISO)
        .lt('created_at', untilISO), 'assigned_to');

      // 2. TODOS los canales activos (para KPI 4, sin filtro de periodo)
      const activeQuery = () => scope(supabase
        .from('channels')
        .select('id, assigned_to, volume_amount, volume_unit')
        .eq('status', 'activo'), 'assigned_to');

      // 3. Visitas en el periodo (para KPI 5)
      const visitsQuery = () => scope(supabase
        .from('visits')
        .select('id, channel_id, kam_id, checkin_at, checkin_lat, checkin_lng, is_gps_verified, channel_status_at_checkin, channels(name)')
        .gte('checkin_at', fromISO)
        .lt('checkin_at', untilISO), 'kam_id');
      const [chData, activeData, vData] = await Promise.all([
        fetchAllRows(channelsQuery), fetchAllRows(activeQuery), fetchAllRows(visitsQuery),
      ]);
      const channelIds = [...new Set(vData.filter(v => !v.channel_status_at_checkin && v.is_gps_verified).map(v => v.channel_id))];
      const allHistory = [];
      for (let start = 0; start < channelIds.length; start += 100) {
        allHistory.push(...await fetchAllRows(() => supabase.from('channel_pipeline_history')
          .select('id, channel_id, from_stage, to_stage, created_at').in('channel_id', channelIds.slice(start, start + 100))));
      }
      if (request !== requestId.current) return;
      setChannels(chData); setAllActiveChannels(activeData); setVisits(vData); setHistory(allHistory);
    } catch (err) {
      console.error('Error cargando datos RVC:', err);
      if (request === requestId.current) setError('No se pudo calcular el RVC completo. Reintenta; si falta channel_status_at_checkin, debe aplicarse la migración del RVC.');
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }

  // ─── Cálculos de KPIs ──────────────────────────────────────────────────────

  const metrics = calculateRvc(channels, allActiveChannels, visits, history);
  const leadsCount = metrics.leads;
  const activeInPeriod = metrics.converted;
  const successRate = metrics.successRate;
  const newActiveCount = metrics.converted;

  // KPI 4: Volúmenes por tipo (de TODOS los canales activos, sin filtro de periodo)
  const volumeByType = VOLUME_UNITS.map(vu => ({
    ...vu,
    total: metrics.volumes[vu.key] || 0,
  }));

  // KPI 5: Número de visitas en el periodo
  const visitsCount = metrics.visits;

  // ─── Render ────────────────────────────────────────────────────────────────

  const kpis = [
    {
      label: 'Leads proactivos identificados',
      value: leadsCount,
      unit: 'canales',
      icon: Target,
      color: '#3b82f6',
      bg: 'rgba(59,130,246,0.1)',
    },
    {
      label: 'Tasa de éxito de leads',
      value: `${successRate}%`,
      unit: leadsCount > 0 ? `${activeInPeriod} de ${leadsCount}` : 'sin datos',
      icon: TrendingUp,
      color: '#22c55e',
      bg: 'rgba(34,197,94,0.1)',
    },
    {
      label: 'Captación nuevas EECC',
      value: newActiveCount,
      unit: 'canales activos',
      icon: Building2,
      color: '#8b5cf6',
      bg: 'rgba(139,92,246,0.1)',
    },
    {
      label: 'Visitas geolocalizadas a potenciales',
      value: visitsCount,
      unit: 'visitas',
      icon: MapPin,
      color: '#06b6d4',
      bg: 'rgba(6,182,212,0.1)',
    },
  ];

  const volIcons = { residencial: Zap, pymes: Building2, caes: Zap, solar: Sun };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-extrabold tracking-tight">RVC</h1>
      </div>

      {/* El RVC se calcula siempre por semestres naturales */}
      <div className="mb-5 bg-surface-1 border border-surface-3 rounded-2xl p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Periodo de cálculo</div>
            <div className="text-sm font-bold text-text-primary mt-0.5">{range.label}</div>
            <div className="text-[10px] text-text-secondary mt-0.5">
              {range.from.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })} — {range.to.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSemesterOffset(value => value - 1)}
              className="w-9 h-9 rounded-lg border border-surface-3 bg-surface-0 hover:bg-surface-2 flex items-center justify-center text-text-secondary"
              title="Semestre anterior"><ChevronLeft size={16} /></button>
            {semesterOffset !== 0 && (
              <button onClick={() => setSemesterOffset(0)}
                className="h-9 px-3 rounded-lg border border-surface-3 bg-surface-0 text-xs font-semibold text-brand-500">Semestre actual</button>
            )}
            <button onClick={() => setSemesterOffset(value => value + 1)} disabled={semesterOffset >= 0}
              className="w-9 h-9 rounded-lg border border-surface-3 bg-surface-0 hover:bg-surface-2 disabled:opacity-35 flex items-center justify-center text-text-secondary"
              title="Semestre siguiente"><ChevronRight size={16} /></button>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-surface-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Datos mostrados</div>
            <div className="text-xs text-text-secondary">
              {isManager ? (selectedUser === 'all' ? 'Todo el equipo' : availableUsers.find(item => item.id === selectedUser)?.full_name || 'Usuario') : profile?.full_name || 'Mis datos'}
            </div>
          </div>
          {isManager && (
            <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}
              className="h-9 px-3 rounded-lg border border-surface-3 bg-surface-0 text-xs font-semibold text-text-primary">
              <option value="all">Todo el equipo</option>
              {availableUsers.map(item => <option key={item.id} value={item.id}>{item.full_name}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      {error || usersError ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {usersError || error}
          <button onClick={() => usersError ? loadAvailableUsers() : loadData()} className="ml-3 font-bold underline">Reintentar</button>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-brand-400" />
        </div>
      ) : (
        <>
        <p className="mb-3 text-xs text-text-secondary">Canales y volumen: responsable actual. Visitas: gestor que hizo el check-in, aunque el cierre sea administrativo. La captación incluye solo leads PUSH creados en el semestre.</p>
        {(metrics.pending > 0 || metrics.inferred > 0) && (
          <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Recuento de visitas provisional: {metrics.inferred} con estado reconstruido del historial y {metrics.pending} sin estado histórico verificable (no incluidas). Requieren revisión antes de validar el RVC.
          </div>
        )}
        {(metrics.pending > 0 || metrics.inferred > 0) && (
          <details className="mb-4 rounded-xl border border-surface-3 bg-surface-1 p-3 text-xs">
            <summary className="cursor-pointer font-semibold">Revisar visitas históricas</summary>
            <ul className="mt-3 space-y-2">{visits.map(visit => ({ visit, decision: visitDecision(visit, history) }))
              .filter(({ decision }) => decision === 'unknown' || decision.startsWith('inferred_'))
              .map(({ visit, decision }) => <li key={visit.id}>
                <Link to={`/channels?detail=${visit.channel_id}`} className="font-semibold underline">{visit.channels?.name || 'Abrir canal'}</Link>
                {' · '}{availableUsers.find(p => p.id === visit.kam_id)?.full_name || profile?.full_name || 'Gestor'}
                {' · '}{new Date(visit.checkin_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}
                {' · '}{decision === 'unknown' ? 'Sin estado histórico: no incluida' : decision === 'inferred_eligible' ? 'Incluida según historial; pendiente de validar' : 'Excluida según historial; pendiente de validar'}
              </li>)}</ul>
          </details>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map((kpi, i) => {
            const Icon = kpi.icon;
            return (
              <div key={i} className="bg-surface-1 border border-surface-3 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: kpi.bg }}>
                    <Icon size={16} style={{ color: kpi.color }} />
                  </div>
                  <span className="text-[11px] font-semibold text-text-secondary leading-tight">{kpi.label}</span>
                </div>
                <div className="text-2xl font-extrabold tracking-tight text-text-primary">{kpi.value}</div>
                <div className="text-[10px] text-text-muted mt-0.5">{kpi.unit}</div>
              </div>
            );
          })}
        </div>

        {isManager && selectedUser === 'all' && (
          <div className="mt-5 overflow-x-auto rounded-xl border border-surface-3 bg-surface-1">
            <table className="w-full text-left text-xs">
              <caption className="p-3 text-left font-bold">Desglose por gestor · volumen total activo</caption>
              <thead><tr className="border-b border-surface-3"><th className="p-3">Gestor</th><th className="p-3">Leads PUSH</th><th className="p-3">Éxito</th><th className="p-3">Captación</th><th className="p-3">Visitas</th><th className="p-3">Pendientes de revisar</th>{VOLUME_UNITS.map(v => <th key={v.key} className="p-3">{v.label} ({v.unit})</th>)}</tr></thead>
              <tbody>{availableUsers.map(manager => {
                const row = calculateRvc(channels, allActiveChannels, visits, history, manager.id);
                return <tr key={manager.id} className="border-b border-surface-3"><td className="p-3 font-semibold">{manager.full_name}</td><td className="p-3">{row.leads}</td><td className="p-3">{row.successRate}%</td><td className="p-3">{row.converted}</td><td className="p-3">{row.visits}</td><td className="p-3">{row.pending + row.inferred}</td>{VOLUME_UNITS.map(v => <td key={v.key} className="p-3">{(row.volumes[v.key] || 0).toFixed(1)}</td>)}</tr>;
              })}</tbody>
            </table>
          </div>
        )}

        {/* Volumen negociado desglosado por tipo (total canales activos, sin filtro de periodo) */}
        <div className="mt-5">
          <h2 className="text-sm font-bold text-text-primary mb-3">Volumen negociado (total canales activos)</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {volumeByType.map(v => {
              const Icon = volIcons[v.key] || Zap;
              const display = v.key === 'residencial' && v.total >= 1000
                ? `${(v.total / 1000).toFixed(1)}K`
                : v.total.toFixed(1);
              return (
                <div key={v.key} className="bg-surface-1 border border-surface-3 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: v.bg }}>
                      <Icon size={16} style={{ color: v.color }} />
                    </div>
                    <span className="text-[11px] font-semibold text-text-secondary">{v.label}</span>
                  </div>
                  <div className="text-2xl font-extrabold tracking-tight" style={{ color: v.color }}>{display}</div>
                  <div className="text-[10px] text-text-muted mt-0.5">{v.unit}</div>
                </div>
              );
            })}
          </div>
        </div>
        </>
      )}
    </div>
  );
}
