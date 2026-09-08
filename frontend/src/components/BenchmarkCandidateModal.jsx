import { useState } from 'react';
import { AlertCircle, Check, Loader2, X } from 'lucide-react';
import {
  BENCHMARK_DOMAINS, BENCHMARK_SECTIONS, BENCHMARK_SUBDOMAINS,
  saveBenchmarkCandidate,
} from '../lib/benchmarkCapture';

export default function BenchmarkCandidateModal({ candidate, source, onClose, onSaved }) {
  const [draft, setDraft] = useState(candidate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const update = (field, value) => setDraft(previous => ({ ...previous, [field]: value }));
  const subdomains = draft.domain === 'new_business'
    ? BENCHMARK_SUBDOMAINS.filter(option => ['wholesale', 'solar', 'residential', 'remote_sales'].includes(option.value))
    : BENCHMARK_SUBDOMAINS.filter(option => option.value === (draft.domain === 'caes' ? 'caes' : 'cross'));

  function updateDomain(domain) {
    setDraft(previous => ({
      ...previous,
      domain,
      subdomain: domain === 'caes' ? 'caes' : domain === 'cross' ? 'cross'
        : ['wholesale', 'solar', 'residential', 'remote_sales'].includes(previous.subdomain) ? previous.subdomain : 'wholesale',
    }));
  }

  async function confirm() {
    if (!draft.statement.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      await saveBenchmarkCandidate({ ...source, draft });
      onSaved?.();
      onClose();
    } catch (saveError) {
      console.error('No se pudo incorporar la propuesta al Benchmark:', saveError);
      setError('No se pudo incorporar la información. La propuesta sigue disponible.');
    } finally {
      setSaving(false);
    }
  }

  const fieldClass = 'mt-1 w-full rounded-lg border border-surface-3 bg-white px-3 py-2 text-xs font-normal normal-case tracking-normal text-slate-700 focus:border-teal-400 focus:outline-none';

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4">
    <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-surface-3 bg-[#f7fafc] shadow-2xl">
      <div className="flex items-start justify-between border-b border-teal-100 bg-[#eaf7f5] p-4">
        <div><h3 className="text-base font-extrabold text-slate-800">Posible información de Benchmark</h3><p className="mt-1 text-xs text-slate-500">La IA ha detectado una aportación de mercado. Tú decides si se incorpora.</p></div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white"><X size={18} /></button>
      </div>
      <div className="space-y-3 p-4">
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700"><div className="flex gap-2"><AlertCircle size={15} className="mt-0.5 flex-shrink-0" /><span>Se guardará como información de mercado compartida, no como hecho confirmado. Puedes corregir la propuesta antes de incorporarla.</span></div></div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Dominio<select value={draft.domain} onChange={event => updateDomain(event.target.value)} className={fieldClass}>{BENCHMARK_DOMAINS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Modelo<select value={draft.subdomain} onChange={event => update('subdomain', event.target.value)} className={fieldClass}>{subdomains.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div>
        <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">Competidor u operador<input value={draft.competitor_name} onChange={event => update('competitor_name', event.target.value)} placeholder="No identificado" className={fieldClass} /></label>
        <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">Categoría<select value={draft.section} onChange={event => update('section', event.target.value)} className={fieldClass}>{BENCHMARK_SECTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">Información que se incorporará<textarea value={draft.statement} onChange={event => update('statement', event.target.value)} rows={5} className={`${fieldClass} resize-none leading-relaxed`} /></label>
        {draft.implication && <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">Posible implicación<textarea value={draft.implication} onChange={event => update('implication', event.target.value)} rows={2} className={`${fieldClass} resize-none leading-relaxed`} /></label>}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button onClick={onClose} disabled={saving} className="rounded-xl border border-surface-3 bg-white px-3 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50">No incorporar</button>
          <button onClick={confirm} disabled={saving || !draft.statement.trim()} className="flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50">{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Incorporar</button>
        </div>
      </div>
    </div>
  </div>;
}
