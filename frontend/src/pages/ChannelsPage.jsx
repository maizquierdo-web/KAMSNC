import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../components/AuthProvider';
import BusinessCase from '../components/BusinessCase';
import PreVisitBrief from '../components/PreVisitBrief';
import ChannelClassification from '../components/ChannelClassification';
import ClassificationSelector from '../components/ClassificationSelector';
import CompanyAnalysis from '../components/CompanyAnalysis';
import ActivityTimeline from '../components/ActivityTimeline';
import ChannelActivitySummary from '../components/ChannelActivitySummary';
import ChannelAttentionAlerts from '../components/ChannelAttentionAlerts';
import ChannelCopilotPanel from '../components/ChannelCopilotPanel';
import MeetingMinutes from '../components/MeetingMinutes';
import VolumeEditor from '../components/VolumeEditor';
import { BulkReassignModal } from '../components/ChannelReassign';
import AddressFields from '../components/AddressFields';
import { useChannelTypes } from '../hooks/useChannelTypes';
import { validatePhone, validateEmail, validateCIF } from '../lib/validators';
import {
  STATUS_CONFIG, PIPELINE_CONFIG,
  CREATABLE_PIPELINE_STAGES,
  POTENCIAL_OPTIONS, COMUNIDADES_AUTONOMAS,
  LEAD_SOURCE_OPTIONS, stageToStatus,
} from '../lib/crmConstants';
import {
  Search, Plus, Building2, Phone, Mail, MapPin,
  ChevronRight, User, X, Check, Loader2, Edit3, Upload, ArrowRightLeft, Sparkles
} from 'lucide-react';

