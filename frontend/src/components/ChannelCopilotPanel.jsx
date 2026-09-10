import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, FileText, Loader2, MessageSquareText, Sparkles, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import BenchmarkCandidateModal from './BenchmarkCandidateModal';
import { detectBenchmarkCandidate } from '../lib/benchmarkCapture';
import { useAuthContext } from './AuthProvider';
import { loadChannelAiContext } from '../lib/channelAiContext';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
const DESKTOP_PANEL_QUERY = '(min-width: 1024px) and (hover: hover) and (pointer: fine)';

const SUGGESTIONS = [
  '¿Qué debo hacer ahora?',
  '¿Qué ocurrió en la última interacción?',
  '¿Qué está pendiente?',
  'Prepárame la próxima reunión',
  'Redacta un correo de seguimiento',
];

function useDesktopPanelLayout() {
  const [matches, setMatches] = useState(() => window.matchMedia(DESKTOP_PANEL_QUERY).matches);

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_PANEL_QUERY);
    const update = () => setMatches(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return matches;
}

export default function ChannelCopilotPanel({ open, onClose, channel }) {
  const { profile, user } = useAuthContext();
  const desktopPanelLayout = useDesktopPanelLayout();
  const [context, setContext] = useState('');
  const [contextStats, setContextStats] = useState({ activities: 0, meetings: 0, documents: 0 });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loadingContext, setLoadingContext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [benchmarkCandidate, setBenchmarkCandidate] = useState(null);
  const [benchmarkNotice, setBenchmarkNotice] = useState('');
  const [memoryNotice, setMemoryNotice] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    if (!open || !channel?.id) return;
    setMessages([]);
    setInput('');
    setError('');
    setBenchmarkCandidate(null);
    setBenchmarkNotice('');
    setMemoryNotice('');
    loadContext();
  }, [open, channel?.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  async function loadContext() {
    setLoadingContext(true);
    try {
      const loaded = await loadChannelAiContext(channel);
      const savedMessages = loaded.savedMessages;

      if (loaded.memoryError) {
        console.warn('No se pudo cargar la memoria del copiloto:', loaded.memoryError);
        setMemoryNotice('La memoria persistente no está disponible.');
      } else if (savedMessages.length) {
        setMemoryNotice(`${savedMessages.length} mensajes recuperados de la memoria del canal.`);
      }
      setContext(loaded.context);
      setContextStats(loaded.stats);
      setMessages(savedMessages);
      await askCopilot('Resume el estado actual del canal en un máximo de cuatro frases e indica el siguiente paso más importante.', loaded.context, true, savedMessages);
    } catch (contextError) {
      console.error('Error cargando contexto del canal:', contextError);
      setError('No se pudo cargar todo el contexto del canal.');
    } finally {
      setLoadingContext(false);
    }
  }

  async function persistMessage(role, content) {
    if (!user?.id) throw new Error('No se ha identificado al usuario');
    const { error: persistenceError } = await supabase.from('channel_copilot_messages').insert({
      channel_id: channel.id,
      user_id: user.id,
      role,
      content: content.trim(),
    });
    if (persistenceError) throw persistenceError;
  }

  async function askCopilot(question, contextOverride = context, isInitial = false, historyOverride = messages) {
    if (!question.trim() || loading) return;
    setLoading(true);
    if (!isInitial) {
      setMessages(previous => [...previous, { role: 'user', text: question }]);
      try {
        await persistMessage('user', question);
        setMemoryNotice('La conversación está guardada en la memoria del canal.');
      } catch (persistenceError) {
        console.warn('No se pudo guardar la aportación en la memoria del copiloto:', persistenceError);
        setMemoryNotice('El mensaje se ha enviado, pero no se pudo guardar en la memoria.');
      }
    }
    setInput('');
    setError('');
    try {
      const previousMessages = historyOverride.filter(message => !message.initial).slice(-20).map(message => ({
        role: message.role === 'assistant' ? 'assistant' : 'user', content: message.text,
      }));
      const response = await fetch(`${BACKEND_URL}/api/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: `Eres el copiloto comercial de una ficha de canal del CRM de Naturgy. Responde en español, con precisión y de forma práctica.
Usa EXCLUSIVAMENTE el contexto proporcionado. No inventes datos, acuerdos, fechas ni riesgos. Si falta información, dilo claramente.
Usa las actas de reunión como contexto acumulado del canal. Ten en cuenta sus acuerdos, objeciones, compromisos y cambios de criterio; si dos actas se contradicen, prioriza la más reciente e indica la discrepancia cuando sea relevante.
Prioriza: situación actual, pendientes, siguiente acción concreta y preparación comercial. Sé conciso salvo que el usuario pida un correo o un guion completo.
La conversación previa es memoria persistente de este canal. Puedes usar la información aportada por los usuarios en ella, pero no conviertas tus propias respuestas anteriores en hechos si no estaban respaldadas por el usuario o por la ficha.

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

      if (!isInitial) {
        try {
          await persistMessage('assistant', answer);
        } catch (persistenceError) {
          console.warn('No se pudo guardar la respuesta en la memoria del copiloto:', persistenceError);
          setMemoryNotice('La respuesta no se pudo guardar en la memoria del canal.');
        }
      }

      // El resumen automático no es una aportación del usuario. En el resto de la
      // conversación analizamos únicamente lo escrito por el KAM, nunca la respuesta
      // generada por la IA, y pedimos confirmación antes de guardar nada.
      if (!isInitial) {
        const userTranscript = [
          ...messages.filter(message => message.role === 'user').slice(-3).map(message => message.text),
          question,
        ]
          .map((text, index) => `Aportación ${index + 1} del KAM: ${text}`)
          .join('\n');

        detectBenchmarkCandidate(userTranscript, { benchmarkProfile: profile?.benchmark_profile })
          .then(candidate => {
            if (!candidate) return;
            setBenchmarkCandidate({
              candidate,
              source: {
                rawContent: userTranscript,
                sourceType: 'conversation',
                channelId: channel.id,
                sourceDate: new Date().toISOString().slice(0, 10),
                title: `Conversación con copiloto · ${channel.name}`,
              },
            });
          })
          .catch(detectionError => console.warn('No se pudo analizar la conversación para Benchmark:', detectionError));
      }
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

  const panel = (
    <>
      <button aria-label="Cerrar copiloto" onClick={onClose} className="channel-copilot-backdrop fixed inset-0 z-40 bg-slate-950/15" />
      <aside className="channel-copilot-panel flex min-h-0 flex-col border-l border-surface-3 bg-[#f7fafc] text-text-primary shadow-2xl">
        <div className="relative z-10 flex flex-shrink-0 items-start justify-between border-b border-navy-100 bg-navy-50 px-4 py-4">
          <div className="flex gap-2.5">
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-navy-100 text-navy-600"><Sparkles size={18} /></div>
            <div><h2 className="text-base font-extrabold text-slate-800">Copiloto del canal</h2><p className="mt-0.5 text-[10px] text-slate-500">Contexto: {channel.name}</p></div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700"><X size={18} /></button>
        </div>

        <div className="flex-shrink-0 border-b border-surface-3 bg-white px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-navy-600"><span className="h-1.5 w-1.5 rounded-full bg-navy-500" /> Contexto cargado</div>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-md border border-surface-3 bg-surface-1 px-2 py-1 text-[9px] text-slate-600">Ficha del canal</span>
            <span className="rounded-md border border-surface-3 bg-surface-1 px-2 py-1 text-[9px] text-slate-600">{contextStats.activities} actividades</span>
            <span className="rounded-md border border-surface-3 bg-surface-1 px-2 py-1 text-[9px] text-slate-600">{contextStats.meetings} reuniones</span>
            <span className="rounded-md border border-surface-3 bg-surface-1 px-2 py-1 text-[9px] text-slate-600">{contextStats.documents} documentos</span>
          </div>
          {benchmarkNotice && (
            <div className="mt-2 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-2 text-[10px] text-teal-700">{benchmarkNotice}</div>
          )}
          {memoryNotice && (
            <div className="mt-2 text-[9px] text-slate-500">{memoryNotice}</div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loadingContext && !initialSummary ? (
            <div className="flex items-center gap-2 rounded-xl border border-surface-3 bg-white p-4 text-xs text-slate-500"><Loader2 size={15} className="animate-spin" /> Analizando el canal…</div>
          ) : initialSummary && (
            <div className="mb-4 rounded-xl border border-navy-100 bg-white p-3.5 shadow-sm">
              <div className="mb-1.5 text-xs font-bold text-navy-700">Resumen de {channel.name}</div>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{initialSummary.text}</p>
            </div>
          )}

          <div className="mb-4 space-y-1.5">
            {SUGGESTIONS.map(suggestion => (
              <button key={suggestion} onClick={() => askCopilot(suggestion)} disabled={loadingContext || loading}
                className="flex w-full items-center justify-between rounded-lg border border-surface-3 bg-white px-3 py-2.5 text-left text-[11px] text-slate-600 transition-colors hover:border-navy-200 hover:bg-navy-50/40 disabled:opacity-40">
                {suggestion}<MessageSquareText size={12} className="text-navy-500" />
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {conversation.map((message, index) => (
              <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[88%] whitespace-pre-wrap rounded-xl px-3 py-2.5 text-xs leading-relaxed ${message.role === 'user' ? 'bg-navy-500 text-white' : 'border border-surface-3 bg-white text-slate-700'}`}>{message.text}</div>
              </div>
            ))}
            {loading && <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 size={14} className="animate-spin" /> Pensando…</div>}
            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}
            <div ref={endRef} />
          </div>
        </div>

        <div className="channel-copilot-composer flex-shrink-0 border-t border-surface-3 bg-white p-3">
          <div className="flex items-center gap-2 rounded-xl border border-surface-3 bg-surface-1 p-1.5 focus-within:border-navy-300">
            <FileText size={15} className="ml-2 flex-shrink-0 text-slate-400" />
            <input value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') askCopilot(input); }}
              disabled={loadingContext || loading} placeholder="Pregunta o añade información sobre este canal"
              className="min-w-0 flex-1 bg-transparent px-1 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:opacity-50" />
            <button onClick={() => askCopilot(input)} disabled={!input.trim() || loadingContext || loading}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-navy-500 text-white hover:bg-navy-600 disabled:opacity-30"><ArrowUp size={16} /></button>
          </div>
        </div>
      </aside>
      {benchmarkCandidate && (
        <BenchmarkCandidateModal
          candidate={benchmarkCandidate.candidate}
          source={benchmarkCandidate.source}
          onClose={() => setBenchmarkCandidate(null)}
          onSaved={() => setBenchmarkNotice('Información incorporada al Benchmark compartido.')}
        />
      )}
    </>
  );

  return desktopPanelLayout ? panel : createPortal(panel, document.body);
}
