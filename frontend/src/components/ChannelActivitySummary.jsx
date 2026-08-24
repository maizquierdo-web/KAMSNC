import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2 } from 'lucide-react';

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

export default function ChannelActivitySummary({ channel, refreshKey = 0 }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

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
        supabase.from('profiles').select('full_name').eq('id', channel.assigned_to).maybeSingle(),
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

      setSummary({ latestActivity, nextAction, responsible: profileRes.data?.full_name || 'Sin asignar' });
      setLoading(false);
    }

    loadSummary();
    return () => { active = false; };
  }, [channel.id, channel.assigned_to, refreshKey]);

  if (loading) {
    return (
      <div className="mb-4 flex items-center justify-center rounded-xl border border-surface-3 bg-surface-1 py-6">
        <Loader2 size={18} className="animate-spin text-brand-400" />
      </div>
    );
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const cards = [
    {
      label: 'Última actividad',
      value: summary.latestActivity
        ? `${formatRelativeDate(summary.latestActivity.date)} · ${summary.latestActivity.label}` : 'Sin actividad',
    },
    {
      label: 'Siguiente acción',
      value: summary.nextAction
        ? `${formatActionDate(summary.nextAction.date)} · ${summary.nextAction.label}` : 'Sin siguiente acción',
      detail: summary.nextAction?.detail,
      alert: summary.nextAction && new Date(`${summary.nextAction.date}T00:00:00`) < todayStart,
    },
    {
      label: 'Potencial',
      value: channel.potencial_caes || channel.potencial_energia || 'Sin valorar',
      detail: channel.potencial_caes && channel.potencial_energia
        ? `CAEs: ${channel.potencial_caes} · Energía: ${channel.potencial_energia}`
        : channel.potencial_caes ? 'CAEs' : channel.potencial_energia ? 'Energía' : null,
    },
    { label: 'Responsable', value: summary.responsible },
  ];

  return (
    <div className="mb-4 grid grid-cols-2 overflow-hidden rounded-xl border border-surface-3 bg-surface-1 lg:grid-cols-4">
      {cards.map((card, index) => (
        <div key={card.label}
          className={`min-w-0 p-3.5 ${index % 2 === 0 ? 'border-r border-surface-3' : ''} ${index < 2 ? 'border-b border-surface-3 lg:border-b-0' : ''} ${index > 0 ? 'lg:border-l lg:border-surface-3' : ''} lg:border-r-0`}>
          <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-text-muted">{card.label}</div>
          <div className={`truncate text-xs font-bold ${card.alert ? 'text-red-500' : 'text-text-primary'}`}>{card.value}</div>
          {card.detail && <div className="mt-1 truncate text-[10px] text-text-muted" title={card.detail}>{card.detail}</div>}
        </div>
      ))}
    </div>
  );
}
