import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../components/AuthProvider';
import {
  Mic, MicOff, Send, User, Loader2, Sparkles,
  CheckCircle, AlertCircle
} from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

const SYSTEM_PROMPT = `Eres el asistente de IA del CRM para KAMs de Naturgy. Ayudas a Key Account Managers a gestionar canales de venta, planificar acciones y consultar su actividad.

Tu trabajo es interpretar lo que el usuario te pide y responder con un JSON que indique la acción a ejecutar.

ACCIONES DISPONIBLES:

1. "create_channel" - Crear un nuevo canal.
   Campos: name (obligatorio), contact_name, phone, email, cif, website,
   lead_source (array, uno o varios de: evento|congreso|webinar|linkedin_sales_navigator|recomendacion_partner|industrial|generacion_distribuida|canal_naturgy|kam|asociacion_sectorial|fabricante|solicitud_directa|otros),
   tipo_canal_caes (Instalador|Fabricante|Distribuidor|Asociación|Ingeniería|ESE|Administrador de fincas|Consultoría energética|Plataforma tecnológica|Concesionario VE|Organización de consumidores|Entidad financiera|Rehabilitador|Otros),
   comunidad_autonoma, potencial_caes (Bajo|Medio|Alto|Muy Alto), potencial_energia (Bajo|Medio|Alto|Muy Alto),
   address, city, province, notes

2. "query_channels" - Consultar canales.
   Filtros: status (pendiente_contacto|en_desarrollo|en_evaluacion|en_proceso_alta|activo|rechazado|cierre_sin_acuerdo), sin_visita_dias (canales sin visitar en X días), city, search (búsqueda por nombre)

3. "query_visits" - Consultar visitas realizadas.
   Filtros: periodo (hoy|semana|mes), resultado (positive|neutral|negative)

4. "move_pipeline" - Mover canal de fase en el pipeline.
   Campos: channel_name, new_stage (lead|first_contact|proposal|negotiation|onboarding|active|closed_no_deal)

5. "plan_action" - Planificar cualquier acción futura (visita, llamada, email, reunión, WhatsApp, LinkedIn).
   Campos: channel_name, action_type (visit|call|email|whatsapp|meeting|linkedin), date (YYYY-MM-DD), time (HH:MM), notes
   IMPORTANTE: el CRM ya soporta planificar llamadas, emails, reuniones, etc. NO solo visitas.

6. "query_agenda" - Consultar la agenda (acciones planificadas).
   Filtros: date (YYYY-MM-DD o "hoy"|"mañana"|"semana"), muestra visitas planificadas Y todas las acciones planificadas (llamadas, emails, reuniones, etc.)

7. "query_stats" - Consultar estadísticas generales del KAM

8. "query_activity" - Consultar la actividad reciente de un canal concreto (visitas + llamadas + emails + notas)
   Campos: channel_name

9. "chat" - Responder conversacionalmente (si no es una acción del CRM)

RESPONDE SIEMPRE con este JSON exacto (sin markdown, sin backticks):
{"action": "nombre_accion", "params": {...}, "message": "Mensaje para el usuario"}

EJEMPLOS:
- "Crea un canal Solar Madrid, contacto Pedro, origen LinkedIn"
  → {"action": "create_channel", "params": {"name": "Solar Madrid", "contact_name": "Pedro", "lead_source": ["linkedin_sales_navigator"]}, "message": "Voy a crear el canal Solar Madrid."}

- "Crea un canal Aislatec, viene de un congreso y también nos lo recomendó un partner"
  → {"action": "create_channel", "params": {"name": "Aislatec", "lead_source": ["congreso", "recomendacion_partner"]}, "message": "Voy a crear el canal Aislatec."}

- "¿Cuántas visitas he hecho esta semana?"
  → {"action": "query_visits", "params": {"periodo": "semana"}, "message": "Déjame consultar tus visitas de esta semana."}

- "Mueve Pepito a negociación"
  → {"action": "move_pipeline", "params": {"channel_name": "Pepito", "new_stage": "negotiation"}, "message": "Voy a mover Pepito a Negociación."}

- "Marca García como sin acuerdo"
  → {"action": "move_pipeline", "params": {"channel_name": "García", "new_stage": "closed_no_deal"}, "message": "Voy a marcar García como cierre sin acuerdo."}

- "Planifica una llamada a García para el jueves a las 11"
  → {"action": "plan_action", "params": {"channel_name": "García", "action_type": "call", "date": "NEXT_THURSDAY", "time": "11:00", "notes": ""}, "message": "Voy a planificar una llamada a García para el jueves a las 11:00."}

- "Planifica una reunión con SunTech para mañana a las 16"
  → {"action": "plan_action", "params": {"channel_name": "SunTech", "action_type": "meeting", "date": "TOMORROW", "time": "16:00"}, "message": "Reunión con SunTech planificada para mañana a las 16:00."}

- "¿Cuál es mi agenda para mañana?" o "¿Qué tengo planificado?"
  → {"action": "query_agenda", "params": {"date": "mañana"}, "message": "Déjame consultar tu agenda completa para mañana."}

- "¿Qué tengo esta semana?"
  → {"action": "query_agenda", "params": {"date": "semana"}, "message": "Aquí tienes tu agenda de la semana."}

- "¿Qué actividad tiene el canal García?"
  → {"action": "query_activity", "params": {"channel_name": "García"}, "message": "Consultando la actividad de García."}

- "¿Qué canales no he visitado en más de 10 días?"
  → {"action": "query_channels", "params": {"sin_visita_dias": 10}, "message": "Buscando canales sin visita en los últimos 10 días."}

Hoy es ${new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.
Si el usuario dice "jueves", "mañana", etc., calcula la fecha correcta.
Si dice "planifica una llamada" o "tengo que llamar a X el martes", usa action_type "call".
Si dice "agenda" o "qué tengo planificado", incluye TODAS las acciones (no solo visitas).
Si dice "sin acuerdo" o "no ha salido", usa new_stage "closed_no_deal".
Responde siempre en español.`;

