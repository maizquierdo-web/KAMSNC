export const DEPTH_OPTIONS = [
  { value: 'direct', label: 'Directa' },
  { value: 'analytical', label: 'Analítica' },
  { value: 'strategic', label: 'Estratégica' },
  { value: 'deep', label: 'Profunda' },
];

export const SCOPE_OPTIONS = [
  { value: 'auto', label: 'Ámbito automático' },
  { value: 'caes', label: 'CAEs' },
  { value: 'new_business', label: 'Nuevos Negocios' },
  { value: 'all', label: 'Todo el mercado' },
];

const DEPTH_LIMITS = { direct: 30, analytical: 60, strategic: 80, deep: 110 };
const STOP_WORDS = new Set([
  'actualmente', 'analiza', 'analizar', 'benchmark', 'como', 'con', 'cual', 'cuales',
  'del', 'desde', 'donde', 'esta', 'este', 'esto', 'hay', 'informacion', 'las', 'los',
  'mercado', 'para', 'por', 'que', 'sobre', 'una', 'unos', 'ver', 'quiero',
]);

const DEPTH_INSTRUCTIONS = {
  direct: `MODO CONSULTAR · RESPUESTA DIRECTA
- Responde de forma breve, factual y centrada solo en lo preguntado.
- No desarrolles implicaciones o recomendaciones salvo que se soliciten expresamente.
- Selecciona únicamente las evidencias imprescindibles.`,
  analytical: `MODO ANALIZAR · RESPUESTA ANALÍTICA
- Agrupa y compara evidencias; identifica patrones, diferencias y contradicciones.
- No enumeres indiscriminadamente las entradas recuperadas.
- Explica qué se sabe, qué interpretación permite y qué sigue siendo incierto.`,
  strategic: `MODO ANALIZAR · RESPUESTA ESTRATÉGICA
- Además de contrastar la información, identifica implicaciones para Naturgy.
- Prioriza riesgos, oportunidades y líneas de actuación con fundamento.
- Distingue lo urgente de lo importante y orienta la respuesta a decisión.`,
  deep: `MODO ANALIZAR · RESPUESTA PROFUNDA
- Integra evolución temporal, patrones, señales débiles, contradicciones e hipótesis alternativas.
- Explicita lagunas de conocimiento, riesgos, oportunidades e implicaciones comerciales.
- Formula recomendaciones priorizadas y preguntas concretas para confirmar lo incierto.
- Utiliza toda la evidencia relevante, no toda la evidencia disponible.`,
};

const AUDIENCE_INSTRUCTIONS = {
  kam: 'Audiencia KAM: orienta la respuesta a la próxima conversación, negociación o pregunta que debe formular al canal.',
  coordinator: 'Audiencia Coordinación: ofrece una visión transversal, comparativa y útil para dirigir al equipo y captar señales del mercado.',
  direction: 'Audiencia Dirección: sé sintético, prioriza decisiones, impacto, riesgo, oportunidad y acciones recomendadas.',
};

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function sourceOf(entry) {
  return Array.isArray(entry.benchmark_sources) ? entry.benchmark_sources[0] : entry.benchmark_sources;
}

function competitorOf(entry) {
  const competitor = Array.isArray(entry.benchmark_competitors) ? entry.benchmark_competitors[0] : entry.benchmark_competitors;
  return competitor?.name || '';
}

function evidenceDate(entry) {
  return sourceOf(entry)?.source_date || entry.created_at;
}

function ageInDays(entry, now = new Date()) {
  const date = new Date(evidenceDate(entry));
  if (Number.isNaN(date.getTime())) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.floor((now - date) / 86400000));
}

function queryTerms(query) {
  return [...new Set(normalize(query).split(/[^a-z0-9]+/).filter(term => term.length > 2 && !STOP_WORDS.has(term)))];
}

