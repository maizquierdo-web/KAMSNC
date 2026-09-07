import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../components/AuthProvider';
import { formatVolume, getVolumeConfig, VOLUME_UNITS } from '../components/VolumeEditor';
import { ACTIVITY_VISUAL, PIPELINE_CONFIG, PIPELINE_STAGES } from '../lib/crmConstants';
import PeriodSelector, { getPeriodRange } from '../components/PeriodSelector';
import { Loader2, Users, Eye, ChevronRight, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

// Stages que cuentan como "en proceso" (ni lead ni terminales)
const IN_PROCESS_STAGES = ['first_contact', 'proposal', 'negotiation', 'onboarding'];

const RESULT_COLORS = {
  positive: { label: 'Positiva', bg: 'bg-green-50', text: 'text-green-600' },
  neutral:  { label: 'Neutral',  bg: 'bg-amber-50', text: 'text-amber-600' },
  negative: { label: 'Negativa', bg: 'bg-red-50',   text: 'text-red-600'   },
};

const ACTION_ICONS  = { visit: '📍', call: '📞', email: '📧', whatsapp: '💬', meeting: '👥', linkedin: '💼', note: '📝' };
const ACTION_LABELS = { visit: 'Visita', call: 'Llamada', email: 'Email', whatsapp: 'WhatsApp', meeting: 'Reunión', linkedin: 'LinkedIn' };

function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full h-1.5 bg-surface-3 rounded-full overflow-hidden mt-1">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

// ============ KAM DETAIL ============
function KamDetail({ kam, onBack }) {
  const [visits, setVisits] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadDetail(); }, [kam.id]);

  async function loadDetail() {
    setLoading(true);
    const [vRes, cRes] = await Promise.allSettled([
      supabase.from('visits').select('*, channels(name)').eq('kam_id', kam.id).order('checkin_at', { ascending: false }).limit(15),
      supabase.from('channels').select('*').eq('assigned_to', kam.id).order('updated_at', { ascending: false }),
    ]);
    setVisits((vRes.status === 'fulfilled' ? vRes.value.data : []) || []);
    setChannels((cRes.status === 'fulfilled' ? cRes.value.data : []) || []);
    setLoading(false);
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-brand-400" /></div>;

  const pipeCounts = {};
  PIPELINE_STAGES.forEach(s => { pipeCounts[s.key] = 0; });
  channels.forEach(ch => { if (pipeCounts[ch.pipeline_stage] !== undefined) pipeCounts[ch.pipeline_stage]++; });
  const maxPipe = Math.max(...Object.values(pipeCounts), 1);

  const volTotals = {};
  channels.forEach(ch => {
    if (ch.volume_amount != null && ch.volume_unit) {
      if (!volTotals[ch.volume_unit]) volTotals[ch.volume_unit] = 0;
      volTotals[ch.volume_unit] += parseFloat(ch.volume_amount);
    }
  });

  return (
    <div>
      <button onClick={onBack} className="text-sm text-brand-400 font-semibold mb-4">← Volver al equipo</button>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-12 h-12 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center text-lg font-extrabold">
          {kam.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
        </div>
        <div>
          <h2 className="text-lg font-extrabold">{kam.name}</h2>
          <p className="text-xs text-text-secondary">{kam.zone || 'Sin zona'} · {channels.length} canales · {kam.visits || 0} visitas · {kam.totalActions || 0} acciones</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        {/* Pipeline */}
        <div className="bg-surface-1 border border-surface-3 rounded-xl p-4">
          <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">Pipeline</h3>
          <div className="space-y-2">
            {PIPELINE_STAGES.map(stage => {
              const count = pipeCounts[stage.key] || 0;
              return (
                <div key={stage.key} className="flex items-center gap-2.5">
                  <span className="text-[10px] font-semibold w-20 text-right text-text-muted">{stage.label}</span>
                  <div className="flex-1 h-5 bg-surface-0 rounded overflow-hidden">
                    {count > 0 && (
                      <div className="h-full rounded flex items-center justify-end pr-1.5 text-[9px] font-bold text-white"
                        style={{ width: `${(count / maxPipe) * 100}%`, backgroundColor: stage.color, minWidth: 22 }}>
                        {count}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Volumen */}
        <div className="bg-surface-1 border border-surface-3 rounded-xl p-4">
          <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">Volumen</h3>
          {Object.keys(volTotals).length === 0 ? (
            <p className="text-xs text-text-muted text-center py-4">Sin volumen registrado</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(volTotals).map(([unitKey, total]) => {
                const cfg = getVolumeConfig(unitKey);
                return (
                  <div key={unitKey} className="flex items-center gap-3 p-2 rounded-lg" style={{ background: cfg.bg }}>
                    <div className="text-lg font-extrabold" style={{ color: cfg.color }}>{formatVolume(total, unitKey)}</div>
                    <div>
                      <div className="text-[10px] font-semibold" style={{ color: cfg.color }}>{cfg.label}</div>
                      <div className="text-[8px] text-text-muted">{cfg.unit}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Últimas visitas */}
      <div className="bg-surface-1 border border-surface-3 rounded-xl p-4">
        <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">Últimas visitas</h3>
        {visits.length === 0 ? <p className="text-sm text-text-muted text-center py-4">Sin visitas</p> : (
          <div className="space-y-1.5">
            {visits.map(v => {
              const d = new Date(v.checkin_at);
              const rc = v.result ? RESULT_COLORS[v.result] : null;
              return (
                <div key={v.id} className="flex items-center gap-2 p-2 rounded-lg bg-surface-0">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${v.result === 'positive' ? 'bg-green-500' : v.result === 'negative' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{v.channels?.name || 'Canal'}</div>
                    <div className="text-[10px] text-text-muted">
                      {d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · {d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      {v.duration_minutes ? ` · ${v.duration_minutes}min` : ''}
                    </div>
                  </div>
                  {rc && <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${rc.bg} ${rc.text}`}>{rc.label}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============ MAIN DASHBOARD ============
export default function DashboardPage() {
  const { user, profile } = useAuthContext();
  const [loading, setLoading] = useState(true);
  const [teamKams, setTeamKams] = useState([]);
  const [pipelineSummary, setPipelineSummary] = useState({});
  const [volumeTotals, setVolumeTotals] = useState({});
  const [teamAlerts, setTeamAlerts] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [selectedKam, setSelectedKam] = useState(null);
  const [period, setPeriod] = useState('this_month');
  const [range, setRange] = useState(() => getPeriodRange('this_month'));

  useEffect(() => { if (user && range?.from && range?.to) loadDashboard(); }, [user, range]);

  function handlePeriodChange(newPeriod, newRange) {
    setPeriod(newPeriod);
    setRange(newRange);
  }

  async function loadDashboard() {
    setLoading(true);
    try {
      // 1. KAMs
      let { data: directReports } = await supabase
        .from('profiles').select('*')
        .eq('reports_to', user.id).eq('is_active', true);

      let kamProfiles = (directReports || []).filter(k => k.role === 'kam');

      if (profile?.role === 'director' && directReports?.length) {
        const mgrIds = directReports.filter(k => k.role !== 'kam').map(k => k.id);
        if (mgrIds.length) {
          const { data: sub } = await supabase.from('profiles').select('*').in('reports_to', mgrIds).eq('is_active', true);
          kamProfiles = [...kamProfiles, ...(sub || []).filter(k => k.role === 'kam')];
        }
      }

      if (kamProfiles.length === 0) {
        const { data: allKams } = await supabase.from('profiles').select('*').eq('role', 'kam').eq('is_active', true);
        kamProfiles = allKams || [];
      }

      const kamIds = kamProfiles.map(k => k.id);
      if (!kamIds.length) { setTeamKams([]); setLoading(false); return; }

      // 2. Periodo (viene del PeriodSelector)
      const fromISO = range.from.toISOString();
      const toISO = range.to.toISOString();

      // 3. Queries
      const [visitsRes, interRes, channelsRes, alertsRes] = await Promise.allSettled([
        supabase.from('visits').select('kam_id, checkin_at, result, channels(name)').in('kam_id', kamIds).gte('checkin_at', fromISO).lte('checkin_at', toISO).order('checkin_at', { ascending: false }),
        supabase.from('channel_interactions').select('user_id, interaction_type, created_at, is_completed, channels(name), profiles(full_name)').in('user_id', kamIds).gte('created_at', fromISO).lte('created_at', toISO).eq('is_completed', true).order('created_at', { ascending: false }).limit(50),
        supabase.from('channels').select('id, assigned_to, pipeline_stage, volume_amount, volume_unit, created_at').in('assigned_to', kamIds),
        supabase.from('alerts').select('*, channels(name), profiles:user_id(full_name)').in('user_id', kamIds).eq('is_dismissed', false).order('priority').order('created_at', { ascending: false }).limit(10),
      ]);

      const gd = (r) => r.status === 'fulfilled' ? (r.value.data || []) : [];
      const weekVisits       = gd(visitsRes);
      const weekInteractions = gd(interRes);
      const allChannels      = gd(channelsRes);
      const alerts           = gd(alertsRes);

      // 4. Per-KAM stats
      const visitsByKam = {};
      const interByKam  = {};
      weekVisits.forEach(v => { visitsByKam[v.kam_id] = (visitsByKam[v.kam_id] || 0) + 1; });
      weekInteractions.forEach(i => { interByKam[i.user_id] = (interByKam[i.user_id] || []); interByKam[i.user_id].push(i); });

      const enrichedKams = kamProfiles.map(k => {
        const visits   = visitsByKam[k.id] || 0;
        const inters   = interByKam[k.id] || [];
        const calls    = inters.filter(i => i.interaction_type === 'call').length;
        const emails   = inters.filter(i => i.interaction_type === 'email').length;
        const meetings = inters.filter(i => ['meeting', 'whatsapp', 'linkedin'].includes(i.interaction_type)).length;
        const totalActions = visits + inters.length;
        const kamChannels  = allChannels.filter(c => c.assigned_to === k.id);
        const pipeline = kamChannels.filter(c => IN_PROCESS_STAGES.includes(c.pipeline_stage)).length;
        const closed   = kamChannels.filter(c => c.pipeline_stage === 'active').length;
        const score    = visits * 10 + calls * 3 + emails * 2 + meetings * 5 + closed * 20;

        const lastVisit = weekVisits.filter(v => v.kam_id === k.id).sort((a, b) => new Date(b.checkin_at) - new Date(a.checkin_at))[0];
        let lastActive = null;
        if (lastVisit) {
          const diff = Math.floor((Date.now() - new Date(lastVisit.checkin_at).getTime()) / 60000);
          if (diff < 60) lastActive = `Hace ${diff}min`;
          else if (diff < 1440) lastActive = `Hace ${Math.floor(diff / 60)}h`;
          else lastActive = `Hace ${Math.floor(diff / 1440)}d`;
        }

        return { ...k, name: k.full_name, visits, calls, emails, meetings, totalActions, channels: kamChannels.length, pipeline, closed, score, lastActive };
      }).sort((a, b) => b.score - a.score);

      // 5. Pipeline summary (todos los stages)
      const pipeSummary = {};
      PIPELINE_STAGES.forEach(s => { pipeSummary[s.key] = 0; });
      allChannels.forEach(ch => { if (pipeSummary[ch.pipeline_stage] !== undefined) pipeSummary[ch.pipeline_stage]++; });

      // 6. Volume totals
      const volTotals = {};
      allChannels.forEach(ch => {
        if (ch.volume_amount != null && ch.volume_unit) {
          if (!volTotals[ch.volume_unit]) volTotals[ch.volume_unit] = 0;
          volTotals[ch.volume_unit] += parseFloat(ch.volume_amount);
        }
      });

      // 7. Activity feed
      const feed = [
        ...weekVisits.slice(0, 10).map(v => ({
          type: 'visit', kam: kamProfiles.find(k => k.id === v.kam_id)?.full_name || 'KAM',
          action: v.result === 'positive' ? 'Visita positiva' : v.result === 'negative' ? 'Visita negativa' : 'Visita realizada',
          channel: v.channels?.name || 'Canal', time: v.checkin_at, icon: '📍',
          color: v.result === 'positive' ? '#16a34a' : v.result === 'negative' ? '#ef4444' : '#f59e0b',
        })),
        ...weekInteractions.slice(0, 10).map(i => ({
          type: i.interaction_type, kam: i.profiles?.full_name || 'KAM',
          action: `${ACTION_LABELS[i.interaction_type] || i.interaction_type} realizada`,
          channel: i.channels?.name || 'Canal', time: i.created_at,
          icon: ACTION_ICONS[i.interaction_type] || '📋', color: ACTIVITY_VISUAL.color,
        })),
      ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 8).map(a => {
        const diff = Math.floor((Date.now() - new Date(a.time).getTime()) / 60000);
        let timeLabel;
        if (diff < 60) timeLabel = `Hace ${diff}min`;
        else if (diff < 1440) timeLabel = `Hace ${Math.floor(diff / 60)}h`;
        else timeLabel = `Hace ${Math.floor(diff / 1440)}d`;
        return { ...a, timeLabel };
      });

      setTeamKams(enrichedKams);
      setPipelineSummary(pipeSummary);
      setVolumeTotals(volTotals);
      setTeamAlerts(alerts);
      setRecentActivity(feed);
    } catch (err) {
      console.error('Error cargando dashboard:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-brand-400" /></div>;
  if (selectedKam) return <KamDetail kam={selectedKam} onBack={() => setSelectedKam(null)} />;

  const totalVisits   = teamKams.reduce((s, k) => s + k.visits, 0);
  const totalActions  = teamKams.reduce((s, k) => s + k.totalActions, 0);
  const totalPipeline = teamKams.reduce((s, k) => s + k.pipeline, 0);
  const totalClosed   = teamKams.reduce((s, k) => s + k.closed, 0);
  const maxScore = teamKams[0]?.score || 1;
  const maxPipe  = Math.max(...Object.values(pipelineSummary), 1);

  const totalChannels    = Object.values(pipelineSummary).reduce((a, b) => a + b, 0);
  const activeCount      = pipelineSummary['active'] || 0;
  const closedNoDeal     = pipelineSummary['closed_no_deal'] || 0;
  const conversionRate   = totalChannels > 0 ? Math.round((activeCount / totalChannels) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Dashboard</h1>
          <p className="text-sm text-text-secondary">
            {teamKams.length} KAMs
          </p>
        </div>
        <div className="px-3 py-1.5 bg-navy-50 border border-navy-100 rounded-lg">
          <span className="text-[10px] font-bold text-navy-600 uppercase">{profile?.role === 'director' ? 'Director' : 'Manager'}</span>
        </div>
      </div>

      {/* Selector de periodo (mismo componente que RVC) */}
      <PeriodSelector period={period} range={range} onChange={handlePeriodChange} />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { val: totalVisits,   sub: `/ ${teamKams.length * 12}`, label: 'Visitas periodo',   color: '#3b82f6', max: teamKams.length * 12 },
          { val: totalActions,  sub: 'total',                     label: 'Acciones periodo',  color: '#8b5cf6', max: teamKams.length * 20 },
          { val: totalPipeline, sub: 'canales',                   label: 'En pipeline',      color: '#E87A1E', max: totalPipeline + 5 },
          { val: totalClosed,   sub: 'activos',                   label: 'Canales activos',  color: '#16a34a', max: Math.max(totalClosed, 5) },
        ].map((kpi, i) => (
          <div key={i} className="rounded-xl p-3 text-center" style={{ background: `linear-gradient(135deg, ${kpi.color}12, ${kpi.color}06)` }}>
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-2xl font-extrabold" style={{ color: kpi.color }}>{kpi.val}</span>
              <span className="text-[10px] text-text-muted">{kpi.sub}</span>
            </div>
            <div className="text-[8px] text-text-muted uppercase tracking-wider font-semibold mt-0.5">{kpi.label}</div>
            <MiniBar value={kpi.val} max={kpi.max} color={kpi.color} />
          </div>
        ))}
      </div>

      {/* Leaderboard */}
      <div className="bg-surface-1 border border-surface-3 rounded-xl p-4">
        <h2 className="text-sm font-bold mb-3">Rendimiento del equipo</h2>
        {teamKams.length === 0 ? (
          <div className="text-center py-8">
            <Users size={24} className="mx-auto mb-2 text-text-muted" />
            <p className="text-sm text-text-secondary">No se encontraron KAMs</p>
          </div>
        ) : (
          <div className="space-y-2">
            {teamKams.map((kam, i) => {
              const pct = maxScore > 0 ? (kam.score / maxScore) * 100 : 0;
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
              const ratio = kam.visits / 12;
              const avatarColor = ratio >= 0.7 ? '#16a34a' : ratio >= 0.3 ? '#f59e0b' : '#ef4444';

              return (
                <div key={kam.id} className="bg-surface-0 border border-surface-3 rounded-xl p-3 hover:bg-white transition-colors cursor-pointer"
                  onClick={() => setSelectedKam(kam)}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm w-5 text-center">{medal || `${i + 1}`}</span>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                        style={{ background: `${avatarColor}15`, color: avatarColor }}>
                        {kam.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{kam.name}</div>
                      <div className="text-[10px] text-text-muted">{kam.zone || 'Sin zona'}{kam.lastActive ? ` · ${kam.lastActive}` : ''}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-extrabold text-brand-500">{kam.score} pts</div>
                    </div>
                    <ChevronRight size={14} className="text-text-muted flex-shrink-0" />
                  </div>
                  <div className="flex items-center gap-3 ml-16">
                    {[
                      { icon: '📍', val: kam.visits,   label: 'vis'   },
                      { icon: '📞', val: kam.calls,    label: 'llam'  },
                      { icon: '📧', val: kam.emails,   label: 'email' },
                      { icon: '👥', val: kam.meetings, label: 'reun'  },
                    ].map((m, j) => (
                      <div key={j} className="flex items-center gap-0.5">
                        <span className="text-[9px]">{m.icon}</span>
                        <span className="text-[10px] font-bold text-text-secondary">{m.val}</span>
                      </div>
                    ))}
                    <div className="flex-1">
                      <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #E87A1E, #f59e0b)' }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <span className="text-[9px]">🏆</span>
                      <span className="text-[10px] font-bold text-green-600">{kam.closed}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Left column */}
        <div className="space-y-4">
          {/* Pipeline */}
          <div className="bg-surface-1 border border-surface-3 rounded-xl p-4">
            <h2 className="text-sm font-bold mb-3">Pipeline equipo</h2>
            <div className="space-y-1.5">
              {PIPELINE_STAGES.map(stage => {
                const count = pipelineSummary[stage.key] || 0;
                return (
                  <div key={stage.key} className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold w-20 text-right text-text-muted">{stage.label}</span>
                    <div className="flex-1 h-6 bg-surface-0 rounded overflow-hidden">
                      {count > 0 && (
                        <div className="h-full rounded flex items-center justify-end pr-1.5 text-[9px] font-bold text-white transition-all duration-500"
                          style={{ width: `${(count / maxPipe) * 100}%`, backgroundColor: stage.color, minWidth: 24 }}>
                          {count}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-surface-3 flex items-center justify-between">
              <span className="text-[10px] text-text-muted">Conversión Lead→Activo</span>
              <span className="text-sm font-extrabold text-green-600">{conversionRate}%</span>
              {closedNoDeal > 0 && (
                <span className="text-[10px] text-red-400 font-semibold">{closedNoDeal} sin acuerdo</span>
              )}
            </div>
          </div>

          {/* Volume */}
          <div className="bg-surface-1 border border-surface-3 rounded-xl p-4">
            <h2 className="text-sm font-bold mb-2">Volumen en pipeline</h2>
            {Object.keys(volumeTotals).length === 0 ? (
              <p className="text-xs text-text-muted text-center py-4">Sin volumen registrado</p>
            ) : (
              <div className="space-y-2">
                {VOLUME_UNITS.map(u => {
                  const total = volumeTotals[u.key] || 0;
                  if (total === 0) return null;
                  return (
                    <div key={u.key} className="flex items-center gap-3">
                      <div className="w-16 text-right">
                        <div className="text-sm font-extrabold" style={{ color: u.color }}>{formatVolume(total, u.key)}</div>
                        <div className="text-[7px] text-text-muted">{u.unit}</div>
                      </div>
                      <div className="flex-1">
                        <div className="text-[9px] font-semibold text-text-muted mb-0.5">{u.label}</div>
                        <div className="h-2 bg-surface-0 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: '60%', backgroundColor: u.color }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Alerts */}
          <div className="bg-surface-1 border border-surface-3 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold">Alertas equipo</h2>
              {teamAlerts.length > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white">{teamAlerts.length}</span>}
            </div>
            {teamAlerts.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-4">Sin alertas pendientes 🎉</p>
            ) : (
              <div className="space-y-1.5">
                {teamAlerts.slice(0, 5).map(a => (
                  <div key={a.id} className="flex items-start gap-2 p-2 bg-surface-0 rounded-lg">
                    <span className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${a.priority === 'high' ? 'bg-red-500' : a.priority === 'medium' ? 'bg-amber-500' : 'bg-gray-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold text-text-primary">{a.title}</div>
                      <div className="text-[9px] text-text-muted">{a.profiles?.full_name || 'KAM'}</div>
                    </div>
                    {a.due_date && (
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${new Date(a.due_date) <= new Date() ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'}`}>
                        {new Date(a.due_date) <= new Date() ? 'Vencido' : new Date(a.due_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity feed */}
          <div className="bg-surface-1 border border-surface-3 rounded-xl p-4">
            <h2 className="text-sm font-bold mb-2">Actividad reciente</h2>
            {recentActivity.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-4">Sin actividad esta semana</p>
            ) : (
              <div className="space-y-0">
                {recentActivity.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 py-2 border-b border-surface-3 last:border-0">
                    <div className="w-6 h-6 rounded flex items-center justify-center text-xs flex-shrink-0 mt-0.5" style={{ background: a.color + '15' }}>{a.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-text-primary"><span className="font-semibold">{a.kam}</span> · {a.action}</div>
                      <div className="text-[9px] text-text-muted">{a.channel} · {a.timeLabel}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
