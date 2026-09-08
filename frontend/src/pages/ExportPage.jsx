import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  BarChart3,
  Building2,
  Check,
  CheckCircle,
  Download,
  FileSpreadsheet,
  Loader2,
  MapPin,
  Users,
  X,
} from 'lucide-react';
import { useAuthContext } from '../components/AuthProvider';
import { supabase } from '../lib/supabase';

const DATASETS = [
  { id: 'channels', label: 'Canales', description: 'Ficha comercial, contacto, clasificación y evolución', icon: Building2 },
  { id: 'visits', label: 'Visitas', description: 'Historial, resultados, próximos pasos y geolocalización', icon: MapPin },
  { id: 'pipeline', label: 'Pipeline', description: 'Situación y evolución comercial de los canales', icon: BarChart3 },
];

const STATUS_LABELS = {
  pendiente_contacto: 'Pendiente contacto', en_desarrollo: 'En desarrollo', en_evaluacion: 'En evaluación',
  en_proceso_alta: 'En proceso de alta', activo: 'Activo', rechazado: 'Rechazado', cierre_sin_acuerdo: 'Cierre sin acuerdo',
};

const STAGE_LABELS = {
  lead: 'Lead', first_contact: 'Primer contacto', proposal: 'Propuesta', negotiation: 'Negociación',
  onboarding: 'En proceso de alta', active: 'Activo', closed_no_deal: 'Sin acuerdo',
};

const RESULT_LABELS = { positive: 'Positiva', neutral: 'Neutral', negative: 'Negativa' };

const LEAD_SOURCE_LABELS = {
  evento: 'Evento', congreso: 'Congreso', webinar: 'Webinar', linkedin_sales_navigator: 'LinkedIn/Sales Navigator',
  recomendacion_partner: 'Recomendación partner', industrial: 'Industrial', generacion_distribuida: 'Generación Distribuida',
  canal_naturgy: 'Canal Naturgy', kam: 'KAM', asociacion_sectorial: 'Asociación sectorial', fabricante: 'Fabricante',
  solicitud_directa: 'Solicitud directa del canal', paginas_empleo: 'Páginas de empleo', otros: 'Otros',
};

const ONBOARDING_LABELS = {
  documentation_requested: 'Documentación solicitada al canal', sauc_opening: 'Apertura de SAUC',
  delayed_by_channel: 'Proceso demorado por el canal', order_contract_activated: 'Pedido y contrato activados',
  user_created: 'Alta de usuario', onboarding_completed: 'Proceso de alta finalizado',
};

const CAES_ROLE_LABELS = { promoter: 'Promotor', promoter_ot: 'Promotor + OT', promoter_ot_verifier: 'Promotor + OT + Verificador' };
const CONTRACT_LABELS = { model_2_alternative_payer: 'Modelo 2 · Pagador alternativo', model_3_savings_facilitator: 'Modelo 3 · Facilitador de ahorro' };
const TIER_LABELS = { tier_a: 'Tramo A', tier_b: 'Tramo B', tier_c: 'Tramo C' };
const OFFICE_LABELS = { sinceo2: 'SINCEO2', e_program: 'E-PROGRAM', unassigned: 'Sin OT asignada' };
const VERIFIER_LABELS = { margube: 'MARGUBE', eqa: 'EQA', unassigned: 'Sin verificador asignado' };

function dateLabel(value) {
  return value ? new Date(value).toLocaleDateString('es-ES') : '';
}

function timeLabel(value) {
  return value ? new Date(value).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
}

function listLabel(value, labels = {}) {
  if (Array.isArray(value)) return value.map(item => labels[item] || item).join(', ');
  return labels[value] || value || '';
}

