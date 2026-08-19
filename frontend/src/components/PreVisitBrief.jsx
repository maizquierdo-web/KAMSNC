import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from './AuthProvider';
import { Sparkles, Loader2, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

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

export default function PreVisitBrief({ channelId, channelName }) {
  const { user } = useAuthContext();
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState('');

  async function generateBrief() {
    if (!channelId || !user?.id) return;
    setLoading(true);
    setError('');
    setBrief(null);

    try {
      const [channelRes, visitsRes, businessCaseRes, alertsRes, playbookRes] = await Promise.allSettled([
        supabase.from('channels').select('*').eq('id', channelId).single(),
        supabase.from('visits').select('*, channels(name)')
          .eq('channel_id', channelId).order('checkin_at', { ascending: false }).limit(10),
        supabase.from('business_cases').select('file_name, updated_at')
          .eq('channel_id', channelId).limit(1),
        supabase.from('alerts').select('*')
          .eq('channel_id', channelId).eq('is_dismissed', false),
        supabase.from('kam_playbook').select('section, content')
          .eq('is_active', true).order('sort_order'),
      ]);

      const channel  = channelRes.status === 'fulfilled' ? channelRes.value.data : null;
      const visits   = visitsRes.status === 'fulfilled' ? (visitsRes.value.data || []) : [];
      const businessCase = businessCaseRes.status === 'fulfilled' ? (businessCaseRes.value.data?.[0] || null) : null;
      const alerts   = alertsRes.status === 'fulfilled' ? (alertsRes.value.data || []) : [];
      const playbook = playbookRes.status === 'fulfilled' ? (playbookRes.value.data || []) : [];

      if (!channel) throw new Error('No se pudo cargar el canal');

      const lastVisit      = visits[0];
      const positiveCount  = visits.filter(v => v.result === 'positive').length;
      const negativeCount  = visits.filter(v => v.result === 'negative').length;
      const daysSinceVisit = lastVisit
        ? Math.floor((Date.now() - new Date(lastVisit.checkin_at).getTime()) / 86400000)
        : null;

      const context = `
DATOS DEL CANAL:
- Nombre: ${channel.name}
- Estado: ${STATUS_LABELS[channel.status] || channel.status || 'No especificado'}
- Fase pipeline: ${STAGE_LABELS[channel.pipeline_stage] || channel.pipeline_stage || 'No especificada'}
- Contacto: ${channel.contact_name || 'No registrado'}
- Teléfono: ${channel.phone || 'No registrado'}
- Ciudad: ${channel.city || 'No especificada'}
- Comunidad Autónoma: ${channel.comunidad_autonoma || 'No especificada'}
- Notas: ${channel.notes || 'Sin notas'}

DATOS CAES:
- Tipo de canal CAES: ${channel.tipo_canal_caes || 'No especificado'}
- Sectores CAE objetivo: ${Array.isArray(channel.sector_cae) && channel.sector_cae.length > 0 ? channel.sector_cae.join(', ') : 'No especificados'}
- Potencial CAES: ${channel.potencial_caes || 'No evaluado'}
- Potencial Venta Energía: ${channel.potencial_energia || 'No evaluado'}

HISTORIAL DE VISITAS (últimas ${visits.length}):
${visits.length === 0 ? '- Sin visitas registradas' : visits.slice(0, 5).map(v =>
  `- ${new Date(v.checkin_at).toLocaleDateString('es-ES')}: ${v.result || 'sin resultado'} | ${v.objective || ''} | Notas: ${v.notes || 'sin notas'} | Próximos pasos: ${v.next_steps || 'no definidos'}`
).join('\n')}
- Total visitas: ${visits.length} | Positivas: ${positiveCount} | Negativas: ${negativeCount}
- Días desde última visita: ${daysSinceVisit !== null ? daysSinceVisit : 'Nunca visitado'}

BUSINESS CASE:
${businessCase ? `- Documento: ${businessCase.file_name}
- Actualizado: ${new Date(businessCase.updated_at).toLocaleDateString('es-ES')}` : '- Business Case no adjuntado'}

ALERTAS ACTIVAS: ${alerts.length > 0 ? alerts.map(a => a.title).join(', ') : 'Ninguna'}
`;

      const response = await fetch(`${BACKEND_URL}/api/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: `Eres un asistente de ventas experto que prepara briefs pre-visita para KAMs (Key Account Managers) de Naturgy.

Tu trabajo es analizar los datos del canal y generar un brief conciso y accionable en español, SIGUIENDO LAS POLÍTICAS DEL PLAYBOOK DE NATURGY.

INSTRUCCIONES CLAVE DEL PLAYBOOK:
- Aplica las fases de captación (Autogestión, Prospección, Aproximación, Negociación, Reporting) según la fase en la que se encuentre el canal.
- Si es primera visita: seguir el protocolo de preparación (revisar info, preparar preguntas, orden del día: objetivo, presentación Naturgy, presentación partner, dudas, cierre).
- NO centrar la primera visita en condiciones económicas. Postponer a segundo encuentro con business case.
- Si el prospecto no tiene experiencia energética: explicar claves del negocio, foco en colaboración mutua.
- Siempre cerrar con acción concreta (agendar siguiente reunión).
- Recordar los 120 minutos de oro diarios para captación.
- DOs: escucha activa, propuesta de valor clara, involucrar al prospecto.
- DONTs: no presionar con objetivos de captación, no tecnicismos excesivos.
- Si hay datos CAES (tipo de canal, sectores CAE objetivo, potencial), úsalos para personalizar el enfoque comercial y los temas a tratar.
${playbook.length > 0 ? '\nDETALLE DEL PLAYBOOK:\n' + playbook.map(p => `[${p.section}]: ${p.content}`).join('\n') : ''}

Responde SIEMPRE con este formato exacto (sin markdown, sin backticks, JSON puro):
{
  "resumen": "2-3 frases resumen del estado del canal",
  "fase_captacion": "la fase del playbook en la que se encuentra este canal",
  "puntos_clave": ["punto 1", "punto 2", "punto 3"],
  "objetivo_sugerido": "objetivo concreto para la próxima visita según el playbook",
  "temas_a_tratar": ["tema 1", "tema 2", "tema 3"],
  "preguntas_clave": ["pregunta que el KAM debe hacer en la visita"],
  "dos": ["qué hacer en esta visita según el playbook"],
  "donts": ["qué NO hacer en esta visita según el playbook"],
  "riesgos": ["riesgo o alerta si hay alguno"],
  "tip": "un consejo práctico del playbook para esta visita"
}

Sé directo, práctico y orientado a la acción. Personaliza según los datos reales del canal y la fase del playbook que aplique.`,
          messages: [
            { role: 'user', content: `Prepara un brief pre-visita para el canal "${channelName}" con estos datos:\n${context}` }
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
          resumen: rawText.slice(0, 200),
          puntos_clave: ['No se pudo generar el brief estructurado'],
          objetivo_sugerido: 'Revisar estado del canal',
          temas_a_tratar: ['Seguimiento general'],
          riesgos: [],
          tip: 'Prepara preguntas abiertas para el cliente',
        };
      }

      setBrief(parsed);
    } catch (err) {
      console.error('Error generando brief:', err);
      setError(err.message || 'Error al generar el brief');
    } finally {
      setLoading(false);
    }
  }

  if (!brief && !loading && !error) {
    return (
      <button
        onClick={generateBrief}
        className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-brand-500 to-brand-700 hover:from-brand-400 hover:to-brand-600 text-white font-bold rounded-xl transition-all shadow-sm shadow-brand-500/20"
      >
        <Sparkles size={16} />
        Preparar brief pre-visita con IA
      </button>
    );
  }

  if (loading) {
    return (
      <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 text-center">
        <Loader2 size={20} className="animate-spin text-brand-500 mx-auto mb-2" />
        <p className="text-sm font-semibold text-brand-600">Analizando canal...</p>
        <p className="text-xs text-text-muted mt-1">Revisando historial, plan de cuenta y alertas</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <p className="text-sm text-red-600 mb-2">{error}</p>
        <button onClick={generateBrief}
          className="text-xs text-brand-500 font-semibold hover:text-brand-600 flex items-center gap-1">
          <RefreshCw size={12} /> Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-brand-200 rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3.5 bg-brand-50 hover:bg-brand-100/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-brand-500" />
          <span className="text-sm font-bold text-brand-700">Brief pre-visita</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={(e) => { e.stopPropagation(); generateBrief(); }}
            className="p-1 text-brand-400 hover:text-brand-600" title="Regenerar">
            <RefreshCw size={13} />
          </button>
          {expanded ? <ChevronUp size={14} className="text-brand-400" /> : <ChevronDown size={14} className="text-brand-400" />}
        </div>
      </button>

      {expanded && brief && (
        <div className="p-4 space-y-3">
          {/* Resumen */}
          <div className="bg-surface-1 rounded-lg p-3">
            <p className="text-sm text-text-primary leading-relaxed">{brief.resumen}</p>
          </div>

          {/* Objetivo sugerido */}
          <div className="bg-brand-50 border border-brand-200 rounded-lg p-3">
            <div className="text-[9px] font-bold text-brand-600 uppercase tracking-wider mb-1">🎯 Objetivo sugerido</div>
            <p className="text-sm font-semibold text-text-primary">{brief.objetivo_sugerido}</p>
            {brief.fase_captacion && (
              <p className="text-[10px] text-brand-500 mt-1">Fase del Playbook: {brief.fase_captacion}</p>
            )}
          </div>

          {/* Puntos clave */}
          <div>
            <div className="text-[9px] font-bold text-text-muted uppercase tracking-wider mb-1.5">Puntos clave</div>
            <div className="space-y-1">
              {brief.puntos_clave?.map((p, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                  <span className="text-brand-500 mt-0.5 font-bold">•</span>
                  <span>{p}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Temas a tratar */}
          <div>
            <div className="text-[9px] font-bold text-text-muted uppercase tracking-wider mb-1.5">Temas a tratar</div>
            <div className="flex flex-wrap gap-1.5">
              {brief.temas_a_tratar?.map((t, i) => (
                <span key={i} className="px-2.5 py-1 bg-surface-2 rounded-lg text-[11px] font-semibold text-text-secondary">
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Preguntas clave */}
          {brief.preguntas_clave?.length > 0 && (
            <div>
              <div className="text-[9px] font-bold text-text-muted uppercase tracking-wider mb-1.5">❓ Preguntas para la visita</div>
              <div className="space-y-1">
                {brief.preguntas_clave.map((p, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                    <span className="text-navy-500 mt-0.5 font-bold">{i + 1}.</span>
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Do's y Don'ts */}
          {(brief.dos?.length > 0 || brief.donts?.length > 0) && (
            <div className="grid grid-cols-2 gap-2">
              {brief.dos?.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-2.5">
                  <div className="text-[9px] font-bold text-green-600 uppercase tracking-wider mb-1">✅ Hacer</div>
                  {brief.dos.map((d, i) => (
                    <p key={i} className="text-[11px] text-green-700 mb-0.5">{d}</p>
                  ))}
                </div>
              )}
              {brief.donts?.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-2.5">
                  <div className="text-[9px] font-bold text-red-500 uppercase tracking-wider mb-1">❌ No hacer</div>
                  {brief.donts.map((d, i) => (
                    <p key={i} className="text-[11px] text-red-600 mb-0.5">{d}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Riesgos */}
          {brief.riesgos?.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2.5">
              <div className="text-[9px] font-bold text-red-500 uppercase tracking-wider mb-1">⚠️ Riesgos / Alertas</div>
              {brief.riesgos.map((r, i) => (
                <p key={i} className="text-xs text-red-600">{r}</p>
              ))}
            </div>
          )}

          {/* Tip */}
          {brief.tip && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              <p className="text-xs text-amber-700">
                <span className="font-bold">💡 Tip:</span> {brief.tip}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
