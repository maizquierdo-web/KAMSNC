import { supabase } from './supabase';

const TYPE_LABELS = {
  call: 'Llamada', email: 'Email', whatsapp: 'WhatsApp', meeting: 'Reunión',
  linkedin: 'LinkedIn', other: 'Acción', visit: 'Visita',
};

const CAES_LABELS = {
  caes_role: {
    promoter: 'Promotor', promoter_ot: 'Promotor + OT',
    promoter_ot_verifier: 'Promotor + OT + Verificador',
  },
  caes_contract_model: {
    model_2_alternative_payer: 'Modelo 2 · Pagador alternativo',
    model_3_savings_facilitator: 'Modelo 3 · Facilitador de ahorro',
  },
  caes_remuneration_tier: { tier_a: 'Tramo A', tier_b: 'Tramo B', tier_c: 'Tramo C' },
  caes_technical_office: { sinceo2: 'SINCEO2', e_program: 'E-PROGRAM', unassigned: 'Sin OT asignada' },
  caes_verifier: { margube: 'MARGUBE', eqa: 'EQA', unassigned: 'Sin verificador asignado' },
};

function valueOrDash(value) {
  return value === null || value === undefined || value === '' ? '-' : value;
}

function dateLabel(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function compact(value, limit = 500) {
  if (!value) return '-';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, limit);
}

function resultData(result) {
  return result?.error ? [] : (result?.data || []);
}

function isCaesChannel(channel, classifications) {
  return classifications.some(value => value.toLowerCase().includes('cae'))
    || String(channel.channel_type || '').toLowerCase().includes('cae')
    || Boolean(channel.potencial_caes);
}

function caesValue(field, value) {
  return CAES_LABELS[field]?.[value] || valueOrDash(value);
}

