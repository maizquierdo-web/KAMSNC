import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowUp, BarChart3, ChevronDown, ChevronRight, Clock3,
  Eye, Lightbulb, Loader2, Scale, Sparkles,
} from 'lucide-react';
import { useAuthContext } from './AuthProvider';
import {
  buildBenchmarkSystemPrompt, DEPTH_OPTIONS, evidenceStats,
  formatEvidenceContext, parseBenchmarkResponse, SCOPE_OPTIONS,
  selectBenchmarkEvidence,
} from '../lib/benchmarkIntelligence';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

const SOURCE_LABELS = {
  manual: 'Aportación de KAM',
  meeting_minutes: 'Acta de reunión',
  conversation: 'Conversación',
  document: 'Conocimiento de referencia',
};

function relatedOne(value) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  return new Date(value).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function sourceDate(entry) {
  return relatedOne(entry.benchmark_sources)?.source_date || entry.created_at;
}

function audienceFor(profile) {
  if (profile?.role === 'director') return 'direction';
  if (['coordinator', 'manager'].includes(profile?.role)) return 'coordinator';
  return 'kam';
}

function statsLabel(stats) {
  const dates = stats.from && stats.to
    ? stats.from === stats.to ? formatDate(stats.from) : `${formatDate(stats.from)}–${formatDate(stats.to)}`
    : 'sin periodo definido';
  return `Basado en ${stats.evidenceCount} evidencias · ${stats.sourceCount} fuentes · ${dates}`;
}

function citedEvidence(answer, selectedEntries) {
  const indices = [...String(answer || '').matchAll(/\[E(\d+)\]/g)]
    .map(match => Number(match[1]) - 1)
    .filter(index => index >= 0 && index < selectedEntries.length);
  const uniqueIndices = [...new Set(indices)];
  return uniqueIndices.length
    ? uniqueIndices.map(index => ({ ...selectedEntries[index], _citationIndex: index + 1 }))
    : selectedEntries.map((entry, index) => ({ ...entry, _citationIndex: index + 1 }));
}

const markdownComponents = {
  h1: ({ children }) => <h3 className="mb-2 mt-3 text-sm font-extrabold text-slate-800">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-2 mt-3 text-sm font-extrabold text-slate-800">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-1.5 mt-3 text-xs font-extrabold text-slate-800">{children}</h4>,
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-4">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-4">{children}</ol>,
  strong: ({ children }) => <strong className="font-extrabold text-slate-800">{children}</strong>,
  table: ({ children }) => <table className="my-3 min-w-full border-collapse text-[10px]">{children}</table>,
  th: ({ children }) => <th className="border border-slate-200 bg-slate-50 px-2 py-1.5 text-left font-bold text-slate-700">{children}</th>,
  td: ({ children }) => <td className="border border-slate-200 px-2 py-1.5 align-top">{children}</td>,
};