export function inferBenchmarkScope(query, selectedScope = 'auto') {
  if (selectedScope !== 'auto') return selectedScope;
  const normalized = normalize(query);
  const mentionsCaes = /\bcaes?\b|certificad|ahorro energetico|mwh|verificad|sujeto obligado|sujeto delegado/.test(normalized);
  const mentionsNewBusiness = /nuevos negocios|mayorista|energia|solar|fotovolta|pyme|venta remota|comercializ/.test(normalized);
  if (mentionsCaes && !mentionsNewBusiness) return 'caes';
  if (mentionsNewBusiness && !mentionsCaes) return 'new_business';
  return 'all';
}

function matchesScope(entry, scope) {
  if (scope === 'all') return true;
  return entry.domain === scope || entry.domain === 'cross';
}

function scoreEntry(entry, terms, now) {
  const competitor = normalize(competitorOf(entry));
  const statement = normalize(entry.statement);
  const searchable = normalize([
    entry.domain, entry.subdomain, entry.section, entry.statement, entry.implication,
    entry.recommended_action, competitor, ...(entry.tags || []),
  ].join(' '));
  let score = 0;
  terms.forEach(term => {
    if (competitor.includes(term)) score += 8;
    if (statement.includes(term)) score += 5;
    if (searchable.includes(term)) score += 2;
  });
  const age = ageInDays(entry, now);
  if (age <= 7) score += 5;
  else if (age <= 30) score += 4;
  else if (age <= 90) score += 2;
  else if (age <= 365) score += 1;
  if (entry.entry_type === 'contradiction') score += 2;
  if (entry.reliability === 'confirmed') score += 2;
  return score;
}

export function selectBenchmarkEvidence(entries, { query, depth = 'analytical', selectedScope = 'auto', periodDays = null } = {}) {
  const now = new Date();
  const scope = inferBenchmarkScope(query, selectedScope);
  const terms = queryTerms(query);
  const limit = DEPTH_LIMITS[depth] || DEPTH_LIMITS.analytical;
  const candidates = entries.filter(entry => matchesScope(entry, scope));
  const ranked = candidates.map(entry => ({ entry, score: scoreEntry(entry, terms, now), age: ageInDays(entry, now) }))
    .sort((a, b) => b.score - a.score || a.age - b.age);

  if (!periodDays) return { scope, entries: ranked.slice(0, limit).map(item => item.entry) };

  const recentLimit = Math.max(1, Math.ceil(limit * 0.7));
  const recent = ranked.filter(item => item.age <= periodDays).slice(0, recentLimit);
  const historical = ranked.filter(item => item.age > periodDays).slice(0, limit - recent.length);
  return { scope, entries: [...recent, ...historical].map(item => item.entry) };
}

export function evidenceStats(entries) {
  const sourceIds = new Set(entries.map(entry => entry.source_id || sourceOf(entry)?.id).filter(Boolean));
  const validDates = entries.map(evidenceDate).filter(Boolean).map(value => new Date(value)).filter(value => !Number.isNaN(value.getTime())).sort((a, b) => a - b);
  return {
    evidenceCount: entries.length,
    sourceCount: sourceIds.size,
    from: validDates[0]?.toISOString().slice(0, 10) || null,
    to: validDates.at(-1)?.toISOString().slice(0, 10) || null,
  };
}

export function formatEvidenceContext(entries) {
  if (!entries.length) return 'No hay evidencias disponibles en el ámbito seleccionado.';
  return entries.map((entry, index) => {
    const source = sourceOf(entry) || {};
    return `[E${index + 1}]
Fecha de la fuente: ${evidenceDate(entry) || 'sin fecha'}
Ámbito: ${entry.domain} / ${entry.subdomain} · Dimensión: ${entry.section}
Competidor u operador: ${competitorOf(entry) || 'no identificado'}
Tipo: ${entry.entry_type || 'evidence'} · Fiabilidad declarada: ${entry.reliability || 'market_information'} · Fuente: ${source.source_type || 'no identificada'}${source.title ? ` (${source.title})` : ''}
Afirmación: ${entry.statement}
${entry.implication ? `Implicación registrada: ${entry.implication}\n` : ''}${entry.recommended_action ? `Acción registrada: ${entry.recommended_action}\n` : ''}${entry.tags?.length ? `Etiquetas: ${entry.tags.join(', ')}` : ''}`.trim();
  }).join('\n\n');
}

