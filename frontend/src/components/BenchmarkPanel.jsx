import { useEffect, useState } from 'react';
import {
  AlertCircle, ArrowLeft, Check, ChevronRight, Database,
  Loader2, Plus, Sparkles, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from './AuthProvider';
import BenchmarkAnalysisView from './BenchmarkAnalysisView';
import {
  BENCHMARK_DOMAINS, BENCHMARK_SECTIONS, BENCHMARK_SUBDOMAINS,
  classifyBenchmarkContribution, saveBenchmarkCandidate,
} from '../lib/benchmarkCapture';

const DOMAIN_LABELS = Object.fromEntries(BENCHMARK_DOMAINS.map(option => [option.value, option.label]));
const SUBDOMAIN_LABELS = Object.fromEntries(BENCHMARK_SUBDOMAINS.map(option => [option.value, option.label]));
const SECTION_LABELS = Object.fromEntries(BENCHMARK_SECTIONS.map(option => [option.value, option.label]));

const VALID_DOMAINS = Object.keys(DOMAIN_LABELS);
const VALID_SECTIONS = Object.keys(SECTION_LABELS);

function formatDate(value) {
  return new Date(value).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BenchmarkPanel({ open, onClose }) {
  const { profile } = useAuthContext();
  const [mode, setMode] = useState('analyze');
  const [entries, setEntries] = useState([]);
  const [rawContent, setRawContent] = useState('');
  const [draft, setDraft] = useState(null);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!open) return;
    loadEntries();
  }, [open]);

  async function loadEntries() {
    setLoadingEntries(true);
    setError('');
    try {
      const { data, error: queryError } = await supabase
        .from('benchmark_entries')
        .select('id, source_id, competitor_id, domain, subdomain, section, statement, entry_type, reliability, confidence, implication, recommended_action, tags, valid_until, created_at, updated_at, benchmark_competitors(name), benchmark_sources(id, source_type, title, source_date, channel_id, created_at)')
        .eq('status', 'incorporated')
        .order('created_at', { ascending: false })
        .limit(500);
      if (queryError) throw queryError;
      setEntries(data || []);
    } catch (queryError) {
      console.error('Error cargando Benchmark:', queryError);
      setError('No se pudo cargar la memoria de Benchmark. Comprueba que la migración esté aplicada.');
    } finally {
      setLoadingEntries(false);
    }
  }

  function startContribution() {
    setRawContent('');
    setDraft(null);
    setError('');
    setNotice('');
    setMode('compose');
  }

  function returnToList() {
    setMode('list');
    setRawContent('');
    setDraft(null);
    setError('');
  }

  async function analyzeContribution() {
    if (rawContent.trim().length < 15 || analyzing) return;
    setAnalyzing(true);
    setError('');
    try {
      setDraft(await classifyBenchmarkContribution(rawContent, { benchmarkProfile: profile?.benchmark_profile }));
      setMode('review');
    } catch (analysisError) {
      console.error('Error estructurando aportación:', analysisError);
      setError('No se pudo estructurar la información. Puedes reintentar sin perder el texto.');
    } finally {
      setAnalyzing(false);
    }
  }

  function updateDraft(field, value) {
    setDraft(previous => ({ ...previous, [field]: value }));
  }

  function updateDomain(domain) {
    setDraft(previous => ({
      ...previous,
      domain,
      subdomain: domain === 'caes' ? 'caes' : domain === 'cross' ? 'cross' :
        ['wholesale', 'solar', 'residential', 'remote_sales'].includes(previous.subdomain) ? previous.subdomain : 'wholesale',
    }));
  }

  async function saveContribution() {
    if (!draft?.statement.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      await saveBenchmarkCandidate({ rawContent, draft, sourceType: 'manual' });
      setNotice('Información incorporada a la memoria colectiva.');
      setMode('list');
      setRawContent('');
      setDraft(null);
      await loadEntries();
    } catch (saveError) {
      console.error('Error guardando aportación:', saveError);
      setError('No se pudo incorporar la información. No se ha perdido la propuesta.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const newBusinessSubdomains = ['wholesale', 'solar', 'residential', 'remote_sales'];
  const fieldClass = 'w-full rounded-xl border border-surface-3 bg-white px-3 py-2.5 text-xs text-slate-700 focus:border-teal-400 focus:outline-none';

  return (
    <>
      <button aria-label="Cerrar Benchmark" onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/20" />
      <aside className="fixed inset-y-0 right-0 z-50 flex h-[100dvh] min-h-0 w-full flex-col border-l border-surface-3 bg-[#f7fafc] text-text-primary shadow-2xl sm:w-[500px]">
        <div className="flex items-start justify-between border-b border-teal-100 bg-[#eaf7f5] px-4 py-4">
          <div className="flex gap-2.5">
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-700"><Database size={18} /></div>
            <div>
              <h2 className="text-base font-extrabold text-slate-800">Benchmark</h2>
              <p className="mt-0.5 text-[10px] text-slate-500">Analista de inteligencia competitiva</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700"><X size={18} /></button>
        </div>

        {['analyze', 'list'].includes(mode) && (
          <div className="flex border-b border-surface-3 bg-white px-4">
            <button onClick={() => { setMode('analyze'); setError(''); }} className={`border-b-2 px-3 py-3 text-xs font-bold ${mode === 'analyze' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-400'}`}>Analizar</button>
            <button onClick={() => { setMode('list'); setError(''); }} className={`border-b-2 px-3 py-3 text-xs font-bold ${mode === 'list' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-400'}`}>Memoria <span className="ml-1 font-normal">{entries.length}</span></button>
          </div>
        )}

        {mode === 'analyze' && <BenchmarkAnalysisView entries={entries} loadingEntries={loadingEntries} onContribute={startContribution} />}

        {mode === 'list' && (
          <>
            <div className="border-b border-surface-3 bg-white p-4">
              <button onClick={startContribution}
                className="flex w-full items-center justify-between rounded-xl bg-teal-600 px-4 py-3 text-left text-sm font-bold text-white transition-colors hover:bg-teal-700">
                <span className="flex items-center gap-2"><Plus size={16} /> Añadir información</span><ChevronRight size={16} />
              </button>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                La IA ordenará la aportación y te pedirá confirmación antes de incorporarla.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {notice && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700">{notice}</div>}
              {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-600">{error}</div>}
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Información reciente</span>
                <span className="text-[10px] text-slate-400">{entries.length} aportaciones</span>
              </div>
              {loadingEntries ? (
                <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-500"><Loader2 size={15} className="animate-spin" /> Cargando memoria…</div>
              ) : entries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-surface-3 bg-white px-5 py-10 text-center">
                  <Database size={24} className="mx-auto mb-3 text-teal-500" />
                  <p className="text-sm font-bold text-slate-700">La memoria está preparada</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">Añade la primera señal del mercado para empezar a construir el benchmark colectivo.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {entries.map(entry => (
                    <article key={entry.id} className="rounded-xl border border-surface-3 bg-white p-3.5 shadow-sm">
                      <div className="mb-2 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-teal-50 px-2 py-1 text-[9px] font-bold text-teal-700">{DOMAIN_LABELS[entry.domain]}</span>
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-[9px] text-slate-600">{SUBDOMAIN_LABELS[entry.subdomain]}</span>
                        <span className="ml-auto text-[9px] text-slate-400">{formatDate(entry.created_at)}</span>
                      </div>
                      {entry.benchmark_competitors?.name && <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{entry.benchmark_competitors.name}</p>}
                      <p className="text-xs leading-relaxed text-slate-700">{entry.statement}</p>
                      <div className="mt-2 text-[9px] text-slate-400">{SECTION_LABELS[entry.section]} · Información de mercado</div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {mode === 'compose' && (
          <div className="flex-1 overflow-y-auto p-4">
            <button onClick={returnToList} className="mb-4 flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"><ArrowLeft size={14} /> Volver</button>
            <h3 className="text-lg font-extrabold text-slate-800">¿Qué has sabido del mercado?</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">Escríbelo con naturalidad. Incluye quién lo hace, qué ofrece y cualquier condición relevante que conozcas.</p>
            <textarea value={rawContent} onChange={event => setRawContent(event.target.value)} rows={10}
              placeholder="Ejemplo: Un colaborador nos indica que Competidor X está anticipando parte del pago de los CAEs…"
              className="mt-4 w-full resize-none rounded-xl border border-surface-3 bg-white p-3 text-sm leading-relaxed text-slate-700 placeholder:text-slate-400 focus:border-teal-400 focus:outline-none" />
            <div className="mt-2 text-right text-[10px] text-slate-400">Mínimo 15 caracteres</div>
            {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-600">{error}</div>}
            <button onClick={analyzeContribution} disabled={rawContent.trim().length < 15 || analyzing}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-40">
              {analyzing ? <><Loader2 size={16} className="animate-spin" /> Estructurando…</> : <><Sparkles size={16} /> Revisar antes de incorporar</>}
            </button>
          </div>
        )}

        {mode === 'review' && draft && (
          <div className="flex-1 overflow-y-auto p-4">
            <button onClick={() => { setMode('compose'); setError(''); }} className="mb-4 flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"><ArrowLeft size={14} /> Corregir texto original</button>
            <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700">
              <div className="flex items-start gap-2"><AlertCircle size={15} className="mt-0.5 flex-shrink-0" /><span>Revisa la propuesta. Se guardará como <strong>información de mercado</strong>, no como hecho confirmado.</span></div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Dominio
                  <select value={draft.domain} onChange={event => updateDomain(event.target.value)} className={`${fieldClass} mt-1 normal-case font-normal tracking-normal`}>
                    {VALID_DOMAINS.map(value => <option key={value} value={value}>{DOMAIN_LABELS[value]}</option>)}
                  </select>
                </label>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Modelo
                  <select value={draft.subdomain} onChange={event => updateDraft('subdomain', event.target.value)} disabled={draft.domain !== 'new_business'} className={`${fieldClass} mt-1 normal-case font-normal tracking-normal disabled:bg-slate-100`}>
                    {(draft.domain === 'new_business' ? newBusinessSubdomains : [draft.subdomain]).map(value => <option key={value} value={value}>{SUBDOMAIN_LABELS[value]}</option>)}
                  </select>
                </label>
              </div>

              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Competidor u operador
                <input value={draft.competitor_name} onChange={event => updateDraft('competitor_name', event.target.value)} placeholder="No identificado" className={`${fieldClass} mt-1 normal-case font-normal tracking-normal`} />
              </label>

              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Categoría
                <select value={draft.section} onChange={event => updateDraft('section', event.target.value)} className={`${fieldClass} mt-1 normal-case font-normal tracking-normal`}>
                  {VALID_SECTIONS.map(value => <option key={value} value={value}>{SECTION_LABELS[value]}</option>)}
                </select>
              </label>

              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Información que se incorporará
                <textarea value={draft.statement} onChange={event => updateDraft('statement', event.target.value)} rows={5} className={`${fieldClass} mt-1 resize-none normal-case font-normal leading-relaxed tracking-normal`} />
              </label>

              {draft.implication && (
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Posible implicación
                  <textarea value={draft.implication} onChange={event => updateDraft('implication', event.target.value)} rows={3} className={`${fieldClass} mt-1 resize-none normal-case font-normal leading-relaxed tracking-normal`} />
                </label>
              )}

              {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-600">{error}</div>}
              <button onClick={saveContribution} disabled={!draft.statement.trim() || saving}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-40">
                {saving ? <><Loader2 size={16} className="animate-spin" /> Incorporando…</> : <><Check size={16} /> Incorporar al Benchmark</>}
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
