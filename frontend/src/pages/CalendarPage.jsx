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

function getSummaryPeriodRange(period, weekStart, customFrom, customTo) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (period === 'week') return { start: new Date(weekStart), end: addDays(weekStart, 7) };
  if (period === 'month') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
  if (period === 'quarter') {
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    return { start: new Date(now.getFullYear(), quarterMonth, 1), end: new Date(now.getFullYear(), quarterMonth + 3, 1) };
  }
  if (period === 'year') return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear() + 1, 0, 1) };
  if (period === 'custom') {
    if (!customFrom || !customTo) return null;
    return { start: new Date(`${customFrom}T00:00:00`), end: addDays(new Date(`${customTo}T00:00:00`), 1) };
  }
  return { start: null, end: null };
}
const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const TYPE_CONFIG = {
  visit: { label: 'Visita', icon: MapPin, color: '#E87A1E', bg: '#FEF3E8', borderColor: '#E87A1E' },
  call: { label: 'Llamada', icon: Phone, color: '#3b82f6', bg: '#eff6ff', borderColor: '#3b82f6' },
  email: { label: 'Email', icon: Mail, color: '#8b5cf6', bg: '#f3eeff', borderColor: '#8b5cf6' },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, color: '#16a34a', bg: '#e6f5ed', borderColor: '#16a34a' },
  meeting: { label: 'Reunión', icon: Users, color: '#E87A1E', bg: '#FEF3E8', borderColor: '#E87A1E' },
  linkedin: { label: 'LinkedIn', icon: Linkedin, color: '#0077b5', bg: '#e8f4fd', borderColor: '#0077b5' },
  follow_up: { label: 'Seguimiento', icon: Clock, color: '#0f766e', bg: '#ecfdf5', borderColor: '#0f766e' },
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

