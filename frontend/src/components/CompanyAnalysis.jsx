import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from './AuthProvider';
import {
  Shield, Loader2, RefreshCw, ChevronDown, ChevronUp,
  ExternalLink, Upload, FileText, Trash2, Download, Edit3, Check, X
} from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

const STATUS_LABELS = {
  pendiente_contacto: 'Pendiente contacto',
  en_desarrollo:      'En desarrollo',
  en_evaluacion:      'En evaluación',
  en_proceso_alta:    'En proceso de alta',
  activo:             'Activo',
  rechazado:          'Rechazado',
  cierre_sin_acuerdo: 'Cierre sin acuerdo',
};

const STAGE_LABELS = {
  lead:           'Lead',
  first_contact:  'Primer contacto',
  proposal:       'Propuesta',
  negotiation:    'Negociación',
  onboarding:     'En proceso alta',
  active:         'Activo',
  closed_no_deal: 'Sin acuerdo',
};

function CifInlineEditor({ channel, onChannelUpdate }) {
  const [editing, setEditing] = useState(false);
  const [cif, setCif] = useState(channel?.cif || '');
  const [saving, setSaving] = useState(false);

  async function saveCif() {
    if (!channel?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('channels').update({ cif: cif.trim() || null }).eq('id', channel.id);
      if (error) throw error;
      if (onChannelUpdate) onChannelUpdate({ ...channel, cif: cif.trim() || null });
      setEditing(false);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 p-2 bg-surface-1 rounded-lg">
        <label className="text-[10px] font-bold text-text-muted flex-shrink-0">CIF</label>
        <input type="text" value={cif} onChange={(e) => setCif(e.target.value.toUpperCase())}
          placeholder="Ej: B12345678" maxLength={9}
          className="flex-1 px-2 py-1.5 bg-white border border-surface-3 rounded-lg text-xs focus:outline-none focus:border-brand-500"
          autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveCif(); if (e.key === 'Escape') setEditing(false); }} />
        <button onClick={saveCif} disabled={saving} className="p-1.5 bg-green-100 hover:bg-green-200 text-green-600 rounded-lg transition-colors">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
        </button>
        <button onClick={() => { setEditing(false); setCif(channel?.cif || ''); }} className="p-1.5 text-text-muted hover:text-text-primary">
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <button onClick={() => setEditing(true)}
      className="flex items-center gap-2 p-2 bg-surface-1 hover:bg-surface-2 rounded-lg transition-colors w-full text-left">
      <Edit3 size={12} className="text-text-muted flex-shrink-0" />
      <span className="text-[11px] text-text-muted">
        {channel?.cif ? `CIF: ${channel.cif} · Pulsa para editar` : 'Añadir CIF del canal'}
      </span>
    </button>
  );
}

