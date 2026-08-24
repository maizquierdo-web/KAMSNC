import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock3, Loader2, Target, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';

const TYPE_LABELS = {
  call: 'Llamada', email: 'Email', whatsapp: 'WhatsApp', meeting: 'Reunión',
  linkedin: 'LinkedIn', visit: 'Visita', other: 'Seguimiento',
};

function formatDate(value) {
  if (!value) return '';
  return new Date(`${value}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function shortText(value, fallback) {
  const text = value?.trim();
  if (!text) return fallback;
  return text.length > 105 ? `${text.slice(0, 102)}…` : text;
}

export default function ChannelWorkFocus({ channelId, refreshKey = 0 }) {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase.from('channel_activity_feed').select('*').eq('channel_id', channelId).limit(200)
      .then(({ data, error }) => {
        if (error) throw error;
        if (active) setActivity(data || []);
      })
      .catch(error => console.error('No se pudo cargar el foco de trabajo:', error))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [channelId, refreshKey]);

  const focus = useMemo(() => {
    const pending = activity
      .filter(item => item.scheduled_date && ['planned', 'overdue'].includes(item.status))
      .sort((a, b) => `${a.scheduled_date}T${a.scheduled_time || '23:59'}`.localeCompare(`${b.scheduled_date}T${b.scheduled_time || '23:59'}`));
    const completed = activity
      .filter(item => item.occurred_at)
      .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
    const next = pending[0] || null;
    const latest = completed[0] || null;
    const daysInactive = latest ? Math.floor((Date.now() - new Date(latest.occurred_at).getTime()) / 86400000) : null;

    let priority = 'Mantener el seguimiento comercial';
    let priorityDetail = 'El canal está al día.';
    let tone = 'teal';
    if (next?.status === 'overdue') {
      priority = 'Resolver la acción vencida';
      priorityDetail = shortText(next.subject || next.notes, `${TYPE_LABELS[next.activity_type] || 'Acción'} prevista para el ${formatDate(next.scheduled_date)}.`);
      tone = 'red';
    } else if (!next) {
      priority = latest ? 'Definir el próximo paso' : 'Registrar el primer contacto';
      priorityDetail = latest ? 'No existe ningún seguimiento planificado.' : 'Todavía no existe actividad comercial registrada.';
      tone = 'amber';
    } else if (daysInactive > 15) {
      priority = 'Reactivar la relación';
      priorityDetail = `Han pasado ${daysInactive} días desde la última actividad.`;
      tone = 'amber';
    } else {
      priority = `${TYPE_LABELS[next.activity_type] || 'Acción'} · ${formatDate(next.scheduled_date)}`;
      priorityDetail = shortText(next.subject || next.notes, 'Próximo seguimiento planificado.');
    }

    return {
      priority, priorityDetail, tone,
      latestTitle: latest ? `${TYPE_LABELS[latest.activity_type] || 'Actividad'} · ${new Date(latest.occurred_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : 'Sin actividad registrada',
      latestDetail: latest ? shortText(latest.result || latest.notes || latest.subject, 'Actividad completada sin resultado informado.') : 'Registra el primer contacto para iniciar el historial.',
      nextTitle: next ? `${TYPE_LABELS[next.activity_type] || 'Acción'} · ${formatDate(next.scheduled_date)}` : 'Sin siguiente acción',
      nextDetail: next ? shortText(next.subject || next.notes, 'Seguimiento pendiente.') : 'Planifica una acción para mantener el canal activo.',
    };
  }, [activity]);

  function goToActivity() {
    document.getElementById('channel-activity')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (loading) return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-surface-3 bg-white px-4 py-4 text-xs text-text-muted">
      <Loader2 size={14} className="animate-spin" /> Preparando el foco de trabajo…
    </div>
  );

  const tone = {
    red: 'border-red-200 bg-red-50 text-red-600',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    teal: 'border-teal-200 bg-teal-50 text-teal-700',
  }[focus.tone];

  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-surface-3 bg-white">
      <div className="flex items-center justify-between border-b border-surface-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-brand-500" />
          <div>
            <div className="text-sm font-bold text-text-primary">Foco de trabajo</div>
            <div className="text-[10px] text-text-muted">Qué necesita este canal ahora</div>
          </div>
        </div>
        <button onClick={goToActivity} className="flex items-center gap-1 text-[10px] font-bold text-brand-500 hover:text-brand-600">
          Abrir historial <ArrowRight size={12} />
        </button>
      </div>

      <div className="grid grid-cols-1 divide-y divide-surface-3 md:grid-cols-3 md:divide-x md:divide-y-0">
        <button onClick={goToActivity} className={`p-3.5 text-left transition-colors hover:brightness-[0.98] ${tone}`}>
          <div className="mb-2 flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider opacity-75"><Target size={13} /> Prioridad ahora</div>
          <div className="text-xs font-bold">{focus.priority}</div>
          <div className="mt-1 text-[10px] leading-relaxed opacity-80">{focus.priorityDetail}</div>
        </button>
        <button onClick={goToActivity} className="p-3.5 text-left transition-colors hover:bg-surface-1">
          <div className="mb-2 flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-text-muted"><CheckCircle2 size={13} /> Último resultado</div>
          <div className="text-xs font-bold text-text-primary">{focus.latestTitle}</div>
          <div className="mt-1 text-[10px] leading-relaxed text-text-muted">{focus.latestDetail}</div>
        </button>
        <button onClick={goToActivity} className="p-3.5 text-left transition-colors hover:bg-surface-1">
          <div className="mb-2 flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-text-muted"><Clock3 size={13} /> Próximo paso</div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-text-primary"><TrendingUp size={13} className="text-brand-500" /> {focus.nextTitle}</div>
          <div className="mt-1 text-[10px] leading-relaxed text-text-muted">{focus.nextDetail}</div>
        </button>
      </div>
    </section>
  );
}
