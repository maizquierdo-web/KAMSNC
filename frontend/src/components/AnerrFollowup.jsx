import { useEffect, useState } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { PIPELINE_CONFIG } from '../lib/crmConstants';

const LINKS = [['ANERR', 'ANERR'], ['ORIGEN ANERR', 'Origen ANERR']];
const labelForLink = value => LINKS.find(([key]) => key === value)?.[1] || value;
const inputClass = 'rounded-lg border border-surface-3 bg-white px-2 py-1.5 text-xs';
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
  ['Todas', () => true],
  ['Vencidas', (row, today) => actionable(row) && row.action_on && row.action_on < today],
  ['Sin próxima acción', row => actionable(row) && !row.action_on],
  ['Sin primer contacto', row => actionable(row) && !row.first_contact],
  ['Primera reunión pendiente', row => actionable(row) && !row.first_meeting],
];

function lastFortnight() {
  const to = dateKey(new Date());
  const start = new Date(to + 'T12:00:00Z');
  start.setUTCDate(start.getUTCDate() - 13);
  return { from: start.toISOString().slice(0, 10), to };
}

export default function AnerrFollowup({ onChannelClick }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  const [filter, setFilter] = useState(0);
  const [{ from, to }, setPeriod] = useState(lastFortnight);

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

  if (error) return <p role="alert" className="text-red-600">{error}</p>;
  if (!rows) return <p className="text-sm text-text-secondary">Cargando seguimiento ANERR…</p>;
  if (!rows.length) return (
    <p className="rounded-xl border border-dashed border-surface-3 bg-white p-5 text-sm text-text-secondary">
      Todavía no hay canales vinculados a ANERR. Etiqueta un canal desde su ficha o importa el listado desde Excel.
    </p>
  );

  const today = dateKey(new Date());
  const portfolio = rows.filter(row => !link || row.anerr_link === link);
  const counts = FILTERS.map(([, test]) => portfolio.filter(row => test(row, today)).length);
  const visible = portfolio.filter(row => FILTERS[filter][1](row, today)).sort((a, b) => {
    const priority = row => FILTERS[1][1](row, today) ? 0 : FILTERS[2][1](row, today) ? 1 : 2;
    return priority(a) - priority(b) ||
      (a.action_on || '9999').localeCompare(b.action_on || '9999') ||
      a.name.localeCompare(b.name, 'es');
  });
  const validRange = Boolean(from && to && from <= to);
  const inDevelopment = row => ['en_desarrollo', 'en_proceso_alta'].includes(row.status) && row.presented_on;
  const summary = [
    ...MILESTONES.map(([label, key]) => [label, row => validRange && row[key] && row[key] >= from && row[key] <= to]),
    ['En desarrollo actualmente', inDevelopment],
  ].map(([label, predicate]) => [label, ...LINKS.map(([value]) => portfolio.filter(row => row.anerr_link === value && predicate(row)).length)]);

  function exportRows(format) {
    const workbook = XLSX.utils.book_new();
    const details = XLSX.utils.aoa_to_sheet([COLUMNS.map(([label]) => label), ...visible.map(row => COLUMNS.map(([, value]) => value(row) ?? ''))]);
    XLSX.utils.book_append_sheet(workbook, details, 'Seguimiento');
    if (format === 'xlsx') {
      const totals = XLSX.utils.aoa_to_sheet([['Desde', from, 'Hasta', to], [], ['Hito', ...LINKS.map(([, label]) => label)], ...summary]);
      XLSX.utils.book_append_sheet(workbook, totals, 'Revisión quincenal');
    }
    XLSX.writeFile(workbook, 'seguimiento_anerr.' + format);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border border-surface-3 bg-white p-1" role="group" aria-label="Etiqueta ANERR">
          {[['', 'Todos'], ...LINKS].map(([value, label]) => (
            <button key={value} type="button" aria-pressed={link === value} onClick={() => setLink(value)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-bold ${link === value ? 'bg-navy-700 text-white' : 'text-navy-700 hover:bg-navy-50'}`}>
              {label}
            </button>
          ))}
        </div>
        <details className="relative">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-surface-3 bg-white px-3 py-2 text-xs font-bold text-navy-700">
            <Download size={14} /> Exportar <ChevronDown size={13} />
          </summary>
          <div className="absolute right-0 z-10 mt-1 w-28 rounded-lg border border-surface-3 bg-white p-1 shadow-sm">
            <button type="button" disabled={!validRange} onClick={event => { exportRows('xlsx'); event.currentTarget.closest('details').open = false; }}
              className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-navy-50 disabled:opacity-50">Excel</button>
            <button type="button" onClick={event => { exportRows('csv'); event.currentTarget.closest('details').open = false; }}
              className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-navy-50">CSV</button>
          </div>
        </details>
      </div>

      <section className="rounded-xl border border-surface-3 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
          <h2 className="text-sm font-extrabold">Revisión quincenal</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setPeriod(lastFortnight())} className="text-xs font-bold text-navy-700 hover:underline">Últimos 14 días</button>
            <label className="flex items-center gap-1 text-xs">Desde <input className={inputClass} type="date" value={from}
              onChange={event => setPeriod({ from: event.target.value, to })} /></label>
            <label className="flex items-center gap-1 text-xs">Hasta <input className={inputClass} type="date" value={to}
              onChange={event => setPeriod({ from, to: event.target.value })} /></label>
          </div>
        </div>
        {!validRange ? <p className="px-3 pb-3 text-xs text-red-600">Introduce un intervalo válido.</p> : (
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-b-xl border-t border-surface-3 bg-surface-3 md:grid-cols-4">
            {summary.slice(0, 4).map(([label, newCount, existingCount]) => (
              <div key={label} className="bg-white px-3 py-2">
                <dt className="text-xs font-semibold text-text-secondary">{label}</dt>
                <dd className="text-xl font-extrabold leading-tight text-navy-700 tabular-nums">{newCount + existingCount}</dd>
                {!link && <dd className="text-[11px] text-text-secondary">ANERR {newCount} · Origen ANERR {existingCount}</dd>}
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-sm font-extrabold">Canales ({visible.length}{filter !== 0 ? ` de ${portfolio.length}` : ''})</h2>
          <p className="text-xs text-text-secondary">{portfolio.filter(inDevelopment).length} en desarrollo</p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por próxima acción">
          {FILTERS.map(([label], index) => (
            <button key={label} type="button" aria-pressed={filter === index} onClick={() => setFilter(index)}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${filter === index ? 'border-navy-700 bg-navy-700 text-white' : index > 0 && counts[index] ? 'border-orange-200 bg-orange-50 text-orange-800' : 'border-surface-3 bg-white text-text-secondary'}`}>
              {label} <span className="tabular-nums">{counts[index]}</span>
            </button>
          ))}
        </div>
        {!visible.length ? (
          <p className="rounded-xl border border-dashed border-surface-3 bg-white p-4 text-sm text-text-secondary">Ningún canal coincide con estos filtros.</p>
        ) : (
          <ul className="divide-y divide-surface-3 rounded-xl border border-surface-3 bg-white">
            {visible.map(row => {
              const needsAttention = FILTERS[1][1](row, today) || FILTERS[2][1](row, today);
              return (
                <li key={row.id} className="px-3 py-2.5">
                  <div className="grid gap-x-3 gap-y-1.5 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.3fr)] md:items-center">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <button type="button" className="min-w-0 break-words text-left text-sm font-bold text-navy-700 hover:underline" onClick={() => onChannelClick(row.id)}>{row.name}</button>
                      <span className="rounded-full bg-navy-50 px-2 py-0.5 text-[10px] font-bold text-navy-700">{labelForLink(row.anerr_link)}</span>
                    </div>
                    <p className="text-xs text-text-secondary">{[row.responsible, PIPELINE_CONFIG[row.stage] || row.stage].filter(Boolean).join(' · ')}</p>
                    <p className={`break-words text-xs font-semibold ${needsAttention ? 'text-orange-800' : 'text-text-secondary'}`}>
                      {row.action_on ? [row.action || 'Próxima acción', row.action_on.split('-').reverse().join('/')].join(' · ') : 'Sin próxima acción'}
                    </p>
                  </div>
                  <details className="mt-1 text-xs text-text-secondary">
                    <summary className="w-fit cursor-pointer">Ver hitos y datos</summary>
                    <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                      {COLUMNS.slice(2).map(([label, value]) => value(row) && (
                        <div key={label}><dt className="inline font-semibold">{label} </dt><dd className="inline">{value(row)}</dd></div>
                      ))}
                    </dl>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
