/**
 * CRM para KAMs — Constantes compartidas
 *
 * Todas las definiciones de campos, estados, tipos y opciones.
 * Importar desde aquí en vez de definir en cada componente.
 */

// ============ STATUS CONFIG (única fuente de verdad para colores de estados) ============
// Incluye TANTO clases Tailwind (para badges en ChannelsPage, etc.) COMO colores hex
// (para estilos inline en PipelinePage, barras de progreso, etc.).
// Si cambias un color, cámbialo aquí y se reflejará en todo el CRM.
export const STATUS_CONFIG = {
  pendiente_contacto: { label: 'Pendiente contacto', color: '#94a3b8', bg: 'bg-slate-500/20',  text: 'text-slate-400',  border: 'border-slate-500/30',  bg_rgba: 'rgba(148,163,184,0.1)', border_rgba: 'rgba(148,163,184,0.25)' },
  en_desarrollo:      { label: 'En desarrollo',      color: '#eab308', bg: 'bg-yellow-500/20', text: 'text-yellow-500', border: 'border-yellow-500/30', bg_rgba: 'rgba(234,179,8,0.1)',   border_rgba: 'rgba(234,179,8,0.25)'   },
  en_evaluacion:      { label: 'En evaluación',      color: '#8b5cf6', bg: 'bg-violet-500/20', text: 'text-violet-500', border: 'border-violet-500/30', bg_rgba: 'rgba(139,92,246,0.1)',  border_rgba: 'rgba(139,92,246,0.25)'  },
  en_proceso_alta:    { label: 'En proceso de alta', color: '#06b6d4', bg: 'bg-cyan-500/20',   text: 'text-cyan-500',   border: 'border-cyan-500/30',   bg_rgba: 'rgba(6,182,212,0.1)',   border_rgba: 'rgba(6,182,212,0.25)'   },
  activo:             { label: 'Activo',             color: '#22c55e', bg: 'bg-green-500/20',  text: 'text-green-500',  border: 'border-green-500/30',  bg_rgba: 'rgba(34,197,94,0.1)',   border_rgba: 'rgba(34,197,94,0.25)'   },
  rechazado:          { label: 'Rechazado',          color: '#dc2626', bg: 'bg-red-600/20',    text: 'text-red-600',    border: 'border-red-600/30',    bg_rgba: 'rgba(220,38,38,0.1)',   border_rgba: 'rgba(220,38,38,0.25)'   },
  cierre_sin_acuerdo: { label: 'Cierre sin acuerdo', color: '#db2777', bg: 'bg-pink-600/20',   text: 'text-pink-600',   border: 'border-pink-600/30',   bg_rgba: 'rgba(219,39,119,0.1)',  border_rgba: 'rgba(219,39,119,0.25)'  },
};

// Array de estados en orden, derivado de STATUS_CONFIG.
// Usado en PipelinePage (columnas del Kanban y barra de progreso).
export const STATUS_LIST = Object.entries(STATUS_CONFIG).map(([key, cfg]) => ({
  key,
  label: cfg.label,
  color: cfg.color,
  bg: cfg.bg_rgba,
  border: cfg.border_rgba,
}));

// ============ MOTIVOS DE DESCARTE ============
// Se guardan en channels.rejection_reason junto con el detalle opcional.
export const REJECTION_REASON_OPTIONS = {
  rechazado: [
    'Derivado a otro canal o partner',
    'Ya colabora con Naturgy',
    'Histórico o conflicto',
  ],
  cierre_sin_acuerdo: [
    'Falta de interés',
    'No le interesa colaborar',
    'No le interesan las condiciones económicas',
    'No forma parte de su estrategia actual',
    'Complejidad administrativa o contractual',
  ],
};

// ============ PIPELINE CONFIG (stage → label) ============
export const PIPELINE_CONFIG = {
  lead:           'Lead',
  first_contact:  'Primer contacto',
  proposal:       'Propuesta',
  negotiation:    'Negociación',
  onboarding:     'En proceso alta',
  active:         'Activo',
  closed_no_deal: 'Sin acuerdo',
};

