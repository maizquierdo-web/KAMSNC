// Shared by the editor, pipeline and RVC: preserve the stored free-text suffix.
export const LEAD_SOURCE_OPTIONS = [
  { value: 'recomendacion_partner', label: 'Recomendación partner', group: 'pull' },
  { value: 'industrial', label: 'Industrial', group: 'pull' },
  { value: 'generacion_distribuida', label: 'Generación Distribuida', group: 'pull' },
  { value: 'canal_naturgy', label: 'Canal Naturgy', group: 'pull' },
  { value: 'kam', label: 'KAM', group: 'pull' },
  { value: 'solicitud_directa', label: 'Solicitud directa del canal', group: 'pull' },
  { value: 'evento', label: 'Evento', group: 'push' },
  { value: 'congreso', label: 'Congreso', group: 'push' },
  { value: 'webinar', label: 'Webinar', group: 'push' },
  { value: 'linkedin_sales_navigator', label: 'LinkedIn/Sales Navigator', group: 'push' },
  { value: 'asociacion_sectorial', label: 'Asociación sectorial', group: 'push' },
  { value: 'paginas_empleo', label: 'Páginas de empleo', group: 'push' },
  { value: 'otros', label: 'Otros', group: 'push' },
];

export function normalizeLeadSources(sources) {
  if (!Array.isArray(sources)) return [];
  return [...new Set(sources.filter(source => typeof source === 'string').map(source => {
    const value = source.trim().toLowerCase();
    return value.startsWith('otros:') ? 'otros' : value;
  }))];
}

export function leadOriginGroups(sources) {
  const values = new Set(normalizeLeadSources(sources));
  return ['push', 'pull'].filter(group => LEAD_SOURCE_OPTIONS.some(option => option.group === group && values.has(option.value)));
}

export function isPushLead(sources) {
  return leadOriginGroups(sources).includes('push');
}
