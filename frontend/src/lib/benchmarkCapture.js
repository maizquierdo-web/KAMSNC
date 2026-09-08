import { supabase } from './supabase';
import { benchmarkProfileInstruction } from './benchmarkProfiles';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

export const BENCHMARK_DOMAINS = [
  { value: 'new_business', label: 'Nuevos Negocios' },
  { value: 'caes', label: 'CAEs' },
  { value: 'cross', label: 'Transversal' },
];

export const BENCHMARK_SUBDOMAINS = [
  { value: 'wholesale', label: 'Mayorista' },
  { value: 'solar', label: 'Comunidades solares' },
  { value: 'residential', label: 'Residencial' },
  { value: 'remote_sales', label: 'Venta en Remoto (VR)' },
  { value: 'sme', label: 'Pyme (histórico)', legacy: true },
  { value: 'caes', label: 'CAEs' },
  { value: 'cross', label: 'Transversal' },
];

export const BENCHMARK_SECTIONS = [
  { value: 'general', label: 'Información general' },
  { value: 'value_proposition', label: 'Propuesta de valor' },
  { value: 'products_services', label: 'Productos y servicios' },
  { value: 'commercial_model', label: 'Modelo comercial' },
  { value: 'operations', label: 'Operativa' },
  { value: 'technology', label: 'Tecnología' },
  { value: 'incentives', label: 'Incentivos' },
  { value: 'communication', label: 'Comunicación' },
  { value: 'strengths', label: 'Fortalezas' },
  { value: 'weaknesses', label: 'Debilidades' },
  { value: 'risks', label: 'Riesgos' },
  { value: 'opportunities', label: 'Oportunidades' },
  { value: 'economic_conditions', label: 'Precios y condiciones' },
  { value: 'organization_capabilities', label: 'Organización y capacidades' },
];

const VALID_DOMAINS = BENCHMARK_DOMAINS.map(option => option.value);
const VALID_SUBDOMAINS = BENCHMARK_SUBDOMAINS.map(option => option.value);
const VALID_SECTIONS = BENCHMARK_SECTIONS.map(option => option.value);

const DETECTION_PROMPT = `Eres el detector de información para la memoria competitiva de Naturgy.
Analiza únicamente el texto facilitado y decide si contiene información concreta aprendida del mercado que merezca proponerse al usuario para el Benchmark.

Es relevante si aporta datos sobre competidores, operadores, partners, canales, precios, retribuciones, anticipos, condiciones, modelos comerciales, propuesta de valor, operativa, tecnología, capacidades, fortalezas, debilidades, riesgos, oportunidades o movimientos de mercado.

No es relevante si solo contiene:
- preguntas del usuario,
- instrucciones al asistente,
- datos internos ordinarios del CRM,
- tareas o próximos pasos sin información de mercado,
- saludos o conversación general,
- contenido inventado o deducido por el asistente.

Reglas:
- Extrae una sola afirmación principal, concreta y autosuficiente.
- No inventes ni completes información ausente.
- Una afirmación comunicada por un canal es información de mercado, no un hecho confirmado.
- confidence mide la claridad de la extracción, no la veracidad.
- Si no hay información relevante, is_relevant debe ser false y el resto puede quedar vacío.

Dominios:
- caes: Certificados de Ahorro Energético.
- new_business: Comunidades solares, Mayorista, Residencial o Venta en Remoto.
- cross: solo cuando la misma información afecta explícitamente a ambos dominios.

Subdominios para nuevas aportaciones:
- caes: CAEs.
- solar: Comunidades solares.
- wholesale: Mayorista.
- residential: Residencial.
- remote_sales: Venta en Remoto (VR).
- cross: información verdaderamente transversal.
Secciones: general, value_proposition, products_services, commercial_model, operations, technology, incentives, communication, strengths, weaknesses, risks, opportunities, economic_conditions, organization_capabilities.

Responde exclusivamente con JSON válido:
{"is_relevant":true,"domain":"new_business|caes|cross","subdomain":"wholesale|solar|residential|remote_sales|caes|cross","section":"general|value_proposition|products_services|commercial_model|operations|technology|incentives|communication|strengths|weaknesses|risks|opportunities|economic_conditions|organization_capabilities","competitor_name":"","statement":"","confidence":0,"implication":"","recommended_action":"","tags":[]}`;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeCandidate(parsed) {
  const domain = VALID_DOMAINS.includes(parsed?.domain) ? parsed.domain : 'cross';
  let subdomain = VALID_SUBDOMAINS.includes(parsed?.subdomain) ? parsed.subdomain : 'cross';
  if (domain === 'caes') subdomain = 'caes';
  if (domain === 'cross') subdomain = 'cross';
  if (domain === 'new_business' && ['caes', 'cross'].includes(subdomain)) subdomain = 'wholesale';
  return {
    is_relevant: parsed?.is_relevant === true,
    domain,
    subdomain,
    section: VALID_SECTIONS.includes(parsed?.section) ? parsed.section : 'general',
    competitor_name: clean(parsed?.competitor_name),
    statement: clean(parsed?.statement),
    confidence: Math.max(0, Math.min(100, Number(parsed?.confidence) || 0)),
    implication: clean(parsed?.implication),
    recommended_action: clean(parsed?.recommended_action),
    tags: Array.isArray(parsed?.tags) ? parsed.tags.map(clean).filter(Boolean).slice(0, 8) : [],
  };
}