const CHANNEL_FIELDS = [
  { id: 'name', label: 'Nombre', group: 'Identificación', value: row => row.name || '' },
  { id: 'responsible', label: 'Responsable', group: 'Identificación', value: row => row._responsible || '' },
  { id: 'status', label: 'Estado', group: 'Identificación', value: row => STATUS_LABELS[row.status] || row.status || '' },
  { id: 'pipeline_stage', label: 'Fase del pipeline', group: 'Identificación', value: row => STAGE_LABELS[row.pipeline_stage] || row.pipeline_stage || '' },
  { id: 'classification', label: 'Clasificación del canal', group: 'Identificación', value: row => row._classification || '' },
  { id: 'contact_name', label: 'Persona de contacto', group: 'Contacto', value: row => row.contact_name || '' },
  { id: 'phone', label: 'Teléfono', group: 'Contacto', value: row => row.phone || '' },
  { id: 'email', label: 'Correo electrónico', group: 'Contacto', value: row => row.email || '' },
  { id: 'website', label: 'Web', group: 'Contacto', value: row => row.website || '' },
  { id: 'cif', label: 'CIF', group: 'Contacto', value: row => row.cif || '' },
  { id: 'address', label: 'Dirección', group: 'Ubicación', value: row => row.address || '' },
  { id: 'city', label: 'Ciudad', group: 'Ubicación', value: row => row.city || '' },
  { id: 'province', label: 'Provincia', group: 'Ubicación', value: row => row.province || '' },
  { id: 'postal_code', label: 'Código postal', group: 'Ubicación', value: row => row.postal_code || '' },
  { id: 'comunidad_autonoma', label: 'Comunidad Autónoma', group: 'Ubicación', value: row => row.comunidad_autonoma || '' },
  { id: 'google_rating', label: 'Valoración Google', group: 'Información comercial', value: row => row.google_rating ?? '' },
  { id: 'lead_source', label: 'Origen del lead', group: 'Información comercial', value: row => listLabel(row.lead_source, LEAD_SOURCE_LABELS) },
  { id: 'volume_amount', label: 'Volumen anual', group: 'Información comercial', value: row => row.volume_amount ?? '' },
  { id: 'volume_unit', label: 'Tipo de volumen', group: 'Información comercial', value: row => row.volume_unit || '' },
  { id: 'energy_potential', label: 'Potencial Energía', group: 'Información comercial', value: row => row.potencial_energia || row.potencial_venta_energia || '' },
  { id: 'onboarding_status', label: 'Estado del alta', group: 'Información comercial', value: row => ONBOARDING_LABELS[row.onboarding_status] || row.onboarding_status || '' },
  { id: 'notes', label: 'Notas', group: 'Información comercial', value: row => row.notes || '' },
  { id: 'economic_report', label: 'Informe económico', group: 'Información comercial', value: row => row.informe_economico_name || '' },
  { id: 'caes_type', label: 'Tipo de canal CAEs', group: 'Información CAEs', caesOnly: true, value: row => row.canal_caes_type || row.tipo_canal_caes || '' },
  { id: 'caes_sector', label: 'Sector CAEs objetivo', group: 'Información CAEs', caesOnly: true, value: row => listLabel(row.sector_cae_objetivo || row.sector_cae) },
  { id: 'caes_potential', label: 'Potencial CAEs', group: 'Información CAEs', caesOnly: true, value: row => row.potencial_caes || '' },
  { id: 'caes_role', label: 'Rol CAEs', group: 'Información CAEs', caesOnly: true, value: row => CAES_ROLE_LABELS[row.caes_role] || row.caes_role || '' },
  { id: 'caes_contract_model', label: 'Modelo de contrato CAEs', group: 'Información CAEs', caesOnly: true, value: row => CONTRACT_LABELS[row.caes_contract_model] || row.caes_contract_model || '' },
  { id: 'caes_remuneration_tier', label: 'Tramo retributivo CAEs', group: 'Información CAEs', caesOnly: true, value: row => TIER_LABELS[row.caes_remuneration_tier] || row.caes_remuneration_tier || '' },
  { id: 'caes_technical_office', label: 'Oficina técnica', group: 'Información CAEs', caesOnly: true, value: row => OFFICE_LABELS[row.caes_technical_office] || row.caes_technical_office || '' },
  { id: 'caes_verifier', label: 'Verificador', group: 'Información CAEs', caesOnly: true, value: row => VERIFIER_LABELS[row.caes_verifier] || row.caes_verifier || '' },
  { id: 'caes_order_number', label: 'Número de pedido', group: 'Información CAEs', caesOnly: true, value: row => row.caes_order_number || '' },
  { id: 'created_at', label: 'Fecha de creación', group: 'Fechas', value: row => dateLabel(row.created_at) },
  { id: 'updated_at', label: 'Última actualización', group: 'Fechas', value: row => dateLabel(row.updated_at) },
  { id: 'pipeline_stage_changed_at', label: 'Último cambio de fase', group: 'Fechas', value: row => dateLabel(row.pipeline_stage_changed_at) },
  { id: 'onboarding_status_changed_at', label: 'Último avance del alta', group: 'Fechas', value: row => dateLabel(row.onboarding_status_changed_at) },
];

