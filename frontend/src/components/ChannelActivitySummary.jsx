import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  ArrowRightLeft, CalendarDays, Check, ChevronDown, Clock3, Loader2, TrendingUp,
} from 'lucide-react';

const TYPE_LABELS = {
  call: 'Llamar', email: 'Enviar email', whatsapp: 'WhatsApp', meeting: 'Reunión',
  linkedin: 'LinkedIn', other: 'Acción', visit: 'Visita',
};

function formatRelativeDate(value) {
  if (!value) return 'Sin actividad';
  const date = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const compare = new Date(date);
  compare.setHours(0, 0, 0, 0);
  const days = Math.round((today - compare) / 86400000);
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days > 1 && days < 7) return `Hace ${days} días`;
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function formatActionDate(dateValue) {
  if (!dateValue) return 'Sin siguiente acción';
  const date = new Date(`${dateValue}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date - today) / 86400000);
  if (days < 0) return `Vencida · ${date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function latestByDate(items) {
  return items.filter(item => item.date).sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;
}

function nextByDate(items) {
  return items.filter(item => item.date).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
}

export default function ChannelActivitySummary({ channel, refreshKey = 0, onReassigned }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [kams, setKams] = useState([]);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [reassignError, setReassignError] = useState('');

  useEffect(() => {
    supabase.from('profiles').select('id, full_name, zone, role')
      .in('role', ['kam', 'coordinator', 'manager']).eq('is_active', true).order('full_name')
      .then(({ data }) => setKams(data || []));
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSummary() {
      setLoading(true);
      const [visitsRes, interactionsRes, meetingsRes, plannedVisitsRes, profileRes] = await Promise.all([
        supabase.from('visits').select('checkin_at, next_action_date, next_steps')
          .eq('channel_id', channel.id).order('checkin_at', { ascending: false }).limit(50),
        supabase.from('channel_interactions')
          .select('interaction_type, subject, notes, created_at, planned_date, planned_time, is_completed')
          .eq('channel_id', channel.id).order('created_at', { ascending: false }).limit(100),
        supabase.from('channel_meetings').select('meeting_date, created_at')
          .eq('channel_id', channel.id).order('meeting_date', { ascending: false }).limit(50),
        supabase.from('planned_visits').select('planned_date, planned_time, notes, is_completed')
          .eq('channel_id', channel.id).eq('is_completed', false).order('planned_date', { ascending: true }).limit(50),
        supabase.from('profiles').select('full_name, zone').eq('id', channel.assigned_to).maybeSingle(),
      ]);

      if (!active) return;
      const visits = visitsRes.data || [];
      const interactions = interactionsRes.data || [];
      const meetings = meetingsRes.data || [];
      const plannedVisits = plannedVisitsRes.data || [];

      const latestActivity = latestByDate([
        ...visits.map(v => ({ date: v.checkin_at, label: 'Visita' })),
        ...interactions.filter(i => i.is_completed === true || (i.is_completed !== false && !i.planned_date))
          .map(i => ({ date: i.created_at, label: TYPE_LABELS[i.interaction_type] || 'Actividad' })),
        ...meetings.map(m => ({ date: m.meeting_date, label: 'Reunión' })),
      ]);

      const nextAction = nextByDate([
        ...interactions.filter(i => i.planned_date && i.is_completed !== true).map(i => ({
          date: i.planned_date, time: i.planned_time,
          label: TYPE_LABELS[i.interaction_type] || 'Acción', detail: i.subject || i.notes,
        })),
        ...plannedVisits.map(v => ({
          date: v.planned_date, time: v.planned_time, label: 'Visita', detail: v.notes,
        })),
        ...visits.filter(v => v.next_action_date && v.next_steps).map(v => ({
          date: v.next_action_date, label: 'Seguimiento', detail: v.next_steps,
        })),
      ]);

      setSummary({
        latestActivity,
        nextAction,
        responsible: profileRes.data?.full_name || 'Sin asignar',
        responsibleZone: profileRes.data?.zone,
      });
      setLoading(false);
    }

    loadSummary();
    return () => { active = false; };
  }, [channel.id, channel.assigned_to, refreshKey]);

  async function reassign(kam) {
    if (!kam || kam.id === channel.assigned_to) { setReassignOpen(false); return; }
    setReassigning(true);
    setReassignError('');
    try {
      const { data, error } = await supabase.from('channels')
        .update({ assigned_to: kam.id }).eq('id', channel.id)
        .select('id, assigned_to').single();
      if (error) throw error;
      if (!data || data.assigned_to !== kam.id) throw new Error('No se pudo completar la reasignación');
      setSummary(prev => ({ ...prev, responsible: kam.full_name, responsibleZone: kam.zone }));
      setReassignOpen(false);
      onReassigned?.(kam.id, kam);
    } catch (error) {
      console.error('Error reasignando canal:', error);
      setReassignError('No se pudo cambiar el responsable. Inténtalo de nuevo.');
    } finally {
      setReassigning(false);
    }
  }

  if (loading) {
    return (
      <div className="mb-4 flex items-center justify-center rounded-xl border border-surface-3 bg-surface-1 py-6">
        <Loader2 size={18} className="animate-spin text-brand-400" />
      </div>
    );
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const nextActionAlert = summary.nextAction
    && new Date(`${summary.nextAction.date}T00:00:00`) < todayStart;
  const potential = channel.potencial_caes || channel.potencial_energia || 'Sin valorar';
  const potentialStyle = {
    Bajo: 'border-slate-200 bg-slate-50 text-slate-600',
    Medio: 'border-amber-300 bg-amber-50 text-amber-600',
    Alto: 'border-green-300 bg-green-50 text-green-600',
    'Muy Alto': 'border-teal-300 bg-teal-50 text-teal-600',
  }[potential] || 'border-slate-200 bg-slate-50 text-slate-600';

  return (
    <div className="mb-4 grid grid-cols-2 overflow-visible rounded-xl border border-surface-3 bg-white lg:grid-cols-4">
      <div className="flex min-w-0 items-center gap-3 border-b border-r border-surface-3 bg-blue-50/40 p-3.5 lg:border-b-0">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
          <Clock3 size={20} />
        </div>
        <div className="min-w-0">
          <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-text-muted">Última actividad</div>
          <div className="truncate text-sm font-bold text-slate-700">
            {summary.latestActivity
              ? `${formatRelativeDate(summary.latestActivity.date)} · ${summary.latestActivity.label}` : 'Sin actividad'}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-3 border-b border-surface-3 bg-orange-50/40 p-3.5 lg:border-b-0 lg:border-r">
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${nextActionAlert ? 'bg-red-100 text-red-500' : 'bg-orange-100 text-orange-500'}`}>
          <CalendarDays size={20} />
        </div>
        <div className="min-w-0">
          <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-text-muted">Siguiente acción</div>
          <div className={`truncate text-sm font-bold ${nextActionAlert ? 'text-red-500' : 'text-orange-500'}`}>
            {summary.nextAction
              ? `${formatActionDate(summary.nextAction.date)} · ${summary.nextAction.label}` : 'Sin siguiente acción'}
          </div>
          {summary.nextAction?.detail && (
            <div className="mt-1 truncate text-[10px] text-text-muted" title={summary.nextAction.detail}>
              {summary.nextAction.detail}
            </div>
          )}
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-3 border-r border-surface-3 bg-amber-50/40 p-3.5">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-500">
          <TrendingUp size={20} />
        </div>
        <div className="min-w-0">
          <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-text-muted">Potencial</div>
          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${potentialStyle}`}>{potential}</span>
          <div className="mt-1 truncate text-[10px] text-text-muted">
            {channel.potencial_caes && channel.potencial_energia
              ? `CAEs: ${channel.potencial_caes} · Energía: ${channel.potencial_energia}`
              : channel.potencial_caes ? 'CAEs' : channel.potencial_energia ? 'Energía' : 'Pendiente de valorar'}
          </div>
        </div>
      </div>

      <div className="relative flex min-w-0 items-center gap-3 bg-teal-50/40 p-3.5">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-teal-500 text-sm font-bold text-white">
          {summary.responsible?.charAt(0) || '?'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-text-muted">Responsable</div>
          <div className="truncate text-sm font-bold text-text-primary">{summary.responsible}</div>
          {summary.responsibleZone && <div className="mt-0.5 text-[10px] text-text-muted">Zona {summary.responsibleZone}</div>}
        </div>
        <button onClick={() => { setReassignOpen(open => !open); setReassignError(''); }} disabled={reassigning}
            title="Cambiar KAM responsable"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-500 transition-colors hover:bg-blue-100 disabled:opacity-50">
            {reassigning ? <Loader2 size={14} className="animate-spin" />
              : reassignOpen ? <ChevronDown size={14} className="rotate-180" /> : <ArrowRightLeft size={14} />}
        </button>

        {reassignOpen && (
          <div className="absolute right-2 top-[calc(100%+6px)] z-30 max-h-60 w-72 overflow-y-auto rounded-xl border border-surface-3 bg-white p-1.5 shadow-xl">
            <div className="px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-text-muted">Cambiar responsable</div>
            {reassignError && <div className="mx-1 mb-1 rounded-lg bg-red-50 px-2 py-1.5 text-[10px] text-red-600">{reassignError}</div>}
            {kams.map(kam => {
              const current = kam.id === channel.assigned_to;
              return (
                <button key={kam.id} onClick={() => reassign(kam)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${current ? 'bg-teal-50' : 'hover:bg-surface-1'}`}>
                  <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${current ? 'bg-teal-500' : 'bg-blue-600'}`}>
                    {kam.full_name?.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-text-primary">{kam.full_name}</div>
                    <div className="text-[9px] text-text-muted">
                      {kam.role === 'kam' ? 'KAM' : 'Coordinación'} · Zona {kam.zone || '-'}
                    </div>
                  </div>
                  {current && <Check size={13} className="text-teal-500" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
