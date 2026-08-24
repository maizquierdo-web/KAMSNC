import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from './AuthProvider';
import {
  ArrowRightLeft, CalendarDays, Check, ChevronDown, Clock3, Loader2, Save, TrendingUp, X,
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

function sourceFromTable(sourceTable) {
  if (sourceTable === 'planned_visits') return 'planned_visit';
  if (sourceTable === 'visit_followup') return 'visit_followup';
  return 'interaction';
}

export default function ChannelActivitySummary({ channel, refreshKey = 0, onReassigned, onActivityChange }) {
  const { user } = useAuthContext();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [kams, setKams] = useState([]);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [reassignError, setReassignError] = useState('');
  const [actionOpen, setActionOpen] = useState(false);
  const [actionForm, setActionForm] = useState({ type: 'call', date: '', time: '09:00', detail: '' });
  const [savingAction, setSavingAction] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    supabase.from('profiles').select('id, full_name, zone, role')
      .in('role', ['kam', 'coordinator', 'manager']).eq('is_active', true).order('full_name')
      .then(({ data }) => setKams(data || []));
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSummary() {
      setLoading(true);
      const [activityRes, meetingsRes, profileRes] = await Promise.all([
        supabase.from('channel_activity_feed').select('*')
          .eq('channel_id', channel.id).limit(200),
        supabase.from('channel_meetings').select('meeting_date, created_at')
          .eq('channel_id', channel.id).order('meeting_date', { ascending: false }).limit(50),
        supabase.from('profiles').select('full_name, zone').eq('id', channel.assigned_to).maybeSingle(),
      ]);

      if (!active) return;
      if (activityRes.error) throw activityRes.error;
      const activity = activityRes.data || [];
      const meetings = meetingsRes.data || [];

      const completed = activity
        .filter(item => item.occurred_at)
        .map(item => ({ date: item.occurred_at, label: TYPE_LABELS[item.activity_type] || 'Actividad' }));
      const meetingActivity = meetings
        .map(item => ({ date: item.meeting_date || item.created_at, label: 'Reunión' }))
        .filter(item => item.date);
      const latestActivity = [...completed, ...meetingActivity]
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;

      const nextItem = activity
        .filter(item => item.scheduled_date && ['planned', 'overdue'].includes(item.status))
        .sort((a, b) => `${a.scheduled_date}T${a.scheduled_time || '23:59'}`.localeCompare(`${b.scheduled_date}T${b.scheduled_time || '23:59'}`))[0];
      const nextAction = nextItem ? {
        id: nextItem.source_id,
        source: sourceFromTable(nextItem.source_table),
        type: nextItem.activity_type,
        date: nextItem.scheduled_date,
        time: nextItem.scheduled_time,
        label: TYPE_LABELS[nextItem.activity_type] || 'Acción',
        detail: nextItem.subject || nextItem.notes,
      } : null;

      setSummary({
        latestActivity,
        nextAction,
        responsible: profileRes.data?.full_name || 'Sin asignar',
        responsibleZone: profileRes.data?.zone,
      });
      setLoading(false);
    }

    loadSummary().catch((error) => {
      console.error('No se pudo cargar el resumen de actividad:', error);
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [channel.id, channel.assigned_to, refreshKey]);

  async function reassign(kam) {
    if (!kam || kam.id === channel.assigned_to) { setReassignOpen(false); return; }
    setReassigning(true);
    setReassignError('');
    try {
      const { data, error } = await supabase.rpc('reassign_channel_open', {
        target_channel_id: channel.id,
        target_assignee_id: kam.id,
      });
      if (error) throw error;
      if (data !== channel.id) throw new Error('No se pudo completar la reasignación');
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

  function openActionEditor() {
    const action = summary.nextAction;
    setActionForm({
      type: action?.type || 'call',
      date: action?.date || '',
      time: action?.time?.slice?.(0, 5) || '09:00',
      detail: action?.detail || '',
    });
    setActionError('');
    setActionOpen(true);
  }

  async function saveNextAction() {
    if (!actionForm.date) { setActionError('Indica una fecha.'); return; }
    setSavingAction(true);
    setActionError('');
    try {
      const current = summary.nextAction;
      let error;
      if (current?.source === 'interaction') {
        ({ error } = await supabase.from('channel_interactions').update({
          interaction_type: actionForm.type,
          planned_date: actionForm.date,
          planned_time: actionForm.time ? `${actionForm.time}:00` : null,
          notes: actionForm.detail || null,
        }).eq('id', current.id));
      } else if (current?.source === 'planned_visit') {
        ({ error } = await supabase.from('planned_visits').update({
          planned_date: actionForm.date,
          planned_time: actionForm.time ? `${actionForm.time}:00` : null,
          notes: actionForm.detail || null,
        }).eq('id', current.id));
      } else if (current?.source === 'visit_followup') {
        ({ error } = await supabase.from('visits').update({
          next_action_date: actionForm.date,
          next_steps: actionForm.detail || 'Seguimiento',
        }).eq('id', current.id));
      } else {
        ({ error } = await supabase.from('channel_interactions').insert({
          channel_id: channel.id,
          user_id: user.id,
          interaction_type: actionForm.type,
          direction: 'outbound',
          planned_date: actionForm.date,
          planned_time: actionForm.time ? `${actionForm.time}:00` : null,
          notes: actionForm.detail || null,
          is_completed: false,
        }));
      }
      if (error) throw error;
      setActionOpen(false);
      onActivityChange?.();
    } catch (error) {
      console.error('Error guardando la siguiente acción:', error);
      setActionError('No se pudo guardar la acción. Inténtalo de nuevo.');
    } finally {
      setSavingAction(false);
    }
  }

  async function completeNextAction() {
    const current = summary.nextAction;
    if (!current) return;
    setSavingAction(true);
    setActionError('');
    try {
      let error;
      if (current.source === 'interaction') {
        ({ error } = await supabase.from('channel_interactions').update({ is_completed: true }).eq('id', current.id));
      } else if (current.source === 'planned_visit') {
        ({ error } = await supabase.from('planned_visits').update({ is_completed: true }).eq('id', current.id));
      } else {
        ({ error } = await supabase.from('visits').update({ next_action_date: null, next_steps: null }).eq('id', current.id));
      }
      if (error) throw error;
      setActionOpen(false);
      onActivityChange?.();
    } catch (error) {
      console.error('Error completando la siguiente acción:', error);
      setActionError('No se pudo completar la acción.');
    } finally {
      setSavingAction(false);
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
  const noActivity = !summary.latestActivity;
  const potential = channel.potencial_caes || channel.potencial_energia || 'Sin valorar';
  const potentialStyle = {
    Bajo: 'border-slate-200 bg-slate-50 text-slate-600',
    Medio: 'border-amber-300 bg-amber-50 text-amber-600',
    Alto: 'border-green-300 bg-green-50 text-green-600',
    'Muy Alto': 'border-teal-300 bg-teal-50 text-teal-600',
  }[potential] || 'border-slate-200 bg-slate-50 text-slate-600';

  return (
    <div className="mb-4 grid grid-cols-2 overflow-visible rounded-xl border border-surface-3 bg-white lg:grid-cols-4">
      <div className={`flex min-w-0 items-center gap-3 border-b border-r border-surface-3 p-3.5 lg:border-b-0 ${noActivity ? 'bg-amber-50/50' : 'bg-blue-50/40'}`}>
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${noActivity ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
          <Clock3 size={20} />
        </div>
        <div className="min-w-0">
          <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-text-muted">Última actividad</div>
          <div className={`truncate text-sm font-bold ${noActivity ? 'text-amber-700' : 'text-slate-700'}`}>
            {summary.latestActivity
              ? `${formatRelativeDate(summary.latestActivity.date)} · ${summary.latestActivity.label}` : 'Sin actividad'}
          </div>
        </div>
      </div>

      <div onClick={openActionEditor} role="button" tabIndex={0}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') openActionEditor(); }}
        className="relative flex min-w-0 cursor-pointer items-center gap-3 border-b border-surface-3 bg-orange-50/40 p-3.5 transition-colors hover:bg-orange-50 lg:border-b-0 lg:border-r">
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
        <ChevronDown size={14} className={`ml-auto flex-shrink-0 text-orange-400 transition-transform ${actionOpen ? 'rotate-180' : ''}`} />

        {actionOpen && (
          <div onClick={(event) => event.stopPropagation()}
            className="absolute left-2 right-2 top-[calc(100%+6px)] z-40 rounded-xl border border-surface-3 bg-white p-3 shadow-xl lg:left-3 lg:right-auto lg:w-80">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-text-primary">Siguiente acción</div>
                <div className="text-[9px] text-text-muted">Actualiza la tarea principal del canal</div>
              </div>
              <button onClick={() => setActionOpen(false)} className="p-1 text-text-muted hover:text-text-primary"><X size={14} /></button>
            </div>
            {actionError && <div className="mb-2 rounded-lg bg-red-50 px-2 py-1.5 text-[10px] text-red-600">{actionError}</div>}
            <div className="space-y-2">
              <select value={actionForm.type} disabled={summary.nextAction?.source && summary.nextAction.source !== 'interaction'}
                onChange={(event) => setActionForm(form => ({ ...form, type: event.target.value }))}
                className="w-full rounded-lg border border-surface-3 bg-white px-2.5 py-2 text-xs focus:border-brand-500 focus:outline-none disabled:bg-surface-1">
                {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={actionForm.date} onChange={(event) => setActionForm(form => ({ ...form, date: event.target.value }))}
                  className="rounded-lg border border-surface-3 px-2.5 py-2 text-xs focus:border-brand-500 focus:outline-none" />
                <input type="time" value={actionForm.time} disabled={summary.nextAction?.source === 'visit_followup'}
                  onChange={(event) => setActionForm(form => ({ ...form, time: event.target.value }))}
                  className="rounded-lg border border-surface-3 px-2.5 py-2 text-xs focus:border-brand-500 focus:outline-none disabled:bg-surface-1" />
              </div>
              <input type="text" value={actionForm.detail} onChange={(event) => setActionForm(form => ({ ...form, detail: event.target.value }))}
                placeholder="Objetivo o detalle" className="w-full rounded-lg border border-surface-3 px-2.5 py-2 text-xs focus:border-brand-500 focus:outline-none" />
              <div className="flex gap-2">
                {summary.nextAction && (
                  <button onClick={completeNextAction} disabled={savingAction}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-green-50 py-2 text-[10px] font-bold text-green-600 hover:bg-green-100 disabled:opacity-50">
                    <Check size={12} /> Marcar realizada
                  </button>
                )}
                <button onClick={saveNextAction} disabled={savingAction}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-brand-500 py-2 text-[10px] font-bold text-white hover:bg-brand-600 disabled:opacity-50">
                  {savingAction ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Guardar
                </button>
              </div>
            </div>
          </div>
        )}
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
