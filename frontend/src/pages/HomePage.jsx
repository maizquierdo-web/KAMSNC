import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../components/AuthProvider';
import { CheckInButton } from '../components/CheckInButton';
import { Loader2, MapPin, Phone, Mail, MessageCircle, Users, Linkedin, Calendar, Check, AlertTriangle, ArrowRight, Target, Activity, CircleAlert, Clock, X } from 'lucide-react';

const TYPE_CONFIG = {
  visit: { label: 'Visita', icon: MapPin, color: '#E87A1E', bg: 'bg-orange-50' },
  call: { label: 'Llamada', icon: Phone, color: '#3b82f6', bg: 'bg-blue-50' },
  email: { label: 'Email', icon: Mail, color: '#8b5cf6', bg: 'bg-purple-50' },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, color: '#16a34a', bg: 'bg-green-50' },
  meeting: { label: 'Reunión', icon: Users, color: '#E87A1E', bg: 'bg-orange-50' },
  linkedin: { label: 'LinkedIn', icon: Linkedin, color: '#0077b5', bg: 'bg-blue-50' },
  follow_up: { label: 'Seguimiento', icon: Clock, color: '#0f766e', bg: 'bg-emerald-50' },
  other: { label: 'Otro', icon: Calendar, color: '#5a6078', bg: 'bg-gray-50' },
};

const ONBOARDING_LABELS = {
  documentation_requested: 'Documentación solicitada',
  sauc_opening: 'Apertura de SAUC',
  delayed_by_channel: 'Demorado por el canal',
  order_contract_activated: 'Pedido y contrato activados',
  user_created: 'Alta de usuario',
};

function dateKey(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function daysSince(value) {
  if (!value) return null;
  const then = new Date(value); const now = new Date();
  then.setHours(0, 0, 0, 0); now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((now - then) / 86400000));
}

function SummaryCard({ value, label, detail, tone = 'default', icon: Icon, onClick }) {
  const tones = {
    default: 'border-surface-3 bg-surface-1 text-text-primary', blue: 'border-blue-200 bg-blue-50/70 text-blue-700',
    amber: 'border-amber-200 bg-amber-50/70 text-amber-700', red: 'border-red-200 bg-red-50/70 text-red-700',
  };
  return <button type="button" onClick={onClick} className={`rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-400/40 ${tones[tone]}`}>
    <div className="flex items-start justify-between"><div className="text-2xl font-extrabold leading-none">{value}</div><Icon size={18} className="opacity-70" /></div>
    <div className="mt-2 text-xs font-bold text-text-primary">{label}</div><div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-text-secondary"><span>{detail}</span><span className="font-bold">Ver detalle →</span></div>
  </button>;
}