// ============ MULTISELECT ORIGEN DEL LEAD (checkboxes) ============
function LeadSourceCheckboxes({ value = [], onChange, otherText = '', onOtherTextChange }) {
  // value contiene los keys seleccionados (ej. ['industrial', 'kam', 'otros'])
  // otherText es el texto libre cuando se marca "Otros"
  const toggle = (val) => {
    if (value.includes(val)) {
      onChange(value.filter(v => v !== val));
    } else {
      onChange([...value, val]);
    }
  };

  const pullOptions = LEAD_SOURCE_OPTIONS.filter(o => o.group === 'pull');
  const pushOptions = LEAD_SOURCE_OPTIONS.filter(o => o.group === 'push');
  const otrosOption = LEAD_SOURCE_OPTIONS.find(o => o.value === 'otros');
  const otrosChecked = value.includes('otros');

  function renderOption(opt) {
    const checked = value.includes(opt.value);
    return (
      <button key={opt.value} type="button" onClick={() => toggle(opt.value)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left border-b border-surface-3 last:border-0 transition-colors ${
          checked ? 'bg-brand-500/10' : 'hover:bg-surface-1'
        }`}>
        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
          checked ? 'bg-brand-500 border-brand-500' : 'border-surface-3'
        }`}>
          {checked && <Check size={10} className="text-white" />}
        </div>
        <span className="text-xs text-text-secondary">{opt.label}</span>
      </button>
    );
  }

  return (
    <div className="border border-surface-3 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
      {/* PULL */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border-b border-surface-3">
        <span className="text-[9px] font-extrabold text-blue-600 uppercase tracking-wider">PULL</span>
      </div>
      {pullOptions.map(renderOption)}

      {/* PUSH */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-pink-50 border-b border-surface-3 border-t border-surface-3">
        <span className="text-[9px] font-extrabold text-pink-600 uppercase tracking-wider">PUSH</span>
      </div>
      {pushOptions.map(renderOption)}

      {/* Otros */}
      <div className="border-t border-surface-3">
        {renderOption(otrosOption)}
        {otrosChecked && (
          <div className="px-3 pb-2">
            <input type="text" value={otherText} onChange={(e) => onOtherTextChange?.(e.target.value)}
              placeholder="Especifica la fuente..."
              className="w-full px-3 py-2 bg-white border border-surface-3 rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-500" />
          </div>
        )}
      </div>
    </div>
  );
}

// ============ LISTADO DE CANALES ============
function ChannelList({ channels, loading, onSelect, filter, setFilter, search, setSearch, typeMap, isManager, onBulkReassign, classificationsByChannel }) {
  // Un filtro por cada estado real del esquema (STATUS_CONFIG), generado
  // dinámicamente para no tener que tocar este código si se añade un estado nuevo.
  const filters = [
    { key: 'all', label: 'Todos', count: channels.length },
    ...Object.entries(STATUS_CONFIG).map(([key, cfg]) => ({
      key,
      label: cfg.label,
      count: channels.filter(c => c.status === key).length,
    })),
  ];

  const filtered = channels
    .filter(c => filter === 'all' || c.status === filter)
    .filter(c =>
      search === '' ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.contact_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.city || '').toLowerCase().includes(search.toLowerCase())
    );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-extrabold tracking-tight">Canales</h1>
        <div className="flex items-center gap-2">
          {isManager && (
            <button onClick={onBulkReassign}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-semibold rounded-lg transition-colors">
              <ArrowRightLeft size={13} />
              Reasignar
            </button>
          )}
          <a
            href="/import"
            className="flex items-center gap-1.5 px-3 py-2 bg-surface-2 hover:bg-surface-3 text-text-secondary text-xs font-semibold rounded-lg transition-colors"
          >
            <Upload size={13} />
            Importar
          </a>
          <button
            onClick={() => onSelect('new')}
            className="flex items-center gap-1.5 px-3 py-2 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold rounded-lg transition-colors"
          >
            <Plus size={14} />
            Nuevo
          </button>
        </div>
      </div>

      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar canal, contacto o ciudad..."
          className="w-full pl-9 pr-4 py-2.5 bg-surface-2 border border-surface-3 rounded-xl text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-500 transition-colors"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide mb-4">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              filter === f.key
                ? 'bg-brand-500 text-white'
                : 'bg-surface-2 text-text-secondary border border-surface-3 hover:border-surface-4'
            }`}
          >
            {f.label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              filter === f.key ? 'bg-white/20' : 'bg-surface-3'
            }`}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-brand-400" />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-12">
          <Building2 size={32} className="mx-auto mb-3 text-text-muted" />
          <p className="text-sm text-text-secondary">
            {search ? 'No se encontraron canales' : 'No hay canales en esta categoría'}
          </p>
        </div>
      )}

      {!loading && filtered.map(channel => {
        const status = STATUS_CONFIG[channel.status] || STATUS_CONFIG.pendiente_contacto;
        const classLabels = (classificationsByChannel?.[channel.id] || []).map(c => c.canal_corto).join(', ');
        const daysSinceVisit = channel.last_visit_at
          ? Math.floor((Date.now() - new Date(channel.last_visit_at).getTime()) / (1000 * 60 * 60 * 24))
          : null;

        return (
          <button
            key={channel.id}
            onClick={() => onSelect(channel.id)}
            className="w-full flex items-center gap-3 p-3 bg-surface-1 border border-surface-3 rounded-xl mb-2 text-left hover:border-surface-4 transition-colors"
          >
            <div className={`w-10 h-10 rounded-xl ${status.bg} ${status.text} flex items-center justify-center text-sm font-extrabold flex-shrink-0`}>
              {channel.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{channel.name}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-text-secondary truncate">{classLabels || 'Sin clasificación'}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${status.bg} ${status.text}`}>
                  {status.label}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              {daysSinceVisit !== null ? (
                <span className={`text-[10px] font-semibold ${
                  daysSinceVisit > 10 ? 'text-red-400' : daysSinceVisit > 5 ? 'text-amber-400' : 'text-text-secondary'
                }`}>
                  Hace {daysSinceVisit}d
                </span>
              ) : (
                <span className="text-[10px] text-text-muted">Sin visitas</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ============ DETALLE DE CANAL ============
function ChannelDetail({ channelId, onBack, types, typeMap }) {
  const { user } = useAuthContext();
  const [channel, setChannel] = useState(null);
  const [classifications, setClassifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const [copilotOpen, setCopilotOpen] = useState(false);

  useEffect(() => {
    loadChannel();
  }, [channelId]);

  async function loadChannel() {
    setLoading(true);
    try {
      const [{ data: ch }, { data: cls }] = await Promise.all([
        supabase.from('channels').select('*').eq('id', channelId).single(),
        supabase.from('channel_classifications').select('*, channel_classification(*)').eq('channel_id', channelId),
      ]);
      setChannel(ch);
      setClassifications(cls || []);
      initForm(ch);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Mismo formato que usa ChannelClassification, para mostrar en el header
  function formatClassificationLabel(cls) {
    if (!cls?.channel_classification) return '';
    const c = cls.channel_classification;
    let label = c.canal;
    if (c.subcanal) label += ` > ${c.subcanal}`;
    if (c.tipo) label += ` > ${c.tipo}`;
    if (cls.custom_text) label += `: ${cls.custom_text}`;
    return label;
  }

  function initForm(ch) {
    // Parsear lead_source: si hay una entrada "otros:texto", extraer el texto
    const rawSources = Array.isArray(ch?.lead_source) ? ch.lead_source : [];
    const otrosEntry = rawSources.find(s => s.startsWith('otros:'));
    const cleanSources = rawSources.map(s => s.startsWith('otros:') ? 'otros' : s);
    const otrosText = otrosEntry ? otrosEntry.split(':').slice(1).join(':') : '';

    setEditForm({
      name: ch?.name || '',
      channel_type: ch?.channel_type || 'energia_mayorista',
      contact_name: ch?.contact_name || '',
      phone: ch?.phone || '',
      email: ch?.email || '',
      cif: ch?.cif || '',
      website: ch?.website || '',
      google_rating: ch?.google_rating ?? '',
      lead_source: cleanSources,
      lead_source_other: otrosText,
      address: ch?.address || '',
      city: ch?.city || '',
      province: ch?.province || '',
      comunidad_autonoma: ch?.comunidad_autonoma || '',
      potencial_caes: ch?.potencial_caes || '',
      potencial_energia: ch?.potencial_energia || '',
      pipeline_stage: ch?.pipeline_stage || 'lead',
      notes: ch?.notes || '',
      rejection_reason: ch?.rejection_reason || '',
    });
  }

  function startEdit() {
    initForm(channel);
    setEditMode(true);
    setEditError('');
  }

  async function saveEdit() {
    if (!editForm.name.trim()) {
      setEditError('El nombre es obligatorio');
      return;
    }
    setSaving(true);
    setEditError('');
    try {
      const now = new Date().toISOString();
      const stageChanged = editForm.pipeline_stage !== channel.pipeline_stage;
      const { error } = await supabase
        .from('channels')
        .update({
          name: editForm.name.trim(),
          channel_type: editForm.channel_type,
          contact_name: editForm.contact_name || null,
          phone: editForm.phone || null,
          email: editForm.email || null,
          cif: editForm.cif || null,
          website: editForm.website || null,
          google_rating: editForm.google_rating && editForm.google_rating !== 'no_tiene' ? parseFloat(editForm.google_rating) : null,
          lead_source: editForm.lead_source?.length > 0
            ? editForm.lead_source.map(s => s === 'otros' && editForm.lead_source_other ? `otros:${editForm.lead_source_other}` : s)
            : null,
          address: editForm.address || null,
          city: editForm.city || null,
          province: editForm.province || null,
          comunidad_autonoma: editForm.comunidad_autonoma || null,
          potencial_caes: editForm.potencial_caes || null,
          potencial_energia: editForm.potencial_energia || null,
          pipeline_stage: editForm.pipeline_stage,
          status: stageToStatus(editForm.pipeline_stage),
          ...(stageChanged ? { pipeline_stage_changed_at: now } : {}),
          notes: editForm.notes || null,
          rejection_reason: editForm.pipeline_stage === 'closed_no_deal' ? (editForm.rejection_reason || null) : null,
        })
        .eq('id', channelId);
      if (error) throw error;

      if (stageChanged) {
        await supabase.from('channel_pipeline_history').insert({
          channel_id: channelId, from_stage: channel.pipeline_stage, to_stage: editForm.pipeline_stage, changed_by: user.id,
        }).catch(() => {});
      }

      setChannel(prev => ({ ...prev, ...editForm, name: editForm.name.trim(), status: stageToStatus(editForm.pipeline_stage) }));
      setEditMode(false);
    } catch (err) {
      setEditError(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  const updateField = (field, value) => setEditForm(prev => ({ ...prev, [field]: value }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-brand-400" />
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-text-secondary">Canal no encontrado</p>
        <button onClick={onBack} className="mt-3 text-sm text-brand-400 font-semibold">Volver</button>
      </div>
    );
  }

  const status = STATUS_CONFIG[channel.status] || STATUS_CONFIG.pendiente_contacto;
  const pipeline = PIPELINE_CONFIG[channel.pipeline_stage] || '-';

  return (
    <div className={`grid items-start gap-4 ${copilotOpen ? 'lg:grid-cols-[minmax(0,1fr)_380px]' : 'grid-cols-1'}`}>
      <div className="min-w-0">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-brand-400 font-semibold mb-4">
        ← Canales
      </button>

      <div className="bg-surface-1 border border-surface-3 rounded-2xl p-4 mb-4">
        {editMode ? (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-text-primary">Editar canal</h2>
              <button onClick={() => setEditMode(false)} className="text-text-muted hover:text-text-primary">
                <X size={18} />
              </button>
            </div>
            {editError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 text-xs text-red-600">{editError}</div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Nombre *</label>
                <input type="text" value={editForm.name} onChange={(e) => updateField('name', e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-surface-3 rounded-xl text-sm focus:outline-none focus:border-brand-500" />
              </div>

              {/* Fase del pipeline — controla status automáticamente */}
              <div>
                <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Fase del Pipeline</label>
                <select value={editForm.pipeline_stage} onChange={(e) => updateField('pipeline_stage', e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-surface-3 rounded-xl text-sm focus:outline-none focus:border-brand-500">
                  {Object.entries(PIPELINE_CONFIG).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <p className="text-[10px] text-text-muted mt-1">
                  Estado derivado: <span className="font-semibold">{STATUS_CONFIG[stageToStatus(editForm.pipeline_stage)]?.label}</span>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Potencial CAES</label>
                  <select value={editForm.potencial_caes} onChange={(e) => updateField('potencial_caes', e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-surface-3 rounded-xl text-sm focus:outline-none focus:border-brand-500">
                    <option value="">-</option>
                    {POTENCIAL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Potencial Energía</label>
                  <select value={editForm.potencial_energia} onChange={(e) => updateField('potencial_energia', e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-surface-3 rounded-xl text-sm focus:outline-none focus:border-brand-500">
                    <option value="">-</option>
                    {POTENCIAL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Comunidad Autónoma</label>
                <select value={editForm.comunidad_autonoma} onChange={(e) => updateField('comunidad_autonoma', e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-surface-3 rounded-xl text-sm focus:outline-none focus:border-brand-500">
                  <option value="">Seleccionar...</option>
                  {COMUNIDADES_AUTONOMAS.map(ca => <option key={ca} value={ca}>{ca}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Contacto</label>
                <input type="text" value={editForm.contact_name} onChange={(e) => updateField('contact_name', e.target.value)}
                  placeholder="Nombre del contacto" className="w-full px-3 py-2.5 bg-white border border-surface-3 rounded-xl text-sm focus:outline-none focus:border-brand-500" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Teléfono</label>
                  <input type="tel" value={editForm.phone} onChange={(e) => updateField('phone', e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-surface-3 rounded-xl text-sm focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Email</label>
                  <input type="email" value={editForm.email} onChange={(e) => updateField('email', e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-surface-3 rounded-xl text-sm focus:outline-none focus:border-brand-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">CIF</label>
                  <input type="text" value={editForm.cif} onChange={(e) => updateField('cif', e.target.value)}
                    placeholder="B12345678" className="w-full px-3 py-2.5 bg-white border border-surface-3 rounded-xl text-sm focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Valoración Google</label>
                  <select value={editForm.google_rating ?? ''} onChange={(e) => updateField('google_rating', e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-surface-3 rounded-xl text-sm focus:outline-none focus:border-brand-500">
                    <option value="">Seleccionar...</option>
                    <option value="no_tiene">No tiene</option>
                    {['5','4.5','4','3.5','3','2.5','2','1.5','1','0.5'].map(v => (
                      <option key={v} value={v}>⭐ {v}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Página web</label>
                <input type="url" value={editForm.website} onChange={(e) => updateField('website', e.target.value)}
                  placeholder="https://www.ejemplo.com" className="w-full px-3 py-2.5 bg-white border border-surface-3 rounded-xl text-sm focus:outline-none focus:border-brand-500" />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Origen del lead</label>
                <LeadSourceCheckboxes value={editForm.lead_source || []} onChange={(v) => updateField('lead_source', v)}
                  otherText={editForm.lead_source_other || ''} onOtherTextChange={(t) => updateField('lead_source_other', t)} />
              </div>

              <AddressFields form={editForm} update={updateField} fieldClass="w-full px-3 py-2.5 bg-white border border-surface-3 rounded-xl text-sm focus:outline-none focus:border-brand-500" />

              <div>
                <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Notas</label>
                <textarea value={editForm.notes} onChange={(e) => updateField('notes', e.target.value)}
                  rows={2} className="w-full px-3 py-2.5 bg-white border border-surface-3 rounded-xl text-sm resize-none focus:outline-none focus:border-brand-500" />
              </div>

              {['closed_no_deal'].includes(editForm.pipeline_stage) && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <label className="block text-[10px] font-bold text-red-400 uppercase tracking-wider mb-1">Motivo de descarte</label>
                  <textarea value={editForm.rejection_reason} onChange={(e) => updateField('rejection_reason', e.target.value)}
                    placeholder="Indica el motivo del rechazo o cierre sin acuerdo..."
                    rows={2} className="w-full px-3 py-2.5 bg-white border border-red-200 rounded-xl text-sm resize-none focus:outline-none focus:border-red-400" />
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={saveEdit} disabled={saving}
                  className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-1.5">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Guardar
                </button>
                <button onClick={() => setEditMode(false)}
                  className="px-4 py-2.5 border border-surface-3 text-text-secondary rounded-xl text-sm font-semibold hover:bg-surface-2 transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 mb-3">
              <div className={`w-12 h-12 rounded-xl ${status.bg} ${status.text} flex items-center justify-center text-lg font-extrabold flex-shrink-0`}>
                {channel.name.charAt(0)}
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-extrabold tracking-tight">{channel.name}</h2>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {classifications.length > 0 ? (
                    classifications.map(cls => (
                      <span key={cls.id} className="text-xs text-text-secondary">{formatClassificationLabel(cls)}</span>
                    ))
                  ) : (
                    <span className="text-xs text-text-muted italic">Sin clasificación</span>
                  )}
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${status.bg} ${status.text}`}>
                    {status.label}
                  </span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300">
                    {pipeline}
                  </span>
                </div>
              </div>
              <button onClick={() => setCopilotOpen(true)}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-xl border border-[#BFDDE6] bg-[#EAF4F8] px-3 py-2 text-xs font-bold text-[#174A5B] transition-colors hover:border-[#9FCED9] hover:bg-[#DCEEF3] [&>svg]:text-[#0F9F95]">
                <Sparkles size={14} /> Analizar con IA
              </button>
              <button onClick={startEdit}
                className="p-2 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text-primary transition-colors flex-shrink-0">
                <Edit3 size={16} />
              </button>
            </div>

            {(channel.potencial_caes || channel.potencial_energia || channel.comunidad_autonoma) && (
              <div className="bg-brand-500/5 border border-brand-500/15 rounded-xl p-3 mb-3 space-y-1.5">
                {channel.comunidad_autonoma && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-text-muted w-20 flex-shrink-0">CCAA</span>
                    <span className="text-text-primary font-semibold">{channel.comunidad_autonoma}</span>
                  </div>
                )}
                {(channel.potencial_caes || channel.potencial_energia) && (
                  <div className="flex items-center gap-4 text-xs">
                    {channel.potencial_caes && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-text-muted">Potencial CAES</span>
                        <PotencialBadge value={channel.potencial_caes} />
                      </div>
                    )}
                    {channel.potencial_energia && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-text-muted">Energía</span>
                        <PotencialBadge value={channel.potencial_energia} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2 mt-3">
              {channel.contact_name && (
                <div className="flex items-center gap-2.5 text-sm">
                  <User size={14} className="text-text-muted flex-shrink-0" />
                  <span className="text-text-secondary">{channel.contact_name}</span>
                </div>
              )}
              {channel.address && (
                <div className="flex items-center gap-2.5 text-sm">
                  <MapPin size={14} className="text-text-muted flex-shrink-0" />
                  <span className="text-text-secondary">
                    {channel.address}
                    {channel.city ? `, ${channel.city}` : ''}
                    {channel.province ? ` (${channel.province})` : ''}
                  </span>
                </div>
              )}
              {channel.phone && (
                <a href={`tel:${channel.phone}`} className="flex items-center gap-2.5 text-sm">
                  <Phone size={14} className="text-text-muted flex-shrink-0" />
                  <span className="text-brand-400">{channel.phone}</span>
                </a>
              )}
              {channel.email && (
                <a href={`mailto:${channel.email}`} className="flex items-center gap-2.5 text-sm">
                  <Mail size={14} className="text-text-muted flex-shrink-0" />
                  <span className="text-brand-400">{channel.email}</span>
                </a>
              )}
              {channel.cif && (
                <div className="flex items-center gap-2.5 text-sm">
                  <span className="text-text-muted flex-shrink-0 text-xs font-bold">CIF</span>
                  <span className="text-text-secondary">{channel.cif}</span>
                </div>
              )}
              {channel.website && (
                <a href={channel.website.startsWith('http') ? channel.website : `https://${channel.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 text-sm">
                  <span className="text-text-muted flex-shrink-0 text-xs">🌐</span>
                  <span className="text-brand-400">{channel.website}</span>
                </a>
              )}
              {channel.google_rating != null && (
                <div className="flex items-center gap-2.5 text-sm">
                  <span className="text-text-muted flex-shrink-0 text-xs">⭐</span>
                  <span className="text-text-secondary">{channel.google_rating} / 5</span>
                </div>
              )}
              {channel.lead_source?.length > 0 && (
                <div className="flex items-start gap-2.5 text-sm">
                  <span className="text-text-muted flex-shrink-0 text-xs mt-0.5">📥</span>
                  <div className="flex flex-wrap gap-1">
                    {channel.lead_source.map(src => {
                      const isOtros = src.startsWith('otros');
                      const otrosText = isOtros && src.includes(':') ? src.split(':').slice(1).join(':') : '';
                      const label = isOtros
                        ? `Otros${otrosText ? `: ${otrosText}` : ''}`
                        : (LEAD_SOURCE_OPTIONS.find(o => o.value === src)?.label || src);
                      return (
                        <span key={src} className="text-text-secondary text-xs">{label}</span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {channel.notes && (
              <div className="mt-4 p-3 bg-surface-0 rounded-lg">
                <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Notas</div>
                <p className="text-xs text-text-secondary leading-relaxed">{channel.notes}</p>
              </div>
            )}

            {channel.rejection_reason && ['rechazado', 'cierre_sin_acuerdo'].includes(channel.status) && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-1">Motivo de descarte</div>
                <p className="text-xs text-red-600 leading-relaxed">{channel.rejection_reason}</p>
              </div>
            )}
          </>
        )}
      </div>

      <ChannelActivitySummary channel={channel} refreshKey={activityRefreshKey} onReassigned={(kamId) => {
        setChannel(prev => ({ ...prev, assigned_to: kamId }));
      }} onActivityChange={() => setActivityRefreshKey(key => key + 1)} />

      <ChannelAttentionAlerts channelId={channelId} refreshKey={activityRefreshKey}
        isCaes={classifications.some(classification =>
          classification.channel_classification?.canal?.trim().toLowerCase().includes('cae')
        ) || channel.channel_type?.trim().toLowerCase().includes('cae')
          || Boolean(channel.potencial_caes)} />

      <div className="mb-4">
        <ChannelClassification channelId={channelId} onUpdate={setClassifications} />
      </div>

      <div className="mb-4">
        <CompanyAnalysis channel={channel} onChannelUpdate={setChannel} />
      </div>

      <div id="channel-activity" className="mb-4 scroll-mt-20">
        <ActivityTimeline channel={channel} onActivityChange={() => setActivityRefreshKey(key => key + 1)} />
      </div>

      <div className="mb-4">
        <MeetingMinutes channelId={channelId} onChange={() => setActivityRefreshKey(key => key + 1)} />
      </div>

      <div className="mb-4">
        <VolumeEditor channel={channel} onChannelUpdate={setChannel} />
      </div>

      <div id="channel-business-case" className="mb-4 scroll-mt-20">
        <BusinessCase channelId={channelId} />
      </div>

      <div className="mb-4">
        <PreVisitBrief channelId={channelId} channelName={channel.name} />
      </div>
      </div>

      <ChannelCopilotPanel open={copilotOpen} onClose={() => setCopilotOpen(false)} channel={channel} />
    </div>
  );
}

function PotencialBadge({ value }) {
  const colors = {
    'Bajo': 'bg-gray-500/20 text-gray-400',
    'Medio': 'bg-amber-500/20 text-amber-400',
    'Alto': 'bg-green-500/20 text-green-400',
    'Muy Alto': 'bg-brand-500/20 text-brand-400',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${colors[value] || 'bg-surface-2 text-text-muted'}`}>
      {value}
    </span>
  );
}

// ============ FORMULARIO NUEVO CANAL (WIZARD 3 PASOS REORGANIZADO) ============
function NewChannelForm({ onBack, onSaved, types }) {
  const { user } = useAuthContext();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [classificationError, setClassificationError] = useState('');
  const [classifications, setClassifications] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});

  // ---- PASO 1: solo datos de identificación/contacto ----
  const [form, setForm] = useState({
    name: '', contact_name: '', phone: '', email: '',
    cif: '', website: '', google_rating: '', lead_source: [], lead_source_other: '',
  });

  // ---- PASO 2: clasificación + potenciales condicionados ----
  const [potencialCaes, setPotencialCaes] = useState('');
  const [potencialEnergia, setPotencialEnergia] = useState('');

  // ---- PASO 3: fase del pipeline + ubicación + notas ----
  const [locationForm, setLocationForm] = useState({
    pipeline_stage: 'lead',
    comunidad_autonoma: '', address: '', city: '', province: '', notes: '',
  });

  const update = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (field === 'phone') { const v = validatePhone(value); setFieldErrors(prev => ({ ...prev, phone: v.valid ? '' : v.error })); }
    if (field === 'email') { const v = validateEmail(value); setFieldErrors(prev => ({ ...prev, email: v.valid ? '' : v.error })); }
    if (field === 'cif') { const v = validateCIF(value); setFieldErrors(prev => ({ ...prev, cif: v.valid ? '' : v.error })); }
  };
  const updateLocation = (field, value) => setLocationForm(prev => ({ ...prev, [field]: value }));

  // Detecta si la clasificación elegida toca CAEs y/o Energía/Solar, para mostrar
  // los campos de potencial correspondientes (y solo esos) en el paso 2.
  const touchesCaes = classifications.some(c => c.canal === 'CAEs');
  const touchesEnergia = classifications.some(c => c.canal === 'Energia' || c.canal === 'Solar');

  function nextStep() {
    setError('');
    if (step === 1) {
      if (!form.name.trim()) { setError('El nombre del canal es obligatorio'); return; }
      const phoneV = validatePhone(form.phone);
      const emailV = validateEmail(form.email);
      const cifV = validateCIF(form.cif);
      const errors = {};
      if (!phoneV.valid) errors.phone = phoneV.error;
      if (!emailV.valid) errors.email = emailV.error;
      if (!cifV.valid) errors.cif = cifV.error;
      setFieldErrors(errors);
      if (Object.keys(errors).length > 0) { setError('Corrige los errores marcados'); return; }
    }
    if (step === 2) {
      if (classifications.length === 0) { setClassificationError('Selecciona al menos una clasificación'); return; }
    }
    setStep(s => s + 1);
  }

  function prevStep() { setError(''); setStep(s => s - 1); }

  async function handleSave() {
    setSaving(true); setError('');
    try {
      const { data, error: insertError } = await supabase.from('channels').insert({
        name: form.name.trim(), contact_name: form.contact_name || null,
        phone: form.phone || null, email: form.email || null,
        cif: form.cif || null, website: form.website || null,
        google_rating: form.google_rating && form.google_rating !== 'no_tiene' ? parseFloat(form.google_rating) : null,
        lead_source: form.lead_source?.length > 0
          ? form.lead_source.map(s => s === 'otros' && form.lead_source_other ? `otros:${form.lead_source_other}` : s)
          : null,
        potencial_caes: touchesCaes ? (potencialCaes || null) : null,
        potencial_energia: touchesEnergia ? (potencialEnergia || null) : null,
        pipeline_stage: locationForm.pipeline_stage,
        status: stageToStatus(locationForm.pipeline_stage),
        comunidad_autonoma: locationForm.comunidad_autonoma || null,
        address: locationForm.address || null, city: locationForm.city || null, province: locationForm.province || null,
        notes: locationForm.notes || null, assigned_to: user.id,
      }).select().single();
      if (insertError) throw insertError;
      const classInserts = classifications.map(c => ({ channel_id: data.id, classification_id: c.classification_id, custom_text: c.custom_text || null }));
      await supabase.from('channel_classifications').insert(classInserts);
      onSaved(data.id);
    } catch (err) { setError(err.message || 'Error al guardar'); }
    finally { setSaving(false); }
  }

  const fieldClass = "w-full px-3 py-2.5 bg-surface-0 border border-surface-3 rounded-xl text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-500 transition-colors";
  const STEPS = [{ num: 1, label: 'Datos básicos' }, { num: 2, label: 'Clasificación' }, { num: 3, label: 'Fase, ubicación y notas' }];

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-brand-400 font-semibold mb-4">← Cancelar</button>

      {/* Stepper */}
      <div className="flex items-center justify-center gap-0 mb-5">
        {STEPS.map((s, i) => (
          <div key={s.num} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              step === s.num ? 'bg-brand-500 text-white' : step > s.num ? 'bg-brand-500/15 text-brand-500' : 'bg-surface-2 text-text-muted border border-surface-3'
            }`}>{step > s.num ? <Check size={14} /> : s.num}</div>
            {i < STEPS.length - 1 && <div className={`w-8 sm:w-12 h-0.5 mx-1 rounded-full transition-colors ${step > s.num ? 'bg-brand-500/30' : 'bg-surface-3'}`} />}
          </div>
        ))}
      </div>
      <div className="text-center mb-5">
        <h1 className="text-lg font-extrabold tracking-tight">{STEPS[step - 1].label}</h1>
        <p className="text-xs text-text-muted mt-0.5">Paso {step} de 3</p>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-4 text-sm text-red-400">{error}</div>}

      {/* ============ PASO 1: Datos básicos (solo identificación/contacto) ============ */}
      {step === 1 && (
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Nombre del canal *</label>
            <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Nombre del canal o empresa" className={fieldClass} autoFocus />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Persona de contacto</label>
            <input type="text" value={form.contact_name} onChange={(e) => update('contact_name', e.target.value)} placeholder="Nombre del contacto principal" className={fieldClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Teléfono</label>
              <input type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="+34 612 345 678" className={`${fieldClass} ${fieldErrors.phone ? 'border-red-400' : ''}`} />
              {fieldErrors.phone && <p className="text-[10px] text-red-500 mt-0.5">{fieldErrors.phone}</p>}
            </div>
            <div>
              <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="contacto@empresa.com" className={`${fieldClass} ${fieldErrors.email ? 'border-red-400' : ''}`} />
              {fieldErrors.email && <p className="text-[10px] text-red-500 mt-0.5">{fieldErrors.email}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">CIF</label>
              <input type="text" value={form.cif} onChange={(e) => update('cif', e.target.value.toUpperCase())} placeholder="B12345678" className={`${fieldClass} ${fieldErrors.cif ? 'border-red-400' : ''}`} />
              {fieldErrors.cif && <p className="text-[10px] text-red-500 mt-0.5">{fieldErrors.cif}</p>}
            </div>
            <div>
              <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Valoración Google</label>
              <select value={form.google_rating} onChange={(e) => update('google_rating', e.target.value)} className={fieldClass}>
                <option value="">Seleccionar...</option>
                <option value="no_tiene">No tiene</option>
                {['5','4.5','4','3.5','3','2.5','2','1.5','1','0.5'].map(v => (
                  <option key={v} value={v}>⭐ {v}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Página web</label>
            <input type="url" value={form.website} onChange={(e) => update('website', e.target.value)} placeholder="https://www.ejemplo.com" className={fieldClass} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Origen del lead</label>
            <LeadSourceCheckboxes value={form.lead_source} onChange={(v) => update('lead_source', v)}
              otherText={form.lead_source_other || ''} onOtherTextChange={(t) => update('lead_source_other', t)} />
          </div>
          <button onClick={nextStep} className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl transition-colors mt-2">Siguiente →</button>
        </div>
      )}

      {/* ============ PASO 2: Clasificación única + potenciales condicionados ============ */}
      {step === 2 && (
        <div className="space-y-3">
          <ClassificationSelector value={classifications} onChange={(v) => { setClassifications(v); setClassificationError(''); }} error={classificationError} />

          {/* Campos dinámicos: aparecen solo si la clasificación elegida lo justifica */}
          {(touchesCaes || touchesEnergia) && (
            <div className="bg-brand-500/5 border border-brand-500/20 rounded-xl p-3 space-y-3">
              <div className="text-[10px] font-bold text-brand-500 uppercase tracking-wider">
                Campos según clasificación elegida
              </div>
              <div className="grid grid-cols-2 gap-3">
                {touchesCaes && (
                  <div>
                    <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Potencial CAES</label>
                    <select value={potencialCaes} onChange={(e) => setPotencialCaes(e.target.value)} className={fieldClass}>
                      <option value="">-</option>
                      {POTENCIAL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                )}
                {touchesEnergia && (
                  <div>
                    <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Potencial Energía</label>
                    <select value={potencialEnergia} onChange={(e) => setPotencialEnergia(e.target.value)} className={fieldClass}>
                      <option value="">-</option>
                      {POTENCIAL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <button onClick={prevStep} className="flex-1 py-3 border border-surface-3 text-text-secondary font-semibold rounded-xl text-sm hover:bg-surface-2 transition-colors">← Atrás</button>
            <button onClick={nextStep} className="flex-[2] py-3 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl transition-colors">Siguiente →</button>
          </div>
        </div>
      )}

      {/* ============ PASO 3: Fase del pipeline + ubicación + notas ============ */}
      {step === 3 && (
        <div className="space-y-3">
          {/* Fase del pipeline — necesario para que el canal aparezca en el Kanban */}
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-3">
            <label className="block text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1">Fase del Pipeline *</label>
            <select value={locationForm.pipeline_stage} onChange={(e) => updateLocation('pipeline_stage', e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-amber-300 rounded-xl text-sm font-semibold focus:outline-none focus:border-brand-500">
              {CREATABLE_PIPELINE_STAGES.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-amber-600 mt-1">
              Por defecto "Lead". El estado "{STATUS_CONFIG[stageToStatus(locationForm.pipeline_stage)]?.label}" se asigna automáticamente.
            </p>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Comunidad Autónoma</label>
            <select value={locationForm.comunidad_autonoma} onChange={(e) => updateLocation('comunidad_autonoma', e.target.value)} className={fieldClass}>
              <option value="">Seleccionar...</option>
              {COMUNIDADES_AUTONOMAS.map(ca => (
                <option key={ca} value={ca}>{ca}</option>
              ))}
            </select>
          </div>

          <AddressFields form={locationForm} update={updateLocation} fieldClass={fieldClass} />

          <div>
            <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Notas</label>
            <textarea value={locationForm.notes} onChange={(e) => updateLocation('notes', e.target.value)} placeholder="Notas sobre el canal..." rows={3} className={`${fieldClass} resize-none`} />
          </div>

          {/* Resumen */}
          <div className="bg-surface-1 border border-surface-3 rounded-xl p-3 mt-2">
            <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Resumen</div>
            <div className="space-y-1 text-xs text-text-secondary">
              <p><span className="font-semibold text-text-primary">{form.name}</span></p>
              {classifications.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {classifications.map((c, i) => (
                    <span key={i} className="px-2 py-0.5 bg-brand-500/10 text-brand-600 rounded text-[10px] font-semibold">{c._label}{c.custom_text ? `: ${c.custom_text}` : ''}</span>
                  ))}
                </div>
              )}
              {(potencialCaes || potencialEnergia) && (
                <p>
                  {touchesCaes && potencialCaes ? `CAES: ${potencialCaes}` : ''}
                  {touchesCaes && potencialCaes && touchesEnergia && potencialEnergia ? ' · ' : ''}
                  {touchesEnergia && potencialEnergia ? `Energía: ${potencialEnergia}` : ''}
                </p>
              )}
              <p>Fase: <span className="font-semibold text-text-primary">{PIPELINE_CONFIG[locationForm.pipeline_stage]}</span></p>
              {form.contact_name && <p>👤 {form.contact_name} {form.phone ? `· ${form.phone}` : ''}</p>}
              {locationForm.comunidad_autonoma && <p>📍 {locationForm.comunidad_autonoma}{locationForm.city ? ` · ${locationForm.city}` : ''}</p>}
            </div>
          </div>

          <div className="flex gap-2 mt-2">
            <button onClick={prevStep} className="flex-1 py-3 border border-surface-3 text-text-secondary font-semibold rounded-xl text-sm hover:bg-surface-2 transition-colors">← Atrás</button>
            <button onClick={handleSave} disabled={saving} className="flex-[2] py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
              {saving ? <><Loader2 size={16} className="animate-spin" /> Guardando...</> : <><Check size={16} /> Guardar canal</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ PÁGINA PRINCIPAL ============
export default function ChannelsPage() {
  const { user, isManager } = useAuthContext();
  const { types, typeMap } = useChannelTypes();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showBulkReassign, setShowBulkReassign] = useState(false);
  const [classificationsByChannel, setClassificationsByChannel] = useState({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const detailId = params.get('detail');
    if (detailId) {
      setSelectedId(detailId);
      setView('detail');
      window.history.replaceState({}, '', '/channels');
    }
  }, []);

  useEffect(() => {
    if (user) loadChannels();
  }, [user]);

  async function loadChannels() {
    setLoading(true);
    try {
      let query = supabase
        .from('channels')
        .select(`*, visits (checkin_at)`)
        .order('updated_at', { ascending: false });

      // Igual que en PipelinePage: si es manager/director, ve todos los canales
      // del equipo (sin filtrar por assigned_to); si es KAM, solo los suyos.
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

      // Cargar clasificaciones de todos los canales visibles en UNA sola query
      // (en vez de una por canal, para no disparar N queries en listados grandes)
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
          // Evitar repetir el mismo "canal" varias veces si hay varios subcanales del mismo canal
          if (!grouped[c.channel_id].some(g => g.canal_corto === c.channel_classification.canal)) {
            grouped[c.channel_id].push({ canal_corto: c.channel_classification.canal });
          }
        });
        setClassificationsByChannel(grouped);
      } else {
        setClassificationsByChannel({});
      }
    } catch (err) {
      console.error('Error cargando canales:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(id) {
    if (id === 'new') { setView('new'); } else { setSelectedId(id); setView('detail'); }
  }
  function handleBack() { setView('list'); setSelectedId(null); }
  function handleSaved(newId) { loadChannels(); setSelectedId(newId); setView('detail'); }

  if (view === 'detail' && selectedId) return <ChannelDetail channelId={selectedId} onBack={handleBack} types={types} typeMap={typeMap} />;
  if (view === 'new') return <NewChannelForm onBack={handleBack} onSaved={handleSaved} types={types} />;
  return (
    <>
      <ChannelList channels={channels} loading={loading} onSelect={handleSelect} filter={filter} setFilter={setFilter}
        search={search} setSearch={setSearch} typeMap={typeMap} isManager={isManager} onBulkReassign={() => setShowBulkReassign(true)}
        classificationsByChannel={classificationsByChannel} />
      {showBulkReassign && (
        <BulkReassignModal onClose={() => setShowBulkReassign(false)} onDone={() => loadChannels()} />
      )}
    </>
  );
}