const VISIT_FIELDS = [
  { id: 'channel', label: 'Canal', group: 'Visita', value: row => row.channels?.name || '' },
  { id: 'responsible', label: 'Responsable', group: 'Visita', value: row => row._responsible || '' },
  { id: 'date', label: 'Fecha', group: 'Visita', value: row => dateLabel(row.checkin_at) },
  { id: 'checkin_time', label: 'Hora de entrada', group: 'Visita', value: row => timeLabel(row.checkin_at) },
  { id: 'checkout_time', label: 'Hora de salida', group: 'Visita', value: row => timeLabel(row.checkout_at) },
  { id: 'duration', label: 'Duración (min)', group: 'Visita', value: row => row.duration_minutes ?? '' },
  { id: 'result', label: 'Resultado', group: 'Contenido', value: row => RESULT_LABELS[row.result] || row.result || '' },
  { id: 'objective', label: 'Objetivo', group: 'Contenido', value: row => row.objective || '' },
  { id: 'result_notes', label: 'Notas', group: 'Contenido', value: row => row.result_notes || row.notes || '' },
  { id: 'next_steps', label: 'Próximos pasos', group: 'Contenido', value: row => row.next_steps || '' },
  { id: 'next_action_date', label: 'Fecha de próxima acción', group: 'Contenido', value: row => dateLabel(row.next_action_date) },
  { id: 'gps_verified', label: 'GPS verificado', group: 'Geolocalización', value: row => row.is_gps_verified ? 'Sí' : 'No' },
  { id: 'checkin_lat', label: 'Latitud de entrada', group: 'Geolocalización', value: row => row.checkin_lat ?? '' },
  { id: 'checkin_lng', label: 'Longitud de entrada', group: 'Geolocalización', value: row => row.checkin_lng ?? '' },
  { id: 'checkin_accuracy', label: 'Precisión GPS (m)', group: 'Geolocalización', value: row => row.checkin_accuracy ?? '' },
  { id: 'offline_sync', label: 'Sincronización offline', group: 'Geolocalización', value: row => row.is_offline_sync ? 'Sí' : 'No' },
];

const DEFAULT_FIELDS = {
  channels: ['name', 'responsible', 'status', 'pipeline_stage', 'classification', 'contact_name', 'phone', 'email', 'city', 'province', 'lead_source', 'volume_amount', 'volume_unit', 'created_at'],
  visits: ['channel', 'responsible', 'date', 'checkin_time', 'checkout_time', 'duration', 'result', 'objective', 'result_notes', 'next_steps'],
  pipeline: ['name', 'responsible', 'pipeline_stage', 'status', 'classification', 'energy_potential', 'volume_amount', 'volume_unit', 'updated_at', 'pipeline_stage_changed_at'],
};

function fieldCatalog(type) {
  return type === 'visits' ? VISIT_FIELDS : CHANNEL_FIELDS;
}

