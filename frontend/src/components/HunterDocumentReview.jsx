import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Save, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from './AuthProvider';
import { documentText, EVIDENCE_LABELS, parseHunterDocument } from '../lib/hunterCanvas.mjs';
import { createHunterDocx, hunterFileName } from '../lib/hunterDocx.mjs';
import { saveHunterCanvas } from '../lib/saveHunterCanvas.mjs';

export default function HunterDocumentReview({ value, channel, onClose, onSaved }) {
  const { user } = useAuthContext();
  const [draft, setDraft] = useState(value.draft);
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  function edit(sectionIndex, itemIndex, field, text) {
    setReviewed(false);
    setDraft(previous => ({ ...previous, sections: previous.sections.map((section, si) => si !== sectionIndex ? section : {
      ...section, items: section.items.map((item, ii) => ii !== itemIndex ? item : { ...item, [field]: text }),
    }) }));
  }

  async function output(save) {
    if (lock.current || !reviewed) return;
    lock.current = true; setBusy(true); setNotice('');
    try {
      const checked = parseHunterDocument(JSON.stringify(draft), value.kind);
      const blob = await createHunterDocx({ draft: checked, name: channel.name, date: value.date, kind: value.kind });
      const filename = hunterFileName(channel.name, value.date, value.kind);
      if (!save) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      } else {
        const saved = await saveHunterCanvas({ client: supabase, channelId: channel.id, userId: user?.id,
          blob, fileName: filename, text: documentText(checked, channel.name, value.date, value.kind),
          confirmReplace: existing => window.confirm(`Ya existe «${existing.file_name}». ¿Quieres sustituir el Hunter Canvas de esta ficha por el borrador revisado? El archivo anterior no se eliminará.`),
        });
        if (!saved.saved) return;
        onSaved?.();
      }
      if (live.current) setNotice(save ? 'Hunter Canvas guardado en la ficha. Al volver a abrir el agente se cargará la nueva versión.' : 'Word preparado para descargar.');
    } catch (error) {
      if (live.current) setNotice(error.message || 'No se pudo preparar el documento.');
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }

  return <section className="mb-4 rounded-xl border border-navy-200 bg-white p-3" aria-label="Revisar documento Hunter">
    <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-bold">{value.kind === 'meeting' ? 'Preparación de reunión' : 'Hunter Canvas'} · Borrador</h3><button onClick={onClose} disabled={busy} aria-label="Cerrar borrador" className="p-2"><X size={16} /></button></div>
    <p className="my-2 text-[11px] text-slate-500">{channel.name} · {value.date}. Revisa contenido, etiquetas y fuentes antes de descargar o guardar.</p>
    <label className="block text-xs font-semibold">Tesis de oportunidad<textarea maxLength={2000} value={draft.summary} onChange={e => { setDraft({ ...draft, summary: e.target.value }); setReviewed(false); }} className="mt-1 w-full rounded-lg border border-surface-3 p-2 text-xs font-normal" rows={3} /></label>
    {draft.sections.map((section, si) => <details key={section.title} className="mt-2 border-t border-surface-3 pt-2" open={si === 0}>
      <summary className="cursor-pointer text-xs font-bold">{si + 1}. {section.title}</summary>
      {section.items.map((item, ii) => <div key={ii} className="mt-2 space-y-1">
        <label className="block text-[10px] text-slate-500">Tipo de evidencia<select aria-label={`Evidencia ${section.title} ${ii + 1}`} value={item.kind} onChange={e => edit(si, ii, 'kind', e.target.value)} className="block w-full rounded border border-surface-3 p-1.5 text-xs">{Object.entries(EVIDENCE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <textarea aria-label={`${section.title} ${ii + 1}`} value={item.text} maxLength={1200} onChange={e => edit(si, ii, 'text', e.target.value)} rows={3} className="w-full rounded border border-surface-3 p-2 text-xs" />
        <input aria-label={`Fuente ${section.title} ${ii + 1}`} value={item.source} maxLength={500} onChange={e => edit(si, ii, 'source', e.target.value)} className="w-full rounded border border-surface-3 p-2 text-[11px]" />
      </div>)}
    </details>)}
    <label className="my-3 flex items-start gap-2 text-xs"><input type="checkbox" checked={reviewed} disabled={busy} onChange={e => setReviewed(e.target.checked)} />He revisado el borrador y sus fuentes.</label>
    <div className="flex flex-wrap gap-2">
      <button disabled={!reviewed || busy} onClick={() => output(false)} className="flex items-center gap-1 rounded-lg border border-navy-200 px-3 py-2 text-xs font-bold disabled:opacity-40">{busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}Descargar Word</button>
      {value.kind !== 'meeting' && <button disabled={!reviewed || busy} onClick={() => output(true)} className="flex items-center gap-1 rounded-lg bg-navy-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><Save size={14} />Guardar en ficha</button>}
    </div>
    {value.kind === 'meeting' && <p className="mt-2 text-[10px] text-slate-500">El guion se descarga por separado; no sustituye al Hunter Canvas de la ficha.</p>}
    {notice && <p role="status" className="mt-2 text-xs text-slate-600">{notice}</p>}
  </section>;
}
