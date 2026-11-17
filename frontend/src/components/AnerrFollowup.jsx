import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { PIPELINE_CONFIG } from '../lib/crmConstants';

const LINKS = ['ANERR', 'ORIGEN ANERR'];
const MILESTONES = [
  ['Presentaciones', 'presented_on'], ['Primeras reuniones realizadas', 'first_meeting'],
  ['Activaciones', 'activated_on'], ['Cierres', 'closed_on'],
];

function state(row) {
  if (row.status === 'activo') return 'Activada';
  if (row.status === 'rechazado') return 'No interesada';
  if (row.status === 'cierre_sin_acuerdo') return 'Cerrada';
  if (['en_desarrollo', 'en_proceso_alta'].includes(row.status) && row.action_on) return 'En desarrollo';
  return row.presented_on ? 'Interesada' : 'Pendiente';
}

function actionable(row) {
  return row.presented_on && !['activo', 'rechazado', 'cierre_sin_acuerdo'].includes(row.status);
}

function dateKey(date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

const COLUMNS = [
  ['Canal', row => row.name], ['Vínculo', row => row.anerr_link], ['Delegado', row => row.delegate],
  ['Territorio', row => row.territory], ['Responsable', row => row.responsible],
  ['Fase CRM', row => PIPELINE_CONFIG[row.stage] || row.stage], ['Estado ANERR', state],
  ['Presentación', row => row.presented_on], ['Primer contacto', row => row.first_contact],
  ['Primera reunión realizada', row => row.first_meeting], ['Reunión prevista', row => row.planned_meeting],
  ['Próxima acción', row => row.action], ['Fecha próxima acción', row => row.action_on],
  ['Activación', row => row.activated_on], ['Cierre', row => row.closed_on], ['Motivo de cierre', row => row.close_reason],
];

const FILTERS = [
  ['Todas las oportunidades', () => true],
  ['Sin primer contacto', row => actionable(row) && !row.first_contact],
  ['Primera reunión pendiente', row => actionable(row) && !row.first_meeting],
  ['Sin próxima acción', row => actionable(row) && !row.action_on],
  ['Acción vencida', row => actionable(row) && row.action_on && row.action_on < dateKey(new Date())],
];

export default function AnerrFollowup({ onChannelClick }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  const [filter, setFilter] = useState('0');
  const [to, setTo] = useState(() => dateKey(new Date()));
  const [from, setFrom] = useState(() => dateKey(new Date(Date.now() - 13 * 86400000)));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const results = [];
      const pageSize = 500;
      for (let start = 0; !cancelled; start += pageSize) {
        const { data, error: requestError } = await supabase.rpc('anerr_followup').order('id').range(start, start + pageSize - 1);
        if (cancelled) return;
        if (requestError) { setError('No se ha podido cargar el seguimiento ANERR.'); return; }
        results.push(...data);
        if (data.length < pageSize) { setRows(results); return; }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const visible = (rows || []).filter(row => (!link || row.anerr_link === link) && FILTERS[Number(filter)][1](row));
  const validRange = Boolean(from && to && from <= to);
  const summary = [
    ...MILESTONES.map(([label, key]) => [label, row => validRange && row[key] && row[key] >= from && row[key] <= to]),
    ['En desarrollo actualmente', row => ['en_desarrollo', 'en_proceso_alta'].includes(row.status) && row.presented_on],
  ].map(([label, predicate]) => [label, ...LINKS.map(value => (rows || []).filter(row => row.anerr_link === value && predicate(row)).length)]);

  function exportRows(format) {
    const workbook = XLSX.utils.book_new();
    const details = XLSX.utils.aoa_to_sheet([COLUMNS.map(([label]) => label), ...visible.map(row => COLUMNS.map(([, value]) => value(row) ?? ''))]);
    XLSX.utils.book_append_sheet(workbook, details, 'Seguimiento');
    if (format === 'xlsx') {
      const totals = XLSX.utils.aoa_to_sheet([['Desde', from, 'Hasta', to], [], ['Hito', ...LINKS], ...summary]);
      XLSX.utils.book_append_sheet(workbook, totals, 'Revisión quincenal');
    }
    XLSX.writeFile(workbook, 'seguimiento_anerr.' + format);
  }

  if (error) return <p role="alert" className="text-red-600">{error}</p>;
  if (!rows) return <p className="text-sm text-text-secondary">Cargando seguimiento ANERR…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-surface-3 bg-white p-3 sm:p-4">
        <label className="grid gap-1 text-xs">Vínculo
          <select className="border rounded p-2" value={link} onChange={event => setLink(event.target.value)}>
            <option value="">Todos</option>{LINKS.map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs">Seguimiento
          <select className="border rounded p-2" value={filter} onChange={event => setFilter(event.target.value)}>
            {FILTERS.map(([label], index) => <option key={label} value={index}>{label}</option>)}
          </select>
        </label>
        <button type="button" className="rounded-lg bg-navy-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50" disabled={!validRange} onClick={() => exportRows('xlsx')}>Exportar Excel</button>
        <button type="button" className="rounded-lg border border-navy-100 px-3 py-2 text-xs font-bold text-navy-700" onClick={() => exportRows('csv')}>Exportar CSV</button>
      </div>
      <section className="space-y-3 rounded-xl border border-surface-3 bg-white p-3 sm:p-4">
        <h2 className="text-base font-extrabold">Revisión quincenal</h2>
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-xs">Desde <input className="border rounded p-1" type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
          <label className="grid gap-1 text-xs">Hasta <input className="border rounded p-1" type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
        </div>
        {!validRange ? <p className="text-sm text-red-600">Introduce un intervalo válido.</p> : (
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
            {summary.map(([label, ...counts]) => (
              <article key={label} className="rounded-xl border border-navy-100 bg-navy-50 p-3">
                <h3 className="text-xs font-bold text-navy-700">{label}</h3>
                <p className="my-1 text-2xl font-extrabold text-navy-700">{counts.reduce((sum, count) => sum + count, 0)}</p>
                <dl className="space-y-1 text-[11px] text-text-secondary">
                  {LINKS.map((value, index) => (
                    <div key={value} className="flex flex-wrap justify-between gap-x-2">
                      <dt>{value}</dt><dd className="font-bold tabular-nums">{counts[index]}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-extrabold">Canales ({visible.length})</h2>
        {visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-surface-3 bg-white p-6 text-sm text-text-secondary">
            {rows.length ? 'Ningún canal coincide con estos filtros.' : 'Todavía no hay canales vinculados a ANERR. Puedes etiquetarlos desde su ficha o importarlos desde Excel.'}
          </div>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {visible.map(row => (
              <article key={row.id} className="rounded-xl border border-surface-3 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button type="button" className="text-left text-sm font-bold text-navy-700 hover:underline" onClick={() => onChannelClick(row.id)}>{row.name}</button>
                  <span className="rounded-full bg-navy-50 px-2 py-1 text-[10px] font-bold text-navy-700">{row.anerr_link}</span>
                </div>
                <p className="mt-1 text-xs text-text-secondary">{[row.responsible, state(row), PIPELINE_CONFIG[row.stage] || row.stage].filter(Boolean).join(' · ')}</p>
                <p className="mt-2 text-xs font-semibold">
                  {row.action_on ? [row.action || 'Próxima acción', row.action_on].join(' · ') : 'Sin próxima acción'}
                </p>
                <details className="mt-2 text-xs text-text-secondary">
                  <summary className="cursor-pointer font-semibold">Ver hitos y datos del canal</summary>
                  <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                    {COLUMNS.slice(2).map(([label, value]) => value(row) && (
                      <div key={label}><dt className="inline font-semibold">{label} </dt><dd className="inline">{value(row)}</dd></div>
                    ))}
                  </dl>
                </details>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
