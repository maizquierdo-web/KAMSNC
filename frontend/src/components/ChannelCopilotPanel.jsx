import { useEffect, useRef, useState } from 'react';
import { ArrowUp, FileText, Loader2, MessageSquareText, Sparkles, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

const SUGGESTIONS = [
  '¿Qué debo hacer ahora?',
  '¿Qué ocurrió en la última interacción?',
  '¿Qué está pendiente?',
  'Prepárame la próxima reunión',
  'Redacta un correo de seguimiento',
];

const TYPE_LABELS = {
  call: 'Llamada', email: 'Email', whatsapp: 'WhatsApp', meeting: 'Reunión',
  linkedin: 'LinkedIn', other: 'Acción', visit: 'Visita',
};

function dateLabel(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function compact(value, limit = 500) {
  if (!value) return '-';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, limit);
}

export default function ChannelCopilotPanel({ open, onClose, channel }) {
  const [context, setContext] = useState('');
  const [contextStats, setContextStats] = useState({ activities: 0, meetings: 0, documents: 0 });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loadingContext, setLoadingContext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    if (!open || !channel?.id) return;
    setMessages([]);
    setInput('');
    setError('');
    loadContext();
  }, [open, channel?.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  async function loadContext() {
    setLoadingContext(true);
    try {
      const [classRes, interactionsRes, visitsRes, notesRes, meetingsRes, historyRes, businessCaseRes, profileRes] = await Promise.all([
        supabase.from('channel_classifications').select('custom_text, channel_classification(canal, subcanal, tipo)').eq('channel_id', channel.id),
        supabase.from('channel_interactions').select('interaction_type, direction, subject, notes, result, contact_person, created_at, planned_date, planned_time, is_completed').eq('channel_id', channel.id).order('created_at', { ascending: false }).limit(20),
        supabase.from('visits').select('checkin_at, result, objective, notes, next_steps, next_action_date').eq('channel_id', channel.id).order('checkin_at', { ascending: false }).limit(10),
        supabase.from('channel_notes').select('content, created_at, profiles(full_name)').eq('channel_id', channel.id).order('created_at', { ascending: false }).limit(10),
        supabase.from('channel_meetings').select('meeting_date, attendees, notes, file_name, created_at').eq('channel_id', channel.id).order('created_at', { ascending: false }).limit(10),
        supabase.from('channel_pipeline_history').select('from_stage, to_stage, created_at').eq('channel_id', channel.id).order('created_at', { ascending: false }).limit(10),
        supabase.from('business_cases').select('file_name, updated_at').eq('channel_id', channel.id).maybeSingle(),
        supabase.from('profiles').select('full_name, zone').eq('id', channel.assigned_to).maybeSingle(),
      ]);

      const classifications = (classRes.data || []).map(item => {
        const classification = item.channel_classification;
        return [classification?.canal, classification?.subcanal, classification?.tipo, item.custom_text].filter(Boolean).join(' > ');
      });
      const interactions = interactionsRes.data || [];
      const visits = visitsRes.data || [];
      const notes = notesRes.data || [];
      const meetings = meetingsRes.data || [];
      const history = historyRes.data || [];
      const businessCase = businessCaseRes.data;
      const responsible = profileRes.data;

      const completedInteractions = interactions.filter(item => item.is_completed === true || (item.is_completed !== false && !item.planned_date));
      const plannedInteractions = interactions.filter(item => item.planned_date && item.is_completed !== true);

      const contextText = `FICHA DEL CANAL
Nombre: ${channel.name}
Estado: ${channel.status || '-'}
Fase: ${channel.pipeline_stage || '-'}
Responsable: ${responsible?.full_name || 'Sin asignar'}${responsible?.zone ? ` · Zona ${responsible.zone}` : ''}
Clasificación: ${classifications.join(' | ') || 'Sin clasificación'}
Contacto: ${channel.contact_name || '-'}
Email: ${channel.email || '-'}
Teléfono: ${channel.phone || '-'}
Ciudad/Provincia: ${[channel.city, channel.province].filter(Boolean).join(', ') || '-'}
Potencial CAEs: ${channel.potencial_caes || '-'}
Potencial Energía: ${channel.potencial_energia || '-'}
Notas generales: ${compact(channel.notes, 1200)}

ACCIONES PLANIFICADAS
${plannedInteractions.length ? plannedInteractions.map(item => `- ${item.planned_date} ${item.planned_time?.slice(0, 5) || ''} · ${TYPE_LABELS[item.interaction_type] || item.interaction_type}: ${compact(item.subject || item.notes)}`).join('\n') : '- Ninguna'}

INTERACCIONES RECIENTES
${completedInteractions.length ? completedInteractions.map(item => `- ${dateLabel(item.created_at)} · ${TYPE_LABELS[item.interaction_type] || item.interaction_type}${item.result ? ` · Resultado: ${item.result}` : ''}${item.contact_person ? ` · Contacto: ${item.contact_person}` : ''} · ${compact(item.subject || item.notes)}`).join('\n') : '- Ninguna'}

VISITAS
${visits.length ? visits.map(item => `- ${dateLabel(item.checkin_at)} · Resultado: ${item.result || '-'} · Objetivo: ${compact(item.objective)} · Notas: ${compact(item.notes)} · Próximo paso: ${compact(item.next_steps)} ${item.next_action_date || ''}`).join('\n') : '- Ninguna'}

REUNIONES Y ACTAS
${meetings.length ? meetings.map(item => `- ${dateLabel(item.meeting_date || item.created_at)} · Asistentes: ${compact(item.attendees)} · Notas: ${compact(item.notes, 800)}${item.file_name ? ` · Documento: ${item.file_name}` : ''}`).join('\n') : '- Ninguna'}

NOTAS INTERNAS
${notes.length ? notes.map(item => `- ${dateLabel(item.created_at)} · ${item.profiles?.full_name || 'Usuario'}: ${compact(item.content, 800)}`).join('\n') : '- Ninguna'}

HISTÓRICO DE FASES
${history.length ? history.map(item => `- ${dateLabel(item.created_at)} · ${item.from_stage || 'Inicio'} → ${item.to_stage}`).join('\n') : '- Sin cambios registrados'}

BUSINESS CASE
${businessCase ? `Adjunto: ${businessCase.file_name} · Actualizado: ${dateLabel(businessCase.updated_at)}` : 'No adjuntado'}`;

      setContext(contextText);
      setContextStats({
        activities: completedInteractions.length + visits.length + notes.length,
        meetings: meetings.length,
        documents: (businessCase ? 1 : 0) + meetings.filter(item => item.file_name).length,
      });
      await askCopilot('Resume el estado actual del canal en un máximo de cuatro frases e indica el siguiente paso más importante.', contextText, true);
    } catch (contextError) {
      console.error('Error cargando contexto del canal:', contextError);
      setError('No se pudo cargar todo el contexto del canal.');
    } finally {
      setLoadingContext(false);
    }
  }

  async function askCopilot(question, contextOverride = context, isInitial = false) {
    if (!question.trim() || loading) return;
    if (!isInitial) setMessages(previous => [...previous, { role: 'user', text: question }]);
    setInput('');
    setLoading(true);
    setError('');
    try {
      const previousMessages = messages.slice(-6).map(message => ({
        role: message.role === 'assistant' ? 'assistant' : 'user', content: message.text,
      }));
      const response = await fetch(`${BACKEND_URL}/api/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: `Eres el copiloto comercial de una ficha de canal del CRM de Naturgy. Responde en español, con precisión y de forma práctica.
Usa EXCLUSIVAMENTE el contexto proporcionado. No inventes datos, acuerdos, fechas ni riesgos. Si falta información, dilo claramente.
Prioriza: situación actual, pendientes, siguiente acción concreta y preparación comercial. Sé conciso salvo que el usuario pida un correo o un guion completo.

CONTEXTO DEL CANAL:
${contextOverride}`,
          messages: [...previousMessages, { role: 'user', content: question }],
        }),
      });
      if (!response.ok) throw new Error('No se pudo conectar con el asistente');
      const data = await response.json();
      const answer = data.content?.map(item => item.text || '').join('').trim();
      if (!answer) throw new Error('El asistente no devolvió una respuesta');
      setMessages(previous => [...previous, { role: 'assistant', text: answer, initial: isInitial }]);
    } catch (requestError) {
      console.error('Error consultando el copiloto:', requestError);
      setError(requestError.message || 'No se pudo obtener una respuesta.');
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const initialSummary = messages.find(message => message.initial);
  const conversation = messages.filter(message => !message.initial);

  return (
    <>
      <button aria-label="Cerrar copiloto" onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/15 lg:hidden" />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-surface-3 bg-[#f7fafc] text-text-primary shadow-2xl sm:w-[440px] lg:sticky lg:top-4 lg:z-0 lg:h-[calc(100vh-120px)] lg:w-full lg:overflow-hidden lg:rounded-2xl lg:border lg:shadow-sm">
        <div className="flex items-start justify-between border-b border-blue-100 bg-[#eaf4f8] px-4 py-4">
          <div className="flex gap-2.5">
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-600"><Sparkles size={18} /></div>
            <div><h2 className="text-base font-extrabold text-slate-800">Copiloto del canal</h2><p className="mt-0.5 text-[10px] text-slate-500">Contexto: {channel.name}</p></div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700"><X size={18} /></button>
        </div>

        <div className="border-b border-surface-3 bg-white px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-teal-600"><span className="h-1.5 w-1.5 rounded-full bg-teal-500" /> Contexto cargado</div>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-md border border-surface-3 bg-surface-1 px-2 py-1 text-[9px] text-slate-600">Ficha del canal</span>
            <span className="rounded-md border border-surface-3 bg-surface-1 px-2 py-1 text-[9px] text-slate-600">{contextStats.activities} actividades</span>
            <span className="rounded-md border border-surface-3 bg-surface-1 px-2 py-1 text-[9px] text-slate-600">{contextStats.meetings} reuniones</span>
            <span className="rounded-md border border-surface-3 bg-surface-1 px-2 py-1 text-[9px] text-slate-600">{contextStats.documents} documentos</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loadingContext && !initialSummary ? (
            <div className="flex items-center gap-2 rounded-xl border border-surface-3 bg-white p-4 text-xs text-slate-500"><Loader2 size={15} className="animate-spin" /> Analizando el canal…</div>
          ) : initialSummary && (
            <div className="mb-4 rounded-xl border border-blue-100 bg-white p-3.5 shadow-sm">
              <div className="mb-1.5 text-xs font-bold text-teal-700">Resumen de {channel.name}</div>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{initialSummary.text}</p>
            </div>
          )}

          <div className="mb-4 space-y-1.5">
            {SUGGESTIONS.map(suggestion => (
              <button key={suggestion} onClick={() => askCopilot(suggestion)} disabled={loadingContext || loading}
                className="flex w-full items-center justify-between rounded-lg border border-surface-3 bg-white px-3 py-2.5 text-left text-[11px] text-slate-600 transition-colors hover:border-teal-200 hover:bg-teal-50/40 disabled:opacity-40">
                {suggestion}<MessageSquareText size={12} className="text-teal-500" />
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {conversation.map((message, index) => (
              <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[88%] whitespace-pre-wrap rounded-xl px-3 py-2.5 text-xs leading-relaxed ${message.role === 'user' ? 'bg-teal-500 text-white' : 'border border-surface-3 bg-white text-slate-700'}`}>{message.text}</div>
              </div>
            ))}
            {loading && <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 size={14} className="animate-spin" /> Pensando…</div>}
            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}
            <div ref={endRef} />
          </div>
        </div>

        <div className="border-t border-surface-3 bg-white p-3">
          <div className="flex items-center gap-2 rounded-xl border border-surface-3 bg-surface-1 p-1.5 focus-within:border-teal-300">
            <FileText size={15} className="ml-2 flex-shrink-0 text-slate-400" />
            <input value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') askCopilot(input); }}
              disabled={loadingContext || loading} placeholder="Pregunta sobre este canal…"
              className="min-w-0 flex-1 bg-transparent px-1 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:opacity-50" />
            <button onClick={() => askCopilot(input)} disabled={!input.trim() || loadingContext || loading}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-30"><ArrowUp size={16} /></button>
          </div>
        </div>
      </aside>
    </>
  );
}