export function buildBenchmarkSystemPrompt({ depth, audience, scope, evidenceContext, currentDate, periodDays = null }) {
  const scopeLabel = scope === 'caes' ? 'CAEs' : scope === 'new_business' ? 'Nuevos Negocios' : 'mercado completo y elementos transversales';
  return `Eres el analista de inteligencia comercial y competitiva de Naturgy dentro del CRM KAMSNC.
Tu misión no es actuar como buscador ni volcar todas las menciones: debes seleccionar, contrastar, sintetizar y convertir la evidencia disponible en conocimiento útil para decidir.

FECHA ACTUAL: ${currentDate}
ÁMBITO: ${scopeLabel}
${periodDays ? `VENTANA SOLICITADA: últimos ${periodDays} días. Distingue lo nuevo de la base histórica y no repitas todo el conocimiento acumulado.` : ''}
${DEPTH_INSTRUCTIONS[depth] || DEPTH_INSTRUCTIONS.analytical}
${AUDIENCE_INSTRUCTIONS[audience] || AUDIENCE_INSTRUCTIONS.coordinator}

JERARQUÍA DE RAZONAMIENTO
- HECHO: consta explícitamente en una fuente fiable o está marcado como confirmado.
- PATRÓN: coincidencia repetida entre varias evidencias; no lo declares con una sola observación.
- HIPÓTESIS: explicación provisional. Nunca la presentes como hecho.
- INSIGHT: conclusión relevante derivada del contraste.
- RECOMENDACIÓN: actuación respaldada por uno o varios insights.
Utiliza la secuencia Hechos → patrones → hipótesis → insights → recomendaciones solo cuando ayude a responder; no fuerces todos los apartados.

REGLAS OBLIGATORIAS
1. Usa exclusivamente las evidencias incluidas abajo y el historial de esta conversación.
2. No inventes datos ni completes dimensiones ausentes. Escribe “Sin información suficiente” cuando corresponda.
3. Da más peso a información reciente si refleja evolución, pero conserva evidencia antigua cuando permita identificar un cambio.
4. Si dos referencias son incompatibles, muéstralas por separado. No fabriques rangos ni una conciliación sin evidencia.
5. Distingue señal débil, tendencia emergente y tendencia consolidada según repetición, independencia y tiempo.
6. Explicita las lagunas relevantes y conviértelas, cuando aporte valor, en preguntas concretas para futuras reuniones.
7. Prioriza relevancia sobre cantidad y sintetiza antes de responder.
8. Cuando compares, usa una tabla Markdown si mejora la claridad. No rellenes huecos con inferencias.
9. Incluye referencias discretas [E1], [E2] junto a las afirmaciones importantes. No incluyas enlaces a documentos.
10. Cuando tenga sentido, termina con Confianza alta, media o baja y una justificación breve. No uses porcentajes.
11. Las aportaciones manuales, actas y conversaciones son evidencias de mercado, no hechos automáticamente confirmados. Respeta reliability y entry_type.
12. Las sugerencias posteriores deben ser específicas de lo realmente encontrado, no botones genéricos.

FORMATO DE SALIDA
Responde exclusivamente con JSON válido, sin bloque de código:
{"answer_markdown":"respuesta en Markdown","suggested_questions":["pregunta específica 1","pregunta específica 2","pregunta específica 3"]}

EVIDENCIAS DISPONIBLES
${evidenceContext}`;
}

export function parseBenchmarkResponse(rawText) {
  const cleaned = String(rawText || '').replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      answer: String(parsed.answer_markdown || parsed.answer || '').trim(),
      suggestions: Array.isArray(parsed.suggested_questions)
        ? parsed.suggested_questions.map(value => String(value).trim()).filter(Boolean).slice(0, 3)
        : [],
    };
  } catch {
    return { answer: cleaned, suggestions: [] };
  }
}