const STAGE_LABELS = {
  lead: 'Lead',
  first_contact: 'Primer contacto',
  proposal: 'Propuesta',
  negotiation: 'Negociación',
  onboarding: 'En proceso alta',
  active: 'Activo',
  closed_no_deal: 'Sin acuerdo',
};

const STATUS_LABELS = {
  pendiente_contacto: 'Pendiente contacto',
  en_desarrollo:      'En desarrollo',
  en_evaluacion:      'En evaluación',
  en_proceso_alta:    'En proceso de alta',
  activo:             'Activo',
  rechazado:          'Rechazado',
  cierre_sin_acuerdo: 'Cierre sin acuerdo',
};

// Mapeo stage → status (igual que PipelinePage)
function stageToStatus(stage) {
  if (stage === 'active')         return 'activo';
  if (stage === 'lead')           return 'pendiente_contacto';
  if (stage === 'closed_no_deal') return 'cierre_sin_acuerdo';
  if (stage === 'onboarding')     return 'en_proceso_alta';
  if (['first_contact', 'proposal', 'negotiation'].includes(stage)) return 'en_desarrollo';
  return 'pendiente_contacto';
}

const ACTION_TYPE_LABELS = {
  visit: '📍 Visita', call: '📞 Llamada', email: '📧 Email',
  whatsapp: '💬 WhatsApp', meeting: '👥 Reunión', linkedin: '💼 LinkedIn', other: '📋 Otro',
};