export default function CompanyAnalysis({ channel, onChannelUpdate }) {
  const { user } = useAuthContext();
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  async function generateAnalysis() {
    if (!channel) return;
    setLoading(true);
    setError('');
    setAnalysis(null);

    try {
      const context = `
DATOS DE LA EMPRESA:
- Nombre: ${channel.name}
- CIF: ${channel.cif || 'No disponible'}
- Página web: ${channel.website || 'No disponible'}
- Valoración Google: ${channel.google_rating != null ? channel.google_rating + '/5' : 'No disponible'}
- Ciudad: ${channel.city || 'No disponible'}
- Comunidad Autónoma: ${channel.comunidad_autonoma || 'No disponible'}
- Dirección: ${channel.address || 'No disponible'}
- Contacto: ${channel.contact_name || 'No disponible'}
- Estado en CRM: ${STATUS_LABELS[channel.status] || channel.status || 'No especificado'}
- Fase pipeline: ${STAGE_LABELS[channel.pipeline_stage] || channel.pipeline_stage || 'No especificada'}
- Tiene informe económico adjunto: ${channel.informe_economico_url ? 'Sí' : 'No'}

DATOS CAES:
- Tipo de canal CAES: ${channel.tipo_canal_caes || 'No especificado'}
- Sectores CAE objetivo: ${Array.isArray(channel.sector_cae) && channel.sector_cae.length > 0 ? channel.sector_cae.join(', ') : 'No especificados'}
- Potencial CAES: ${channel.potencial_caes || 'No evaluado'}
- Potencial Venta Energía: ${channel.potencial_energia || 'No evaluado'}
`;

      const response = await fetch(`${BACKEND_URL}/api/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: `Eres un analista de riesgo comercial experto. Tu trabajo es evaluar la calidad y fiabilidad de empresas/canales para Naturgy en el contexto del programa CAES (Certificados de Ahorro Energético).

Analiza los datos proporcionados y genera un informe de calidad en JSON puro (sin markdown, sin backticks):
{
  "scoring": 0-100,
  "nivel_riesgo": "bajo|medio|alto",
  "resumen": "2-3 frases sobre la calidad general de la empresa",
  "puntos_positivos": ["punto 1", "punto 2"],
  "puntos_negativos": ["punto 1", "punto 2"],
  "recomendaciones": ["recomendación 1", "recomendación 2"],
  "datos_faltantes": ["dato que falta para mejor análisis"]
}

Criterios de scoring:
- CIF disponible: +15 pts
- Web disponible: +10 pts
- Valoración Google >= 4: +15 pts, >= 3: +10 pts, < 3: +5 pts
- Dirección completa: +10 pts
- Contacto identificado: +10 pts
- Informe económico adjunto: +20 pts
- Estado activo o en desarrollo: +10 pts
- Pipeline avanzado (propuesta o superior): +10 pts
- Tipo de canal CAES especificado: +5 pts
- Potencial CAES Alto o Muy Alto: +5 pts

Ten en cuenta el tipo de canal CAES y los sectores objetivo para personalizar el análisis de riesgo y las recomendaciones.
Sé concreto y práctico. Si faltan datos, indícalo claramente y ajusta el scoring a la baja.`,
          messages: [
            { role: 'user', content: `Analiza la calidad y riesgo de esta empresa:\n${context}` }
          ],
        }),
      });

      if (!response.ok) throw new Error('Error conectando con el asistente IA');

      const data = await response.json();
      const rawText = data.content?.map(c => c.text || '').join('') || '';

      let parsed;
      try {
        const cleaned = rawText.replace(/```json\s*/g, '').replace(/```/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = {
          scoring: 50,
          nivel_riesgo: 'medio',
          resumen: rawText.slice(0, 200),
          puntos_positivos: [],
          puntos_negativos: ['No se pudo generar análisis estructurado'],
          recomendaciones: ['Completar los datos del canal'],
          datos_faltantes: [],
        };
      }

      setAnalysis(parsed);
    } catch (err) {
      console.error('Error:', err);
      setError(err.message || 'Error al generar el análisis');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !channel?.id) return;

    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      setError('Formato no soportado. Sube PDF, Excel o imagen.');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const ext = file.name.split('.').pop();
      const path = `informes/${channel.id}/informe_economico_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('channel-documents')
        .upload(path, file);
      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from('channels')
        .update({
          informe_economico_url: path,
          informe_economico_name: file.name,
        })
        .eq('id', channel.id);
      if (updateError) throw updateError;

      if (onChannelUpdate) {
        onChannelUpdate({
          ...channel,
          informe_economico_url: path,
          informe_economico_name: file.name,
        });
      }
    } catch (err) {
      console.error('Error subiendo informe:', err);
      setError(err.message || 'Error al subir el archivo');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDeleteInforme() {
    if (!channel?.informe_economico_url) return;
    try {
      await supabase.storage.from('channel-documents').remove([channel.informe_economico_url]);
      await supabase.from('channels').update({
        informe_economico_url: null,
        informe_economico_name: null,
      }).eq('id', channel.id);

      if (onChannelUpdate) {
        onChannelUpdate({ ...channel, informe_economico_url: null, informe_economico_name: null });
      }
    } catch (err) {
      console.error('Error eliminando informe:', err);
    }
  }

  async function downloadInforme() {
    if (!channel?.informe_economico_url) return;
    try {
      const { data, error } = await supabase.storage
        .from('channel-documents')
        .download(channel.informe_economico_url);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = channel.informe_economico_name || 'informe_economico';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error descargando:', err);
    }
  }

  const scoringColor = (score) => {
    if (score >= 70) return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-600', bar: 'bg-green-500' };
    if (score >= 40) return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-600', bar: 'bg-amber-500' };
    return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-600', bar: 'bg-red-500' };
  };

  const riesgoLabel = { bajo: '🟢 Bajo', medio: '🟡 Medio', alto: '🔴 Alto' };

  return (
    <div className="bg-white border border-surface-3 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3.5 border-b border-surface-3">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-navy-500" />
          <span className="text-sm font-bold text-text-primary">Análisis de empresa</span>
        </div>
      </div>

      <div className="space-y-3.5 p-3.5">

        {/* Informe Económico */}
        <div>
          <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Informe Económico (Informa)</div>
          {channel?.informe_economico_url ? (
            <div className="flex items-center gap-2 p-2.5 bg-surface-1 rounded-lg">
              <FileText size={16} className="text-brand-500 flex-shrink-0" />
              <span className="text-xs text-text-primary font-semibold flex-1 truncate">
                {channel.informe_economico_name || 'Informe económico'}
              </span>
              <button onClick={downloadInforme} className="p-1 text-brand-500 hover:text-brand-600" title="Descargar">
                <Download size={14} />
              </button>
              <button onClick={handleDeleteInforme} className="p-1 text-text-muted hover:text-red-400" title="Eliminar">
                <Trash2 size={14} />
              </button>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-2 p-3 border border-dashed border-surface-3 rounded-lg cursor-pointer hover:border-brand-500 hover:bg-brand-50/30 transition-colors">
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png"
                onChange={handleUpload}
                className="hidden"
              />
              {uploading ? (
                <><Loader2 size={14} className="animate-spin text-brand-500" /><span className="text-xs text-brand-500">Subiendo...</span></>
              ) : (
                <><Upload size={14} className="text-text-muted" /><span className="text-xs text-text-muted">Adjuntar informe (PDF, Excel o imagen)</span></>
              )}
            </label>
          )}
        </div>

        {/* Enlace a DatosCIF */}
        {channel?.cif ? (
          <div className="space-y-2">
            <a href={`https://www.datoscif.es/empresa/${channel.cif}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 p-2.5 bg-navy-50 border border-navy-100 rounded-lg hover:bg-navy-100 transition-colors">
              <ExternalLink size={14} className="text-navy-500 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-xs font-semibold text-navy-700">Consultar en DatosCIF.es</div>
                <div className="text-[10px] text-navy-500">Ver información financiera pública · CIF: {channel.cif}</div>
              </div>
            </a>
            <CifInlineEditor channel={channel} onChannelUpdate={onChannelUpdate} />
          </div>
        ) : (
          <CifInlineEditor channel={channel} onChannelUpdate={onChannelUpdate} />
        )}

        {/* Botón análisis IA */}
        {!analysis && !loading && (
          <button
            onClick={generateAnalysis}
            className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-navy-500 to-navy-700 hover:from-navy-400 hover:to-navy-600 text-white font-bold rounded-xl transition-all shadow-sm"
          >
            <Shield size={16} />
            Analizar calidad con IA
          </button>
        )}

        {loading && (
          <div className="text-center py-4">
            <Loader2 size={20} className="animate-spin text-navy-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-navy-600">Analizando empresa...</p>
            <p className="text-xs text-text-muted mt-0.5">Revisando datos del canal y scoring</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-xs text-red-600">{error}</p>
            <button onClick={generateAnalysis} className="text-xs text-brand-500 font-semibold mt-1 flex items-center gap-1">
              <RefreshCw size={10} /> Reintentar
            </button>
          </div>
        )}

        {/* Resultado */}
        {analysis && (
          <div className="space-y-3">
            {/* Scoring */}
            <div className={`p-3 rounded-lg ${scoringColor(analysis.scoring).bg} ${scoringColor(analysis.scoring).border} border`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-text-muted">Scoring de calidad</div>
                  <div className={`text-2xl font-extrabold ${scoringColor(analysis.scoring).text}`}>{analysis.scoring}/100</div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-text-muted">Nivel de riesgo</div>
                  <div className="text-sm font-bold">{riesgoLabel[analysis.nivel_riesgo] || analysis.nivel_riesgo}</div>
                </div>
              </div>
              <div className="w-full h-2 bg-white/50 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${scoringColor(analysis.scoring).bar}`}
                  style={{ width: `${analysis.scoring}%` }} />
              </div>
            </div>

            {/* Resumen */}
            <div className="bg-surface-1 rounded-lg p-3">
              <p className="text-xs text-text-primary leading-relaxed">{analysis.resumen}</p>
            </div>

            {/* Positivos / Negativos */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <div className="text-[9px] font-bold text-green-600 uppercase tracking-wider">Puntos positivos</div>
                {analysis.puntos_positivos?.map((p, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-text-secondary">
                    <span className="text-green-500 mt-0.5">✓</span>{p}
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <div className="text-[9px] font-bold text-red-500 uppercase tracking-wider">Puntos negativos</div>
                {analysis.puntos_negativos?.map((p, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-text-secondary">
                    <span className="text-red-400 mt-0.5">✗</span>{p}
                  </div>
                ))}
              </div>
            </div>

            {/* Recomendaciones */}
            {analysis.recomendaciones?.length > 0 && (
              <div>
                <div className="text-[9px] font-bold text-text-muted uppercase tracking-wider mb-1">Recomendaciones</div>
                {analysis.recomendaciones.map((r, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-text-secondary mb-0.5">
                    <span className="text-brand-500 mt-0.5">→</span>{r}
                  </div>
                ))}
              </div>
            )}

            {/* Datos faltantes */}
            {analysis.datos_faltantes?.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                <div className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-1">⚠️ Datos faltantes para mejor análisis</div>
                {analysis.datos_faltantes.map((d, i) => (
                  <p key={i} className="text-xs text-amber-700">{d}</p>
                ))}
              </div>
            )}

            {/* Regenerar */}
            <button onClick={generateAnalysis}
              className="text-xs text-text-muted hover:text-brand-500 flex items-center gap-1 transition-colors">
              <RefreshCw size={10} /> Regenerar análisis
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
