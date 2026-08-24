import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarX, Clock3, FileWarning, Loader2, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

const DAY_MS = 86400000;

function scrollToBlock(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function ChannelAttentionAlerts({ channelId, refreshKey = 0, isCaes = false }) {
  const [alerts, setAlerts] = useState([]);
  const [businessCaseMissing, setBusinessCaseMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!channelId) return;
    loadAlerts();
  }, [channelId, refreshKey, isCaes]);

  async function loadAlerts() {
    setLoading(true);
    try {
      const [visitsRes, interactionsRes, meetingsRes, businessCaseRes] = await Promise.all([
        supabase.from('visits').select('checkin_at').eq('channel_id', channelId).order('checkin_at', { ascending: false }).limit(1),
        supabase.from('channel_interactions').select('created_at, planned_date, is_completed').eq('channel_id', channelId).order('created_at', { ascending: false }).limit(100),
        supabase.from('channel_meetings').select('meeting_date, created_at').eq('channel_id', channelId).order('created_at', { ascending: false }).limit(1),
        supabase.from('business_cases').select('id').eq('channel_id', channelId).limit(1),
      ]);

      const interactions = interactionsRes.data || [];
      const planned = interactions.filter(item => item.planned_date && item.is_completed !== true);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayKey = today.toISOString().slice(0, 10);
      const overdue = planned.filter(item => item.planned_date < todayKey);

      const activityDates = [
        visitsRes.data?.[0]?.checkin_at,
        interactions.find(item => item.is_completed === true || (item.is_completed !== false && !item.planned_date))?.created_at,
        meetingsRes.data?.[0]?.meeting_date || meetingsRes.data?.[0]?.created_at,
      ].filter(Boolean).map(value => new Date(value));
      const lastActivity = activityDates.sort((a, b) => b - a)[0];
      const inactiveDays = lastActivity ? Math.floor((Date.now() - lastActivity.getTime()) / DAY_MS) : null;

      const nextAlerts = [];
      if (overdue.length > 0) nextAlerts.push({
        key: 'overdue', Icon: CalendarX, color: 'red',
        title: `${overdue.length} ${overdue.length === 1 ? 'acción vencida' : 'acciones vencidas'}`,
        detail: 'Requiere actualización o cierre.', target: 'channel-activity', action: 'Revisar',
      });
      if (planned.length === 0) nextAlerts.push({
        key: 'no-next', Icon: Clock3, color: 'amber',
        title: 'Sin siguiente acción', detail: 'El canal no tiene ningún seguimiento planificado.',
        target: 'channel-activity', action: 'Planificar',
      });
      if (!lastActivity || inactiveDays > 15) nextAlerts.push({
        key: 'inactive', Icon: AlertTriangle, color: 'amber',
        title: lastActivity ? `Sin actividad desde hace ${inactiveDays} días` : 'Sin actividad registrada',
        detail: 'Conviene revisar la prioridad del canal.', target: 'channel-activity', action: 'Registrar',
      });
      const missingBusinessCase = !businessCaseRes.data?.length;
      setBusinessCaseMissing(missingBusinessCase);
      if (missingBusinessCase && !isCaes) nextAlerts.push({
        key: 'business-case', Icon: FileWarning, color: 'blue',
        title: 'Business Case pendiente', detail: 'Todavía no hay ningún documento adjunto.',
        target: 'channel-business-case', action: 'Adjuntar',
      });
      setAlerts(nextAlerts);
    } catch (error) {
      console.error('No se pudieron calcular las alertas del canal', error);
      setAlerts([]);
      setBusinessCaseMissing(false);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return (
    <div className="mb-4 bg-white border border-surface-3 rounded-xl px-4 py-3 flex items-center gap-2 text-xs text-text-muted">
      <Loader2 size={14} className="animate-spin" /> Revisando el estado del canal…
    </div>
  );

  const optionalBusinessCase = isCaes && businessCaseMissing ? {
    key: 'business-case-optional', Icon: FileWarning, color: 'blue',
    title: 'Business Case opcional', detail: 'Funcionalidad en estudio para canales CAEs.',
    target: 'channel-business-case', action: 'Añadir si procede',
  } : null;

  if (alerts.length === 0) return (
    <div className="mb-4 space-y-2">
      <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-xs font-semibold text-green-700">Canal al día · No necesita atención inmediata</span>
      </div>
      {optionalBusinessCase && (
        <button onClick={() => scrollToBlock(optionalBusinessCase.target)}
          className="flex w-full items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-left text-blue-600 transition-transform hover:-translate-y-0.5">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/70"><FileWarning size={17} /></div>
          <div className="min-w-0 flex-1"><div className="text-xs font-bold">{optionalBusinessCase.title}</div><div className="mt-0.5 text-[10px] opacity-80">{optionalBusinessCase.detail}</div></div>
          <span className="flex flex-shrink-0 items-center gap-1 text-[10px] font-bold">{optionalBusinessCase.action} <ArrowRight size={11} /></span>
        </button>
      )}
    </div>
  );

  const styles = {
    red: 'bg-red-50 border-red-200 text-red-600',
    amber: 'bg-amber-50 border-amber-200 text-amber-600',
    blue: 'bg-blue-50 border-blue-200 text-blue-600',
  };

  return (
    <section className="mb-4 bg-white border border-surface-3 rounded-xl p-3.5">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={16} className="text-amber-500" />
        <div className="text-sm font-bold text-text-primary">Necesita atención</div>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{alerts.length}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {[...alerts, ...(optionalBusinessCase ? [optionalBusinessCase] : [])].map(({ key, Icon, color, title, detail, target, action }) => (
          <button key={key} onClick={() => scrollToBlock(target)}
            className={`flex items-center gap-3 p-3 border rounded-xl text-left transition-transform hover:-translate-y-0.5 ${styles[color]}`}>
            <div className="w-9 h-9 rounded-lg bg-white/70 flex items-center justify-center flex-shrink-0"><Icon size={17} /></div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold">{title}</div>
              <div className="text-[10px] opacity-80 mt-0.5">{detail}</div>
            </div>
            <span className="flex items-center gap-1 text-[10px] font-bold flex-shrink-0">{action} <ArrowRight size={11} /></span>
          </button>
        ))}
      </div>
    </section>
  );
}
