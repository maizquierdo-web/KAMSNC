import { useState } from 'react';
import { isoAnerrDate, useAnerrAccess } from '../lib/anerr';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../components/AuthProvider';
import * as XLSX from 'xlsx';
import {
  CREATABLE_PIPELINE_STAGES, POTENCIAL_OPTIONS,
  COMUNIDADES_AUTONOMAS, LEAD_SOURCE_OPTIONS, stageToStatus,
} from '../lib/crmConstants';
import {
  Upload, FileSpreadsheet, Check, X, AlertCircle,
  Loader2, ArrowRight, Download, Eye
} from 'lucide-react';

// Campos "normales" (1 columna Excel -> 1 campo CRM)
const CHANNEL_FIELDS = [
  { key: 'name', label: 'Nombre del canal', required: true },
  { key: 'contact_name', label: 'Persona de contacto', required: false },
  { key: 'phone', label: 'Teléfono', required: false },
  { key: 'email', label: 'Email', required: false },
  { key: 'cif', label: 'CIF', required: false },
  { key: 'website', label: 'Página web', required: false },
  { key: 'google_rating', label: 'Valoración Google', required: false },
  { key: 'pipeline_stage', label: 'Fase del Pipeline', required: false },
  { key: 'comunidad_autonoma', label: 'Comunidad Autónoma', required: false },
  { key: 'potencial_caes', label: 'Potencial CAES', required: false },
  { key: 'potencial_energia', label: 'Potencial Energía', required: false },
  { key: 'volume_amount', label: 'Volumen anual', required: false },
  { key: 'volume_unit', label: 'Tipo volumen (residencial/pymes/caes)', required: false },
  { key: 'address', label: 'Dirección / Calle', required: false },
  { key: 'city', label: 'Localidad', required: false },
  { key: 'province', label: 'Provincia', required: false },
  { key: 'notes', label: 'Notas', required: false },
];

const ANERR_FIELDS = [
  { key: 'anerr_link', label: 'Etiqueta ANERR' },
  { key: 'anerr_delegate', label: 'Delegado ANERR' },
  { key: 'anerr_territory', label: 'Territorio' },
  { key: 'anerr_alias', label: 'Alias' },
  { key: 'anerr_presented_on', label: 'Fecha de presentación ANERR' },
];

// Campos de Origen del lead: una columna Excel por cada origen posible (Sí/No),
// que se combinan en el array lead_source al importar.
const LEAD_SOURCE_FIELDS = LEAD_SOURCE_OPTIONS.map(opt => ({
  key: `lead_source__${opt.value}`,
  label: `Origen: ${opt.label}`,
  leadSourceValue: opt.value,
}));

// Mapa de fase del pipeline en español (Excel) -> key interna
const STAGE_INPUT_MAP = Object.fromEntries(
  CREATABLE_PIPELINE_STAGES.map(s => [s.label.toLowerCase(), s.key])
);
// También aceptar las keys en inglés tal cual, por si el Excel las trae así
CREATABLE_PIPELINE_STAGES.forEach(s => { STAGE_INPUT_MAP[s.key] = s.key; });

function parsePipelineStage(value) {
  if (!value) return 'lead';
  const v = value.toString().trim().toLowerCase();
  return STAGE_INPUT_MAP[v] || 'lead';
}

function parsePotencial(value) {
  if (!value) return null;
  const v = value.toString().trim().toLowerCase();
  const found = POTENCIAL_OPTIONS.find(p => p.toLowerCase() === v);
  return found || null;
}

function parseComunidadAutonoma(value) {
  if (!value) return null;
  const v = value.toString().trim().toLowerCase();
  const found = COMUNIDADES_AUTONOMAS.find(ca => ca.toLowerCase() === v);
  return found || value.toString().trim(); // si no coincide exacto, se guarda igual el texto tal cual
}

function isAffirmative(value) {
  if (!value) return false;
  const v = value.toString().trim().toLowerCase();
  return ['si', 'sí', 'yes', 'x', 'true', '1'].includes(v);
}

// ============ EXCEL/CSV PARSER ============
async function parseFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (jsonData.length === 0) return { headers: [], rows: [], sheetName };

  const headers = Object.keys(jsonData[0]);
  const rows = jsonData.map(row => {
    const cleaned = {};
    headers.forEach(h => { cleaned[h] = String(row[h] ?? '').trim(); });
    return cleaned;
  }).filter(row => Object.values(row).some(v => v));

  return { headers, rows, sheetName, totalSheets: workbook.SheetNames.length, allSheets: workbook.SheetNames };
}

