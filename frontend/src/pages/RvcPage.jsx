import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../components/AuthProvider';
import { VOLUME_UNITS, formatVolume } from '../components/VolumeEditor';
import { Loader2, TrendingUp, Target, Building2, Zap, MapPin, Sun, ChevronLeft, ChevronRight } from 'lucide-react';

function getSemesterRange(offset = 0) {
  const now = new Date();
  const currentIndex = now.getFullYear() * 2 + (now.getMonth() >= 6 ? 1 : 0);
  const targetIndex = currentIndex + offset;
  const year = Math.floor(targetIndex / 2);
  const half = targetIndex % 2;
  const startMonth = half * 6;
  return {
    from: new Date(year, startMonth, 1, 0, 0, 0, 0),
    to: new Date(year, startMonth + 6, 0, 23, 59, 59, 999),
    label: `${half === 0 ? '1º' : '2º'} semestre ${year}`,
  };
}

// ============ PÁGINA RVC ============
export default function RvcPage() {
  const { user, profile, isManager } = useAuthContext();
  const [semesterOffset, setSemesterOffset] = useState(0);
  const range = getSemesterRange(semesterOffset);
  const [selectedUser, setSelectedUser] = useState('all');
  const [availableUsers, setAvailableUsers] = useState([]);
  const [channels, setChannels] = useState([]);
  const [allActiveChannels, setAllActiveChannels] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && range?.from && range?.to) loadData();
  }, [user, semesterOffset, selectedUser]);

  useEffect(() => {
    if (user && isManager) loadAvailableUsers();
  }, [user, isManager]);

  async function loadAvailableUsers() {
    const { data } = await supabase.from('profiles').select('id, full_name, role')
      .eq('is_active', true).in('role', ['kam', 'coordinator', 'manager', 'director']).order('full_name');
    setAvailableUsers(data || []);
  }

  async function loadData() {
    setLoading(true);
    try {
      const fromISO = range.from.toISOString();
      const toISO = range.to.toISOString();

      // 1. Canales creados en el periodo (para KPIs 1, 2, 3)
      let chQuery = supabase
        .from('channels')
        .select('id, status, volume_amount, volume_unit, lead_source, created_at')
        .gte('created_at', fromISO)
        .lte('created_at', toISO);
      if (!isManager) chQuery = chQuery.eq('assigned_to', user.id);
      else if (selectedUser !== 'all') chQuery = chQuery.eq('assigned_to', selectedUser);
      const { data: chData } = await chQuery;
      setChannels(chData || []);

      // 2. TODOS los canales activos (para KPI 4, sin filtro de periodo)
      let activeQuery = supabase
        .from('channels')
        .select('id, volume_amount, volume_unit')
        .eq('status', 'activo');
      if (!isManager) activeQuery = activeQuery.eq('assigned_to', user.id);
      else if (selectedUser !== 'all') activeQuery = activeQuery.eq('assigned_to', selectedUser);
      const { data: activeData } = await activeQuery;
      setAllActiveChannels(activeData || []);

      // 3. Visitas en el periodo (para KPI 5)
      let vQuery = supabase
        .from('visits')
        .select('id, checkin_at')
        .gte('checkin_at', fromISO)
        .lte('checkin_at', toISO);
      if (!isManager) vQuery = vQuery.eq('kam_id', user.id);
      else if (selectedUser !== 'all') vQuery = vQuery.eq('kam_id', selectedUser);
      const { data: vData } = await vQuery;
      setVisits(vData || []);
    } catch (err) {
      console.error('Error cargando datos RVC:', err);
    } finally {
      setLoading(false);
    }
  }

  // ─── Cálculos de KPIs ──────────────────────────────────────────────────────

  // Lead sources de tipo PUSH (los KPIs 1 y 2 solo cuentan estos)
  const PUSH_SOURCES = ['evento', 'congreso', 'webinar', 'linkedin_sales_navigator', 'asociacion_sectorial', 'paginas_empleo'];
  const isPush = (ch) => Array.isArray(ch.lead_source) && ch.lead_source.some(s => PUSH_SOURCES.includes(s));

  // KPI 1: Nº de leads proactivos identificados (solo canales PUSH creados en el periodo)
  const pushChannels = channels.filter(isPush);
  const leadsCount = pushChannels.length;

  // KPI 2: Tasa de éxito (canales PUSH activos / total canales PUSH creados en el periodo)
  const activeInPeriod = pushChannels.filter(c => c.status === 'activo').length;
  const successRate = leadsCount > 0 ? ((activeInPeriod / leadsCount) * 100).toFixed(1) : '0.0';

  // KPI 3: Captación nuevas EECC (canales creados en el periodo con status activo)
  const newActiveCount = activeInPeriod;

  // KPI 4: Volúmenes por tipo (de TODOS los canales activos, sin filtro de periodo)
  const volumeByType = VOLUME_UNITS.map(vu => ({
    ...vu,
    total: allActiveChannels
      .filter(c => c.volume_unit === vu.key)
      .reduce((sum, c) => sum + (parseFloat(c.volume_amount) || 0), 0),
  }));

  // KPI 5: Número de visitas en el periodo
  const visitsCount = visits.length;

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
      label: 'Visitas realizadas',
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
              {range.from.toLocaleDateString('es-ES')} — {range.to.toLocaleDateString('es-ES')}
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
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-brand-400" />
        </div>
      ) : (
        <>
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
