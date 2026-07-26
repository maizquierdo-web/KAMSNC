import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../components/AuthProvider';
import {
  Loader2, Plus, ChevronLeft, ChevronRight, ChevronDown, X, Check,
  Clock, MapPin, Building2, CalendarDays, Mail, Phone,
  MessageCircle, Users, Linkedin, Calendar
} from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function isSameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function formatDateKey(date) { const p = (n) => String(n).padStart(2, '0'); return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())}`; }

function getDateRange(period) {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);

  if (period === '7d') start.setDate(start.getDate() - 6);
  else if (period === '14d') start.setDate(start.getDate() - 13);
  else if (period === '30d') start.setDate(start.getDate() - 29);
  else if (period === '90d') start.setDate(start.getDate() - 89);
  else return null;

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getPeriodRange(periodKey, customFrom, customTo) {
  if (periodKey === 'custom') {
    if (!customFrom || !customTo) return null;
    return { start: new Date(customFrom), end: new Date(customTo + 'T23:59:59') };
  }
  return getDateRange(periodKey);
}
const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const TYPE_CONFIG = {
  visit: { label: 'Visita', icon: MapPin, color: '#E87A1E', bg: '#FEF3E8', borderColor: '#E87A1E' },
  call: { label: 'Llamada', icon: Phone, color: '#3b82f6', bg: '#eff6ff', borderColor: '#3b82f6' },
  email: { label: 'Email', icon: Mail, color: '#8b5cf6', bg: '#f3eeff', borderColor: '#8b5cf6' },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, color: '#16a34a', bg: '#e6f5ed', borderColor: '#16a34a' },
  meeting: { label: 'Reunión', icon: Users, color: '#E87A1E', bg: '#FEF3E8', borderColor: '#E87A1E' },
  linkedin: { label: 'LinkedIn', icon: Linkedin, color: '#0077b5', bg: '#e8f4fd', borderColor: '#0077b5' },
  other: { label: 'Otro', icon: Calendar, color: '#5a6078', bg: '#f0f0f4', borderColor: '#5a6078' },
};

const ACTION_TYPES = [
  { key: 'visit', label: 'Visita', icon: '📍' },
  { key: 'call', label: 'Llamada', icon: '📞' },
  { key: 'email', label: 'Email', icon: '📧' },
  { key: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { key: 'meeting', label: 'Reunión', icon: '👥' },
  { key: 'linkedin', label: 'LinkedIn', icon: '💼' },
  { key: 'other', label: 'Otro', icon: '📋' },
];

// ============ NEW PLANNED ACTION MODAL ============
function NewPlannedActionModal({ date, channels, onSave, onClose }) {
  const [actionType, setActionType] = useState('visit');
  const [selectedChannel, setSelectedChannel] = useState('');
  const [time, setTime] = useState('09:00');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = channels.filter(ch => search === '' || ch.name.toLowerCase().includes(search.toLowerCase()));
  const fieldClass = "w-full px-3 py-2.5 bg-surface-0 border border-surface-3 rounded-xl text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-500 transition-colors";

  async function handleSave() {
    if (!selectedChannel) return;
    setSaving(true);
    try {
      await onSave({
        action_type: actionType,
        channel_id: selectedChannel,
        planned_date: formatDateKey(date),
        planned_time: time + ':00',
        notes: notes || null,
      });
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-surface-1 border border-surface-3 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-surface-3">
          <div>
            <h3 className="font-bold text-sm">Planificar acción</h3>
            <p className="text-xs text-text-secondary">{date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Action type */}
          <div>
            <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5">Tipo de acción</label>
            <div className="grid grid-cols-4 gap-1.5">
              {ACTION_TYPES.map(t => {
                const cfg = TYPE_CONFIG[t.key];
                const sel = actionType === t.key;
                return (
                  <button key={t.key} onClick={() => setActionType(t.key)}
                    className="flex flex-col items-center gap-0.5 px-2 py-2 rounded-xl text-[10px] font-semibold transition-all"
                    style={{ background: sel ? cfg.bg : '#f7f8fa', border: `1.5px solid ${sel ? cfg.color : '#dde1e8'}`, color: sel ? cfg.color : '#8b90a0' }}>
                    <span className="text-sm">{t.icon}</span>{t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Channel */}
          <div>
            <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Canal *</label>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar canal..." className={`${fieldClass} mb-2`} />
            <div className="max-h-36 overflow-y-auto rounded-xl border border-surface-3 bg-surface-0">
              {filtered.length === 0 && <div className="text-xs text-text-muted text-center py-4">Sin resultados</div>}
              {filtered.map(ch => (
                <button key={ch.id} onClick={() => { setSelectedChannel(ch.id); setSearch(ch.name); }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                    selectedChannel === ch.id ? 'bg-brand-500/10 text-brand-400' : 'hover:bg-surface-1'
                  }`}>
                  <div className="w-7 h-7 rounded-lg bg-surface-2 flex items-center justify-center text-[10px] font-bold text-text-secondary flex-shrink-0">{ch.name.charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-xs font-semibold">{ch.name}</div>
                    <div className="text-[10px] text-text-muted truncate">{ch.address || 'Sin dirección'}</div>
                  </div>
                  {selectedChannel === ch.id && <Check size={14} className="text-brand-400 flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Hora</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={fieldClass} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Notas / Objetivo</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="¿Qué quieres conseguir?" rows={2} className={`${fieldClass} resize-none`} />
          </div>
        </div>

        <div className="p-4 border-t border-surface-3">
          <button onClick={handleSave} disabled={!selectedChannel || saving}
            className="w-full py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Calendar size={16} />}
            Planificar {TYPE_CONFIG[actionType]?.label.toLowerCase() || 'acción'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ EVENT CARD ============
function EventCard({ event, onDelete, onComplete }) {
  const time = event.planned_time ? event.planned_time.slice(0, 5) : '--:--';
  const cfg = TYPE_CONFIG[event._type] || TYPE_CONFIG.other;
  const Icon = cfg.icon;
  const isCompleted = event.is_completed;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
      isCompleted ? 'bg-green-500/5 border-green-500/20' : 'bg-surface-0'
    }`} style={!isCompleted ? { borderColor: cfg.borderColor + '40', borderLeftWidth: '3px', borderLeftColor: cfg.borderColor } : {}}>
      <div className="text-center flex-shrink-0 w-12">
        <div className={`text-sm font-bold ${isCompleted ? 'text-green-400' : ''}`} style={!isCompleted ? { color: cfg.color } : {}}>{time}</div>
      </div>
      <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0`} style={{ background: cfg.bg }}>
        <Icon size={12} style={{ color: cfg.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold truncate ${isCompleted ? 'line-through text-text-secondary' : ''}`}>
          {event._channelName || 'Canal'}
        </div>
        <div className="text-[10px] text-text-muted truncate">
          <span className="font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
          {event._kamName ? ` · ${event._kamName}` : ''}
          {event._channelAddress ? ` · ${event._channelAddress}` : ''}
        </div>
        {event.notes && <div className="text-[10px] text-text-muted mt-0.5 truncate">{event.notes}</div>}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {isCompleted ? (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-green-500/20 text-green-400">✓</span>
        ) : (
          <>
            {event._type !== 'visit' && (
              <button onClick={(e) => { e.stopPropagation(); onComplete?.(event); }}
                className="px-2 py-1 bg-green-100 hover:bg-green-200 text-green-600 rounded text-[9px] font-bold transition-colors">✓ Hecho</button>
            )}
            <button onClick={(e) => { e.stopPropagation(); onDelete?.(event); }}
              className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted hover:text-red-400 transition-colors"><X size={14} /></button>
          </>
        )}
      </div>
    </div>
  );
}

// ============ SELECTOR DE KAM (mismo patrón que PipelinePage) ============
function KamSelector({ kams, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const current = selected === 'all' ? { name: 'Todo el equipo', zone: '' } : kams.find(k => k.id === selected) || {};

  return (
    <div ref={ref} className="relative mb-3">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-[#f7f8fa] border border-[#dde1e8] rounded-xl hover:border-[#c5cbd6] transition-colors">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white"
            style={{ background: selected === 'all' ? '#003E6B' : '#E87A1E' }}>
            {selected === 'all' ? '👥' : current.name?.charAt(0) || current.full_name?.charAt(0) || '?'}
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-[#1a1a2e]">{current.name || current.full_name}</div>
            <div className="text-[10px] text-[#8b90a0]">
              {selected === 'all' ? `${kams.length} KAMs` : `Zona ${current.zone || '-'}`}
            </div>
          </div>
        </div>
        <ChevronDown size={14} className="text-[#8b90a0]" />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#dde1e8] rounded-xl shadow-lg z-20 overflow-hidden max-h-64 overflow-y-auto">
          <button onClick={() => { onChange('all'); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#f7f8fa] border-b border-[#eef0f4]">
            <div className="w-7 h-7 rounded-lg bg-[#003E6B] flex items-center justify-center text-[10px] font-bold text-white">👥</div>
            <div className="flex-1 text-left">
              <div className="text-xs font-semibold text-[#1a1a2e]">Todo el equipo</div>
              <div className="text-[9px] text-[#8b90a0]">{kams.length} KAMs</div>
            </div>
            {selected === 'all' && <span className="text-[#E87A1E] font-bold text-xs">✓</span>}
          </button>
          {kams.map(kam => (
            <button key={kam.id} onClick={() => { onChange(kam.id); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#f7f8fa] border-b border-[#eef0f4] last:border-0">
              <div className="w-7 h-7 rounded-lg bg-[#E87A1E] flex items-center justify-center text-[10px] font-bold text-white">
                {kam.full_name?.charAt(0) || '?'}
              </div>
              <div className="flex-1 text-left">
                <div className="text-xs font-semibold text-[#1a1a2e]">{kam.full_name}</div>
                <div className="text-[9px] text-[#8b90a0]">Zona {kam.zone || '-'}</div>
              </div>
              {selected === kam.id && <span className="text-[#E87A1E] font-bold text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ MAIN CALENDAR PAGE ============
export default function CalendarPage() {
  const { user, profile, isManager } = useAuthContext();
  const [loading, setLoading] = useState(false);
  const [currentWeekStart, setCurrentWeekStart] = useState(getMonday(new Date()));
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [plannedVisits, setPlannedVisits] = useState([]);
  const [plannedActions, setPlannedActions] = useState([]);
  const [completedVisits, setCompletedVisits] = useState([]);
  const [channels, setChannels] = useState([]);
  const [activityChannelIds, setActivityChannelIds] = useState(new Set());
  const [dateType, setDateType] = useState('creation');
  const [showNewModal, setShowNewModal] = useState(false);
  const [toast, setToast] = useState(null);
  const [selectedKam, setSelectedKam] = useState('all');
  const [teamKams, setTeamKams] = useState([]);
  const [viewMode, setViewMode] = useState('day');

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));

  useEffect(() => { if (user) { loadWeekData(); loadChannels(); if (isManager) loadTeamKams(); } }, [user, currentWeekStart, selectedKam]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  async function loadTeamKams() {
    const { data } = await supabase.from('profiles')
      .select('id, full_name, zone').eq('is_active', true)
      .in('role', ['kam', 'coordinator']).order('full_name');
    setTeamKams(data || []);
  }

  async function loadChannels() {
    // FIX: igual que en ChannelsPage/PipelinePage — un manager/director debe
    // poder planificar acciones sobre CUALQUIER canal del equipo, no solo
    // los asignados directamente a su propia cuenta.
    let query = supabase.from('channels').select('id, name, address, contact_name').order('name');
    if (!isManager) query = query.eq('assigned_to', user.id);
    const { data } = await query;
    setChannels(data || []);
  }

  async function loadWeekData() {
    setLoading(true);
    try {
      const weekEnd = addDays(currentWeekStart, 7);
      const startStr = formatDateKey(currentWeekStart);
      const endStr = formatDateKey(weekEnd);

      const [plannedRes, actionsRes, visitsRes] = await Promise.all([
        (() => {
          let q = supabase.from('planned_visits').select('*, channels(name, address), profiles(full_name)')
           if (dateType === 'activity_change') {
  q = q.gte('activity_date', startStr).lt('activity_date', endStr).order('activity_time');
} else {
  q = q.gte('planned_date', startStr).lt('planned_date', endStr).order('planned_time');
}
          if (selectedKam !== 'all') q = q.eq('kam_id', selectedKam);
          else if (!isManager) q = q.eq('kam_id', user.id);
          return q;
        })(),
        (() => {
          let q = supabase.from('channel_interactions').select('*, channels(name, address), profiles(full_name)')
            .not('planned_date', 'is', null)
           if (dateType === 'activity_change') {
  q = q.gte('activity_date', startStr).lt('activity_date', endStr).order('activity_time');
} else {
  q = q.gte('planned_date', startStr).lt('planned_date', endStr).order('planned_time');
}
          if (selectedKam !== 'all') q = q.eq('user_id', selectedKam);
          else if (!isManager) q = q.eq('user_id', user.id);
          return q;
        })(),
        (() => {
          let q = supabase.from('visits').select('id, channel_id, kam_id, checkin_at, channels(name), profiles(full_name)')
            .gte('checkin_at', currentWeekStart.toISOString()).lt('checkin_at', weekEnd.toISOString());
          if (selectedKam !== 'all') q = q.eq('kam_id', selectedKam);
          else if (!isManager) q = q.eq('kam_id', user.id);
          return q;
        })(),
      ]);

      setPlannedVisits(plannedRes.data || []);
      setPlannedActions(actionsRes.data || []);
      setCompletedVisits(visitsRes.data || []);
      const ids = new Set();
(plannedRes.data || []).forEach(v => { if (v?.channel_id) ids.add(v.channel_id); });
(actionsRes.data || []).forEach(a => { if (a?.channel_id) ids.add(a.channel_id); });
(visitsRes.data || []).forEach(v => { if (v?.channel_id) ids.add(v.channel_id); });
setActivityChannelIds(ids);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function handleSavePlanned(data) {
    try {
      if (data.action_type === 'visit') {
        // Save as planned_visit (existing behavior)
        const { error } = await supabase.from('planned_visits').insert({
          channel_id: data.channel_id, kam_id: user.id,
          planned_date: data.planned_date, planned_time: data.planned_time, notes: data.notes,
        }).select('*, channels(name, address)').single();
        if (error) throw error;

        // Try sending email
        const channelData = channels.find(c => c.id === data.channel_id);
        try {
          await fetch(`${BACKEND_URL}/api/calendar-invite`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              kam_email: profile?.email, kam_name: profile?.full_name,
              channel_name: channelData?.name || 'Canal', channel_address: channelData?.address || '',
              planned_date: data.planned_date, planned_time: data.planned_time, notes: data.notes || '',
            }),
          });
        } catch (e) { console.error('Email error:', e); }
      } else {
        // Save as planned interaction
        const { error } = await supabase.from('channel_interactions').insert({
          channel_id: data.channel_id, user_id: user.id,
          interaction_type: data.action_type, direction: 'outbound',
          planned_date: data.planned_date, planned_time: data.planned_time,
          notes: data.notes, is_completed: false,
        });
        if (error) throw error;
      }

      setToast({ message: `✓ ${TYPE_CONFIG[data.action_type]?.label || 'Acción'} planificada`, type: 'success' });
      setShowNewModal(false);
      loadWeekData();
    } catch (err) {
      setToast({ message: 'Error: ' + err.message, type: 'error' });
    }
  }

  async function handleDeleteEvent(event) {
    try {
      if (event._source === 'planned_visit') {
        await supabase.from('planned_visits').delete().eq('id', event._sourceId);
      } else {
        await supabase.from('channel_interactions').delete().eq('id', event._sourceId);
      }
      loadWeekData();
      setToast({ message: 'Eliminada', type: 'success' });
    } catch (err) { console.error(err); }
  }

  async function handleCompleteEvent(event) {
    try {
      await supabase.from('channel_interactions').update({ is_completed: true }).eq('id', event._sourceId);
      loadWeekData();
      setToast({ message: '✓ Marcada como hecha', type: 'success' });
    } catch (err) { console.error(err); }
  }

  // Merge all events for a given day
  function getDayEvents(day) {
    const key = formatDateKey(day);
    const events = [];

    // Planned visits
    plannedVisits.filter(v => v.planned_date === key).forEach(v => {
      events.push({
        _type: 'visit', _source: 'planned_visit', _sourceId: v.id,
        planned_time: v.planned_time, notes: v.notes, is_completed: v.is_completed,
        _channelName: v.channels?.name, _channelAddress: v.channels?.address,
        _kamName: selectedKam === 'all' ? v.profiles?.full_name : null,
      });
    });

    // Planned actions (interactions)
    plannedActions.filter(a => a.planned_date === key).forEach(a => {
      events.push({
        _type: a.interaction_type, _source: 'interaction', _sourceId: a.id,
        planned_time: a.planned_time, notes: a.notes, is_completed: a.is_completed,
        _channelName: a.channels?.name, _channelAddress: a.channels?.address,
        _kamName: selectedKam === 'all' ? a.profiles?.full_name : null,
      });
    });

    // Completed visits (not from planned)
    completedVisits.filter(v => isSameDay(new Date(v.checkin_at), day)).forEach(v => {
      if (!events.some(e => e._source === 'planned_visit' && e._type === 'visit' && e._channelName === v.channels?.name)) {
        events.push({
          _type: 'visit', _source: 'completed_visit', _sourceId: v.id,
          planned_time: new Date(v.checkin_at).toTimeString().slice(0, 8),
          is_completed: true, _channelName: v.channels?.name,
          _kamName: selectedKam === 'all' ? v.profiles?.full_name : null,
        });
      }
    });

    return events.sort((a, b) => (a.planned_time || '').localeCompare(b.planned_time || ''));
  }

  function getDayCount(day) {
    return getDayEvents(day).length;
  }

  function getDayDots(day) {
    const events = getDayEvents(day);
    const types = [...new Set(events.map(e => e._type))];
    return types.slice(0, 4).map(t => TYPE_CONFIG[t]?.color || '#8b90a0');
  }

  function prevWeek() { setCurrentWeekStart(addDays(currentWeekStart, -7)); }
  function nextWeek() { setCurrentWeekStart(addDays(currentWeekStart, 7)); }
  function goToday() { setCurrentWeekStart(getMonday(new Date())); setSelectedDay(new Date()); }

  const weekLabel = `${currentWeekStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} — ${addDays(currentWeekStart, 6).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const dayEvents = getDayEvents(selectedDay);
  const totalPlanned = plannedVisits.length + plannedActions.filter(a => !a.is_completed).length;
  const totalCompleted = completedVisits.length + plannedActions.filter(a => a.is_completed).length;
const visibleChannels = channels.filter(ch => {
  if (dateType === 'activity_change') {
    return activityChannelIds.has(ch.id);
  }
  return true;
});
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Agenda</h1>
          <p className="text-xs text-text-secondary">{weekLabel}</p>
        </div>
       <div className="flex items-center gap-2">
        <select
  value={dateType}
  onChange={(e) => setDateType(e.target.value)}
  className="h-9 px-3 rounded-lg border border-surface-3 bg-surface-0 text-sm"
>
  <option value="creation">Creación</option>
  <option value="activity_change">Cambios de actividad</option>
</select>
        <button onClick={() => setShowNewModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold rounded-lg transition-colors">
          <Plus size={14} /> Planificar
        </button>
      </div>

      {/* Selector de KAM (solo para coordinadores+) */}
      {isManager && teamKams.length > 0 && (
        <KamSelector kams={teamKams} selected={selectedKam} onChange={setSelectedKam} />
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(TYPE_CONFIG).filter(([k]) => k !== 'other').map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
            <span className="text-[9px] text-text-muted">{cfg.label}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1 p-1 bg-surface-2 border border-surface-3 rounded-xl">
        <button onClick={() => setViewMode('day')}
          className={`py-2 rounded-lg text-xs font-semibold transition-colors ${viewMode === 'day' ? 'bg-white text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}>
          Día
        </button>
        <button onClick={() => setViewMode('week')}
          className={`py-2 rounded-lg text-xs font-semibold transition-colors ${viewMode === 'week' ? 'bg-white text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}>
          Semana
        </button>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={prevWeek} className="p-2 rounded-lg hover:bg-surface-2 text-text-secondary transition-colors"><ChevronLeft size={18} /></button>
        <button onClick={goToday} className="text-xs font-semibold text-brand-400 px-3 py-1.5 rounded-lg hover:bg-brand-500/10 transition-colors">Hoy</button>
        <button onClick={nextWeek} className="p-2 rounded-lg hover:bg-surface-2 text-text-secondary transition-colors"><ChevronRight size={18} /></button>
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-7 gap-1.5">
        {weekDays.map((day, i) => {
          const isToday = isSameDay(day, today);
          const isSelected = isSameDay(day, selectedDay);
          const dots = getDayDots(day);
          const isPast = day < today && !isToday;
          return (
            <button key={i} onClick={() => setSelectedDay(new Date(day))}
              className={`flex flex-col items-center py-2.5 px-1 rounded-xl transition-all ${
                isSelected ? 'bg-brand-500/20 border border-brand-500/40'
                : isToday ? 'bg-surface-2 border border-surface-4'
                : 'border border-transparent hover:bg-surface-1'
              }`}>
              <span className={`text-[10px] font-semibold ${isSelected ? 'text-brand-400' : 'text-text-muted'}`}>{DAY_NAMES[i]}</span>
              <span className={`text-lg font-extrabold mt-0.5 ${
                isSelected ? 'text-brand-400' : isToday ? 'text-text-primary' : isPast ? 'text-text-muted' : 'text-text-primary'
              }`}>{day.getDate()}</span>
              {dots.length > 0 && (
                <div className="flex gap-0.5 mt-1">
                  {dots.map((color, j) => <div key={j} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />)}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Detalle diario o semanal */}
      {viewMode === 'day' ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold">
              {isSameDay(selectedDay, today) ? 'Hoy' : selectedDay.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h2>
            <span className="text-[11px] text-text-secondary">{dayEvents.length} acciones</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 size={20} className="animate-spin text-brand-400" /></div>
          ) : dayEvents.length === 0 ? (
            <div className="text-center py-10 bg-surface-1 border border-surface-3 rounded-xl">
              <CalendarDays size={28} className="mx-auto mb-2 text-text-muted" />
              <p className="text-sm text-text-secondary">Sin acciones para este día</p>
              <button onClick={() => setShowNewModal(true)}
                className="mt-3 text-xs font-semibold text-blue-500 hover:text-blue-400 transition-colors">+ Planificar acción</button>
            </div>
          ) : (
            <div className="space-y-2">
              {dayEvents.map(event => (
                <EventCard key={`${event._source}-${event._sourceId}`} event={event}
                  onDelete={handleDeleteEvent} onComplete={handleCompleteEvent} />
              ))}
              <button onClick={() => setShowNewModal(true)}
                className="w-full py-2.5 border border-dashed border-surface-3 hover:border-blue-300 hover:bg-blue-50/50 rounded-xl text-xs font-semibold text-text-muted hover:text-blue-500 transition-colors">
                + Planificar otra acción
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={20} className="animate-spin text-brand-400" />
            </div>
          ) : (
            weekDays.map((day) => {
              const events = getDayEvents(day);
              const isToday = isSameDay(day, today);
              return (
                <section key={formatDateKey(day)} className="bg-surface-1 border border-surface-3 rounded-xl overflow-hidden">
                  <button
                    onClick={() => { setSelectedDay(new Date(day)); setViewMode('day'); }}
                    className="w-full flex items-center justify-between px-4 py-3 bg-surface-2 hover:bg-surface-3 transition-colors"
                  >
                    <div className="text-left">
                      <h2 className={`text-sm font-bold ${isToday ? 'text-brand-500' : 'text-text-primary'}`}>
                        {isToday ? 'Hoy' : day.toLocaleDateString('es-ES', { weekday: 'long' })}
                      </h2>
                      <p className="text-[10px] text-text-muted">
                        {day.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
                      </p>
                    </div>
                    <span className="text-[11px] text-text-secondary">{events.length} acciones</span>
                  </button>

                  <div className="p-3">
                    {events.length === 0 ? (
                      <p className="py-4 text-center text-xs text-text-muted">Sin acciones</p>
                    ) : (
                      <div className="space-y-2">
                        {events.map(event => (
                          <EventCard key={`${event._source}-${event._sourceId}`} event={event}
                            onDelete={handleDeleteEvent} onComplete={handleCompleteEvent} />
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              );
            })
          )}
        </div>
      )}

      {/* Weekly summary */}
      <div className="bg-surface-1 border border-surface-3 rounded-xl p-4">
        <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">Resumen semanal</h3>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div><div className="text-lg font-extrabold text-blue-400">{totalPlanned}</div><div className="text-[9px] text-text-muted uppercase tracking-wider">Planificadas</div></div>
          <div><div className="text-lg font-extrabold text-green-400">{totalCompleted}</div><div className="text-[9px] text-text-muted uppercase tracking-wider">Completadas</div></div>
          <div><div className="text-lg font-extrabold text-amber-400">{Math.max(0, totalPlanned - plannedVisits.filter(v => v.is_completed).length)}</div><div className="text-[9px] text-text-muted uppercase tracking-wider">Pendientes</div></div>
        </div>
      </div>

      {showNewModal && (
        <NewPlannedActionModal date={selectedDay} channels={channels} onSave={handleSavePlanned} onClose={() => setShowNewModal(false)} />
      )}

      {toast && (
        <div className={`fixed bottom-24 left-4 right-4 sm:left-auto sm:right-4 sm:w-72 px-4 py-3 rounded-xl text-center text-sm font-bold shadow-xl z-50 ${
          toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>{toast.message}</div>
      )}
    </div>
  );
}