// ============ STEP 1: FILE UPLOAD ============
function FileUploadStep({ onFileParsed, anerr }) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleFile(file) {
    if (!file) return;
    setError('');
    setLoading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!['xlsx', 'xls', 'csv', 'tsv', 'txt'].includes(ext)) {
        setError('Formato no soportado. Usa Excel (.xlsx) o CSV.');
        setLoading(false);
        return;
      }
      const result = await parseFile(file);
      if (result.rows.length === 0) {
        setError('El archivo no contiene datos. Asegúrate de que la primera fila tiene las cabeceras.');
        setLoading(false);
        return;
      }
      onFileParsed({ fileName: file.name, ...result });
    } catch (err) {
      console.error('Error leyendo archivo:', err);
      setError('Error al leer el archivo. Asegúrate de que es un Excel válido.');
    } finally {
      setLoading(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }

  const downloadTemplate = () => {
    // Cabeceras de origen del lead: una por opción, para marcar con "Sí"
    const leadSourceHeaders = {};
    LEAD_SOURCE_OPTIONS.forEach(opt => { leadSourceHeaders[`Origen: ${opt.label}`] = ''; });

    const stageOptionsLabel = CREATABLE_PIPELINE_STAGES.map(s => s.label).join(' / ');
    const potencialOptionsLabel = POTENCIAL_OPTIONS.join(' / ');

    const data = [
      {
        Nombre: 'Distribuciones García', Contacto: 'Antonio García', Teléfono: '+34 612 345 678',
        Email: 'antonio@garcia.es', CIF: 'B12345678', Web: 'www.garcia.es', 'Valoración Google': '4.5',
        'Fase del Pipeline': 'Lead', 'Comunidad Autónoma': 'Madrid', 'Potencial CAES': 'Alto', 'Potencial Energía': 'Medio',
        ...leadSourceHeaders, 'Origen: Webinar': 'Sí', 'Origen: Congreso': 'Sí',
        Calle: 'C/ Gran Vía 42', Localidad: 'Madrid', Provincia: 'Madrid', Notas: 'Cliente desde 2020',
      },
      {
        Nombre: 'Electro Norte S.L.', Contacto: 'Laura Martín', Teléfono: '+34 623 456 789',
        Email: 'laura@electronorte.com', CIF: 'A87654321', Web: 'www.electronorte.com', 'Valoración Google': '3.8',
        'Fase del Pipeline': 'Primer contacto', 'Comunidad Autónoma': 'Madrid', 'Potencial CAES': '', 'Potencial Energía': 'Alto',
        ...leadSourceHeaders, 'Origen: LinkedIn/Sales Navigator': 'Sí',
        Calle: 'Av. de América 15', Localidad: 'Madrid', Provincia: 'Madrid', Notas: 'Contactar en junio',
      },
      {
        Nombre: 'Canal Sur Energía', Contacto: 'Pedro López', Teléfono: '+34 634 567 890',
        Email: 'pedro@canalsur.es', CIF: 'B11223344', Web: '', 'Valoración Google': '',
        'Fase del Pipeline': 'Lead', 'Comunidad Autónoma': 'Andalucía', 'Potencial CAES': 'Bajo', 'Potencial Energía': '',
        ...leadSourceHeaders, 'Origen: Recomendación partner': 'Sí',
        Calle: 'C/ Alcalá 200', Localidad: 'Sevilla', Provincia: 'Sevilla', Notas: '',
      },
    ];

    const ws = anerr
      ? XLSX.utils.aoa_to_sheet([[...Object.keys(data[0]).filter(key => key !== 'Fase del Pipeline' && !key.startsWith('Origen:')), ...ANERR_FIELDS.map(field => field.label)]])
      : XLSX.utils.json_to_sheet(data);
    // Ancho de columna razonable para todas; las de Origen son más estrechas
    const baseCols = 13; // columnas "normales" antes de los orígenes
    const cols = Object.keys(data[0]).map((_, i) => (i < baseCols ? { wch: 20 } : { wch: 14 }));
    ws['!cols'] = cols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Canales');

    // Hoja de ayuda con los valores válidos
    const helpData = [
      { Campo: 'Fase del Pipeline', 'Valores válidos': stageOptionsLabel, Notas: 'Si se deja vacío o no coincide, se asigna "Lead"' },
      { Campo: 'Potencial CAES / Potencial Energía', 'Valores válidos': potencialOptionsLabel, Notas: 'Opcional, dejar vacío si no aplica' },
      { Campo: 'Comunidad Autónoma', 'Valores válidos': COMUNIDADES_AUTONOMAS.join(' / '), Notas: 'Opcional' },
      { Campo: 'Origen: [cualquiera]', 'Valores válidos': 'Sí / No (o dejar vacío = No)', Notas: 'Puedes marcar varios orígenes a la vez con "Sí"' },
      { Campo: 'Valoración Google', 'Valores válidos': '0.5 a 5 (o dejar vacío)', Notas: '' },
    ];
    const wsHelp = XLSX.utils.json_to_sheet(helpData);
    wsHelp['!cols'] = [{ wch: 30 }, { wch: 60 }, { wch: 45 }];
    XLSX.utils.book_append_sheet(wb, wsHelp, 'Ayuda - valores válidos');

    XLSX.writeFile(wb, anerr ? 'plantilla_canales_anerr.xlsx' : 'plantilla_canales_kamapp.xlsx');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-extrabold text-text-primary">Importar canales</h2>
          <p className="text-xs text-text-secondary mt-0.5">Sube un Excel con tu cartera de canales</p>
        </div>
        <button onClick={downloadTemplate}
          className="flex items-center gap-1.5 px-3 py-2 bg-surface-2 hover:bg-surface-3 text-text-secondary text-xs font-semibold rounded-lg transition-colors">
          <Download size={13} />
          Plantilla Excel
        </button>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-10 text-center transition-colors ${
          dragging ? 'border-brand-500 bg-brand-50' : 'border-surface-3 bg-white hover:border-surface-4'
        } ${loading ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}
      >
        {loading ? (
          <>
            <Loader2 size={36} className="mx-auto mb-3 text-brand-500 animate-spin" />
            <p className="text-sm font-semibold text-text-primary">Leyendo archivo...</p>
          </>
        ) : (
          <>
            <FileSpreadsheet size={36} className="mx-auto mb-3 text-green-600" />
            <p className="text-sm font-semibold text-text-primary mb-1">Arrastra tu archivo Excel aquí</p>
            <p className="text-xs text-text-muted mb-4">Formatos: .xlsx, .xls, .csv</p>
            <label className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold rounded-xl cursor-pointer transition-colors">
              <Upload size={14} />
              Seleccionar archivo
              <input type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" onChange={(e) => handleFile(e.target.files?.[0])} className="hidden" />
            </label>
          </>
        )}
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />{error}
        </div>
      )}

      <div className="mt-5 bg-surface-1 border border-surface-3 rounded-xl p-4">
        <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">Cómo preparar tu Excel</h3>
        <div className="text-xs text-text-muted space-y-1.5">
          {anerr && <p>En Etiqueta ANERR puedes indicar ANERR para un lead nuevo u ORIGEN ANERR para una ficha existente. Si dejas la etiqueta en blanco, se deduce al cotejar. Indica la fecha de presentación cuando la cuenta existente vaya a gestionarse en el acuerdo.</p>}
          <p>1. Descarga la <strong>plantilla Excel</strong> con el botón de arriba (incluye una hoja de ayuda con los valores válidos)</p>
          <p>2. Rellena los datos de tus canales (uno por fila)</p>
          <p>3. La columna <strong>Nombre</strong> es obligatoria, el resto son opcionales</p>
          <p>4. <strong>Fase del Pipeline</strong>: si la dejas vacía, el canal entra como "Lead"</p>
          <p>5. <strong>Origen del lead</strong>: marca "Sí" en una o varias columnas de origen — puedes dejar varias marcadas a la vez</p>
          <p>6. <strong>Potencial CAES / Energía</strong> y <strong>Comunidad Autónoma</strong> son opcionales</p>
          <p>7. Sube el archivo y revisa la previsualización antes de importar</p>
          <p>8. La clasificación detallada del canal (Energia/Solar/CAEs/Otros &gt; subtipo) se asigna después desde la ficha</p>
        </div>
      </div>
    </div>
  );
}

