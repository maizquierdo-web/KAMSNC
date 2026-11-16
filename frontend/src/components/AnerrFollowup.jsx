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
      <div className="flex flex-wrap items-end gap-3">
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
        <button type="button" className="border rounded p-2 text-xs" disabled={!validRange} onClick={() => exportRows('xlsx')}>Exportar Excel</button>
        <button type="button" className="border rounded p-2 text-xs" onClick={() => exportRows('csv')}>Exportar CSV</button>
      </div>
      <section className="rounded-xl border border-surface-3 p-3 space-y-2">
        <h2 className="text-sm font-bold">Revisión quincenal</h2>
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-xs">Desde <input className="border rounded p-1" type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
          <label className="grid gap-1 text-xs">Hasta <input className="border rounded p-1" type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
        </div>
        {!validRange ? <p className="text-sm text-red-600">Introduce un intervalo válido.</p> : (
          <table className="text-xs">
            <thead><tr><th className="text-left pr-4">Hito</th>{LINKS.map(value => <th key={value} className="px-3">{value}</th>)}</tr></thead>
            <tbody>{summary.map(([label, ...counts]) => <tr key={label}><th scope="row" className="text-left pr-4 py-1 font-normal">{label}</th>{counts.map((count, index) => <td key={LINKS[index]} className="text-center">{count}</td>)}</tr>)}</tbody>
          </table>
        )}
      </section>
      <p className="text-xs text-text-secondary">{visible.length} canales</p>
      <div className="overflow-x-auto rounded-xl border border-surface-3">
        <table className="w-full text-xs whitespace-nowrap">
          <thead><tr>{COLUMNS.map(([label]) => <th key={label} className="p-2 text-left bg-surface-2">{label}</th>)}</tr></thead>
          <tbody>{visible.map(row => <tr key={row.id} className="border-t border-surface-3">
            {COLUMNS.map(([label, value], index) => <td key={label} className="p-2">
              {index === 0 ? <button type="button" className="font-bold underline" onClick={() => onChannelClick(row.id)}>{row.name}</button> : value(row) || '—'}
            </td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