function classificationLabel(item) {
  const classification = item.channel_classification;
  if (!classification) return item.custom_text || '';
  return [classification.canal, classification.subcanal, classification.tipo, item.custom_text].filter(Boolean).join(' > ');
}

export default function ExportPage() {
  const { user, profile, isManager } = useAuthContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [dataset, setDataset] = useState('channels');
  const [format, setFormat] = useState('xlsx');
  const [selectedFields, setSelectedFields] = useState(DEFAULT_FIELDS.channels);
  const [teamKams, setTeamKams] = useState([]);
  const [ownerFilter, setOwnerFilter] = useState('team');
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState(false);
  const [savedPreference, setSavedPreference] = useState(false);

  const canSeeCaesFields = profile?.benchmark_profile !== 'new_business';
  const availableFields = useMemo(() => fieldCatalog(dataset).filter(field => canSeeCaesFields || !field.caesOnly), [dataset, canSeeCaesFields]);
  const groupedFields = useMemo(() => availableFields.reduce((groups, field) => {
    if (!groups[field.group]) groups[field.group] = [];
    groups[field.group].push(field);
    return groups;
  }, {}), [availableFields]);

  useEffect(() => {
    if (user) loadTeamScope();
  }, [user?.id, isManager]);

  useEffect(() => {
    if (!user) return;
    const allowedIds = new Set(availableFields.map(field => field.id));
    let preference = null;
    try {
      preference = JSON.parse(localStorage.getItem(`kamapp_export_preferences:${user.id}:${dataset}`));
    } catch {}
    const restoredFields = (preference?.fields || []).filter(id => allowedIds.has(id));
    setSelectedFields(restoredFields.length ? restoredFields : DEFAULT_FIELDS[dataset].filter(id => allowedIds.has(id)));
    setFormat(preference?.format === 'csv' ? 'csv' : 'xlsx');
    setSavedPreference(restoredFields.length > 0);
    setDone(false);
  }, [dataset, user?.id, canSeeCaesFields]);

  async function loadTeamScope() {
    if (!isManager) {
      setTeamKams([]);
      setOwnerFilter(user.id);
      return;
    }
    const { data, error } = await supabase.from('profiles').select('id, full_name, role, reports_to').eq('is_active', true).order('full_name');
    if (error) {
      console.error('No se pudo cargar la jerarquía de exportación:', error);
      setTeamKams([]);
      return;
    }
    const descendants = [];
    const visited = new Set([user.id]);
    let managersToExpand = [user.id];
    while (managersToExpand.length) {
      const currentManagers = new Set(managersToExpand);
      const children = (data || []).filter(person => currentManagers.has(person.reports_to) && !visited.has(person.id));
      children.forEach(person => visited.add(person.id));
      descendants.push(...children.filter(person => person.role === 'kam'));
      managersToExpand = children.filter(person => ['coordinator', 'manager', 'director'].includes(person.role)).map(person => person.id);
    }
    setTeamKams(descendants);
    setOwnerFilter('team');
  }

  function toggleField(fieldId) {
    setDone(false);
    setSelectedFields(current => current.includes(fieldId) ? current.filter(id => id !== fieldId) : [...current, fieldId]);
  }

  function selectedOwnerIds() {
    const permittedIds = [user.id, ...teamKams.map(kam => kam.id)];
    return ownerFilter === 'team' ? permittedIds : permittedIds.includes(ownerFilter) ? [ownerFilter] : [user.id];
  }

  function responsibleMap() {
    return new Map([[user.id, profile?.full_name || user.email || 'Usuario'], ...teamKams.map(kam => [kam.id, kam.full_name])]);
  }

  async function loadChannelRows(type, ownerIds, profileNames) {
    let query = supabase.from('channels').select('*').in('assigned_to', ownerIds);
    query = type === 'pipeline' ? query.order('pipeline_stage').order('name') : query.order('name');
    const { data: channels, error } = await query;
    if (error) throw error;

    const rows = channels || [];
    const classificationMap = new Map();
    if (selectedFields.includes('classification') && rows.length) {
      const { data: classifications, error: classificationError } = await supabase
        .from('channel_classifications')
        .select('channel_id, custom_text, channel_classification(canal, subcanal, tipo)')
        .in('channel_id', rows.map(row => row.id));
      if (classificationError) throw classificationError;
      (classifications || []).forEach(item => {
        const labels = classificationMap.get(item.channel_id) || [];
        const label = classificationLabel(item);
        if (label) labels.push(label);
        classificationMap.set(item.channel_id, labels);
      });
    }
    return rows.map(row => ({ ...row, _responsible: profileNames.get(row.assigned_to) || '', _classification: (classificationMap.get(row.id) || []).join(' · ') }));
  }

  async function loadVisitRows(ownerIds, profileNames) {
    const { data, error } = await supabase.from('visits').select('*, channels(name)').in('kam_id', ownerIds).order('checkin_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(row => ({ ...row, _responsible: profileNames.get(row.kam_id) || '' }));
  }

  function saveFile(data, fileName, sheetName) {
    const worksheet = XLSX.utils.json_to_sheet(data);
    worksheet['!cols'] = Object.keys(data[0]).map(key => ({
      wch: Math.min(60, Math.max(key.length, ...data.slice(0, 100).map(row => String(row[key] ?? '').length)) + 2),
    }));
    if (format === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      return;
    }
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
  }

  async function handleExport() {
    if (!selectedFields.length) {
      alert('Selecciona al menos un campo para realizar la extracción.');
      return;
    }
    setExporting(true);
    setDone(false);
    try {
      const ownerIds = selectedOwnerIds();
      const profileNames = responsibleMap();
      const rows = dataset === 'visits' ? await loadVisitRows(ownerIds, profileNames) : await loadChannelRows(dataset, ownerIds, profileNames);
      if (!rows.length) {
        alert('No hay datos para exportar en el ámbito seleccionado.');
        return;
      }
      const fields = availableFields.filter(field => selectedFields.includes(field.id));
      const exportData = rows.map(row => Object.fromEntries(fields.map(field => [field.label, field.value(row)])));
      const today = new Date().toISOString().slice(0, 10);
      const datasetName = DATASETS.find(item => item.id === dataset)?.label || 'Datos';
      saveFile(exportData, `${dataset}_kamapp_${today}`, datasetName);
      setDone(true);
      const shouldSave = window.confirm('¿Quieres guardar esta selección de campos y formato para la próxima extracción?');
      if (shouldSave) {
        localStorage.setItem(`kamapp_export_preferences:${user.id}:${dataset}`, JSON.stringify({ fields: selectedFields, format }));
        setSavedPreference(true);
      }
    } catch (error) {
      console.error('Error exportando:', error);
      alert(`Error al exportar: ${error.message}`);
    } finally {
      setExporting(false);
    }
  }

  const currentDataset = DATASETS.find(item => item.id === dataset);

  function closeExport() {
    const returnTo = location.state?.returnTo;
    navigate(returnTo && returnTo !== '/export' ? returnTo : '/home', { replace: true });
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <FileSpreadsheet size={20} className="text-brand-500" />
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-text-primary">Extraer datos</h1>
            <p className="mt-0.5 text-xs text-text-secondary">Selecciona el contenido y descarga el resultado en Excel o CSV</p>
          </div>
        </div>
        <button onClick={closeExport} title="Cerrar" aria-label="Cerrar extracción de datos"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary">
          <X size={19} />
        </button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {DATASETS.map(item => {
          const Icon = item.icon;
          const active = dataset === item.id;
          return (
            <button key={item.id} onClick={() => setDataset(item.id)}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${active ? 'border-brand-400 bg-brand-50' : 'border-surface-3 bg-white hover:bg-surface-1'}`}>
              <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${active ? 'bg-brand-100 text-brand-600' : 'bg-surface-2 text-text-secondary'}`}><Icon size={18} /></span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-text-primary">{item.label}</span>
                <span className="block text-[10px] leading-relaxed text-text-muted">{item.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-xl border border-surface-3 bg-white">
        <div className="flex flex-col gap-3 border-b border-surface-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-bold text-text-primary">Configurar {currentDataset?.label.toLowerCase()}</div>
            <div className="mt-0.5 text-[10px] text-text-muted">
              {selectedFields.length} de {availableFields.length} campos seleccionados{savedPreference ? ' · Configuración recuperada' : ''}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isManager && (
              <label className="flex items-center gap-2 rounded-lg border border-surface-3 bg-surface-1 px-2.5 py-1.5">
                <Users size={13} className="text-text-muted" />
                <select value={ownerFilter} onChange={event => setOwnerFilter(event.target.value)} className="bg-transparent text-xs font-semibold text-text-secondary focus:outline-none">
                  <option value="team">Mi equipo ({teamKams.length + 1})</option>
                  <option value={user.id}>Mis registros</option>
                  {teamKams.map(kam => <option key={kam.id} value={kam.id}>{kam.full_name}</option>)}
                </select>
              </label>
            )}
            <div className="flex rounded-lg border border-surface-3 bg-surface-1 p-0.5">
              <button onClick={() => { setFormat('xlsx'); setDone(false); }} className={`rounded-md px-3 py-1.5 text-xs font-bold ${format === 'xlsx' ? 'bg-white text-brand-600 shadow-sm' : 'text-text-muted'}`}>Excel</button>
              <button onClick={() => { setFormat('csv'); setDone(false); }} className={`rounded-md px-3 py-1.5 text-xs font-bold ${format === 'csv' ? 'bg-white text-brand-600 shadow-sm' : 'text-text-muted'}`}>CSV</button>
            </div>
          </div>
        </div>

        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Campos incluidos</span>
            <div className="flex gap-3 text-[10px] font-semibold">
              <button onClick={() => setSelectedFields(availableFields.map(field => field.id))} className="text-brand-600 hover:text-brand-700">Marcar todos</button>
              <button onClick={() => setSelectedFields([])} className="text-text-muted hover:text-text-secondary">Desmarcar</button>
            </div>
          </div>
          <div className="space-y-4">
            {Object.entries(groupedFields).map(([group, fields]) => (
              <div key={group}>
                <div className="mb-2 text-[10px] font-bold text-text-secondary">{group}</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {fields.map(field => {
                    const checked = selectedFields.includes(field.id);
                    return (
                      <label key={field.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${checked ? 'border-brand-200 bg-brand-50/60 text-text-primary' : 'border-surface-3 text-text-secondary hover:bg-surface-1'}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleField(field.id)} className="sr-only" />
                        <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${checked ? 'border-brand-500 bg-brand-500 text-white' : 'border-surface-4 bg-white'}`}>{checked && <Check size={11} strokeWidth={3} />}</span>
                        <span>{field.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-surface-3 bg-surface-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[10px] text-text-muted">
            {isManager ? 'Solo se incluyen tus registros y los de los KAMs que dependen de tu jerarquía.' : 'Solo se incluyen los registros que tienes asignados.'}
            {!canSeeCaesFields && ' Los campos exclusivos de CAEs no están disponibles para tu perfil.'}
          </div>
          <button onClick={handleExport} disabled={exporting || selectedFields.length === 0}
            className={`flex min-w-[160px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors ${done ? 'border border-green-200 bg-green-50 text-green-600' : 'bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40'}`}>
            {exporting ? <><Loader2 size={14} className="animate-spin" /> Extrayendo…</>
              : done ? <><CheckCircle size={14} /> Descargado</>
                : <><Download size={14} /> Extraer {format === 'xlsx' ? 'Excel' : 'CSV'}</>}
          </button>
        </div>
      </section>
    </div>
  );
}