export async function detectBenchmarkCandidate(rawContent, { benchmarkProfile = null } = {}) {
  const content = clean(rawContent).slice(0, 18000);
  if (content.length < 20) return null;
  const response = await fetch(`${BACKEND_URL}/api/assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: `${DETECTION_PROMPT}\n\n${benchmarkProfileInstruction(benchmarkProfile)}`,
      messages: [{ role: 'user', content }],
    }),
  });
  if (!response.ok) throw new Error('No se pudo analizar la posible aportación al Benchmark');
  const data = await response.json();
  const rawText = data.content?.map(item => item.text || '').join('').trim();
  if (!rawText) return null;
  const parsed = JSON.parse(rawText.replace(/```json\s*/gi, '').replace(/```/g, '').trim());
  const candidate = normalizeCandidate(parsed);
  return candidate.is_relevant && candidate.statement ? candidate : null;
}

// La aportación directa ya ha sido declarada relevante por el usuario. Reutiliza
// el mismo clasificador que actas y conversaciones y conserva el texto original
// si el detector resulta demasiado conservador.
export async function classifyBenchmarkContribution(rawContent, options = {}) {
  const content = clean(rawContent);
  const candidate = await detectBenchmarkCandidate(content, options);
  const fallbackDomain = options.benchmarkProfile === 'caes' ? 'caes'
    : options.benchmarkProfile === 'new_business' ? 'new_business' : 'cross';
  return candidate || {
    is_relevant: true,
    domain: fallbackDomain,
    subdomain: fallbackDomain === 'caes' ? 'caes' : fallbackDomain === 'new_business' ? 'wholesale' : 'cross',
    section: 'general',
    competitor_name: '',
    statement: content,
    confidence: 0,
    implication: '',
    recommended_action: '',
    tags: [],
  };
}

export async function saveBenchmarkCandidate({ rawContent, draft, sourceType, channelId = null, sourceDate = null, title = null }) {
  const { data: entryId, error: saveError } = await supabase.rpc('add_manual_benchmark_entry', {
    p_raw_content: clean(rawContent),
    p_competitor_name: clean(draft.competitor_name) || null,
    p_domain: draft.domain,
    p_subdomain: draft.subdomain,
    p_section: draft.section,
    p_statement: clean(draft.statement),
    p_confidence: Math.round(Number(draft.confidence) || 0),
    p_implication: clean(draft.implication) || null,
    p_recommended_action: clean(draft.recommended_action) || null,
    p_tags: Array.isArray(draft.tags) ? draft.tags : [],
  });
  if (saveError) throw saveError;

  if (sourceType && sourceType !== 'manual' && entryId) {
    const { data: entry, error: entryError } = await supabase.from('benchmark_entries')
      .select('source_id').eq('id', entryId).single();
    if (entryError) throw entryError;
    const changes = {
      source_type: sourceType,
      title: title || null,
      channel_id: channelId || null,
    };
    if (sourceDate) changes.source_date = sourceDate;
    const { error: sourceError } = await supabase.from('benchmark_sources')
      .update(changes).eq('id', entry.source_id);
    if (sourceError) throw sourceError;
  }

  return entryId;
}