export async function loadChannelAiContext(channel, client = supabase) {
  const [
    classRes, interactionsRes, visitsRes, plannedVisitsRes, notesRes, meetingsRes,
    historyRes, businessCaseRes, profileRes, memoryRes, benchmarkSourcesRes,
  ] = await Promise.all([
    client.from('channel_classifications').select('custom_text, channel_classification(canal, subcanal, tipo)').eq('channel_id', channel.id),
    client.from('channel_interactions').select('interaction_type, direction, subject, notes, result, contact_person, created_at, planned_date, planned_time, is_completed').eq('channel_id', channel.id).order('created_at', { ascending: false }).limit(20),
    client.from('visits').select('checkin_at, result, objective, result_notes, next_steps, next_action_date').eq('channel_id', channel.id).order('checkin_at', { ascending: false }).limit(10),
    client.from('planned_visits').select('planned_date, planned_time, notes, is_completed, created_at').eq('channel_id', channel.id).eq('is_completed', false).order('planned_date', { ascending: true }).limit(10),
    client.from('channel_notes').select('content, created_at, profiles(full_name)').eq('channel_id', channel.id).order('created_at', { ascending: false }).limit(10),
    client.from('channel_meetings').select('meeting_date, attendees, notes, file_name, created_at').eq('channel_id', channel.id).order('created_at', { ascending: false }).limit(10),
    client.from('channel_pipeline_history').select('from_stage, to_stage, created_at').eq('channel_id', channel.id).order('created_at', { ascending: false }).limit(10),
    client.from('business_cases').select('file_name, updated_at').eq('channel_id', channel.id).maybeSingle(),
    client.from('profiles').select('full_name, zone').eq('id', channel.assigned_to).maybeSingle(),
    client.from('channel_copilot_messages').select('id, role, content, created_at').eq('channel_id', channel.id).order('created_at', { ascending: false }).limit(40),
    client.from('benchmark_sources').select('id, title, source_date').eq('channel_id', channel.id).order('source_date', { ascending: false }).limit(10),
  ]);

  const classifications = resultData(classRes).map(item => {
    const classification = item.channel_classification;
    return [classification?.canal, classification?.subcanal, classification?.tipo, item.custom_text]
      .filter(Boolean).join(' > ');
  });
  const interactions = resultData(interactionsRes);
  const visits = resultData(visitsRes);
  const plannedVisits = resultData(plannedVisitsRes);
  const notes = resultData(notesRes);
  const meetings = resultData(meetingsRes);
  const history = resultData(historyRes);
  const businessCase = businessCaseRes?.error ? null : businessCaseRes?.data;
  const responsible = profileRes?.error ? null : profileRes?.data;
  const savedMessages = memoryRes?.error ? [] : resultData(memoryRes).reverse().map(message => ({
    id: message.id,
    role: message.role,
    text: message.content,
    createdAt: message.created_at,
    persisted: true,
  }));
  const benchmarkSources = resultData(benchmarkSourcesRes);
  const benchmarkSourceIds = benchmarkSources.map(source => source.id);
  const benchmarkEntriesRes = benchmarkSourceIds.length
    ? await client.from('benchmark_entries')
      .select('source_id, domain, subdomain, statement, implication, recommended_action, reliability, created_at')
      .in('source_id', benchmarkSourceIds).eq('status', 'incorporated')
      .order('created_at', { ascending: false }).limit(12)
    : { data: [], error: null };
  const benchmarkEntries = resultData(benchmarkEntriesRes);
  const sourceMap = new Map(benchmarkSources.map(source => [source.id, source]));

  const completedInteractions = interactions.filter(item => item.is_completed === true || (item.is_completed !== false && !item.planned_date));
  const plannedInteractions = interactions.filter(item => item.planned_date && item.is_completed !== true);
  const userMemory = savedMessages.filter(message => message.role === 'user').slice(-12);
  const caes = isCaesChannel(channel, classifications);
  const caesContext = caes ? `

DATOS ESPECÍFICOS CAES
Rol: ${caesValue('caes_role', channel.caes_role)}
Modelo de contrato: ${caesValue('caes_contract_model', channel.caes_contract_model)}
Tramo retributivo: ${caesValue('caes_remuneration_tier', channel.caes_remuneration_tier)}
Oficina técnica: ${caesValue('caes_technical_office', channel.caes_technical_office)}
Verificador: ${caesValue('caes_verifier', channel.caes_verifier)}
Número de pedido: ${valueOrDash(channel.caes_order_number)}
Estado del alta: ${valueOrDash(channel.onboarding_status)}` : '';

  const context = `FECHA ACTUAL
${new Date().toISOString().slice(0, 10)}

FICHA DEL CANAL
Nombre: ${channel.name}
Línea de negocio: ${valueOrDash(channel.channel_type)}
Estado: ${valueOrDash(channel.status)}
Fase: ${valueOrDash(channel.pipeline_stage)}
Responsable: ${responsible?.full_name || 'Sin asignar'}${responsible?.zone ? ` · Zona ${responsible.zone}` : ''}
Clasificación: ${classifications.join(' | ') || 'Sin clasificación'}
Contacto: ${valueOrDash(channel.contact_name)}
Email: ${valueOrDash(channel.email)}
Teléfono: ${valueOrDash(channel.phone)}
Ciudad/Provincia: ${[channel.city, channel.province].filter(Boolean).join(', ') || '-'}
Potencial CAEs: ${valueOrDash(channel.potencial_caes)}
Potencial Energía: ${valueOrDash(channel.potencial_energia)}
Notas generales: ${compact(channel.notes, 1200)}${caesContext}

SIGUIENTES ACCIONES REGISTRADAS
${plannedInteractions.length ? plannedInteractions.map(item => `- ${item.planned_date} ${item.planned_time?.slice(0, 5) || ''} · ${TYPE_LABELS[item.interaction_type] || item.interaction_type}: ${compact(item.subject || item.notes)}`).join('\n') : '- Ninguna'}

VISITAS PLANIFICADAS
${plannedVisits.length ? plannedVisits.map(item => `- ${item.planned_date} ${item.planned_time?.slice(0, 5) || ''} · ${compact(item.notes)}`).join('\n') : '- Ninguna'}

INTERACCIONES RECIENTES
${completedInteractions.length ? completedInteractions.map(item => `- ${dateLabel(item.created_at)} · ${TYPE_LABELS[item.interaction_type] || item.interaction_type}${item.result ? ` · Resultado: ${item.result}` : ''}${item.contact_person ? ` · Contacto: ${item.contact_person}` : ''} · ${compact(item.subject || item.notes)}`).join('\n') : '- Ninguna'}

VISITAS REALIZADAS
${visits.length ? visits.map(item => `- ${dateLabel(item.checkin_at)} · Resultado: ${valueOrDash(item.result)} · Objetivo: ${compact(item.objective)} · Notas: ${compact(item.result_notes)} · Próximo paso: ${compact(item.next_steps)} ${item.next_action_date || ''}`).join('\n') : '- Ninguna'}

REUNIONES Y ACTAS
${meetings.length ? meetings.map(item => `- ${dateLabel(item.meeting_date || item.created_at)} · Asistentes: ${compact(item.attendees)} · Notas: ${compact(item.notes, 800)}${item.file_name ? ` · Documento: ${item.file_name}` : ''}`).join('\n') : '- Ninguna'}

NOTAS INTERNAS
${notes.length ? notes.map(item => `- ${dateLabel(item.created_at)} · ${item.profiles?.full_name || 'Usuario'}: ${compact(item.content, 800)}`).join('\n') : '- Ninguna'}

HISTÓRICO DE FASES
${history.length ? history.map(item => `- ${dateLabel(item.created_at)} · ${item.from_stage || 'Inicio'} → ${item.to_stage}`).join('\n') : '- Sin cambios registrados'}

BUSINESS CASE
${businessCase ? `Adjunto: ${businessCase.file_name} · Actualizado: ${dateLabel(businessCase.updated_at)}. El contenido interno del archivo no está disponible.` : 'No adjuntado'}

MEMORIA APORTADA POR USUARIOS
${userMemory.length ? userMemory.map(message => `- ${dateLabel(message.createdAt)} · ${compact(message.text, 700)}`).join('\n') : '- Sin aportaciones guardadas'}

BENCHMARK VINCULADO A ESTE CANAL
${benchmarkEntries.length ? benchmarkEntries.map(entry => {
    const source = sourceMap.get(entry.source_id);
    return `- ${source?.source_date || dateLabel(entry.created_at)} · ${entry.domain}/${entry.subdomain} · ${compact(entry.statement, 500)}${entry.implication ? ` · Implicación: ${compact(entry.implication, 350)}` : ''}${entry.recommended_action ? ` · Acción propuesta en Benchmark: ${compact(entry.recommended_action, 300)}` : ''} · Fiabilidad: ${entry.reliability}`;
  }).join('\n') : '- Sin señales vinculadas'}`;

  return {
    context,
    savedMessages,
    memoryError: memoryRes?.error || null,
    stats: {
      activities: completedInteractions.length + visits.length + notes.length,
      meetings: meetings.length,
      documents: (businessCase ? 1 : 0) + meetings.filter(item => item.file_name).length,
    },
  };
}
