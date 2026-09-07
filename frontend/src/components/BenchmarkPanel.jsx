import { useEffect, useState } from 'react';
import {
  AlertCircle, ArrowLeft, Check, ChevronRight, Database,
  Loader2, Plus, Sparkles, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

const DOMAIN_LABELS = {
  new_business: 'Nuevos Negocios',
  caes: 'CAEs',
  cross: 'Transversal',
};

const SUBDOMAIN_LABELS = {
  wholesale: 'Mayorista',
  solar: 'Solar',
  sme: 'Pyme',
  remote_sales: 'Venta Remota',
  caes: 'CAEs',
  cross: 'Transversal',
};

const SECTION_LABELS = {
  general: 'Información general',
  value_proposition: 'Propuesta de valor',
  products_services: 'Productos y servicios',
  commercial_model: 'Modelo comercial',
  operations: 'Operativa',
  technology: 'Tecnología',
  incentives: 'Incentivos',
  communication: 'Comunicación',
  strengths: 'Fortalezas',
  weaknesses: 'Debilidades',
  risks: 'Riesgos',
  opportunities: 'Oportunidades',
  economic_conditions: 'Precios y condiciones',
  organization_capabilities: 'Organización y capacidades',
};

const VALID_DOMAINS = Object.keys(DOMAIN_LABELS);
const VALID_SUBDOMAINS = Object.keys(SUBDOMAIN_LABELS);
const VALID_SECTIONS = Object.keys(SECTION_LABELS);

const EXTRACTION_PROMPT = `Eres el clasificador de aportaciones del Benchmark competitivo de Naturgy.
Tu única tarea es transformar el texto de un KAM en una ficha estructurada, sin añadir hechos que no estén en el texto.

Dominios:
- new_business: negocios de captación y desarrollo de canales de energía, Mayorista, Solar, Pyme o Venta Remota.
- caes: Certificados de Ahorro Energético.
- cross: información que afecta claramente a ambos.

Subdominios permitidos: wholesale, solar, sme, remote_sales, caes, cross.
Secciones permitidas: general, value_proposition, products_services, commercial_model, operations, technology, incentives, communication, strengths, weaknesses, risks, opportunities, economic_conditions, organization_capabilities.

Reglas:
- Extrae una sola afirmación principal, concreta y autosuficiente.
- competitor_name debe ser una empresa u operador identificado; usa cadena vacía si no aparece.
- Esta fuente es una aportación de mercado, nunca la presentes como confirmada.
- confidence mide solo la claridad de la extracción, no la veracidad, entre 0 y 100.
- implication y recommended_action deben quedar vacíos si no se deducen prudentemente.
- No inventes precios, fechas, nombres ni condiciones.

Responde exclusivamente con JSON válido y esta forma:
{"domain":"new_business|caes|cross","subdomain":"wholesale|solar|sme|remote_sales|caes|cross","section":"general|value_proposition|products_services|commercial_model|operations|technology|incentives|communication|strengths|weaknesses|risks|opportunities|economic_conditions|organization_capabilities","competitor_name":"","statement":"","confidence":0,"implication":"","recommended_action":"","tags":[]}`;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDraft(parsed, originalText) {
  const domain = VALID_DOMAINS.includes(parsed?.domain) ? parsed.domain : 'cross';
  let subdomain = VALID_SUBDOMAINS.includes(parsed?.subdomain) ? parsed.subdomain : 'cross';
  if (domain === 'caes') subdomain = 'caes';
  if (domain === 'cross') subdomain = 'cross';
  if (domain === 'new_business' && ['caes', 'cross'].includes(subdomain)) subdomain = 'wholesale';

  return {
    domain,
    subdomain,
    section: VALID_SECTIONS.includes(parsed?.section) ? parsed.section : 'general',
    competitor_name: clean(parsed?.competitor_name),
    statement: clean(parsed?.statement) || originalText.trim(),
    confidence: Math.max(0, Math.min(100, Number(parsed?.confidence) || 0)),
    implication: clean(parsed?.implication),
    recommended_action: clean(parsed?.recommended_action),
    tags: Array.isArray(parsed?.tags) ? parsed.tags.map(clean).filter(Boolean).slice(0, 8) : [],
  };
}

function parseAssistantJson(rawText) {
  const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned);
}

function formatDate(value) {
  return new Date(value).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BenchmarkPanel({ open, onClose }) {
  const [mode, setMode] = useState('list');
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
        .select('id, domain, subdomain, section, statement, reliability, confidence, created_at, benchmark_competitors(name), benchmark_sources(source_type, source_date)')
        .eq('status', 'incorporated')
        .order('created_at', { ascending: false })
        .limit(30);
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
      const response = await fetch(`${BACKEND_URL}/api/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: EXTRACTION_PROMPT,
          messages: [{ role: 'user', content: rawContent.trim() }],
        }),
      });
      if (!response.ok) throw new Error('No se pudo conectar con el clasificador');
      const data = await response.json();
      const assistantText = data.content?.map(item => item.text || '').join('').trim();
      if (!assistantText) throw new Error('La IA no devolvió una propuesta');
      setDraft(normalizeDraft(parseAssistantJson(assistantText), rawContent));
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
        ['wholesale', 'solar', 'sme', 'remote_sales'].includes(previous.subdomain) ? previous.subdomain : 'wholesale',
    }));
  }

  async function saveContribution() {
    if (!draft?.statement.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const { error: saveError } = await supabase.rpc('add_manual_benchmark_entry', {
        p_raw_content: rawContent.trim(),
        p_competitor_name: draft.competitor_name || null,
        p_domain: draft.domain,
        p_subdomain: draft.subdomain,
        p_section: draft.section,
        p_statement: draft.statement.trim(),
        p_confidence: Math.round(draft.confidence),
        p_implication: draft.implication || null,
        p_recommended_action: draft.recommended_action || null,
        p_tags: draft.tags,
      });
      if (saveError) throw saveError;
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

  const newBusinessSubdomains = ['wholesale', 'solar', 'sme', 'remote_sales'];
  const fieldClass = 'w-full rounded-xl border border-surface-3 bg-white px-3 py-2.5 text-xs text-slate-700 focus:border-teal-400 focus:outline-none';

  return (
    <>
      <button aria-label="Cerrar Benchmark" onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/20" />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-surface-3 bg-[#f7fafc] text-text-primary shadow-2xl sm:w-[460px]">
        <div className="flex items-start justify-between border-b border-teal-100 bg-[#eaf7f5] px-4 py-4">
          <div className="flex gap-2.5">
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-700"><Database size={18} /></div>
            <div>
              <h2 className="text-base font-extrabold text-slate-800">Benchmark</h2>
              <p className="mt-0.5 text-[10px] text-slate-500">Memoria competitiva compartida</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700"><X size={18} /></button>
        </div>

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