const COMPLETION_RESULTS = [
  { value: 'connected', label: 'Contactado' },
  { value: 'no_answer', label: 'No contesta' },
  { value: 'callback', label: 'Volver a contactar' },
  { value: 'positive', label: 'Resultado positivo' },
  { value: 'neutral', label: 'Resultado neutral' },
  { value: 'negative', label: 'Resultado negativo' },
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

// ============ SMART COMPLETION MODAL ============
function CompleteActionModal({ event, onSave, onClose }) {
  const [result, setResult] = useState('');
  const [notes, setNotes] = useState('');
  const [addNextAction, setAddNextAction] = useState(false);
  const [nextType, setNextType] = useState(event?._type || 'call');
  const [nextDate, setNextDate] = useState('');
  const [nextTime, setNextTime] = useState('09:00');
  const [nextNotes, setNextNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const fieldClass = 'w-full px-3 py-2.5 bg-surface-0 border border-surface-3 rounded-xl text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-500 transition-colors';

  async function handleSave() {
    if (!result || (addNextAction && !nextDate)) return;
    setSaving(true);
    try {
      await onSave({
        result,
        notes: notes.trim(),
        nextAction: addNextAction ? {
          interaction_type: nextType,
          planned_date: nextDate,
          planned_time: `${nextTime}:00`,
          notes: nextNotes.trim() || null,
        } : null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/35 backdrop-blur-[1px] z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-surface-1 border border-surface-3 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-surface-3">
          <div>
            <h3 className="font-bold text-sm">Completar acción</h3>
            <p className="text-xs text-text-secondary">{event?._channelName} · {TYPE_CONFIG[event?._type]?.label || 'Acción'}</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5">Resultado *</label>
            <div className="grid grid-cols-2 gap-2">
              {COMPLETION_RESULTS.map(option => (
                <button key={option.value} type="button" onClick={() => setResult(option.value)}
                  className={`px-3 py-2.5 rounded-xl border text-xs font-semibold text-left transition-colors ${
                    result === option.value
                      ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                      : 'border-surface-3 bg-surface-0 text-text-secondary hover:border-surface-4'
                  }`}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Nota <span className="normal-case font-normal">(opcional)</span></label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Añade solo la información que aporte contexto"
              className={`${fieldClass} resize-none`} />
          </div>

          <div className="border border-surface-3 rounded-xl overflow-hidden">
            <label className="flex items-center gap-3 px-3 py-3 cursor-pointer bg-surface-0">
              <input type="checkbox" checked={addNextAction} onChange={(e) => setAddNextAction(e.target.checked)}
                className="w-4 h-4 accent-brand-500" />
              <span className="flex-1">
                <span className="block text-xs font-bold text-text-primary">Planificar siguiente acción</span>
                <span className="block text-[10px] text-text-muted">Opcional; se añadirá directamente a la agenda</span>
              </span>
            </label>

            {addNextAction && (
              <div className="p-3 border-t border-surface-3 space-y-3 bg-surface-1">
                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Tipo</label>
                  <select value={nextType} onChange={(e) => setNextType(e.target.value)} className={fieldClass}>
                    {ACTION_TYPES.filter(type => type.key !== 'visit').map(type => (
                      <option key={type.key} value={type.key}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Fecha *</label>
                    <input type="date" value={nextDate} min={formatDateKey(new Date())}
                      onChange={(e) => setNextDate(e.target.value)} className={fieldClass} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Hora</label>
                    <input type="time" value={nextTime} onChange={(e) => setNextTime(e.target.value)} className={fieldClass} />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Objetivo <span className="normal-case font-normal">(opcional)</span></label>
                  <input value={nextNotes} onChange={(e) => setNextNotes(e.target.value)}
                    placeholder="¿Qué hay que conseguir?" className={fieldClass} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-surface-3">
          <button onClick={handleSave} disabled={!result || saving || (addNextAction && !nextDate)}
            className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Guardar y completar
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ RESCHEDULE MODAL ============
function RescheduleActionModal({ event, onSave, onClose }) {
  const [date, setDate] = useState(event?.planned_date || formatDateKey(new Date()));
  const [time, setTime] = useState(event?.planned_time?.slice(0, 5) || '09:00');
  const [notes, setNotes] = useState(event?.notes || '');
  const [saving, setSaving] = useState(false);
  const fieldClass = 'w-full px-3 py-2.5 bg-surface-0 border border-surface-3 rounded-xl text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-500 transition-colors';

  async function handleSave() {
    if (!date) return;
    setSaving(true);
    try {
      await onSave({
        planned_date: date,
        planned_time: `${time}:00`,
        notes: notes.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/35 backdrop-blur-[1px] z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-surface-1 border border-surface-3 rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-surface-3">
          <div>
            <h3 className="font-bold text-sm">Reprogramar acción</h3>
            <p className="text-xs text-text-secondary">{event?._channelName} · {TYPE_CONFIG[event?._type]?.label || 'Acción'}</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={20} /></button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Nueva fecha *</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Hora</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={fieldClass} />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Objetivo</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="¿Qué hay que conseguir?" className={`${fieldClass} resize-none`} />
          </div>
          <p className="text-[10px] text-text-muted">Se actualizará esta acción; no se creará ningún registro nuevo.</p>
        </div>

        <div className="p-4 border-t border-surface-3">
          <button onClick={handleSave} disabled={!date || saving}
            className="w-full py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Clock size={16} />}
            Guardar nueva fecha
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ EVENT CARD ============
function EventCard({ event, onDelete, onComplete, onReschedule, canModify }) {
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
        <div className={`text-sm font-semibold truncate ${isCompleted ? 'text-text-primary' : ''}`}>
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
        ) : canModify ? (
          <>
            <button onClick={(e) => { e.stopPropagation(); onReschedule?.(event); }}
              className="px-2 py-1.5 bg-surface-1 hover:bg-surface-2 text-text-secondary border border-surface-3 rounded-lg text-[10px] font-semibold transition-colors flex items-center gap-1">
              <Clock size={11} /> <span className="hidden sm:inline">Reprogramar</span>
            </button>
            {event._type !== 'visit' && (
              <button onClick={(e) => { e.stopPropagation(); onComplete?.(event); }}
                className="px-2.5 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg text-[10px] font-bold transition-colors">Completar</button>
            )}
            <button onClick={(e) => { e.stopPropagation(); onDelete?.(event); }}
              className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted hover:text-red-400 transition-colors"><X size={14} /></button>
          </>
        ) : (
          <span className="text-[9px] font-semibold px-2 py-1 rounded-lg bg-surface-2 text-text-muted">
            Solo lectura
          </span>
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

function SummaryKamMultiSelect({ kams, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectedNames = kams.filter(kam => selected.includes(kam.id)).map(kam => kam.full_name);
  const label = selected.length === 0
    ? 'Todo el equipo'
    : selected.length === 1
      ? selectedNames[0]
      : `${selected.length} KAMs seleccionados`;

  function toggle(id) {
    onChange(selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id]);
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className="h-9 min-w-44 px-3 rounded-lg border border-surface-3 bg-surface-0 text-xs font-semibold text-text-primary flex items-center justify-between gap-2">
        <span className="truncate">{label}</span><ChevronDown size={13} className="text-text-muted flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 max-h-72 overflow-y-auto rounded-xl border border-surface-3 bg-white shadow-xl z-30 p-1.5">
          <button type="button" onClick={() => onChange([])}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-surface-1 text-left">
            <span className={`w-4 h-4 rounded border flex items-center justify-center ${selected.length === 0 ? 'bg-brand-500 border-brand-500 text-white' : 'border-surface-4'}`}>
              {selected.length === 0 && <Check size={11} />}
            </span>
            <span className="text-xs font-semibold">Todo el equipo</span>
          </button>
          <div className="h-px bg-surface-3 my-1" />
          {kams.map(kam => {
            const checked = selected.includes(kam.id);
            return (
              <button key={kam.id} type="button" onClick={() => toggle(kam.id)}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-surface-1 text-left">
                <span className={`w-4 h-4 rounded border flex items-center justify-center ${checked ? 'bg-brand-500 border-brand-500 text-white' : 'border-surface-4'}`}>
                  {checked && <Check size={11} />}
                </span>
                <span className="text-xs text-text-primary truncate">{kam.full_name}</span>
              </button>
            );
          })}
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
  const [overdueEvents, setOverdueEvents] = useState([]);
  const [priorityCounts, setPriorityCounts] = useState({ overdue: 0, today: 0, upcoming: 0 });
  const [channels, setChannels] = useState([]);
  const [activityChannelIds, setActivityChannelIds] = useState(new Set());
  const [dateType, setDateType] = useState('creation');
  const [showNewModal, setShowNewModal] = useState(false);
  const [eventToComplete, setEventToComplete] = useState(null);
  const [eventToReschedule, setEventToReschedule] = useState(null);
  const [toast, setToast] = useState(null);
  const [selectedKam, setSelectedKam] = useState('all');
  const [teamKams, setTeamKams] = useState([]);
  const [viewMode, setViewMode] = useState('day');
  const [onlyPending, setOnlyPending] = useState(false);
  const [summaryPeriod, setSummaryPeriod] = useState('week');
  const [summaryFrom, setSummaryFrom] = useState('');
  const [summaryTo, setSummaryTo] = useState('');
  const [summaryRows, setSummaryRows] = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryKamIds, setSummaryKamIds] = useState([]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));

  useEffect(() => { if (user) { loadWeekData(); loadChannels(); if (isManager) loadTeamKams(); } }, [user, currentWeekStart, selectedKam]);
  useEffect(() => {
    if (user) loadActivitySummary();
  }, [user, summaryKamIds.join(','), summaryPeriod, summaryFrom, summaryTo, currentWeekStart, teamKams.length]);
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

  async function loadActivitySummary() {
    const range = getSummaryPeriodRange(summaryPeriod, currentWeekStart, summaryFrom, summaryTo);
    if (!range) {
      setSummaryRows([]);
      return;
    }
    setSummaryLoading(true);
    try {
      let activityQuery = supabase.from('channel_activity_feed')
        .select('user_id, activity_type, status, scheduled_date')
        .not('scheduled_date', 'is', null);

      if (range.start && range.end) {
        const from = formatDateKey(range.start);
        const to = formatDateKey(range.end);
        activityQuery = activityQuery.gte('scheduled_date', from).lt('scheduled_date', to);
      }

      if (isManager && summaryKamIds.length > 0) {
        activityQuery = activityQuery.in('user_id', summaryKamIds);
      } else if (!isManager) {
        activityQuery = activityQuery.eq('user_id', user.id);
      }

      const { data: activityData, error: activityError } = await activityQuery;
      if (activityError) throw activityError;

      const rows = new Map();
      const ensureRow = (id, name) => {
        if (!rows.has(id)) rows.set(id, {
          id, name: name || 'KAM', planned: 0, completed: 0, pending: 0, overdue: 0,
          types: { visit: 0, call: 0, meeting: 0, email: 0, whatsapp: 0, linkedin: 0, other: 0 },
        });
        return rows.get(id);
      };

      if (isManager) {
        teamKams.filter(kam => summaryKamIds.length === 0 || summaryKamIds.includes(kam.id))
          .forEach(kam => ensureRow(kam.id, kam.full_name));
      } else {
        const targetId = user.id;
        const target = teamKams.find(kam => kam.id === targetId);
        ensureRow(targetId, target?.full_name || profile?.full_name);
      }

      const register = (id, type, status) => {
        const kam = teamKams.find(item => item.id === id);
        const row = ensureRow(id, kam?.full_name || (id === user.id ? profile?.full_name : 'KAM'));
        row.planned += 1;
        row.types[type] = (row.types[type] || 0) + 1;
        if (status === 'completed') row.completed += 1;
        else {
          row.pending += 1;
          if (status === 'overdue') row.overdue += 1;
        }
      };

      (activityData || []).forEach(item => register(item.user_id, item.activity_type || 'other', item.status));

      setSummaryRows([...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')));
    } catch (err) {
      console.error('Error cargando resumen de actividad:', err);
      setSummaryRows([]);
    } finally {
      setSummaryLoading(false);
    }
  }

  async function loadWeekData() {
    setLoading(true);
    try {
      const weekEnd = addDays(currentWeekStart, 7);
      const startStr = formatDateKey(currentWeekStart);
      const endStr = formatDateKey(weekEnd);

      const todayKey = formatDateKey(new Date());
      let activityQuery = supabase.from('channel_activity_feed')
        .select('*').gte('scheduled_date', startStr).lt('scheduled_date', endStr)
        .order('scheduled_date').order('scheduled_time');
      if (selectedKam !== 'all') activityQuery = activityQuery.eq('user_id', selectedKam);
      else if (!isManager) activityQuery = activityQuery.eq('user_id', user.id);

      const { data: feedData, error: feedError } = await activityQuery;
      if (feedError) throw feedError;
      const feed = feedData || [];
      const channelIds = [...new Set(feed.map(item => item.channel_id).filter(Boolean))];
      const userIds = [...new Set(feed.map(item => item.user_id).filter(Boolean))];
      const [channelRes, profileRes] = await Promise.all([
        channelIds.length ? supabase.from('channels').select('id, name, address').in('id', channelIds) : Promise.resolve({ data: [] }),
        userIds.length ? supabase.from('profiles').select('id, full_name').in('id', userIds) : Promise.resolve({ data: [] }),
      ]);
      if (channelRes.error) throw channelRes.error;
      if (profileRes.error) throw profileRes.error;
      const channelMap = new Map((channelRes.data || []).map(item => [item.id, item]));
      const profileMap = new Map((profileRes.data || []).map(item => [item.id, item]));
      const enrich = item => ({
        ...item,
        id: item.source_id,
        planned_date: item.scheduled_date,
        planned_time: item.scheduled_time,
        interaction_type: item.activity_type,
        is_completed: item.status === 'completed',
        channels: channelMap.get(item.channel_id),
        profiles: profileMap.get(item.user_id),
        _feedSource: item.source_table === 'planned_visits' ? 'planned_visit'
          : item.source_table === 'visits' ? 'completed_visit'
            : item.source_table,
      });
      const enriched = feed.map(enrich);
      setPlannedVisits(enriched.filter(item => item.source_table === 'planned_visits'));
      setPlannedActions(enriched.filter(item => ['channel_interactions', 'visit_followup'].includes(item.source_table)));
      setCompletedVisits(enriched.filter(item => item.source_table === 'visits').map(item => ({
        ...item, checkin_at: item.occurred_at,
      })));
      const overdue = enriched.filter(item => item.status === 'overdue').map(item => ({
        _type: item.activity_type,
        _source: item._feedSource,
        _sourceId: item.source_id,
        _channelId: item.channel_id,
        _userId: item.user_id,
        planned_date: item.scheduled_date,
        planned_time: item.scheduled_time,
        notes: item.notes,
        is_completed: false,
        _channelName: item.channels?.name,
        _channelAddress: item.channels?.address,
        _kamName: selectedKam === 'all' ? item.profiles?.full_name : null,
      }));
      setOverdueEvents(overdue);
      setPriorityCounts({
        overdue: overdue.length,
        today: enriched.filter(item => item.scheduled_date === todayKey && !item.is_completed).length,
        upcoming: enriched.filter(item => item.scheduled_date > todayKey && !item.is_completed).length,
      });
      setActivityChannelIds(new Set(channelIds));
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
      if (event?._userId !== user.id) throw new Error('Solo el KAM responsable puede modificar esta actividad.');
      let deleteQuery;
      if (event._source === 'planned_visit') {
        deleteQuery = supabase.from('planned_visits').delete().eq('id', event._sourceId);
      } else if (event._source === 'visit_followup') {
        deleteQuery = supabase.from('visits').update({ next_action_date: null, next_steps: null }).eq('id', event._sourceId);
      } else {
        deleteQuery = supabase.from('channel_interactions').delete().eq('id', event._sourceId);
      }
      const { data, error } = await deleteQuery.select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('La actividad no se eliminó. Comprueba que te pertenece e inténtalo de nuevo.');
      await loadWeekData();
      setToast({ message: 'Eliminada', type: 'success' });
    } catch (err) {
      console.error(err);
      setToast({ message: 'Error: ' + err.message, type: 'error' });
    }
  }

  async function handleCompleteEvent(event) {
    if (event?._userId !== user.id) {
      setToast({ message: 'Solo el KAM responsable puede completar esta actividad.', type: 'error' });
      return;
    }
    setEventToComplete(event);
  }

  async function handleSaveCompletion({ result, notes, nextAction }) {
    const event = eventToComplete;
    if (!event) return;
    try {
      if (event._userId !== user.id) throw new Error('Solo el KAM responsable puede modificar esta actividad.');
      const completedNotes = [event.notes, notes].filter(Boolean).join('\n\nResultado: ');
      let completionQuery;
      if (event._source === 'planned_visit') {
        completionQuery = supabase.from('planned_visits').update({
          is_completed: true,
          notes: completedNotes || null,
        }).eq('id', event._sourceId);
      } else if (event._source === 'visit_followup') {
        completionQuery = supabase.from('visits').update({
          next_action_date: null,
          next_steps: null,
        }).eq('id', event._sourceId);
      } else {
        completionQuery = supabase.from('channel_interactions').update({
          is_completed: true,
          result,
          notes: completedNotes || null,
          created_at: new Date().toISOString(),
        }).eq('id', event._sourceId);
      }
      const { data: completedRows, error: completeError } = await completionQuery.select('id');
      if (completeError) throw completeError;
      if (!completedRows?.length) throw new Error('La actividad no se completó. Comprueba que te pertenece e inténtalo de nuevo.');

      if (nextAction) {
        const { error: nextError } = await supabase.from('channel_interactions').insert({
          channel_id: event._channelId,
          user_id: event._userId || user.id,
          interaction_type: nextAction.interaction_type,
          direction: 'outbound',
          planned_date: nextAction.planned_date,
          planned_time: nextAction.planned_time,
          notes: nextAction.notes,
          is_completed: false,
        });
        if (nextError) throw nextError;
      }

      setEventToComplete(null);
      await loadWeekData();
      setToast({ message: nextAction ? '✓ Completada y siguiente acción planificada' : '✓ Acción completada', type: 'success' });
    } catch (err) {
      console.error(err);
      setToast({ message: 'Error: ' + err.message, type: 'error' });
    }
  }

  async function handleSaveReschedule(changes) {
    const event = eventToReschedule;
    if (!event) return;
    try {
      if (event._userId !== user.id) throw new Error('Solo el KAM responsable puede modificar esta actividad.');
      let updateQuery;
      if (event._source === 'visit_followup') {
        updateQuery = supabase.from('visits').update({
          next_action_date: changes.planned_date,
          next_steps: changes.notes,
        }).eq('id', event._sourceId);
      } else {
        const table = event._source === 'planned_visit' ? 'planned_visits' : 'channel_interactions';
        updateQuery = supabase.from(table).update(changes).eq('id', event._sourceId);
      }
      const { data: updatedRows, error } = await updateQuery.select('id');
      if (error) throw error;
      if (!updatedRows?.length) throw new Error('La actividad no se reprogramó. Comprueba que te pertenece e inténtalo de nuevo.');
      setEventToReschedule(null);
      await loadWeekData();
      setToast({ message: '✓ Acción reprogramada', type: 'success' });
    } catch (err) {
      console.error(err);
      setToast({ message: 'Error: ' + err.message, type: 'error' });
    }
  }

  // Merge all events for a given day
  function getDayEvents(day) {
    const key = formatDateKey(day);
    const events = [];

    // Planned visits
    plannedVisits.filter(v => v.planned_date === key).forEach(v => {
      events.push({
        _type: 'visit', _source: 'planned_visit', _sourceId: v.id,
        _channelId: v.channel_id, _userId: v.user_id,
        planned_date: v.planned_date, planned_time: v.planned_time, notes: v.notes, is_completed: v.is_completed,
        _channelName: v.channels?.name, _channelAddress: v.channels?.address,
        _kamName: selectedKam === 'all' ? v.profiles?.full_name : null,
      });
    });

    // Planned actions (interactions)
    plannedActions.filter(a => a.planned_date === key).forEach(a => {
      events.push({
        _type: a.interaction_type, _source: a._feedSource || 'channel_interactions', _sourceId: a.id,
        _channelId: a.channel_id, _userId: a.user_id,
        planned_date: a.planned_date, planned_time: a.planned_time, notes: a.notes, is_completed: a.is_completed,
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

    return events
      .filter(event => !onlyPending || !event.is_completed)
      .sort((a, b) => (a.planned_time || '').localeCompare(b.planned_time || ''));
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
  const summaryTotals = summaryRows.reduce((total, row) => ({
    planned: total.planned + row.planned,
    completed: total.completed + row.completed,
    pending: total.pending + row.pending,
    overdue: total.overdue + row.overdue,
  }), { planned: 0, completed: 0, pending: 0, overdue: 0 });
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
      </div>

      {/* Selector de KAM (solo para coordinadores+) */}
      {isManager && teamKams.length > 0 && (
        <KamSelector kams={teamKams} selected={selectedKam} onChange={setSelectedKam} />
      )}

      {/* Automatic priority overview */}
      <div className="grid grid-cols-3 gap-2">
        <div className={`rounded-xl border px-3 py-3 ${priorityCounts.overdue > 0 ? 'bg-red-50 border-red-200' : 'bg-surface-1 border-surface-3'}`}>
          <div className={`text-xl font-extrabold ${priorityCounts.overdue > 0 ? 'text-red-600' : 'text-text-muted'}`}>{priorityCounts.overdue}</div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Vencidas</div>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3">
          <div className="text-xl font-extrabold text-blue-600">{priorityCounts.today}</div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Hoy</div>
        </div>
        <div className="rounded-xl border border-surface-3 bg-surface-1 px-3 py-3">
          <div className="text-xl font-extrabold text-text-primary">{priorityCounts.upcoming}</div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Próximas</div>
        </div>
      </div>

      <div className="flex justify-end">
        <label className="inline-flex items-center gap-2 text-[11px] text-text-secondary cursor-pointer select-none">
          <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)}
            className="w-3.5 h-3.5 accent-brand-500" />
          Solo pendientes
        </label>
      </div>

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

      {/* Overdue actions always stay visible before the selected day */}
      {overdueEvents.length > 0 && (
        <section className="bg-red-50/70 border border-red-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-red-200">
            <div>
              <h2 className="text-sm font-bold text-red-700">Acciones vencidas</h2>
              <p className="text-[10px] text-red-500">Pendientes de la semana seleccionada</p>
            </div>
            <span className="min-w-6 h-6 px-2 rounded-full bg-red-100 text-red-700 text-xs font-bold flex items-center justify-center">{overdueEvents.length}</span>
          </div>
          <div className="p-3 space-y-2">
            {overdueEvents.map(event => (
              <div key={`${event._source}-${event._sourceId}`}>
                <div className="mb-1 pl-1 text-[9px] font-bold uppercase tracking-wider text-red-500">
                  {new Date(`${event.planned_date}T00:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                </div>
                <EventCard event={event} onDelete={handleDeleteEvent} onComplete={handleCompleteEvent}
                  onReschedule={setEventToReschedule} canModify={event._userId === user.id} />
              </div>
            ))}
          </div>
        </section>
      )}

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
                  onDelete={handleDeleteEvent} onComplete={handleCompleteEvent} onReschedule={setEventToReschedule}
                  canModify={event._userId === user.id} />
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
                            onDelete={handleDeleteEvent} onComplete={handleCompleteEvent} onReschedule={setEventToReschedule}
                            canModify={event._userId === user.id} />
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

      {/* Activity summary by user and period */}
      <section className="bg-surface-1 border border-surface-3 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-surface-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-text-primary">Resumen de actividad</h3>
              <p className="text-[10px] text-text-muted">
                {isManager && summaryKamIds.length === 0 ? 'Visión automática de todo el equipo' : isManager ? 'Actividad de los KAMs seleccionados' : 'Tu actividad registrada'}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              {isManager && (
                <SummaryKamMultiSelect kams={teamKams} selected={summaryKamIds} onChange={setSummaryKamIds} />
              )}
              <select value={summaryPeriod} onChange={(e) => setSummaryPeriod(e.target.value)}
                className="h-9 px-3 rounded-lg border border-surface-3 bg-surface-0 text-xs font-semibold text-text-primary">
                <option value="week">Semana seleccionada</option>
                <option value="month">Mes actual</option>
                <option value="quarter">Trimestre actual</option>
                <option value="year">Año actual</option>
                <option value="all">Acumulado</option>
                <option value="custom">Periodo personalizado</option>
              </select>
            </div>
          </div>

          {summaryPeriod === 'custom' && (
            <div className="grid grid-cols-2 gap-2 mt-3 max-w-md ml-auto">
              <div>
                <label className="block text-[9px] font-bold uppercase text-text-muted mb-1">Desde</label>
                <input type="date" value={summaryFrom} onChange={(e) => setSummaryFrom(e.target.value)}
                  className="w-full h-9 px-2 rounded-lg border border-surface-3 bg-surface-0 text-xs" />
              </div>
              <div>
                <label className="block text-[9px] font-bold uppercase text-text-muted mb-1">Hasta</label>
                <input type="date" value={summaryTo} min={summaryFrom || undefined} onChange={(e) => setSummaryTo(e.target.value)}
                  className="w-full h-9 px-2 rounded-lg border border-surface-3 bg-surface-0 text-xs" />
              </div>
            </div>
          )}
        </div>

        {summaryLoading ? (
          <div className="flex items-center justify-center py-10"><Loader2 size={20} className="animate-spin text-brand-400" /></div>
        ) : summaryPeriod === 'custom' && (!summaryFrom || !summaryTo) ? (
          <p className="py-8 text-center text-xs text-text-muted">Selecciona las fechas para calcular el resumen.</p>
        ) : (
          <>
            <div className="grid grid-cols-5 divide-x divide-surface-3 border-b border-surface-3 bg-surface-0">
              <div className="px-2 py-3 text-center"><div className="text-lg font-extrabold text-blue-600">{summaryTotals.planned}</div><div className="text-[8px] font-bold uppercase text-text-muted">Planificadas</div></div>
              <div className="px-2 py-3 text-center"><div className="text-lg font-extrabold text-green-600">{summaryTotals.completed}</div><div className="text-[8px] font-bold uppercase text-text-muted">Realizadas</div></div>
              <div className="px-2 py-3 text-center"><div className="text-lg font-extrabold text-amber-600">{summaryTotals.pending}</div><div className="text-[8px] font-bold uppercase text-text-muted">Pendientes</div></div>
              <div className="px-2 py-3 text-center"><div className="text-lg font-extrabold text-red-600">{summaryTotals.overdue}</div><div className="text-[8px] font-bold uppercase text-text-muted">Vencidas</div></div>
              <div className="px-2 py-3 text-center"><div className="text-lg font-extrabold text-text-primary">{summaryTotals.planned ? Math.round((summaryTotals.completed / summaryTotals.planned) * 100) : 0}%</div><div className="text-[8px] font-bold uppercase text-text-muted">Ejecución</div></div>
            </div>

            <div className="divide-y divide-surface-3">
              {summaryRows.map(row => (
                <button key={row.id} type="button"
                  onClick={() => { if (isManager) setSelectedKam(row.id); }}
                  className={`w-full px-4 py-3 text-left ${isManager ? 'hover:bg-surface-0 cursor-pointer' : 'cursor-default'} transition-colors`}>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <div className="sm:w-40 min-w-0">
                      <div className="text-xs font-bold text-text-primary truncate">{row.name}</div>
                      <div className="text-[9px] text-text-muted">{row.planned ? Math.round((row.completed / row.planned) * 100) : 0}% ejecutado</div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 flex-1 text-center">
                      <div><span className="text-xs font-bold text-blue-600">{row.planned}</span><span className="block text-[8px] text-text-muted">Planif.</span></div>
                      <div><span className="text-xs font-bold text-green-600">{row.completed}</span><span className="block text-[8px] text-text-muted">Realiz.</span></div>
                      <div><span className="text-xs font-bold text-amber-600">{row.pending}</span><span className="block text-[8px] text-text-muted">Pend.</span></div>
                      <div><span className="text-xs font-bold text-red-600">{row.overdue}</span><span className="block text-[8px] text-text-muted">Venc.</span></div>
                    </div>
                    <div className="flex flex-wrap gap-1 sm:w-64 sm:justify-end">
                      {Object.entries(row.types).filter(([, count]) => count > 0).map(([type, count]) => (
                        <span key={type} className="px-1.5 py-0.5 rounded-md text-[8px] font-semibold"
                          style={{ color: TYPE_CONFIG[type]?.color || TYPE_CONFIG.other.color, background: TYPE_CONFIG[type]?.bg || TYPE_CONFIG.other.bg }}>
                          {TYPE_CONFIG[type]?.label || 'Otro'} {count}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              ))}
              {summaryRows.length === 0 && <p className="py-8 text-center text-xs text-text-muted">Sin acciones en este periodo.</p>}
            </div>
          </>
        )}
      </section>

      {showNewModal && (
        <NewPlannedActionModal date={selectedDay} channels={channels} onSave={handleSavePlanned} onClose={() => setShowNewModal(false)} />
      )}

      {eventToComplete && (
        <CompleteActionModal event={eventToComplete} onSave={handleSaveCompletion} onClose={() => setEventToComplete(null)} />
      )}

      {eventToReschedule && (
        <RescheduleActionModal event={eventToReschedule} onSave={handleSaveReschedule} onClose={() => setEventToReschedule(null)} />
      )}

      {toast && (
        <div className={`fixed bottom-24 left-4 right-4 sm:left-auto sm:right-4 sm:w-72 px-4 py-3 rounded-xl text-center text-sm font-bold shadow-xl z-50 ${
          toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>{toast.message}</div>
      )}
    </div>
  );
}
