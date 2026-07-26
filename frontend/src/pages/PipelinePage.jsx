import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../components/AuthProvider';
import { useChannelTypes } from '../hooks/useChannelTypes';
import { formatVolume, getVolumeConfig, VOLUME_UNITS } from '../components/VolumeEditor';
import { PIPELINE_CONFIG, STATUS_CONFIG, STATUS_LIST, stageToStatus } from '../lib/crmConstants';
import {
  Loader2, ChevronRight, ChevronDown, X, Check, Filter,
  Calendar, Users, TrendingUp, Clock, Building2
} from 'lucide-react';

// Las columnas del Kanban representan ESTADOS (igual que en la pantalla de
// El Kanban se organiza por status (no por pipeline_stage). Los colores y labels
// vienen de STATUS_LIST (importado de crmConstants — fuente de verdad única).
// STATUS_TO_DEFAULT_STAGE es el mapeo inverso: al mover una tarjeta a una columna
// de ESTADO, qué pipeline_stage le asignamos por defecto.
const STATUS_TO_DEFAULT_STAGE = {
  pendiente_contacto: 'lead',
  en_desarrollo:       'first_contact',
  en_evaluacion:        'first_contact', // sin fase dedicada propia; se asimila a "en desarrollo"
  en_proceso_alta:     'onboarding',
  activo:              'active',
  rechazado:           'closed_no_deal',
  cierre_sin_acuerdo:  'closed_no_deal',
};