export default function BenchmarkAnalysisView({ entries, loadingEntries }) {
  const { profile } = useAuthContext();
  const [depth, setDepth] = useState('analytical');
  const [scope, setScope] = useState('auto');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPeriods, setShowPeriods] = useState(false);
  const [expandedEvidence, setExpandedEvidence] = useState(null);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  async function askBenchmark(question, { periodDays = null } = {}) {
    const questionText = question.trim();
    if (!questionText || loading || loadingEntries) return;
    const selection = selectBenchmarkEvidence(entries, {
      query: questionText, depth, selectedScope: scope, periodDays,
    });
    const selectedEntries = selection.entries;
    setMessages(previous => [...previous, { id: `user-${Date.now()}`, role: 'user', text: questionText }]);
    setInput('');
    setShowPeriods(false);
    setLoading(true);
    setError('');

    try {
      const system = buildBenchmarkSystemPrompt({
        depth,
        audience: audienceFor(profile),
        scope: selection.scope,
        evidenceContext: formatEvidenceContext(selectedEntries),
        currentDate: new Date().toISOString().slice(0, 10),
        periodDays,
      });
      const previousMessages = messages.slice(-6).map(message => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        // Las referencias E# pertenecen al conjunto de evidencias de cada turno;
        // se eliminan del historial para que no se reasignen a otra fuente.
        content: message.role === 'assistant' ? message.answer.replace(/\[E\d+\]/g, '') : message.text,
      }));
      const response = await fetch(`${BACKEND_URL}/api/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system,
          messages: [...previousMessages, { role: 'user', content: questionText }],
        }),
      });
      if (!response.ok) throw new Error('No se pudo conectar con el analista');
      const data = await response.json();
      const rawText = data.content?.map(item => item.text || '').join('').trim();
      if (!rawText) throw new Error('El analista no devolvió una respuesta');
      const parsed = parseBenchmarkResponse(rawText);
      if (!parsed.answer) throw new Error('La respuesta no contiene análisis');
      const usedEvidence = citedEvidence(parsed.answer, selectedEntries);
      setMessages(previous => [...previous, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        answer: parsed.answer,
        suggestions: parsed.suggestions,
        evidence: usedEvidence,
        stats: evidenceStats(usedEvidence),
      }]);
    } catch (requestError) {
      console.error('Error consultando Benchmark:', requestError);
      setError(requestError.message || 'No se pudo obtener el análisis.');
    } finally {
      setLoading(false);
    }
  }

  const latestAssistantId = [...messages].reverse().find(message => message.role === 'assistant')?.id;

  return <>
    <div className="border-b border-surface-3 bg-white px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Profundidad</span>
        <select value={scope} onChange={event => setScope(event.target.value)} className="rounded-lg border border-surface-3 bg-white px-2 py-1.5 text-[10px] font-semibold text-slate-600 focus:border-teal-400 focus:outline-none">
          {SCOPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-4 overflow-hidden rounded-lg border border-surface-3">
        {DEPTH_OPTIONS.map(option => <button key={option.value} onClick={() => setDepth(option.value)}
          className={`border-r border-surface-3 px-1 py-2 text-[10px] font-bold last:border-r-0 ${depth === option.value ? 'bg-teal-600 text-white' : 'bg-white text-slate-500 hover:bg-teal-50'}`}>{option.label}</button>)}
      </div>
      <p className="mt-1.5 text-[9px] text-slate-400">{depth === 'direct' ? 'Consulta factual y concisa' : 'Análisis, contraste e interpretación de evidencias'}</p>
    </div>

    <div className="border-b border-surface-3 bg-white px-4 py-3">
      <div className="grid grid-cols-4 gap-1.5">
        <div className="relative">
          <button onClick={() => setShowPeriods(previous => !previous)} className="flex w-full flex-col items-center gap-1 rounded-lg border border-surface-3 px-1 py-2 text-[9px] font-bold text-slate-600 hover:border-teal-200 hover:bg-teal-50"><Clock3 size={14} className="text-teal-600" />Novedades</button>
          {showPeriods && <div className="absolute left-0 top-full z-10 mt-1 w-28 overflow-hidden rounded-lg border border-surface-3 bg-white shadow-lg">
            {[7, 30, 90].map(days => <button key={days} onClick={() => askBenchmark(`¿Qué ha cambiado durante los últimos ${days} días?`, { periodDays: days })} className="block w-full px-3 py-2 text-left text-[10px] font-semibold text-slate-600 hover:bg-teal-50">Últimos {days} días</button>)}
          </div>}
        </div>
        <button onClick={() => askBenchmark('Compara los competidores, modelos comerciales o propuestas de valor con evidencia suficiente y señala las dimensiones sin información.')} className="flex flex-col items-center gap-1 rounded-lg border border-surface-3 px-1 py-2 text-[9px] font-bold text-slate-600 hover:border-teal-200 hover:bg-teal-50"><Scale size={14} className="text-teal-600" />Comparar</button>
        <button onClick={() => askBenchmark('¿Qué oportunidades relevantes detectas para Naturgy y qué evidencias apoyan cada una?')} className="flex flex-col items-center gap-1 rounded-lg border border-surface-3 px-1 py-2 text-[9px] font-bold text-slate-600 hover:border-teal-200 hover:bg-teal-50"><Lightbulb size={14} className="text-teal-600" />Oportunidades</button>
        <button onClick={() => askBenchmark('Prepara un briefing ejecutivo de inteligencia competitiva para dirección, breve, priorizado y orientado a decisión.')} className="flex flex-col items-center gap-1 rounded-lg border border-surface-3 px-1 py-2 text-[9px] font-bold text-slate-600 hover:border-teal-200 hover:bg-teal-50"><BarChart3 size={14} className="text-teal-600" />Briefing</button>
      </div>
    </div>

    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      {loadingEntries && messages.length === 0 ? <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-500"><Loader2 size={15} className="animate-spin" /> Cargando conocimiento…</div>
        : messages.length === 0 ? <div className="rounded-2xl border border-dashed border-surface-3 bg-white px-6 py-10 text-center"><Sparkles size={24} className="mx-auto mb-3 text-teal-600" /><p className="text-sm font-extrabold text-slate-700">Pregunta al Benchmark</p><p className="mt-1 text-xs leading-relaxed text-slate-500">Contrasta la memoria colectiva, detecta cambios, contradicciones, señales y oportunidades.</p></div>
        : <div className="space-y-4">{messages.map(message => message.role === 'user' ? <div key={message.id} className="flex justify-end"><div className="max-w-[88%] rounded-xl bg-teal-600 px-3 py-2.5 text-xs leading-relaxed text-white">{message.text}</div></div> :
          <article key={message.id} className="rounded-xl border border-surface-3 bg-white p-3.5 shadow-sm">
            <div className="overflow-x-auto text-xs leading-relaxed text-slate-700"><ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{message.answer}</ReactMarkdown></div>
            <div className="mt-3 border-t border-surface-3 pt-2.5">
              <button onClick={() => setExpandedEvidence(expandedEvidence === message.id ? null : message.id)} className="flex w-full items-center justify-between gap-2 text-left text-[9px] font-semibold text-slate-400 hover:text-teal-700"><span>{statsLabel(message.stats)}</span><span className="flex flex-shrink-0 items-center gap-1"><Eye size={11} /> Evidencias <ChevronDown size={11} className={expandedEvidence === message.id ? 'rotate-180' : ''} /></span></button>
              {expandedEvidence === message.id && <div className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-2">{message.evidence.map((entry, index) => {
                const source = relatedOne(entry.benchmark_sources);
                const competitor = relatedOne(entry.benchmark_competitors)?.name;
                return <div key={entry.id} className="rounded-md border border-slate-200 bg-white p-2 text-[9px] leading-relaxed text-slate-600"><div className="mb-1 flex flex-wrap items-center gap-1 font-bold text-slate-500"><span>[E{entry._citationIndex || index + 1}]</span><span>·</span><span>{formatDate(sourceDate(entry))}</span><span>·</span><span>{SOURCE_LABELS[source?.source_type] || 'Fuente de mercado'}</span></div>{competitor && <div className="mb-0.5 font-bold text-slate-700">{competitor}</div>}<div>{entry.statement}</div></div>;
              })}</div>}
            </div>
            {message.id === latestAssistantId && message.suggestions?.length > 0 && <div className="mt-3 space-y-1.5">{message.suggestions.map(suggestion => <button key={suggestion} onClick={() => askBenchmark(suggestion)} disabled={loading} className="flex w-full items-center justify-between rounded-lg border border-teal-100 bg-teal-50/40 px-3 py-2 text-left text-[10px] text-teal-800 hover:bg-teal-50 disabled:opacity-40">{suggestion}<ChevronRight size={12} /></button>)}</div>}
          </article>)}</div>}
      {loading && <div className="mt-3 flex items-center gap-2 text-xs text-slate-500"><Loader2 size={14} className="animate-spin" /> Contrastando evidencias…</div>}
      {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}
      <div ref={endRef} />
    </div>

    <div className="flex-shrink-0 border-t border-surface-3 bg-white p-3">
      <div className="flex items-center gap-2 rounded-xl border border-surface-3 bg-surface-1 p-1.5 focus-within:border-teal-300">
        <input value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') askBenchmark(input); }} disabled={loadingEntries || loading} placeholder="Pregunta sobre el mercado…" className="min-w-0 flex-1 bg-transparent px-2 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:opacity-50" />
        <button onClick={() => askBenchmark(input)} disabled={!input.trim() || loadingEntries || loading} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-30"><ArrowUp size={16} /></button>
      </div>
    </div>
  </>;
}