export default function HomePage() {
  const { user, profile } = useAuthContext();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [todayActions, setTodayActions] = useState([]);
  const [completedToday, setCompletedToday] = useState(0);
  const [attentionItems, setAttentionItems] = useState([]);
  const [stats, setStats] = useState({ today: 0, withoutNext: 0, inactive: 0, overdue: 0 });
  const [detailGroups, setDetailGroups] = useState({ today: [], withoutNext: [], inactive: [], overdue: [] });
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [onboardingWarnings, setOnboardingWarnings] = useState([]);
  const mountedRef = useRef(true);
  const openChannel = id => { if (id) navigate(`/channels?detail=${id}`); };

  async function loadData() {
    if (!user?.id) return;
    setLoading(true);
    try {
      const today = dateKey();
      const [feedRes, channelsRes, alertsRes] = await Promise.all([
        supabase.from('channel_activity_feed').select('*').eq('user_id', user.id).order('scheduled_date').order('scheduled_time'),
        supabase.from('channels').select('id, name, pipeline_stage, status, updated_at, pipeline_stage_changed_at, onboarding_status, onboarding_status_changed_at').eq('assigned_to', user.id),
        supabase.from('alerts').select('id, channel_id, alert_type, title, detail, priority, due_date').eq('user_id', user.id).eq('is_dismissed', false).order('created_at', { ascending: false }).limit(10),
      ]);
      if (feedRes.error) throw feedRes.error;
      if (channelsRes.error) throw channelsRes.error;
      const feed = feedRes.data || []; const channels = channelsRes.data || [];
      const onboarding = channels
        .filter(channel => channel.pipeline_stage === 'onboarding')
        .map(channel => ({
          id: channel.id,
          name: channel.name,
          status: ONBOARDING_LABELS[channel.onboarding_status] || 'Documentación solicitada',
          days: daysSince(channel.onboarding_status_changed_at || channel.pipeline_stage_changed_at || channel.updated_at) || 0,
        }))
        .sort((a, b) => b.days - a.days);
      const ids = [...new Set(feed.map(item => item.channel_id).filter(Boolean))];
      const detailsRes = ids.length ? await supabase.from('channels').select('id, name, address').in('id', ids) : { data: [], error: null };
      if (detailsRes.error) throw detailsRes.error;
      const channelMap = new Map((detailsRes.data || []).map(channel => [channel.id, channel]));

      const todayRows = feed.filter(item => item.scheduled_date === today);
      const pendingToday = todayRows.filter(item => ['planned', 'overdue'].includes(item.status)).map(item => ({
        id: item.activity_key, sourceId: item.source_id, source: item.source_table, channelId: item.channel_id,
        channelName: channelMap.get(item.channel_id)?.name || 'Canal', channelAddress: channelMap.get(item.channel_id)?.address || '',
        type: item.activity_type || 'other', time: item.scheduled_time?.slice(0, 5) || '--:--', notes: item.notes,
      }));
      const active = channels.filter(channel => !['discarded', 'closed', 'inactive'].includes(channel.status));
      const futureIds = new Set(feed.filter(item => item.scheduled_date >= today && ['planned', 'in_progress'].includes(item.status)).map(item => item.channel_id));
      const withoutNext = active.filter(channel => !futureIds.has(channel.id));
      const channelsWithPendingVisit = new Set(feed
        .filter(item => item.source_table === 'planned_visits'
          && (item.status === 'in_progress' || (item.status === 'planned' && item.scheduled_date >= today)))
        .map(item => item.channel_id));
      const lastByChannel = new Map();
      feed.filter(item => item.occurred_at).forEach(item => {
        const current = lastByChannel.get(item.channel_id);
        if (!current || new Date(item.occurred_at) > new Date(current)) lastByChannel.set(item.channel_id, item.occurred_at);
      });
      const inactive = active.filter(channel => !channelsWithPendingVisit.has(channel.id)
        && (daysSince(lastByChannel.get(channel.id) || channel.updated_at) || 0) > 15);
      const overdue = feed.filter(item => item.status === 'overdue');
      const attention = []; const representedChannels = new Set();
      overdue.forEach(item => { if (representedChannels.has(item.channel_id)) return; representedChannels.add(item.channel_id); attention.push({ key: `overdue:${item.activity_key}`, severity: 'high', channelId: item.channel_id, channelName: channelMap.get(item.channel_id)?.name || 'Canal', title: 'Acción vencida', detail: `${TYPE_CONFIG[item.activity_type]?.label || 'Seguimiento'} · ${item.scheduled_date}` }); });
      withoutNext.forEach(channel => { if (representedChannels.has(channel.id)) return; representedChannels.add(channel.id); attention.push({ key: `next:${channel.id}`, severity: 'medium', channelId: channel.id, channelName: channel.name, title: 'Sin siguiente acción', detail: 'Conviene planificar el próximo contacto.' }); });
      inactive.forEach(channel => { if (representedChannels.has(channel.id)) return; representedChannels.add(channel.id); attention.push({ key: `inactive:${channel.id}`, severity: 'medium', channelId: channel.id, channelName: channel.name, title: 'Sin actividad reciente', detail: `${daysSince(lastByChannel.get(channel.id) || channel.updated_at)} días sin actividad registrada.` }); });
      (alertsRes.data || []).forEach(alert => { if (alert.alert_type === 'channel_inactive' && channelsWithPendingVisit.has(alert.channel_id)) return; if (alert.channel_id && representedChannels.has(alert.channel_id)) return; if (alert.channel_id) representedChannels.add(alert.channel_id); attention.push({ key: `alert:${alert.id}`, alertId: alert.id, severity: alert.priority === 'high' ? 'high' : 'low', channelId: alert.channel_id, channelName: alert.title, title: alert.detail || 'Aviso pendiente', detail: alert.due_date ? `Fecha: ${alert.due_date}` : 'Requiere revisión.' }); });

      if (!mountedRef.current) return;
      setTodayActions(pendingToday); setCompletedToday(todayRows.filter(item => item.status === 'completed').length);
      setAttentionItems(attention.slice(0, 12));
      setOnboardingWarnings(onboarding);
      setStats({ today: todayRows.length, withoutNext: withoutNext.length, inactive: inactive.length, overdue: overdue.length });
      setDetailGroups({
        today: todayRows.map(item => ({ id: item.activity_key, channelId: item.channel_id, channelName: channelMap.get(item.channel_id)?.name || 'Canal', title: TYPE_CONFIG[item.activity_type]?.label || 'Acción', detail: `${item.scheduled_time?.slice(0, 5) || '--:--'} · ${item.status === 'completed' ? 'Completada' : item.status === 'in_progress' ? 'En curso' : 'Pendiente'}` })),
        withoutNext: withoutNext.map(channel => ({ id: channel.id, channelId: channel.id, channelName: channel.name, title: 'Sin siguiente acción', detail: 'No tiene un próximo contacto planificado.' })),
        inactive: inactive.map(channel => ({ id: channel.id, channelId: channel.id, channelName: channel.name, title: 'Sin actividad reciente', detail: `${daysSince(lastByChannel.get(channel.id) || channel.updated_at)} días sin actividad registrada.` })),
        overdue: overdue.map(item => ({ id: item.activity_key, channelId: item.channel_id, channelName: channelMap.get(item.channel_id)?.name || 'Canal', title: TYPE_CONFIG[item.activity_type]?.label || 'Acción vencida', detail: `Vencida desde ${item.scheduled_date}` })),
      });
    } catch (error) { console.error('Error cargando Mi día:', error); }
    finally { if (mountedRef.current) setLoading(false); }
  }

  useEffect(() => { mountedRef.current = true; loadData(); return () => { mountedRef.current = false; }; }, [user?.id]);
  useEffect(() => { const refresh = () => { if (document.visibilityState === 'visible') loadData(); }; document.addEventListener('visibilitychange', refresh); return () => document.removeEventListener('visibilitychange', refresh); }, [user?.id]);

  async function completeAction(item) {
    try {
      let response;
      if (item.source === 'channel_interactions') response = await supabase.from('channel_interactions').update({ is_completed: true, created_at: new Date().toISOString() }).eq('id', item.sourceId);
      else if (item.source === 'planned_visits') response = await supabase.from('planned_visits').update({ is_completed: true }).eq('id', item.sourceId);
      else if (item.source === 'visit_followup') response = await supabase.from('visits').update({ next_action_date: null, next_steps: null }).eq('id', item.sourceId);
      if (response?.error) throw response.error;
      await loadData();
    } catch (error) { console.error('Error completando acción:', error); }
  }

  async function dismissAttention(item) {
    if (!item.alertId) return;
    await supabase.from('alerts').update({ is_dismissed: true }).eq('id', item.alertId);
    setAttentionItems(current => current.filter(entry => entry.key !== item.key));
  }

  const hour = new Date().getHours();
  const greeting = hour < 13 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
  const firstName = profile?.full_name?.split(' ')[0] || '';
  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-brand-400" /></div>;

  return <div className="space-y-5">
    <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-500">Tu jornada comercial</p><h1 className="mt-1 text-2xl font-extrabold tracking-tight">{greeting}{firstName ? `, ${firstName}` : ''}</h1><p className="mt-0.5 text-sm text-text-secondary">{new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
    <section>
      <div className="mb-3"><h2 className="text-lg font-extrabold">Lo importante, hoy</h2><p className="text-[11px] text-text-secondary">El CRM reúne lo que requiere acción, sin reporting adicional.</p></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <SummaryCard value={stats.today} label="Acciones de hoy" detail={`${completedToday} completadas`} tone="blue" icon={Target} onClick={() => setSelectedDetail('today')} />
        <SummaryCard value={stats.withoutNext} label="Sin siguiente acción" detail="Canales activos" tone="amber" icon={Calendar} onClick={() => setSelectedDetail('withoutNext')} />
        <SummaryCard value={stats.inactive} label="Sin actividad +15 días" detail="Revisar prioridad" tone="amber" icon={Activity} onClick={() => setSelectedDetail('inactive')} />
        <SummaryCard value={stats.overdue} label="Acciones vencidas" detail="Requieren atención" tone="red" icon={CircleAlert} onClick={() => setSelectedDetail('overdue')} />
      </div>
    </section>
    {onboardingWarnings.length > 0 && <section className="overflow-hidden rounded-2xl border border-cyan-200 bg-cyan-50/35">
      <div className="flex items-center justify-between border-b border-cyan-100 px-4 py-3">
        <div><h2 className="text-sm font-bold text-text-primary">Seguimiento de altas</h2><p className="text-[10px] text-text-muted">Días transcurridos desde el último cambio de evolución</p></div>
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-cyan-100 px-2 text-xs font-bold text-cyan-700">{onboardingWarnings.length}</span>
      </div>
      <div className="divide-y divide-cyan-100">
        {onboardingWarnings.slice(0, 5).map(item => <button key={item.id} onClick={() => openChannel(item.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-cyan-50">
          <span className={`flex h-9 min-w-9 items-center justify-center rounded-xl text-xs font-extrabold ${item.days > 10 ? 'bg-red-50 text-red-600' : item.days > 5 ? 'bg-amber-50 text-amber-700' : 'bg-white text-cyan-700'}`}>{item.days}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{item.name}</span><span className="block truncate text-[10px] text-text-secondary">{item.status} · {item.days === 0 ? 'actualizado hoy' : `${item.days} ${item.days === 1 ? 'día' : 'días'} sin evolución`}</span></span>
          <ArrowRight size={14} className="text-cyan-600" />
        </button>)}
      </div>
    </section>}
    <CheckInButton />
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
      <section className="rounded-2xl border border-surface-3 bg-surface-1 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-3"><div><h2 className="text-sm font-bold">Próximas acciones</h2><p className="text-[10px] text-text-muted">Pendientes de hoy, ordenadas por hora</p></div><button onClick={() => navigate('/calendar')} className="text-[10px] font-bold text-brand-500 flex items-center gap-1">Ver agenda <ArrowRight size={12} /></button></div>
        {todayActions.length === 0 ? <div className="py-10 text-center"><Check size={24} className="mx-auto mb-2 text-green-500" /><p className="text-sm font-semibold">No tienes acciones pendientes hoy</p><p className="text-[10px] text-text-muted mt-1">Puedes revisar los canales que necesitan atención.</p></div> : <div className="divide-y divide-surface-3">
          {todayActions.slice(0, 6).map(item => { const cfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.other; const Icon = cfg.icon; return <div key={item.id} className="flex items-center gap-3 px-4 py-3"><div className="w-10 text-xs font-extrabold" style={{ color: cfg.color }}>{item.time}</div><div className={`w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center`}><Icon size={15} style={{ color: cfg.color }} /></div><button onClick={() => openChannel(item.channelId)} className="flex-1 min-w-0 text-left"><div className="text-xs font-bold truncate">{item.channelName}</div><div className="text-[10px] text-text-muted truncate"><span style={{ color: cfg.color }} className="font-semibold">{cfg.label}</span>{item.notes ? ` · ${item.notes}` : item.channelAddress ? ` · ${item.channelAddress}` : ''}</div></button><button onClick={() => completeAction(item)} className="px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 text-[10px] font-bold flex items-center gap-1"><Check size={11} /> Hecho</button></div>; })}
        </div>}
      </section>
      <section className="rounded-2xl border border-surface-3 bg-surface-1 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-3"><div><h2 className="text-sm font-bold">Necesitan atención</h2><p className="text-[10px] text-text-muted">Prioridades detectadas automáticamente</p></div><span className="min-w-6 h-6 px-2 rounded-full bg-surface-2 text-xs font-bold flex items-center justify-center">{attentionItems.length}</span></div>
        {attentionItems.length === 0 ? <div className="py-10 text-center text-sm text-text-secondary">Todo está al día.</div> : <div className="divide-y divide-surface-3">{attentionItems.slice(0, 8).map(item => <div key={item.key} className="flex items-center gap-3 px-4 py-3"><span className={`w-2 h-2 rounded-full ${item.severity === 'high' ? 'bg-red-500' : item.severity === 'medium' ? 'bg-amber-500' : 'bg-blue-500'}`} /><button onClick={() => openChannel(item.channelId)} className="flex-1 min-w-0 text-left"><div className="text-xs font-bold truncate">{item.channelName}</div><div className="text-[10px] text-text-secondary truncate"><span className="font-semibold">{item.title}</span> · {item.detail}</div></button>{item.alertId ? <button onClick={() => dismissAttention(item)} className="text-[10px] font-bold text-text-muted">Hecho</button> : <button onClick={() => openChannel(item.channelId)} className="text-[10px] font-bold text-brand-500 flex items-center gap-1">Abrir <ArrowRight size={11} /></button>}</div>)}</div>}
      </section>
    </div>
    {stats.overdue > 0 && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-[10px] text-amber-800"><AlertTriangle size={14} />Las acciones vencidas permanecen visibles hasta completarlas o reprogramarlas en la Agenda.</div>}
    {selectedDetail && <div className="fixed inset-0 z-50 bg-black/25" onClick={() => setSelectedDetail(null)}>
      <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-surface-0 border-l border-surface-3 shadow-2xl flex flex-col" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-3"><div><p className="text-[10px] font-bold uppercase tracking-wider text-brand-500">Detalle de Mi día</p><h2 className="text-lg font-extrabold">{{ today: 'Acciones de hoy', withoutNext: 'Canales sin siguiente acción', inactive: 'Canales sin actividad +15 días', overdue: 'Acciones vencidas' }[selectedDetail]}</h2></div><button onClick={() => setSelectedDetail(null)} className="p-2 rounded-lg hover:bg-surface-2"><X size={19} /></button></div>
        <div className="flex-1 overflow-y-auto divide-y divide-surface-3">
          {detailGroups[selectedDetail].length === 0 ? <div className="py-16 text-center text-sm text-text-secondary">No hay registros en este apartado.</div> : detailGroups[selectedDetail].map(item => <button key={item.id} onClick={() => openChannel(item.channelId)} className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-surface-1 transition-colors"><span className={`w-2 h-2 rounded-full ${selectedDetail === 'overdue' ? 'bg-red-500' : selectedDetail === 'today' ? 'bg-blue-500' : 'bg-amber-500'}`} /><span className="flex-1 min-w-0"><span className="block text-sm font-bold truncate">{item.channelName}</span><span className="block text-[11px] text-text-secondary">{item.title} · {item.detail}</span></span><ArrowRight size={15} className="text-text-muted" /></button>)}
        </div>
        <div className="p-4 border-t border-surface-3"><button onClick={() => navigate('/calendar')} className="w-full py-2.5 rounded-xl bg-brand-500 text-white text-xs font-bold">Abrir Agenda completa</button></div>
      </aside>
    </div>}
  </div>;
}