// ============ PIPELINE STAGES (array completo, para DashboardPage y formularios) ============
// Colores diferenciados para cada fase del pipeline (distinto de los estados/status,
// porque un pipeline stage puede mapearse a varios statuses).
export const PIPELINE_STAGES = [
  { key: 'lead',           label: 'Lead',             color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.25)' },
  { key: 'first_contact',  label: 'Primer contacto',  color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.25)'  },
  { key: 'proposal',       label: 'Propuesta',        color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',  border: 'rgba(139,92,246,0.25)'  },
  { key: 'negotiation',    label: 'Negociación',      color: '#eab308', bg: 'rgba(234,179,8,0.1)',   border: 'rgba(234,179,8,0.25)'   },
  { key: 'onboarding',     label: 'En proceso alta',  color: '#06b6d4', bg: 'rgba(6,182,212,0.1)',   border: 'rgba(6,182,212,0.25)'   },
  { key: 'active',         label: 'Activo',           color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.25)'   },
  { key: 'closed_no_deal', label: 'Sin acuerdo',      color: '#db2777', bg: 'rgba(219,39,119,0.1)',  border: 'rgba(219,39,119,0.25)'  },
];

// Stages disponibles al CREAR un canal (sin "closed_no_deal" — no tiene sentido nacer ya cerrado)
export const CREATABLE_PIPELINE_STAGES = PIPELINE_STAGES.filter(s => s.key !== 'closed_no_deal');

export const STAGE_LABELS = Object.fromEntries(PIPELINE_STAGES.map(s => [s.key, s.label]));

export const ACTIVE_PIPELINE_STAGES = ['first_contact', 'proposal', 'negotiation', 'onboarding'];
export const TERMINAL_STAGES        = ['active', 'closed_no_deal'];
export const INITIAL_STAGE          = 'lead';

// ============ stage -> status (única fuente de verdad, usada en todo el CRM) ============
export function stageToStatus(stage) {
  if (stage === 'active')         return 'activo';
  if (stage === 'lead')           return 'pendiente_contacto';
  if (stage === 'closed_no_deal') return 'cierre_sin_acuerdo';
  if (stage === 'onboarding')     return 'en_proceso_alta';
  if (['first_contact', 'proposal', 'negotiation'].includes(stage)) return 'en_desarrollo';
  return 'pendiente_contacto';
}

// ============ SECTOR CAE (referencia informativa; ya NO es un campo propio del canal:
// la clasificación CAEs > Subcanal ya cubre esta información) ============
export const SECTOR_CAE_OPTIONS = [
  'Aislamiento térmico',
  'Aerotermia',
  'Climatización',
  'BACS',
  'Rehabilitación envolvente',
  'ACS',
  'Iluminación',
  'Vehículo eléctrico',
  'Neumáticos',
  'Tratamiento de aguas',
  'Industrial',
  'Otros',
];

// ============ POTENCIAL ============
export const POTENCIAL_OPTIONS = ['Bajo', 'Medio', 'Alto', 'Muy Alto'];

export const POTENCIAL_CONFIG = [
  { key: 'Bajo',     label: 'Bajo',     color: '#94a3b8', bg: '#f1f5f9' },
  { key: 'Medio',    label: 'Medio',    color: '#f59e0b', bg: '#fffbeb' },
  { key: 'Alto',     label: 'Alto',     color: '#E87A1E', bg: '#FEF3E8' },
  { key: 'Muy Alto', label: 'Muy Alto', color: '#dc2626', bg: '#fef2f2' },
];

// ============ COMUNIDADES AUTÓNOMAS ============
export const COMUNIDADES_AUTONOMAS = [
  'Andalucía', 'Aragón', 'Asturias', 'Baleares', 'Canarias', 'Cantabria',
  'Castilla-La Mancha', 'Castilla y León', 'Cataluña', 'Ceuta',
  'Comunidad Valenciana', 'Extremadura', 'Galicia', 'La Rioja', 'Madrid',
  'Melilla', 'Murcia', 'Navarra', 'País Vasco',
];

// ============ ORIGEN DEL LEAD ============
export const LEAD_SOURCE_OPTIONS = [
  // PULL
  { value: 'recomendacion_partner',    label: 'Recomendación partner',       group: 'pull' },
  { value: 'industrial',               label: 'Industrial',                  group: 'pull' },
  { value: 'generacion_distribuida',   label: 'Generación Distribuida',      group: 'pull' },
  { value: 'canal_naturgy',            label: 'Canal Naturgy',               group: 'pull' },
  { value: 'kam',                      label: 'KAM',                         group: 'pull' },
  { value: 'solicitud_directa',        label: 'Solicitud directa del canal', group: 'pull' },
  // PUSH
  { value: 'evento',                   label: 'Evento',                      group: 'push' },
  { value: 'congreso',                 label: 'Congreso',                    group: 'push' },
  { value: 'webinar',                  label: 'Webinar',                     group: 'push' },
  { value: 'linkedin_sales_navigator', label: 'LinkedIn/Sales Navigator',    group: 'push' },
  { value: 'asociacion_sectorial',     label: 'Asociación sectorial',        group: 'push' },
  { value: 'paginas_empleo',           label: 'Páginas de empleo',           group: 'push' },
  // Sin grupo
  { value: 'otros',                    label: 'Otros',                       group: null   },
];

// ============ ZONAS ============
export const ZONES = ['Norte', 'Centro', 'Este'];

// ============ CLASIFICACIÓN DE CANAL ============
// Única fuente de verdad para "qué tipo de canal es". Sustituye a los antiguos
// campos sueltos tipo_canal_caes/sector_cae: la rama "CAEs" ya cubre esos sectores.
export const CHANNEL_CATEGORIES = {
  'Energia': {
    subcategories: ['Mayorista', 'Integral', 'PYMEs'],
  },
  'Solar': {
    subcategories: ['Venta', 'Instalador', 'Integral'],
  },
  'CAEs': {
    subcategories: [
      'Aislamiento', 'Aerotermia', 'Climatización', 'BACS',
      'Rehabilitación', 'ACS', 'Iluminación', 'VE', 'Industrial', 'Otros',
    ],
  },
  'Otros': {
    subcategories: ['Financiero', 'Tecnológico', 'Consultoría', 'Otro'],
  },
};

// ============ ACTIVITY TYPES ============
export const ACTION_TYPES = [
  { key: 'visit',    label: 'Visita',    icon: '📍', color: '#E87A1E', bg: '#FEF3E8' },
  { key: 'call',     label: 'Llamada',   icon: '📞', color: '#3b82f6', bg: '#eff6ff' },
  { key: 'email',    label: 'Email',     icon: '📧', color: '#8b5cf6', bg: '#f3eeff' },
  { key: 'whatsapp', label: 'WhatsApp',  icon: '💬', color: '#16a34a', bg: '#e6f5ed' },
  { key: 'meeting',  label: 'Reunión',   icon: '👥', color: '#E87A1E', bg: '#FEF3E8' },
  { key: 'linkedin', label: 'LinkedIn',  icon: '💼', color: '#0077b5', bg: '#e8f4fd' },
  { key: 'other',    label: 'Otro',      icon: '📋', color: '#5a6078', bg: '#f0f0f4' },
];

// ============ RESULT OPTIONS ============
export const RESULT_OPTIONS = [
  { key: 'positive', label: 'Positiva', color: '#16a34a', bg: 'bg-green-50', text: 'text-green-600' },
  { key: 'neutral',  label: 'Neutral',  color: '#f59e0b', bg: 'bg-amber-50', text: 'text-amber-600' },
  { key: 'negative', label: 'Negativa', color: '#ef4444', bg: 'bg-red-50',   text: 'text-red-600'   },
];

// ============ VOLUME UNITS ============
export const VOLUME_UNITS = [
  { key: 'residencial', label: 'Residencial', unit: 'SWE+SWG', color: '#3b82f6', bg: '#eff6ff' },
  { key: 'pymes',       label: 'PYMEs',       unit: 'GWh',     color: '#8b5cf6', bg: '#f3eeff' },
  { key: 'caes',        label: 'CAEs',        unit: 'GWh',     color: '#16a34a', bg: '#e6f5ed' },
  { key: 'solar',       label: 'Solar',       unit: 'kWp',     color: '#f59e0b', bg: '#fffbeb' },
];