function localDateKey(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function resolveDate(dateStr) {
  if (!dateStr) { const d = new Date(); d.setDate(d.getDate() + 1); return localDateKey(d); }
  if (dateStr === 'hoy') return localDateKey(new Date());
  if (dateStr === 'TOMORROW' || dateStr === 'mañana') { const d = new Date(); d.setDate(d.getDate() + 1); return localDateKey(d); }
  if (dateStr.startsWith('NEXT_')) {
    const dayNames = { MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6, SUNDAY: 0 };
    const targetDay = dayNames[dateStr.replace('NEXT_', '')];
    if (targetDay !== undefined) {
      const d = new Date(); const currentDay = d.getDay();
      const daysUntil = ((targetDay - currentDay + 7) % 7) || 7;
      d.setDate(d.getDate() + daysUntil);
      return localDateKey(d);
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  return localDateKey(new Date());
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isUser ? 'bg-brand-500 text-white' : 'bg-surface-2 text-brand-500'}`}>
        {isUser ? <User size={14} /> : <Sparkles size={14} />}
      </div>
      <div className={`max-w-[80%] ${isUser ? 'text-right' : ''}`}>
        <div className={`inline-block px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${isUser ? 'bg-brand-500 text-white rounded-tr-md' : 'bg-white border border-surface-3 text-text-primary rounded-tl-md'}`}>
          {message.text}
        </div>
        {message.actionResult && (
          <div className={`mt-1.5 inline-block px-3 py-2 rounded-xl text-xs border ${message.actionSuccess ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
            <div className="flex items-center gap-1.5">
              {message.actionSuccess ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
              {message.actionResult}
            </div>
          </div>
        )}
        {message.data && message.data.length > 0 && (
          <div className="mt-1.5 bg-white border border-surface-3 rounded-xl overflow-hidden max-w-sm">
            {message.data.slice(0, 10).map((item, i) => (
              <div key={i} className={`flex items-center gap-2 px-3 py-2 text-xs ${i < message.data.length - 1 && i < 9 ? 'border-b border-surface-3' : ''}`}>
                <span className="font-semibold text-text-primary flex-1">{item.name || item.label}</span>
                {item.value !== undefined && <span className="text-text-secondary">{item.value}</span>}
                {item.badge && <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${item.badgeClass || 'bg-surface-2 text-text-secondary'}`}>{item.badge}</span>}
              </div>
            ))}
            {message.data.length > 10 && (
              <div className="px-3 py-1.5 text-[10px] text-text-muted text-center bg-surface-1">+{message.data.length - 10} más</div>
            )}
          </div>
        )}
        <div className="text-[9px] text-text-muted mt-1">
          {new Date(message.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

export default function AssistantPage() {
  const { user } = useAuthContext();
  const [messages, setMessages] = useState([{
    role: 'assistant',
    text: '¡Hola! Soy tu asistente del CRM para KAMs. Puedo ayudarte con:\n\n📍 Consultar y planificar visitas, llamadas, emails, reuniones...\n📊 Ver tu agenda completa, estadísticas y pipeline\n🏢 Crear canales, mover fases, buscar actividad\n\n¿Qué necesitas?',
    timestamp: Date.now(),
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      const r = new SR(); r.lang = 'es-ES'; r.continuous = false; r.interimResults = false;
      r.onresult = (e) => { const t = e.results[0][0].transcript; setInput(t); setListening(false); handleSend(t); };
      r.onerror = () => setListening(false); r.onend = () => setListening(false);
      recognitionRef.current = r;
    }
  }, []);

  function toggleVoice() {
    if (!recognitionRef.current) { alert('Tu navegador no soporta reconocimiento de voz'); return; }
    if (listening) { recognitionRef.current.stop(); setListening(false); }
    else { recognitionRef.current.start(); setListening(true); }
  }

  async function handleSend(text) {
    const msgText = text || input.trim();
    if (!msgText || loading) return;
    const userMsg = { role: 'user', text: msgText, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch(`${BACKEND_URL}/api/assistant`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: SYSTEM_PROMPT,
          messages: [...messages.filter(m => m.role !== 'system').slice(-10).map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text,
          })), { role: 'user', content: msgText }],
        }),
      });
      if (!response.ok) { const e = await response.json().catch(() => ({})); throw new Error(e.error || `Error ${response.status}`); }

      const data = await response.json();
      const rawText = data.content?.map(c => c.text || '').join('') || '';
      let parsed;
      try { parsed = JSON.parse(rawText.replace(/```json\s*/g, '').replace(/```/g, '').trim()); }
      catch { parsed = { action: 'chat', params: {}, message: rawText }; }

      const result = await executeAction(parsed.action, parsed.params);
      setMessages(prev => [...prev, { role: 'assistant', text: parsed.message || 'Hecho.', timestamp: Date.now(), ...result }]);
    } catch (err) {
      console.error('Error:', err);
      setMessages(prev => [...prev, { role: 'assistant', text: `Lo siento, ha ocurrido un error: ${err.message}`, timestamp: Date.now() }]);
    } finally { setLoading(false); }
  }

  async function executeAction(action, params) {
    try {
      switch (action) {
        case 'create_channel': {
          if (!params.name) return { actionResult: 'Falta el nombre del canal', actionSuccess: false };
          const { error } = await supabase.from('channels').insert({
            name: params.name, contact_name: params.contact_name || null,
            phone: params.phone || null, email: params.email || null,
            cif: params.cif || null, website: params.website || null,
            lead_source: params.lead_source
              ? (Array.isArray(params.lead_source) ? params.lead_source : [params.lead_source])
              : null,
            tipo_canal_caes: params.tipo_canal_caes || null,
            comunidad_autonoma: params.comunidad_autonoma || null,
            potencial_caes: params.potencial_caes || null,
            potencial_energia: params.potencial_energia || null,
            address: params.address || null, city: params.city || null, province: params.province || null,
            status: 'pendiente_contacto', pipeline_stage: 'lead',
            notes: params.notes || null, assigned_to: user.id,
          }).select().single();
          if (error) throw error;
          return { actionResult: `Canal "${params.name}" creado correctamente`, actionSuccess: true };
        }

        case 'query_channels': {
          let query = supabase.from('channels').select('name, status, city, pipeline_stage').eq('assigned_to', user.id);
          if (params.status) query = query.eq('status', params.status);
          if (params.search) query = query.ilike('name', `%${params.search}%`);
          if (params.city) query = query.ilike('city', `%${params.city}%`);
          const { data, error } = await query.order('name').limit(20);
          if (error) throw error;

          if (params.sin_visita_dias) {
            const threshold = new Date(Date.now() - params.sin_visita_dias * 86400000).toISOString();
            const { data: allCh } = await supabase.from('channels').select('id, name, status').eq('assigned_to', user.id);
            const results = [];
            for (const ch of (allCh || [])) {
              const { data: lv } = await supabase.from('visits').select('checkin_at').eq('channel_id', ch.id).order('checkin_at', { ascending: false }).limit(1);
              if (!lv?.length || lv[0].checkin_at < threshold) {
                const days = lv?.length ? Math.floor((Date.now() - new Date(lv[0].checkin_at).getTime()) / 86400000) : null;
                results.push({ name: ch.name, badge: days !== null ? `${days}d` : 'Nunca', badgeClass: 'bg-red-50 text-red-500' });
              }
            }
            return { data: results, actionResult: `${results.length} canales sin visita en ${params.sin_visita_dias}+ días`, actionSuccess: true };
          }
          return {
            data: (data || []).map(c => ({ name: c.name, value: c.city || '', badge: STATUS_LABELS[c.status] || c.status })),
            actionResult: `${data?.length || 0} canales encontrados`, actionSuccess: true,
          };
        }

        case 'query_visits': {
          const now = new Date();
          let startDate;
          if (params.periodo === 'hoy') startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
          else if (params.periodo === 'semana') { const d = new Date(now); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); d.setHours(0,0,0,0); startDate = d.toISOString(); }
          else startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
          let query = supabase.from('visits').select('*, channels(name)').eq('kam_id', user.id).gte('checkin_at', startDate);
          if (params.resultado) query = query.eq('result', params.resultado);
          const { data, error } = await query.order('checkin_at', { ascending: false });
          if (error) throw error;
          const positive = (data || []).filter(v => v.result === 'positive').length;
          return {
            data: (data || []).slice(0, 10).map(v => ({
              name: v.channels?.name || 'Canal',
              value: new Date(v.checkin_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
              badge: v.result === 'positive' ? '✓' : v.result === 'negative' ? '✗' : '~',
              badgeClass: v.result === 'positive' ? 'bg-green-50 text-green-600' : v.result === 'negative' ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-600',
            })),
            actionResult: `${data?.length || 0} visitas (${positive} positivas) ${params.periodo === 'hoy' ? 'hoy' : params.periodo === 'semana' ? 'esta semana' : 'este mes'}`,
            actionSuccess: true,
          };
        }

        case 'move_pipeline': {
          if (!params.channel_name || !params.new_stage) return { actionResult: 'Necesito el nombre del canal y la fase destino', actionSuccess: false };
          const { data: chs } = await supabase.from('channels').select('id, name, pipeline_stage').eq('assigned_to', user.id).ilike('name', `%${params.channel_name}%`).limit(1);
          if (!chs?.length) return { actionResult: `No encontré "${params.channel_name}"`, actionSuccess: false };
          const ch = chs[0];
          const oldStageLabel = STAGE_LABELS[ch.pipeline_stage] || ch.pipeline_stage;
          const newStageLabel = STAGE_LABELS[params.new_stage] || params.new_stage;
          const now = new Date().toISOString();
          const newStatus = stageToStatus(params.new_stage);
          const { error } = await supabase.from('channels').update({
            pipeline_stage: params.new_stage,
            status: newStatus,
            pipeline_stage_changed_at: now,
          }).eq('id', ch.id);
          if (error) throw error;
          await supabase.from('channel_pipeline_history').insert({
            channel_id: ch.id, from_stage: ch.pipeline_stage, to_stage: params.new_stage, changed_by: user.id,
          }).catch(() => {});
          return { actionResult: `${ch.name}: ${oldStageLabel} → ${newStageLabel}`, actionSuccess: true };
        }

        case 'plan_action': {
          if (!params.channel_name) return { actionResult: 'Necesito el nombre del canal', actionSuccess: false };
          const { data: chs } = await supabase.from('channels').select('id, name').eq('assigned_to', user.id).ilike('name', `%${params.channel_name}%`).limit(1);
          if (!chs?.length) return { actionResult: `No encontré "${params.channel_name}"`, actionSuccess: false };
          const date = resolveDate(params.date);
          const time = params.time ? params.time + ':00' : '09:00:00';
          const actionType = params.action_type || 'visit';

          if (actionType === 'visit') {
            const { error } = await supabase.from('planned_visits').insert({
              channel_id: chs[0].id, kam_id: user.id, planned_date: date, planned_time: time, notes: params.notes || null,
            });
            if (error) throw error;
          } else {
            const { error } = await supabase.from('channel_interactions').insert({
              channel_id: chs[0].id, user_id: user.id, interaction_type: actionType, direction: 'outbound',
              planned_date: date, planned_time: time, notes: params.notes || null, is_completed: false,
            });
            if (error) throw error;
          }
          const label = ACTION_TYPE_LABELS[actionType] || actionType;
          const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
          return { actionResult: `${label} planificada: ${chs[0].name} el ${dateLabel} a las ${params.time || '09:00'}`, actionSuccess: true };
        }

        case 'query_agenda': {
          const now = new Date();
          let startDate, endDate;
          if (params.date === 'hoy' || !params.date) {
            startDate = localDateKey(now); endDate = startDate;
          } else if (params.date === 'mañana' || params.date === 'TOMORROW') {
            const d = new Date(now); d.setDate(d.getDate() + 1);
            startDate = localDateKey(d); endDate = startDate;
          } else if (params.date === 'semana') {
            const d = new Date(now); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1);
            startDate = localDateKey(d);
            const e = new Date(d); e.setDate(e.getDate() + 6);
            endDate = localDateKey(e);
          } else {
            startDate = resolveDate(params.date); endDate = startDate;
          }

          const [pvRes, paRes] = await Promise.allSettled([
            supabase.from('planned_visits').select('*, channels(name)').eq('kam_id', user.id)
              .gte('planned_date', startDate).lte('planned_date', endDate).order('planned_date').order('planned_time'),
            supabase.from('channel_interactions').select('*, channels(name)').eq('user_id', user.id)
              .not('planned_date', 'is', null).eq('is_completed', false)
              .gte('planned_date', startDate).lte('planned_date', endDate).order('planned_date').order('planned_time'),
          ]);

          const visits  = (pvRes.status === 'fulfilled' ? pvRes.value.data : []) || [];
          const actions = (paRes.status === 'fulfilled' ? paRes.value.data : []) || [];

          const allEvents = [
            ...visits.map(v => ({ name: v.channels?.name || 'Canal', value: v.planned_date, badge: '📍 Visita', badgeClass: 'bg-orange-50 text-orange-600', time: v.planned_time?.slice(0,5) })),
            ...actions.map(a => {
              const label = ACTION_TYPE_LABELS[a.interaction_type] || a.interaction_type;
              return { name: a.channels?.name || 'Canal', value: a.planned_date, badge: label, badgeClass: 'bg-navy-50 text-navy-600', time: a.planned_time?.slice(0,5) };
            }),
          ].sort((a, b) => `${a.value} ${a.time}`.localeCompare(`${b.value} ${b.time}`));

          const formatted = allEvents.map(e => ({
            ...e,
            value: `${e.time || '--:--'} · ${new Date(e.value + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}`,
          }));

          const total = allEvents.length;
          const periodLabel = startDate === endDate
            ? new Date(startDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
            : 'la semana';
          return { data: formatted, actionResult: `${total} acciones planificadas para ${periodLabel}`, actionSuccess: true };
        }

        case 'query_activity': {
          if (!params.channel_name) return { actionResult: 'Necesito el nombre del canal', actionSuccess: false };
          const { data: chs } = await supabase.from('channels').select('id, name').eq('assigned_to', user.id).ilike('name', `%${params.channel_name}%`).limit(1);
          if (!chs?.length) return { actionResult: `No encontré "${params.channel_name}"`, actionSuccess: false };

          const [vRes, iRes] = await Promise.allSettled([
            supabase.from('visits').select('checkin_at, result').eq('channel_id', chs[0].id).order('checkin_at', { ascending: false }).limit(5),
            supabase.from('channel_interactions').select('interaction_type, created_at, notes, is_completed, planned_date').eq('channel_id', chs[0].id).order('created_at', { ascending: false }).limit(10),
          ]);

          const visits = (vRes.status === 'fulfilled' ? vRes.value.data : []) || [];
          const inters = (iRes.status === 'fulfilled' ? iRes.value.data : []) || [];

          const items = [
            ...visits.map(v => ({
              name: '📍 Visita', value: new Date(v.checkin_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
              badge: v.result === 'positive' ? '✓ Positiva' : v.result === 'negative' ? '✗ Negativa' : '~ Neutral',
              badgeClass: v.result === 'positive' ? 'bg-green-50 text-green-600' : v.result === 'negative' ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-600',
              _date: v.checkin_at,
            })),
            ...inters.filter(i => i.is_completed !== false).map(i => ({
              name: ACTION_TYPE_LABELS[i.interaction_type] || i.interaction_type,
              value: new Date(i.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
              badge: i.notes ? i.notes.substring(0, 30) : '', badgeClass: 'bg-surface-2 text-text-secondary',
              _date: i.created_at,
            })),
            ...inters.filter(i => i.is_completed === false && i.planned_date).map(i => ({
              name: `⏳ ${ACTION_TYPE_LABELS[i.interaction_type] || i.interaction_type}`,
              value: new Date(i.planned_date + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
              badge: 'Planificada', badgeClass: 'bg-navy-50 text-navy-600',
              _date: i.planned_date,
            })),
          ].sort((a, b) => new Date(b._date) - new Date(a._date)).map(({ _date, ...rest }) => rest);

          return { data: items, actionResult: `Actividad de ${chs[0].name}: ${visits.length} visitas, ${inters.length} interacciones`, actionSuccess: true };
        }

        case 'query_stats': {
          const now = new Date();
          const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
          const mondayStart = (() => { const d = new Date(now); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); d.setHours(0,0,0,0); return d.toISOString(); })();
          const todayKey = localDateKey(now);
          const [today, week, channels, pipeline, plannedToday] = await Promise.allSettled([
            supabase.from('visits').select('id', { count: 'exact', head: true }).eq('kam_id', user.id).gte('checkin_at', todayStart),
            supabase.from('visits').select('id', { count: 'exact', head: true }).eq('kam_id', user.id).gte('checkin_at', mondayStart),
            supabase.from('channels').select('id', { count: 'exact', head: true }).eq('assigned_to', user.id),
            supabase.from('channels').select('id', { count: 'exact', head: true }).eq('assigned_to', user.id).in('pipeline_stage', ['first_contact','proposal','negotiation','onboarding']),
            supabase.from('channel_interactions').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('planned_date', todayKey).eq('is_completed', false),
          ]);
          const gc = (r) => r.status === 'fulfilled' ? (r.value.count || 0) : 0;
          return {
            data: [
              { name: 'Visitas hoy',             value: gc(today) },
              { name: 'Visitas esta semana',      value: gc(week) },
              { name: 'Total canales',            value: gc(channels) },
              { name: 'Pipeline activo',          value: gc(pipeline) },
              { name: 'Acciones pendientes hoy',  value: gc(plannedToday) },
            ],
            actionResult: 'Tus estadísticas actualizadas', actionSuccess: true,
          };
        }

        case 'chat': default: return {};
      }
    } catch (err) {
      console.error('Error ejecutando acción:', err);
      return { actionResult: `Error: ${err.message}`, actionSuccess: false };
    }
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 140px)' }}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center">
          <Sparkles size={18} className="text-brand-500" />
        </div>
        <div>
          <h1 className="text-lg font-extrabold text-text-primary tracking-tight">Asistente IA</h1>
          <p className="text-[10px] text-text-muted">Dime qué necesitas, por texto o por voz</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pb-2">
        {messages.map((msg, i) => <MessageBubble key={i} message={msg} />)}
        {loading && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-surface-2 flex items-center justify-center"><Sparkles size={14} className="text-brand-500" /></div>
            <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-md bg-white border border-surface-3">
              <div className="flex items-center gap-2 text-sm text-text-muted"><Loader2 size={14} className="animate-spin" /> Pensando...</div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide py-2">
        {['¿Qué tengo hoy?', '¿Mi agenda de mañana?', 'Mis estadísticas', '¿Canales sin visitar?', 'Planifica una llamada'].map((s, i) => (
          <button key={i} onClick={() => { setInput(s); handleSend(s); }}
            className="px-3 py-1.5 bg-surface-1 border border-surface-3 rounded-full text-[11px] text-text-secondary font-semibold whitespace-nowrap hover:bg-surface-2 transition-colors">{s}</button>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-surface-3">
        <button onClick={toggleVoice}
          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${listening ? 'bg-red-500 text-white animate-pulse' : 'bg-surface-2 text-text-muted hover:bg-surface-3'}`}>
          {listening ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={listening ? 'Escuchando...' : 'Escribe o habla...'}
          disabled={loading}
          className="flex-1 px-4 py-2.5 bg-white border border-surface-3 rounded-xl text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-500 disabled:opacity-50" />
        <button onClick={() => handleSend()} disabled={!input.trim() || loading}
          className="w-10 h-10 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-30 text-white flex items-center justify-center flex-shrink-0"><Send size={16} /></button>
      </div>
    </div>
  );
}