function daysSince(dateStr) {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function getDateRange(period) {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  let start = new Date();
  start.setHours(0, 0, 0, 0);

  if (period === 'week') {
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
  } else if (period === 'month') {
    start.setDate(1);
  } else if (period === 'quarter') {
    const q = Math.floor(start.getMonth() / 3) * 3;
    start.setMonth(q, 1);
  }
  return { start, end: now };
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

// ============ CHANNEL CARD ============
function ChannelCard({ channel, onDragStart, stage, onClick, typeMap, showKam, dateType, classifications }) {
  const daysInStage = daysSince(channel.pipeline_stage_changed_at || channel.updated_at);
  const lastVisitDays = channel.last_visit_at ? daysSince(channel.last_visit_at) : null;
  const isDragging = useRef(false);
  const classLabel = (classifications || []).map(c => c.canal_corto).join(', ');

  return (
    <div draggable
      onDragStart={(e) => { isDragging.current = true; e.dataTransfer.setData('text/plain', channel.id); e.dataTransfer.effectAllowed = 'move'; onDragStart(channel.id); }}
      onDragEnd={() => { isDragging.current = false; }}
      onClick={() => { if (!isDragging.current) onClick(channel.id); }}
      className="bg-[#ffffff] border rounded-xl p-2.5 cursor-pointer active:cursor-grabbing hover:shadow-md hover:border-opacity-80 transition-all group"
      style={{ borderColor: stage.border }}>
      <div className="flex items-start justify-between gap-1.5 mb-1">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold truncate group-hover:text-[#E87A1E] transition-colors">{channel.name}</div>
          <div className="text-[9px] text-[#5a6078] truncate">{classLabel || 'Sin clasificación'}</div>
        </div>
        <ChevronRight size={11} className="text-[#c5cbd6] group-hover:text-[#E87A1E] transition-colors flex-shrink-0 mt-0.5" />
      </div>

      {showKam && channel.profiles?.full_name && (
        <div className="text-[10px] text-[#E87A1E] font-medium mb-1">{channel.profiles.full_name}</div>
      )}

      <div className="text-[9px] text-[#8b90a0] mb-1">
        {dateType === 'creation'
          ? `Creado: ${formatShortDate(channel.created_at)}`
          : `→ ${formatShortDate(channel.pipeline_stage_changed_at || channel.updated_at)}`}
      </div>

      {channel.volume_amount != null && channel.volume_unit && (
        <div className="mb-1">
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
            style={{ background: getVolumeConfig(channel.volume_unit).bg, color: getVolumeConfig(channel.volume_unit).color }}>
            {formatVolume(channel.volume_amount, channel.volume_unit)} {getVolumeConfig(channel.volume_unit).unit}
          </span>
        </div>
      )}

      {/* Potencial CAES / Energía si existen */}
      {(channel.potencial_caes || channel.potencial_energia) && (
        <div className="flex gap-1 mb-1">
          {channel.potencial_caes && (
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400">
              CAES: {channel.potencial_caes}
            </span>
          )}
          {channel.potencial_energia && (
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">
              E: {channel.potencial_energia}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {daysInStage !== null && (
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
              daysInStage > 14 ? 'bg-red-500/20 text-red-400' :
              daysInStage > 7  ? 'bg-amber-500/20 text-amber-400' :
              'bg-[#dde1e8] text-[#5a6078]'
            }`}>{daysInStage}d en fase</span>
          )}
        </div>
        {lastVisitDays !== null && (
          <span className={`text-[9px] font-semibold ${
            lastVisitDays > 10 ? 'text-red-400' : lastVisitDays > 5 ? 'text-amber-400' : 'text-[#8b90a0]'
          }`}>Visita: {lastVisitDays}d</span>
        )}
      </div>
    </div>
  );
}

// ============ PIPELINE COLUMN ============
function PipelineColumn({ stage, channels, onDrop, onDragStart, dragOver, setDragOver, onChannelClick, typeMap, showKam, dateType, classificationsByChannel }) {
  const isOver = dragOver === stage.key;

  const volTotals = {};
  channels.forEach(ch => {
    if (ch.volume_amount != null && ch.volume_unit) {
      if (!volTotals[ch.volume_unit]) volTotals[ch.volume_unit] = 0;
      volTotals[ch.volume_unit] += parseFloat(ch.volume_amount);
    }
  });
  const hasVolumes = Object.keys(volTotals).length > 0;

  return (
    <div className="flex flex-col min-w-[110px] flex-1"
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(stage.key); }}
      onDragLeave={() => setDragOver(null)}
      onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); onDrop(id, stage.key); setDragOver(null); }}>
      <div className="flex items-center gap-2 mb-1 px-1 min-w-0">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
        <span className="text-[11px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ color: stage.color }}>{stage.label}</span>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#dde1e8] text-[#5a6078] flex-shrink-0">{channels.length}</span>
      </div>
      {hasVolumes && (
        <div className="flex flex-wrap gap-1 px-1 mb-2">
          {Object.entries(volTotals).map(([unitKey, total]) => {
            const cfg = getVolumeConfig(unitKey);
            return (
              <span key={unitKey} className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: cfg.bg, color: cfg.color }}>
                {formatVolume(total, unitKey)} {cfg.unit}
              </span>
            );
          })}
        </div>
      )}
      <div className={`flex-1 space-y-2 p-1.5 rounded-xl min-h-[120px] transition-colors ${isOver ? 'bg-[#1a1a2e] ring-1' : 'bg-transparent'}`}
        style={isOver ? { ringColor: stage.color } : {}}>
        {channels.map(ch => (
          <ChannelCard key={ch.id} channel={ch} stage={stage} onDragStart={onDragStart}
            onClick={onChannelClick} typeMap={typeMap} showKam={showKam} dateType={dateType}
            classifications={classificationsByChannel?.[ch.id]} />
        ))}
        {channels.length === 0 && !isOver && (
          <div className="flex items-center justify-center h-20 border border-dashed border-[#dde1e8] rounded-xl">
            <span className="text-[10px] text-[#c5cbd6]">Sin canales</span>
          </div>
        )}
        {isOver && (
          <div className="flex items-center justify-center h-14 border-2 border-dashed rounded-xl" style={{ borderColor: stage.color, backgroundColor: stage.bg }}>
            <span className="text-xs font-semibold" style={{ color: stage.color }}>Soltar aquí</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ MOBILE VIEW ============
function PipelineMobile({ channelsByStage, onMove, loading, onChannelClick, typeMap, showKam, dateType }) {
  const [expandedStage, setExpandedStage] = useState(null);
  const [movingChannel, setMovingChannel] = useState(null);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-[#E87A1E]" /></div>;

  return (
    <div className="space-y-2">
      {STATUS_LIST.map(stage => {
        const channels = channelsByStage[stage.key] || [];
        const isExpanded = expandedStage === stage.key;
        return (
          <div key={stage.key}>
            <button onClick={() => setExpandedStage(isExpanded ? null : stage.key)}
              className="w-full flex items-center gap-3 p-3 rounded-xl transition-colors"
              style={{ backgroundColor: isExpanded ? stage.bg : 'transparent', border: `1px solid ${isExpanded ? stage.border : '#dde1e8'}` }}>
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
              <span className="text-sm font-bold flex-1 text-left" style={{ color: isExpanded ? stage.color : '#1a1a2e' }}>{stage.label}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: stage.bg, color: stage.color }}>{channels.length}</span>
              <ChevronRight size={14} style={{ color: '#8b90a0', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }} />
            </button>
            {isExpanded && (
              <div className="mt-1 ml-5 space-y-1.5 pb-2">
                {channels.length === 0 && <div className="text-xs text-[#8b90a0] py-3 text-center">Sin canales en esta fase</div>}
                {channels.map(ch => (
                  <div key={ch.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-[#ffffff] border" style={{ borderColor: stage.border }}>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onChannelClick(ch.id)}>
                      <div className="text-sm font-semibold truncate hover:text-[#E87A1E] transition-colors">{ch.name}</div>
                      <div className="text-[10px] text-[#8b90a0]">
                        {showKam && ch.profiles?.full_name ? `${ch.profiles.full_name} · ` : ''}
                        {dateType === 'creation' ? `Creado: ${formatShortDate(ch.created_at)}` : `→ ${formatShortDate(ch.pipeline_stage_changed_at || ch.updated_at)}`}
                      </div>
                      {ch.volume_amount != null && ch.volume_unit && (
                        <span className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: getVolumeConfig(ch.volume_unit).bg, color: getVolumeConfig(ch.volume_unit).color }}>
                          {formatVolume(ch.volume_amount, ch.volume_unit)} {getVolumeConfig(ch.volume_unit).unit}
                        </span>
                      )}
                    </div>
                    {movingChannel === ch.id ? (
                      <div className="flex gap-1 flex-wrap justify-end max-w-[180px]">
                        {STATUS_LIST.filter(s => s.key !== stage.key).map(s => (
                          <button key={s.key} onClick={() => { onMove(ch.id, s.key); setMovingChannel(null); }}
                            className="text-[9px] font-semibold px-2 py-1 rounded-md" style={{ backgroundColor: s.bg, color: s.color, border: `1px solid ${s.border}` }}>{s.label}</button>
                        ))}
                        <button onClick={() => setMovingChannel(null)} className="text-[9px] px-1.5 py-1 text-[#8b90a0]"><X size={12} /></button>
                      </div>
                    ) : (
                      <button onClick={() => setMovingChannel(ch.id)}
                        className="text-[10px] font-semibold px-2 py-1 rounded-md bg-[#dde1e8] text-[#5a6078]">Mover →</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============ KAM SELECTOR ============
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
            {selected === 'all' ? '👥' : current.name?.charAt(0) || '?'}
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

// ============ MAIN PAGE ============
export default function PipelinePage() {
  const { user, profile, isManager } = useAuthContext();
  const navigate = useNavigate();
  const { typeMap } = useChannelTypes();
  const [channels, setChannels] = useState([]);
  const [activityChannelIds, setActivityChannelIds] = useState(new Set());
  const [classificationsByChannel, setClassificationsByChannel] = useState({});
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [toast, setToast] = useState(null);
  const [pendingReject, setPendingReject] = useState(null);
  const scrollRef = useRef(null);

  // Filters
  const [period, setPeriod] = useState('all');
  const [dateType, setDateType] = useState('creation');
  const [selectedKam, setSelectedKam] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [teamKams, setTeamKams] = useState([]);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => { if (user) { loadChannels(); if (isManager) loadTeamKams(); } }, [user]);
  useEffect(() => {
  if (!user || period === 'all' || dateType !== 'activity_change') {
    setActivityChannelIds(new Set());
    return;
  }

  let cancelled = false;

  async function loadActivityIds() {
    const range = getPeriodRange(period);
    if (!range) {
      setActivityChannelIds(new Set());
      return;
    }

    const startIso = range.start.toISOString();
    const endIso = range.end.toISOString();
    const startDate = range.start.toISOString().slice(0, 10);
    const endDate = range.end.toISOString().slice(0, 10);

    const kamFilter = selectedKam !== 'all' ? selectedKam : (!isManager ? user.id : null);

    const [interactionsRes, plannedVisitsRes, visitsRes, pipelineHistoryRes] = await Promise.all([
      (() => {
        let q = supabase.from('channel_interactions')
          .select('channel_id, user_id, planned_date, created_at')
          .or(`and(planned_date.gte.${startDate},planned_date.lte.${endDate}),and(created_at.gte.${startIso},created_at.lte.${endIso})`);
        if (kamFilter) q = q.eq('user_id', kamFilter);
        return q;
      })(),
      (() => {
        let q = supabase.from('planned_visits')
          .select('channel_id, kam_id, planned_date')
          .gte('planned_date', startDate).lte('planned_date', endDate);
        if (kamFilter) q = q.eq('kam_id', kamFilter);
        return q;
      })(),
      (() => {
        let q = supabase.from('visits')
          .select('channel_id, kam_id, checkin_at')
          .gte('checkin_at', startIso).lte('checkin_at', endIso);
        if (kamFilter) q = q.eq('kam_id', kamFilter);
        return q;
      })(),
      (() => {
        let q = supabase.from('channel_pipeline_history')
          .select('channel_id, changed_by, created_at')
          .gte('created_at', startIso).lte('created_at', endIso);
        if (kamFilter) q = q.eq('changed_by', kamFilter);
        return q;
      })(),
    ]);

    const ids = new Set();
    (interactionsRes.data || []).forEach(r => r.channel_id && ids.add(r.channel_id));
    (plannedVisitsRes.data || []).forEach(r => r.channel_id && ids.add(r.channel_id));
    (visitsRes.data || []).forEach(r => r.channel_id && ids.add(r.channel_id));
    (pipelineHistoryRes.data || []).forEach(r => r.channel_id && ids.add(r.channel_id));

    if (!cancelled) setActivityChannelIds(ids);
  }

  loadActivityIds().catch(console.error);
  return () => { cancelled = true; };
}, [user, period, dateType, customFrom, customTo, selectedKam, isManager]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 2500); return () => clearTimeout(t); } }, [toast]);

  async function loadTeamKams() {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, zone, role')
        .eq('role', 'kam')
        .eq('is_active', true)
        .order('full_name');
      setTeamKams(data || []);
    } catch (err) { console.error(err); }
  }

  async function loadChannels() {
    setLoading(true);
    try {
      let query = supabase
        .from('channels')
        .select(`*, visits(checkin_at), profiles!channels_assigned_to_fkey(full_name, zone)`)
        .order('updated_at', { ascending: false });

      if (!isManager) query = query.eq('assigned_to', user.id);

      const { data, error } = await query;
      if (error) throw error;

      const enriched = (data || []).map(ch => ({
        ...ch,
        last_visit_at: ch.visits?.length > 0
          ? ch.visits.sort((a, b) => new Date(b.checkin_at) - new Date(a.checkin_at))[0].checkin_at
          : null,
        visits: undefined,
      }));

      setChannels(enriched);

      // Clasificaciones de todos los canales visibles, en UNA sola query
      // (mismo patrón que en ChannelsPage, para no disparar N queries)
      const ids = enriched.map(ch => ch.id);
      if (ids.length > 0) {
        const { data: cls } = await supabase
          .from('channel_classifications')
          .select('channel_id, channel_classification(canal)')
          .in('channel_id', ids);
        const grouped = {};
        (cls || []).forEach(c => {
          if (!c.channel_classification) return;
          if (!grouped[c.channel_id]) grouped[c.channel_id] = [];
          if (!grouped[c.channel_id].some(g => g.canal_corto === c.channel_classification.canal)) {
            grouped[c.channel_id].push({ canal_corto: c.channel_classification.canal });
          }
        });
        setClassificationsByChannel(grouped);
      } else {
        setClassificationsByChannel({});
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }
  function getPeriodRange(periodKey) {
  if (periodKey === 'custom') {
    if (!customFrom || !customTo) return null;
    return { start: new Date(customFrom), end: new Date(customTo + 'T23:59:59') };
  }
  return getDateRange(periodKey);
}

  async function moveChannel(channelId, newStatusKey, rejectionReason) {
    const oldChannels = [...channels];
    const channel = channels.find(c => c.id === channelId);
    if (!channel || channel.status === newStatusKey) return;

    // Si el destino es rechazado o cierre sin acuerdo y no hay motivo, pedir motivo
    if ((newStatusKey === 'rechazado' || newStatusKey === 'cierre_sin_acuerdo') && !rejectionReason) {
      setPendingReject({ channelId, statusKey: newStatusKey });
      return;
    }

    const oldStatusKey = channel.status;
    const oldStatusObj = STATUS_LIST.find(s => s.key === oldStatusKey);
    const newStatusObj = STATUS_LIST.find(s => s.key === newStatusKey);
    const now = new Date().toISOString();
    const newPipelineStage = STATUS_TO_DEFAULT_STAGE[newStatusKey] || channel.pipeline_stage;
    const oldStageKey = channel.pipeline_stage;

    setChannels(prev => prev.map(c =>
      c.id === channelId
        ? { ...c, pipeline_stage: newPipelineStage, status: newStatusKey, pipeline_stage_changed_at: now, updated_at: now, rejection_reason: rejectionReason || c.rejection_reason }
        : c
    ));

    try {
      const updateData = { pipeline_stage: newPipelineStage, status: newStatusKey, pipeline_stage_changed_at: now };
      if (rejectionReason) updateData.rejection_reason = rejectionReason;
      // Si se mueve FUERA de rechazo, limpiar el motivo
      if (newStatusKey !== 'rechazado' && newStatusKey !== 'cierre_sin_acuerdo') updateData.rejection_reason = null;

      const { error } = await supabase.from('channels').update(updateData).eq('id', channelId);
      if (error) throw error;

      await supabase.from('channel_pipeline_history').insert({
        channel_id: channelId, from_stage: oldStageKey, to_stage: newPipelineStage, changed_by: user.id,
      });

      setToast({ message: `${channel.name}: ${oldStatusObj?.label} → ${newStatusObj?.label}`, color: newStatusObj?.color });
    } catch (err) {
      setChannels(oldChannels);
      setToast({ message: 'Error al mover canal', color: '#ef4444' });
    }
    setDraggingId(null);
  }

  function handleChannelClick(channelId) { navigate(`/channels?detail=${channelId}`); }

  // ---- FILTERING ----
  const filteredChannels = channels.filter(ch => {
    if (selectedKam !== 'all' && ch.assigned_to !== selectedKam) return false;
    if (period === 'all') return true;
    if (dateType === 'activity_change') {
  return activityChannelIds.has(ch.id);
}

    let range;
    if (period === 'custom') {
      if (!customFrom || !customTo) return true;
      range = { start: new Date(customFrom), end: new Date(customTo + 'T23:59:59') };
    } else {
      range = getDateRange(period);
    }

    const dateField = ch.created_at;
    if (!dateField) return false;
    const d = new Date(dateField);
    return d >= range.start && d <= range.end;
  });

  // Group by status (igual que en la pantalla de Canales)
  const channelsByStage = {};
  STATUS_LIST.forEach(s => { channelsByStage[s.key] = []; });
  filteredChannels.forEach(ch => {
    const key = ch.status;
    if (channelsByStage[key]) channelsByStage[key].push(ch);
  });

  // KPIs — excluir pendiente_contacto y los estados terminales
  const inProcess = ['en_desarrollo', 'en_evaluacion', 'en_proceso_alta'];
  const totalInPipeline = filteredChannels.filter(c => inProcess.includes(c.status)).length;
  const newLeads     = filteredChannels.filter(c => c.status === 'pendiente_contacto').length;
  const advanced     = filteredChannels.filter(c => inProcess.includes(c.status)).length;
  const closed       = filteredChannels.filter(c => c.status === 'activo').length;
  const closedNoDeal = filteredChannels.filter(c => ['rechazado', 'cierre_sin_acuerdo'].includes(c.status)).length;
  const avgDays = (() => {
    const withDays = filteredChannels
      .filter(c => !['activo', 'rechazado', 'cierre_sin_acuerdo'].includes(c.status) && c.pipeline_stage_changed_at)
      .map(c => daysSince(c.pipeline_stage_changed_at))
      .filter(d => d !== null);
    return withDays.length > 0 ? Math.round(withDays.reduce((a, b) => a + b, 0) / withDays.length) : 0;
  })();

  const teamBreakdown = isManager && selectedKam === 'all' ? teamKams.map(kam => {
    const kamChannels = filteredChannels.filter(c => c.assigned_to === kam.id);
    return {
      ...kam,
      leads:    kamChannels.filter(c => c.status === 'pendiente_contacto').length,
      pipeline: kamChannels.filter(c => inProcess.includes(c.status)).length,
      closed:   kamChannels.filter(c => c.status === 'activo').length,
      total:    kamChannels.length,
    };
  }).filter(k => k.total > 0) : [];

  const showKam = isManager && selectedKam === 'all';

  const periodLabel = (() => {
    if (period === 'all') return 'Todos';
    if (period === 'custom' && customFrom && customTo) return `${customFrom} — ${customTo}`;
    const r = getDateRange(period);
    return `${r.start.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} — ${r.end.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;
  })();

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Pipeline</h1>
          <p className="text-xs text-[#5a6078]">
            {filteredChannels.length} canales · {totalInPipeline} en proceso
            {period !== 'all' && ` · ${periodLabel}`}
          </p>
        </div>
        {isManager && (
          <div className="px-2 py-1 bg-blue-50 border border-blue-200 rounded-lg">
            <span className="text-[9px] font-bold text-blue-600 uppercase">{profile?.role === 'director' ? 'Director' : 'Manager'}</span>
          </div>
        )}
      </div>

      {/* KAM Selector */}
      {isManager && teamKams.length > 0 && (
        <KamSelector kams={teamKams} selected={selectedKam} onChange={setSelectedKam} />
      )}

      {/* Period pills */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide mb-3">
        {[
          { key: 'all', label: 'Todos' },
          { key: 'week', label: 'Esta semana' },
          { key: 'month', label: 'Este mes' },
          { key: 'quarter', label: 'Trimestre' },
          { key: 'custom', label: '📅 Personalizado' },
        ].map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors"
            style={{
              background: period === p.key ? 'rgba(232,122,30,0.1)' : '#f7f8fa',
              color: period === p.key ? '#E87A1E' : '#8b90a0',
              border: `1px solid ${period === p.key ? '#E87A1E' : '#dde1e8'}`,
            }}>{p.label}</button>
        ))}
      </div>

      {/* Date range + type */}
      {period !== 'all' && (
        <div className="bg-[#f7f8fa] border border-[#dde1e8] rounded-xl p-2.5 mb-3">
          <div className="flex items-center gap-2">
            {period === 'custom' ? (
              <>
                <div className="flex-1">
                  <div className="text-[8px] font-bold text-[#8b90a0] uppercase mb-0.5">Desde</div>
                  <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-full px-2 py-1.5 bg-white border border-[#dde1e8] rounded-lg text-[11px] text-[#1a1a2e]" />
                </div>
                <span className="text-[#c5cbd6] mt-3">→</span>
                <div className="flex-1">
                  <div className="text-[8px] font-bold text-[#8b90a0] uppercase mb-0.5">Hasta</div>
                  <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                    className="w-full px-2 py-1.5 bg-white border border-[#dde1e8] rounded-lg text-[11px] text-[#1a1a2e]" />
                </div>
              </>
            ) : (
              <div className="flex-1 text-xs text-[#5a6078] font-medium">{periodLabel}</div>
            )}
            <div className="flex flex-col gap-1">
              [{ key: 'creation', label: 'Creación' }, { key: 'activity_change', label: 'Cambios de actividad' }].map(dt => (
                <button key={dt.key} onClick={() => setDateType(dt.key)}
                  className="px-2 py-0.5 rounded text-[9px] font-bold transition-all"
                  style={{
                    background: dateType === dt.key ? 'rgba(232,122,30,0.1)' : 'transparent',
                    color: dateType === dt.key ? '#E87A1E' : '#8b90a0',
                    border: `1px solid ${dateType === dt.key ? '#E87A1E' : '#dde1e8'}`,
                  }}>{dt.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* KPIs */}
      {period !== 'all' && (
        <div className="flex gap-2 mb-3">
          {[
            { val: newLeads,     label: 'Nuevos leads',  color: '#E87A1E' },
            { val: advanced,     label: 'En proceso',    color: '#3b82f6' },
            { val: closed,       label: 'Activos',       color: '#16a34a' },
            { val: closedNoDeal, label: 'Sin acuerdo',   color: '#ef4444' },
          ].map((k, i) => (
            <div key={i} className="flex-1 bg-white border border-[#dde1e8] rounded-xl p-2.5 text-center">
              <div className="text-lg font-extrabold" style={{ color: k.color }}>{k.val}</div>
              <div className="text-[8px] font-semibold text-[#8b90a0] uppercase tracking-wider mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Team breakdown */}
      {isManager && selectedKam === 'all' && period !== 'all' && teamBreakdown.length > 0 && (
        <div className="bg-[#f7f8fa] border border-[#dde1e8] rounded-xl p-2.5 mb-3">
          <div className="text-[9px] font-bold text-[#8b90a0] uppercase tracking-wider mb-2">Desglose por KAM</div>
          <div className="space-y-1">
            {teamBreakdown.map(kam => (
              <button key={kam.id} onClick={() => setSelectedKam(kam.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white transition-colors text-left">
                <div className="w-6 h-6 rounded-md bg-[#FEF3E8] flex items-center justify-center text-[10px] font-bold text-[#E87A1E]">
                  {kam.full_name?.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-[#1a1a2e] truncate">{kam.full_name}</div>
                  <div className="text-[9px] text-[#8b90a0]">Zona {kam.zone || '-'}</div>
                </div>
                <div className="flex gap-3 text-center">
                  <div><div className="text-[11px] font-bold text-[#E87A1E]">{kam.leads}</div><div className="text-[7px] text-[#8b90a0]">Leads</div></div>
                  <div><div className="text-[11px] font-bold text-[#3b82f6]">{kam.pipeline}</div><div className="text-[7px] text-[#8b90a0]">Pipeline</div></div>
                  <div><div className="text-[11px] font-bold text-[#16a34a]">{kam.closed}</div><div className="text-[7px] text-[#8b90a0]">Activos</div></div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Volume summary */}
      {(() => {
        const volTotals = {};
        filteredChannels.forEach(ch => {
          if (ch.volume_amount != null && ch.volume_unit) {
            if (!volTotals[ch.volume_unit]) volTotals[ch.volume_unit] = 0;
            volTotals[ch.volume_unit] += parseFloat(ch.volume_amount);
          }
        });
        return Object.keys(volTotals).length > 0 ? (
          <div className="bg-[#f7f8fa] border border-[#dde1e8] rounded-xl p-2.5 mb-3">
            <div className="text-[9px] font-bold text-[#8b90a0] uppercase tracking-wider mb-2">Volumen total en pipeline</div>
            <div className="flex gap-2">
              {VOLUME_UNITS.map(u => {
                const total = volTotals[u.key] || 0;
                if (total === 0) return null;
                return (
                  <div key={u.key} className="flex-1 rounded-lg p-2 text-center" style={{ background: u.bg }}>
                    <div className="text-lg font-extrabold" style={{ color: u.color }}>{formatVolume(total, u.key)}</div>
                    <div className="text-[9px] font-semibold" style={{ color: u.color }}>{u.label}</div>
                    <div className="text-[7px] text-[#8b90a0]">{u.unit}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null;
      })()}

      {/* Barra de color por estado: cada segmento ocupa el mismo ancho fijo
          (100/7 %), igual que cada columna de título de abajo, para que
          coincidan exactamente en horizontal. NO es proporcional al número
          de canales — es solo un indicador visual de color por estado. */}
      <div className="flex mb-3 h-2 rounded-full overflow-hidden bg-[#dde1e8]">
        {STATUS_LIST.map(stage => {
          const count = channelsByStage[stage.key]?.length || 0;
          return (
            <div key={stage.key} style={{ width: `${100 / STATUS_LIST.length}%`, backgroundColor: stage.color }}
              className="transition-all duration-300" title={`${stage.label}: ${count}`} />
          );
        })}
      </div>

      {/* Kanban / Mobile */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-[#E87A1E]" /></div>
      ) : isMobile ? (
        <PipelineMobile channelsByStage={channelsByStage} onMove={moveChannel} loading={loading}
          onChannelClick={handleChannelClick} typeMap={typeMap} showKam={showKam} dateType={dateType}
          classificationsByChannel={classificationsByChannel} />
      ) : (
        <div ref={scrollRef} className="flex gap-2 overflow-x-auto scrollbar-hide pb-4" style={{ minHeight: 300 }}>
          {STATUS_LIST.map(stage => (
            <PipelineColumn key={stage.key} stage={stage} channels={channelsByStage[stage.key] || []}
              onDrop={moveChannel} onDragStart={setDraggingId} dragOver={dragOver} setDragOver={setDragOver}
              onChannelClick={handleChannelClick} typeMap={typeMap} showKam={showKam} dateType={dateType}
              classificationsByChannel={classificationsByChannel} />
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 px-4 py-3 rounded-xl text-center text-sm font-bold shadow-xl z-50"
          style={{ backgroundColor: toast.color || '#6366f1', color: '#fff' }}>{toast.message}</div>
      )}

      {/* Modal motivo de descarte */}
      {pendingReject && (
        <RejectReasonModal
          channelName={channels.find(c => c.id === pendingReject.channelId)?.name || ''}
          statusLabel={STATUS_LIST.find(s => s.key === pendingReject.statusKey)?.label || ''}
          onConfirm={(reason) => { moveChannel(pendingReject.channelId, pendingReject.statusKey, reason); setPendingReject(null); }}
          onCancel={() => setPendingReject(null)}
        />
      )}
    </div>
  );
}

// ============ MODAL MOTIVO DE DESCARTE ============
function RejectReasonModal({ channelName, statusLabel, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-surface-3 rounded-2xl w-full max-w-sm p-5">
        <h3 className="font-bold text-sm text-text-primary mb-1">Motivo de descarte</h3>
        <p className="text-xs text-text-secondary mb-3">
          Vas a mover <strong>{channelName}</strong> a <strong>{statusLabel}</strong>. Indica el motivo:
        </p>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Ej: No encaja con el perfil, sin presupuesto, no responde..."
          rows={3}
          className="w-full px-3 py-2.5 bg-white border border-surface-3 rounded-xl text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-brand-500 mb-3"
          autoFocus />
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 py-2.5 border border-surface-3 text-text-secondary text-sm font-semibold rounded-xl hover:bg-surface-1 transition-colors">
            Cancelar
          </button>
          <button onClick={() => onConfirm(reason.trim())} disabled={!reason.trim()}
            className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors">
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