// ============ STEP 2: COLUMN MAPPING ============
function MappingStep({ fileData, onMapped, onBack, anerr }) {
  const { headers, rows, sheetName, totalSheets } = fileData;

  const [mapping, setMapping] = useState(() => {
    const autoMap = {};
    const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

    headers.forEach(h => {
      const n = normalize(h);
      if (anerr) {
        const field = ANERR_FIELDS.find(field => n === normalize(field.label));
        if (field) { autoMap[h] = field.key; return; }
        if (n === 'razonsocial') { autoMap[h] = 'name'; return; }
        if (n === 'fechadepresentacion') { autoMap[h] = 'anerr_presented_on'; return; }
      }

      // Detectar columnas de origen del lead ("Origen: X") por coincidencia exacta de label
      const leadMatch = LEAD_SOURCE_FIELDS.find(f => n === normalize(`Origen: ${LEAD_SOURCE_OPTIONS.find(o => o.value === f.leadSourceValue)?.label || ''}`));
      if (leadMatch) { autoMap[h] = leadMatch.key; return; }

      if (n.includes('nombre') || n === 'name' || n === 'canal' || n === 'empresa') autoMap[h] = 'name';
      else if (n.includes('contacto') || n.includes('contact') || n.includes('persona')) autoMap[h] = 'contact_name';
      else if (n.includes('telefono') || n.includes('phone') || n.includes('tel') || n.includes('movil')) autoMap[h] = 'phone';
      else if (n.includes('email') || n.includes('correo') || n.includes('mail')) autoMap[h] = 'email';
      else if (n === 'cif' || n === 'nif' || n === 'nie' || n.includes('fiscal')) autoMap[h] = 'cif';
      else if (n.includes('web') || n.includes('pagina') || n.includes('url') || n.includes('sitio')) autoMap[h] = 'website';
      else if (n.includes('google') || n.includes('valoracion') || n.includes('rating') || n.includes('puntuacion')) autoMap[h] = 'google_rating';
      else if (n.includes('fasepipeline') || n.includes('fase') || n.includes('stage')) autoMap[h] = 'pipeline_stage';
      else if (n.includes('comunidadautonoma') || n.includes('ccaa')) autoMap[h] = 'comunidad_autonoma';
      else if (n.includes('potencialcaes')) autoMap[h] = 'potencial_caes';
      else if (n.includes('potencialenergia')) autoMap[h] = 'potencial_energia';
      else if (n.includes('volumen') || n.includes('volume') || n.includes('cantidad')) autoMap[h] = 'volume_amount';
      else if (n.includes('tipovolumen') || n.includes('unidad') || n.includes('medida')) autoMap[h] = 'volume_unit';
      else if (n.includes('direccion') || n.includes('address') || n.includes('calle') || n.includes('domicilio')) autoMap[h] = 'address';
      else if (n.includes('localidad') || n.includes('ciudad') || n.includes('city') || n.includes('poblacion') || n.includes('municipio')) autoMap[h] = 'city';
      else if (n.includes('provincia') || n.includes('province') || n.includes('region')) autoMap[h] = 'province';
      else if (n.includes('nota') || n.includes('note') || n.includes('observ') || n.includes('comentario') || n.includes('descripcion')) autoMap[h] = 'notes';
    });
    return autoMap;
  });

  const nameIsMapped = Object.values(mapping).includes('name');

  function setMap(header, field) {
    setMapping(prev => {
      const next = { ...prev };
      Object.entries(next).forEach(([k, v]) => {
        if (v === field && k !== header) delete next[k];
      });
      if (field) next[header] = field;
      else delete next[header];
      return next;
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-extrabold text-text-primary">Mapear columnas</h2>
          <p className="text-xs text-text-secondary mt-0.5">
            {rows.length} filas en hoja "{sheetName}"
            {totalSheets > 1 && ` · ${totalSheets} hojas (usando la primera)`}
          </p>
        </div>
        <button onClick={onBack} className="text-xs text-brand-500 font-semibold hover:text-brand-600">← Volver</button>
      </div>

      <div className="bg-white border border-surface-3 rounded-xl overflow-hidden mb-4">
        <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-2 p-3 bg-surface-1 border-b border-surface-3">
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Columna Excel</span>
          <span />
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Campo CRM</span>
        </div>

        {headers.map(header => {
          const mapped = mapping[header] || '';
          const sampleValues = rows.slice(0, 3).map(r => r[header]).filter(Boolean).join(', ');
          return (
            <div key={header} className="grid grid-cols-[1fr,auto,1fr] items-center gap-2 p-3 border-b border-surface-3 last:border-0">
              <div>
                <div className="text-sm font-semibold text-text-primary">{header}</div>
                <div className="text-[10px] text-text-muted truncate mt-0.5" title={sampleValues}>
                  Ej: {sampleValues || '(vacío)'}
                </div>
              </div>
              <ArrowRight size={14} className="text-text-muted" />
              <select value={mapped} onChange={(e) => setMap(header, e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-500 ${
                  mapped ? 'bg-brand-50 border-brand-200 text-brand-700 font-semibold' : 'bg-white border-surface-3 text-text-muted'
                }`}>
                <option value="">— No importar —</option>
                <optgroup label="Datos del canal">
                  {[...CHANNEL_FIELDS, ...(anerr ? ANERR_FIELDS : [])].map(f => {
                    const usedBy = Object.entries(mapping).find(([k, v]) => v === f.key && k !== header);
                    return (
                      <option key={f.key} value={f.key} disabled={!!usedBy}>
                        {f.label}{f.required ? ' *' : ''}{usedBy ? ` (→ ${usedBy[0]})` : ''}
                      </option>
                    );
                  })}
                </optgroup>
                <optgroup label="Origen del lead (Sí/No)">
                  {LEAD_SOURCE_FIELDS.map(f => {
                    const usedBy = Object.entries(mapping).find(([k, v]) => v === f.key && k !== header);
                    return (
                      <option key={f.key} value={f.key} disabled={!!usedBy}>
                        {f.label}{usedBy ? ` (→ ${usedBy[0]})` : ''}
                      </option>
                    );
                  })}
                </optgroup>
              </select>
            </div>
          );
        })}
      </div>

      {!nameIsMapped && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700 mb-4">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          Debes mapear al menos la columna "Nombre del canal" (obligatoria)
        </div>
      )}

      <button onClick={() => onMapped(mapping)} disabled={!nameIsMapped}
        className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
        <Eye size={16} />
        Previsualizar importación ({rows.length} canales)
      </button>
    </div>
  );
}

// ============ STEP 3: PREVIEW & IMPORT ============
function PreviewStep({ rows, mapping, onImport, onBack, importing, result }) {
  const mappedRows = rows.map(row => {
    const mapped = { lead_source: [] };

    Object.entries(mapping).forEach(([excelCol, field]) => {
      const rawValue = row[excelCol]?.trim() || '';

      // Columnas de origen del lead: si está marcada como afirmativa, añadir ese origen al array
      if (field.startsWith('lead_source__')) {
        const leadSourceValue = field.replace('lead_source__', '');
        if (isAffirmative(rawValue)) mapped.lead_source.push(leadSourceValue);
        return;
      }

      let value = rawValue;
      if (field === 'pipeline_stage') value = parsePipelineStage(value);
      if (field === 'potencial_caes' || field === 'potencial_energia') value = parsePotencial(value);
      if (field === 'comunidad_autonoma') value = parseComunidadAutonoma(value);
      if (field === 'google_rating') {
        value = (value && !isNaN(parseFloat(value))) ? parseFloat(value) : null;
      }
      mapped[field] = value;
    });

    // Si no se mapeó ninguna columna de Fase del Pipeline, por defecto "lead"
    if (!mapped.pipeline_stage) mapped.pipeline_stage = 'lead';
    mapped.status = stageToStatus(mapped.pipeline_stage);

    return mapped;
  });

  const validRows = mappedRows.filter(r => r.name);
  const invalidRows = mappedRows.filter(r => !r.name);

  if (result) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check size={32} className="text-green-600" />
        </div>
        <h2 className="text-xl font-extrabold text-text-primary mb-1">Importación completada</h2>
        <p className="text-sm text-text-secondary mb-2">
          {result.success} canales importados correctamente
          {result.errors > 0 && ` · ${result.errors} con errores`}
        </p>
        <p className="text-xs text-text-muted mb-6">
          Recuerda asignar la clasificación detallada (Energia/Solar/CAEs &gt; subtipo) desde la ficha de cada canal
        </p>
        {result.outcomes.length > 0 && (
          <ul className="mb-4 max-h-72 overflow-auto text-sm text-left">
            {result.outcomes.map(({ name, outcome }, index) => (
              <li key={index} className="py-1">{name} · {{
                created: 'Nuevo canal ANERR', linked: 'Cuenta existente vinculada como ORIGEN ANERR',
                updated: 'Vínculo actualizado', excluded: 'Excluido por estar en alta o activo',
                awaiting: 'Cuenta existente pendiente de presentación',
                ambiguous: 'Varias coincidencias, revisar CIF y nombre',
                invalid: 'Revisar nombre, etiqueta o fecha de presentación',
                mismatch: 'La etiqueta indicada no corresponde a la coincidencia en CRM',
                error: 'Error al guardar',
              }[outcome] || 'Revisar resultado'}</li>
            ))}
          </ul>
        )}
        <button onClick={() => window.location.href = result.outcomes.length ? '/pipeline?anerr=1' : '/channels'}
          className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl transition-colors">
          {result.outcomes.length ? 'Ver seguimiento ANERR' : 'Ver mis canales'}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-extrabold text-text-primary">Previsualización</h2>
          <p className="text-xs text-text-secondary mt-0.5">
            {validRows.length} canales listos
            {invalidRows.length > 0 && ` · ${invalidRows.length} sin nombre (se ignorarán)`}
          </p>
        </div>
        <button onClick={onBack} className="text-xs text-brand-500 font-semibold hover:text-brand-600">← Mapeo</button>
      </div>

      <div className="bg-white border border-surface-3 rounded-xl overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-3 bg-surface-1">
              <th className="text-left p-2.5 text-[10px] font-bold text-text-muted uppercase tracking-wider">#</th>
              <th className="text-left p-2.5 text-[10px] font-bold text-text-muted uppercase tracking-wider">Nombre</th>
              <th className="text-left p-2.5 text-[10px] font-bold text-text-muted uppercase tracking-wider">Contacto</th>
              <th className="text-left p-2.5 text-[10px] font-bold text-text-muted uppercase tracking-wider">Teléfono</th>
              <th className="text-left p-2.5 text-[10px] font-bold text-text-muted uppercase tracking-wider">Localidad</th>
              <th className="text-left p-2.5 text-[10px] font-bold text-text-muted uppercase tracking-wider">Fase</th>
              <th className="text-left p-2.5 text-[10px] font-bold text-text-muted uppercase tracking-wider">Origen del lead</th>
            </tr>
          </thead>
          <tbody>
            {validRows.slice(0, 25).map((row, i) => {
              const stageInfo = CREATABLE_PIPELINE_STAGES.find(s => s.key === row.pipeline_stage);
              return (
                <tr key={i} className="border-b border-surface-3 last:border-0 hover:bg-surface-1">
                  <td className="p-2.5 text-text-muted text-xs">{i + 1}</td>
                  <td className="p-2.5 font-semibold text-text-primary">{row.name}</td>
                  <td className="p-2.5 text-text-secondary text-xs">{row.contact_name || '-'}</td>
                  <td className="p-2.5 text-text-secondary text-xs">{row.phone || '-'}</td>
                  <td className="p-2.5 text-text-secondary text-xs">{row.city || '-'}</td>
                  <td className="p-2.5">
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-surface-2 text-text-secondary">
                      {stageInfo?.label || 'Lead'}
                    </span>
                  </td>
                  <td className="p-2.5 text-text-secondary text-xs">
                    {row.lead_source.length > 0
                      ? row.lead_source.map(v => LEAD_SOURCE_OPTIONS.find(o => o.value === v)?.label || v).join(', ')
                      : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {validRows.length > 25 && (
          <div className="p-2.5 text-center text-xs text-text-muted bg-surface-1 border-t border-surface-3">
            ... y {validRows.length - 25} canales más
          </div>
        )}
      </div>

      {invalidRows.length > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-700 mb-4">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          {invalidRows.length} fila(s) sin nombre serán ignoradas
        </div>
      )}

      <button onClick={() => onImport(validRows)} disabled={importing || validRows.length === 0}
        className="w-full py-3.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
        {importing ? (
          <><Loader2 size={16} className="animate-spin" /> Importando {validRows.length} canales...</>
        ) : (
          <><Check size={16} /> Importar {validRows.length} canales</>
        )}
      </button>
    </div>
  );
}

// ============ MAIN PAGE ============
export default function ImportPage() {
  const { user } = useAuthContext();
  const canUseAnerr = useAnerrAccess(user?.id);
  const [anerr, setAnerr] = useState(false);
  const [step, setStep] = useState('upload');
  const [fileData, setFileData] = useState(null);
  const [mapping, setMapping] = useState({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  function handleFileParsed(data) { setFileData(data); setStep('mapping'); }
  function handleMapped(map) { setMapping(map); setStep('preview'); }

  async function handleImport(rows) {
    setImporting(true);
    let success = 0;
    let errors = 0;
    const outcomes = [];

    const chunkSize = 50;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const source = rows.slice(i, i + chunkSize);
      const chunk = source.map(row => ({
        name: row.name,
        contact_name: row.contact_name || null,
        phone: row.phone || null,
        email: row.email || null,
        cif: row.cif || null,
        website: row.website || null,
        google_rating: row.google_rating != null && row.google_rating !== '' ? row.google_rating : null,
        lead_source: row.lead_source?.length > 0 ? row.lead_source : null,
        potencial_caes: row.potencial_caes || null,
        potencial_energia: row.potencial_energia || null,
        comunidad_autonoma: row.comunidad_autonoma || null,
        volume_amount: row.volume_amount && !isNaN(parseFloat(row.volume_amount)) ? parseFloat(row.volume_amount) : null,
        volume_unit: row.volume_unit ? row.volume_unit.toLowerCase().replace(/\s/g, '') : null,
        address: row.address || null,
        city: row.city || null,
        province: row.province || null,
        status: row.status,
        pipeline_stage: row.pipeline_stage,
        notes: row.notes || null,
        assigned_to: user.id,
      }));

      if (anerr) {
        for (const [index, record] of chunk.entries()) {
          const row = source[index];
          const date = isoAnerrDate(row.anerr_presented_on, XLSX.SSF.parse_date_code);
          let outcome = 'invalid';
          if (!row.anerr_presented_on || date) {
            const { data, error } = await supabase.rpc('anerr_import', { payload: {
              ...record, anerr_link: row.anerr_link, anerr_presented_on: date, anerr_delegate: row.anerr_delegate,
              anerr_territory: row.anerr_territory, anerr_alias: row.anerr_alias,
            } });
            outcome = error ? 'error' : data;
          }
          if (['created', 'linked', 'updated'].includes(outcome)) success++;
          else if (['error', 'invalid', 'ambiguous', 'mismatch'].includes(outcome)) errors++;
          outcomes.push({ name: record.name, outcome });
        }
        continue;
      }

      try {
        const { data, error } = await supabase.from('channels').insert(chunk).select();
        if (error) throw error;
        success += data.length;
      } catch (err) {
        console.error('Error en chunk:', err);
        errors += chunk.length;
      }
    }

    setResult({ success, errors, outcomes });
    setImporting(false);
  }

  return (
    <div>
      {!result && (
        <div className="flex items-center gap-2 mb-5">
          {['upload', 'mapping', 'preview'].map((s, i) => {
            const labels = ['Subir Excel', 'Mapear columnas', 'Importar'];
            const isActive = s === step;
            const isDone = ['upload', 'mapping', 'preview'].indexOf(step) > i;
            return (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                  isDone ? 'bg-green-500 text-white' : isActive ? 'bg-brand-500 text-white' : 'bg-surface-2 text-text-muted'
                }`}>{isDone ? <Check size={12} /> : i + 1}</div>
                <span className={`text-[11px] font-semibold hidden sm:block ${isActive ? 'text-text-primary' : 'text-text-muted'}`}>{labels[i]}</span>
                {i < 2 && <div className={`flex-1 h-0.5 rounded ${isDone ? 'bg-green-500' : 'bg-surface-3'}`} />}
              </div>
            );
          })}
        </div>
      )}

      {step === 'upload' && canUseAnerr && (
        <label className="flex items-center gap-2 mb-4 text-sm font-semibold">
          <input type="checkbox" checked={anerr} onChange={event => setAnerr(event.target.checked)} /> Carga ANERR
        </label>
      )}
      {step === 'upload' && <FileUploadStep onFileParsed={handleFileParsed} anerr={anerr} />}
      {step === 'mapping' && fileData && (
        <MappingStep anerr={anerr} fileData={fileData} onMapped={handleMapped} onBack={() => setStep('upload')} />
      )}
      {step === 'preview' && fileData && (
        <PreviewStep rows={fileData.rows} mapping={mapping} onImport={handleImport}
          onBack={() => setStep('mapping')} importing={importing} result={result} />
      )}
    </div>
  );
}
