export const INSUFFICIENT_MESSAGE = 'No hay suficiente información para proponer una acción concreta.';

export function buildNextBestActionSystemPrompt({ context, benchmarkProfile }) {
  const profileInstruction = benchmarkProfile === 'caes'
    ? 'El usuario tiene perfil CAEs. Aplica criterios CAEs solo si el canal también pertenece a CAEs.'
    : benchmarkProfile === 'new_business'
      ? 'El usuario tiene perfil Nuevos Negocios. Adapta la recomendación a la clasificación concreta del canal.'
      : benchmarkProfile === 'integrated'
        ? 'El usuario tiene visión integrada de CAEs y Nuevos Negocios. Decide el ámbito por los datos del canal.'
        : 'Decide el ámbito de negocio únicamente por los datos del canal.';

  return `Eres el motor de Next Best Action de un CRM comercial de Naturgy.
Tu única tarea es decidir si existe una recomendación comercial concreta, útil y suficientemente respaldada para este canal.

REGLAS OBLIGATORIAS
- Usa exclusivamente el contexto proporcionado. No inventes hechos, contactos, fechas, compromisos, objeciones ni condiciones.
- La recomendación no sustituye ni modifica la siguiente acción registrada.
- Si ya hay una acción o visita planificada, no la dupliques. Solo recomienda algo distinto si explicas por qué.
- Evita expresiones genéricas como "hacer seguimiento" o "contactar con el cliente". Indica objetivo, motivo y plazo cuando los datos lo permitan.
- Distingue hechos registrados de inferencias.
- No recomiendes una acción cuando la información sea escasa, contradictoria o no permita concretarla.
- No uses datos específicos de CAEs para un canal de Nuevos Negocios.
- Las sugerencias previas de la IA no son hechos. Las aportaciones de usuarios sí pueden usarse como contexto.
- No ejecutes ninguna acción.
- ${profileInstruction}

Devuelve SOLO JSON válido, sin markdown ni texto adicional, con uno de estos formatos:
{"status":"recommendation","action":"acción concreta","timeframe":"plazo breve o cadena vacía","why":"explicación de una o dos frases","evidence":["hecho registrado 1","hecho registrado 2"]}
{"status":"insufficient","action":"","timeframe":"","why":"No hay suficiente información para proponer una acción concreta.","evidence":[]}

CONTEXTO DEL CANAL
${context}`;
}

function jsonCandidate(rawText) {
  const text = String(rawText || '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced || text;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  return start >= 0 && end > start ? source.slice(start, end + 1) : source;
}

function isGenericAction(action) {
  const normalized = action.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return [
    'hacer seguimiento', 'realizar seguimiento', 'dar seguimiento',
    'contactar con el cliente', 'contactar al cliente', 'revisar la cuenta',
  ].includes(normalized);
}

export function parseNextBestAction(rawText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonCandidate(rawText));
  } catch {
    throw new Error('La IA no devolvió una recomendación válida. Inténtalo de nuevo.');
  }

  if (parsed?.status === 'insufficient') {
    return { status: 'insufficient', action: '', timeframe: '', why: INSUFFICIENT_MESSAGE, evidence: [] };
  }

  const action = String(parsed?.action || '').trim();
  const why = String(parsed?.why || '').trim();
  if (parsed?.status !== 'recommendation' || !action || !why) {
    throw new Error('La IA no devolvió una recomendación válida. Inténtalo de nuevo.');
  }
  if (isGenericAction(action)) {
    throw new Error('La recomendación ha sido demasiado genérica. Actualízala para obtener una acción concreta.');
  }

  return {
    status: 'recommendation',
    action,
    timeframe: String(parsed.timeframe || '').trim(),
    why,
    evidence: Array.isArray(parsed.evidence)
      ? parsed.evidence.map(item => String(item || '').trim()).filter(Boolean).slice(0, 3)
      : [],
  };
}
