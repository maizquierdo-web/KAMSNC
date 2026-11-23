import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Mail, X } from 'lucide-react';
import { useAuthContext } from './AuthProvider';
import { supabase } from '../lib/supabase';
import { canPrepareWelcome, defaultAssignments, initialWelcome, welcomeErrors, validEmail, WELCOME_ROUTES, WELCOME_SHEET_CODES } from '../lib/welcomePack.mjs';
import { downloadWelcomeBlob } from '../lib/welcomePackDocx.mjs';
import { welcomeHandoffPlan, welcomeDesktopEmail, welcomeMailtoHandoff, createWelcomeDownload, createWelcomeEmailFile } from '../lib/welcomeHandoff.mjs';
const inputClass = 'w-full rounded-lg border border-surface-3 bg-white px-3 py-2 text-sm text-text-primary focus:border-navy-500 focus:outline-none';
function Field({ label, value, onChange, type = 'text', readOnly = false }) {
  return <label className="block"><span className="mb-1 block text-sm font-semibold text-text-secondary">{label}</span><input className={inputClass} type={type} value={value || ''} readOnly={readOnly} onChange={e => onChange?.(e.target.value)} /></label>;
}
export default function ChannelWelcomePack({ channel, classifications, onUpdate, onPrepared }) {
  const { user, profile } = useAuthContext();
  const [open, setOpen] = useState(false), [data, setData] = useState(null), [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [search, setSearch] = useState(''), [extraCode, setExtraCode] = useState(''), [saveChannel, setSaveChannel] = useState(true);
  const [email, setEmail] = useState({ subject: '', body: '' }), [last, setLast] = useState(null);
  const [hasLocalDraft, setHasLocalDraft] = useState(false);
  const latest = useRef(null); latest.current = { data, email, step };
  const localDraft = useRef(null), modalRef = useRef(null), triggerRef = useRef(null);
  const sender = { name: profile?.full_name || user?.email || '', email: user?.email || '' };
  const active = canPrepareWelcome(channel);
  useEffect(() => {
    localDraft.current = null; setHasLocalDraft(false); setOpen(false); setData(null); setLast(null);
  }, [channel.id, user?.id]);
  useEffect(() => {
    if (!open) return;
    const old = document.body.style.overflow; document.body.style.overflow = 'hidden';
    modalRef.current?.querySelector('button')?.focus();
    function keys(e) {
      if (e.key === 'Escape' && !busy) { if (latest.current?.data) { localDraft.current = latest.current; setHasLocalDraft(true); } setOpen(false); }
      if (e.key === 'Tab') {
        const nodes = [...(modalRef.current?.querySelectorAll('button:not(:disabled),input:not(:disabled),select,textarea,summary,[tabindex="0"]') || [])];
        const first = nodes[0], lastNode = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastNode?.focus(); }
        if (!e.shiftKey && document.activeElement === lastNode) { e.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener('keydown', keys);
    return () => { document.body.style.overflow = old; document.removeEventListener('keydown', keys); triggerRef.current?.focus(); };
  }, [open, busy]);
  function update(key, value) {
    setData(current => ({ ...current, [key]: value, ...(key === 'recipient' ? { recipientConfirmed: false } : {}) }));
    setNotice('');
  }
  function close() {
    if (busy) return;
    if (!data) { setOpen(false); return; }
    localDraft.current = { data, email, step }; setHasLocalDraft(true); setOpen(false);
  }
  async function start() {
    setOpen(true); setError(''); setNotice(''); setSearch('');
    if (localDraft.current) { setData({ ...localDraft.current.data, recipientConfirmed: false }); setEmail(localDraft.current.email); setStep(1); return false; }
    setLoading(true);
    try {
      const [kamResult, draftResult] = await Promise.all([
        supabase.from('profiles').select('full_name,email,phone').eq('id', channel.assigned_to).single(),
        supabase.from('channel_welcome_packs').select('*').eq('channel_id', channel.id).eq('created_by', user.id).maybeSingle(),
      ]);
      const initial = initialWelcome(channel, kamResult.data, classifications);
      const previous = draftResult.data;
      setData({ ...initial, ...(previous?.data || {}), recipientConfirmed: false });
      setLast(previous); setStep(1);
      setEmail(previous?.email_draft || { subject: '', body: '' });
      if (draftResult.error) setNotice('No se pudo recuperar el borrador. Comprueba que se ha aplicado la migración de welcome pack. Puedes completar los datos aquí.');
      if (kamResult.error) setNotice('No se han podido recuperar los datos del KAM. Puedes completarlos en este asistente.');
    } catch (e) { setError(e.message || 'No se pudo abrir el asistente.'); }
    finally { setLoading(false); }
  }
  async function checkActive() {
    const { data: fresh, error: readError } = await supabase.from('channels').select('id,status,pipeline_stage').eq('id', channel.id).single();
    if (readError) throw readError;
    if (!canPrepareWelcome(fresh)) throw new Error('El canal ya no está ACTIVO. El borrador se conserva; no se puede preparar el pack.');
  }
  async function save(prepared = false) {
    setError(''); setNotice('');
    if (prepared) {
      const errors = welcomeErrors(data, sender.email);
      if (errors.length) { setError('Completa: ' + errors.join(', ')); setStep(1); return false; }
      if (!email.subject.trim() || !email.body.trim()) { setError('Completa el asunto y el texto del correo.'); return false; }
    }
    setBusy(true);
    try {
      const cleanData = { ...data, deliveryMethod: 'desktop' }; delete cleanData.recipientConfirmed;
      const { data: saved, error: saveError } = await supabase.rpc('save_channel_welcome_pack', {
        p_channel_id: channel.id, p_data: cleanData, p_email: email,
        p_save_channel: saveChannel, p_prepared: prepared,
      });
      if (saveError) throw saveError;
      setLast(saved); localDraft.current = { data, email, step }; setHasLocalDraft(true);
      if (saveChannel) onUpdate?.({
        ...Object.fromEntries(Object.entries({ name: data.company, cif: data.cif, contact_name: data.contact, phone: data.phone }).filter(([, value]) => value?.trim())),
        caes_assigned_sheets: data.sheets, welcome_pack_config: cleanData });
      if (prepared) onPrepared?.();
      setNotice(prepared ? 'Correo preparado y registrado. El envío se realiza desde tu aplicación de correo.' : 'Borrador guardado en el CRM.');
      return true;
    } catch (e) { setError(`No se pudo guardar. Tus datos siguen en este diálogo. ${e.message || ''}`); return false; }
    finally { setBusy(false); }
  }
  async function download() {
    setError(''); setBusy(true);
    try {
      const errors = welcomeErrors(data, sender.email);
      if (errors.length) throw new Error('Completa antes de generar el Word: ' + errors.join(', '));
      await checkActive();
      const pack = await createWelcomeDownload(data);
      downloadWelcomeBlob(pack.blob, pack.name);
      setNotice(pack.plan.draft ? 'ZIP de PRUEBA descargado. Contiene el Word borrador y una lista de pendientes. Extrae los archivos antes de adjuntarlos al correo.' : 'Documentos descargados en ZIP. Extrae y adjunta los archivos al correo antes de enviarlo.');
    } catch (e) { setError(e.message || 'No se pudo generar el documento.'); }
    finally { setBusy(false); }
  }
  async function openDesktopMail() {
    setError('');
    try {
      const handoff = welcomeMailtoHandoff(email, data.recipient);
      if (!await save(true)) return;
      window.location.href = handoff.url;
      setNotice(handoff.copyBody
        ? 'Se ha solicitado abrir el correo con destinatario y asunto. El texto es largo: utiliza «Copiar texto» y pégalo en el mensaje. Adjunta los archivos descargados y comprueba el remitente.'
        : 'Se ha solicitado abrir tu aplicación de correo. Comprueba destinatario, cuenta remitente y adjuntos antes de enviar. El CRM no puede confirmar si se ha abierto ni si se ha enviado.');
    } catch (e) { setError(e.message || 'No se pudo abrir el correo. Puedes copiar el texto y crear el mensaje manualmente.'); }
  }
  async function downloadEmail() {
    setError(''); setBusy(true);
    try {
      const errors = welcomeErrors(data, sender.email);
      if (errors.length) throw new Error('Completa: ' + errors.join(', '));
      await checkActive();
      const file = await createWelcomeEmailFile(data, email, sender);
      downloadWelcomeBlob(file.blob, file.name);
      setNotice('Correo .eml descargado con los documentos disponibles adjuntos. Ábrelo en Outlook; según tu versión, puede ser necesario elegir Reenviar. Comprueba remitente y destinatario antes de enviar. No se ha registrado ningún envío.');
    } catch (e) { setError(e.message || 'No se pudo descargar el correo.'); }
    finally { setBusy(false); }
  }
  async function copyEmail() {
    try { await navigator.clipboard.writeText(email.body); setNotice('Texto copiado. Pégalo en el mensaje de tu aplicación de correo.'); }
    catch { setError('No se pudo copiar automáticamente. Selecciona y copia el texto del correo mostrado arriba.'); }
  }
  function next() {
    const errors = welcomeErrors(data, sender.email, step);
    if (errors.length) { setError('Completa aquí: ' + errors.join(', ')); return; }
    setError('');
    if (step === 3) setEmail(welcomeDesktopEmail(data, sender));
    setStep(value => value + 1);
  }
  function selectRoute(route) {
    setData(current => ({ ...current, route, ...(!current.exception ? defaultAssignments(route, current.company) : {}) }));
  }
  function field(key,label,type='text') { return <Field key={key} label={label} type={type} value={data[key]} onChange={v=>update(key,v)} />; }
  const codes = [...new Set([...WELCOME_SHEET_CODES, ...(data?.sheets || [])])].sort();
  return <>
    {active && <section className="mb-3 rounded-xl border border-navy-100 bg-white p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-text-primary">Welcome pack CAE</h3><p className="text-sm text-text-secondary">Prepara el correo y descarga los documentos para adjuntarlos en Outlook.</p></div>
        <button ref={triggerRef} onClick={start} className="flex items-center gap-2 rounded-lg bg-navy-600 px-4 py-2.5 text-sm font-semibold text-white"><Mail size={16} />Preparar welcome pack</button></div>
      {hasLocalDraft && <p className="mt-2 text-sm text-text-muted">Tienes un borrador de esta sesión. Puedes retomarlo.</p>}
      <p className="mt-2 text-xs text-text-muted">El envío se realiza desde tu aplicación de correo, sin conectar el buzón al CRM.</p>
    </section>}
    {open && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3" role="presentation">
      <section ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="welcome-title" className="welcome-pack-dialog flex max-h-[92dvh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-surface-3 p-4"><h2 id="welcome-title" className="text-lg font-bold text-text-primary">Welcome pack · {channel.name}</h2><button disabled={busy} aria-label="Cerrar y conservar borrador" onClick={close}><X size={20} /></button></header>
        <div className="overflow-y-auto p-4 md:p-6">
          {loading ? <div className="flex items-center gap-2"><Loader2 className="animate-spin" />Cargando datos del CRM…</div> : data && <>
            <ol className="mb-5 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">{['Destinatario','Datos y fichas CAE','Configuración','Correo y adjuntos'].map((label,i)=><li key={label} aria-current={step===i+1?'step':undefined} className={`border-b-2 pb-2 ${step===i+1?'border-brand-500 font-bold text-navy-600':'border-surface-3 text-text-muted'}`}>{label}</li>)}</ol>
            {!active && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">El canal ya no está ACTIVO. Los datos introducidos se conservan.</p>}
            {last && <p className="mb-4 text-sm text-text-muted">Último {last.status==='prepared'?'pack preparado':'borrador'}: {new Date(last.updated_at).toLocaleString('es-ES')}. No equivale a un envío.</p>}
            {step===1 && <div className="space-y-4"><div className="rounded-lg bg-navy-50 p-3 text-sm"><strong>Remitente:</strong> {sender.name} · {sender.email || 'Correo del usuario no disponible'}<p className="mt-1 text-text-secondary">Remitente previsto: el usuario del CRM. Al abrir Outlook, comprueba que está seleccionada esta cuenta; el CRM no puede elegirla por ti.</p></div>
              {field('contact','Persona destinataria *')}{field('recipient','Correo de destino *','email')}
              <div className="rounded-lg border border-surface-3 p-3">
                <button type="button" disabled={!data.contact.trim() || !validEmail(data.recipient)}
                  onClick={() => { update('recipient', data.recipient.trim()); update('recipientConfirmed', true); setError(''); }}
                  className="rounded-lg bg-navy-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                  {data.recipientConfirmed ? 'Correo confirmado' : 'Confirmar correo de destino'}
                </button>
                {data.recipientConfirmed
                  ? <p role="status" className="mt-2 text-sm font-semibold text-green-700">Destinatario confirmado: {data.recipient.trim()}</p>
                  : <p className="mt-2 text-sm text-text-secondary">Revisa la dirección y pulsa «Confirmar correo de destino» antes de continuar.</p>}
              </div>
              <p className="text-sm text-text-muted">Cambiar el destinatario no sustituye el email habitual del canal.</p></div>}
            {step===2 && <div className="space-y-4"><div className="grid gap-4 md:grid-cols-2">{field('company','Razón social *')}{field('cif','CIF *')}{field('phone','Teléfono del contacto *','tel')}{field('startDate','Fecha prevista de inicio *','date')}{field('kamName','KAM asignado · nombre *')}{field('kamEmail','Correo del KAM *','email')}{field('kamPhone','Teléfono del KAM *','tel')}</div>
              <details open className="rounded-lg border border-surface-3 p-3"><summary className="cursor-pointer text-sm font-bold text-navy-600">Fichas CAE que trabajará el canal * · {data.sheets.length} seleccionadas</summary><input aria-label="Buscar ficha CAE" className={`${inputClass} my-3`} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar código de ficha" />
                <div className="grid gap-2 sm:grid-cols-2">{codes.filter(code=>code.toLowerCase().includes(search.toLowerCase())).map(code=><label key={code} className="flex items-center gap-2 p-2 text-sm"><input type="checkbox" checked={data.sheets.includes(code)} onChange={e=>update('sheets',e.target.checked?[...data.sheets,code]:data.sheets.filter(s=>s!==code))} />{code}</label>)}</div>
                <div className="mt-3 flex flex-wrap gap-2"><input aria-label="Añadir otro código CAE" value={extraCode} onChange={e=>setExtraCode(e.target.value.toUpperCase())} className={inputClass} placeholder="Otro código, por ejemplo IND001" /><button type="button" className="text-sm font-semibold text-navy-600" onClick={()=>{const code=extraCode.trim();if(!/^[A-Z]{3}\d{3}$/.test(code)){setError('Introduce un código de ficha con tres letras y tres cifras.');return;}update('sheets',[...new Set([...data.sheets,code])]);setExtraCode('');setError('');}}>Añadir ficha</button></div>
                <p className="mt-2 text-xs text-text-muted">Confirma los códigos aplicables. No se asignan por defecto RES010/RES020/RES022.</p></details>
              <label className="flex gap-2 text-sm"><input type="checkbox" checked={saveChannel} onChange={e=>setSaveChannel(e.target.checked)} />Guardar los datos comerciales y las fichas también en el canal. Los datos del KAM se conservan en el pack; no se modifica su perfil.</label></div>}
            {step===3 && <div className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><Field label="Unidad de negocio" value="Retail" readOnly /><label className="text-sm font-semibold">Tipo de canal *<select className={`${inputClass} mt-1`} value={data.kind} onChange={e=>update('kind',e.target.value)}><option value="">Seleccionar…</option><option>Agregador</option><option>Facilitador</option></select></label></div>
              <label className="block text-sm font-semibold">Canal de entrada *<select className={`${inputClass} mt-1`} value={data.route} onChange={e=>selectRoute(e.target.value)}><option value="">Seleccionar…</option>{WELCOME_ROUTES.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
              <label className="flex gap-2 text-sm"><input type="checkbox" checked={data.exception} onChange={e=>{const exception=e.target.checked;setData(c=>({...c,exception,...(!exception&&c.route?defaultAssignments(c.route,c.company):{})}));}} />Asignación excepcional de OT / verificadora</label>
              <div className="grid gap-4 md:grid-cols-3">{[['ot1','OT1 *'],['ot2','OT2 *'],['verifier','Verificadora *']].map(([k,l])=><Field key={k} label={l} value={data[k]} readOnly={!data.exception} onChange={v=>update(k,v)} />)}</div>
              {data.exception && field('exceptionReason','Motivo de la excepción *')}
              <details className="rounded-lg border border-surface-3 p-3" open><summary className="cursor-pointer text-sm font-semibold">Contactos de OT y verificadora</summary><p className="my-3 text-sm text-text-muted">Puedes completarlos aquí. El directorio definitivo se incorporará cuando se facilite.</p><div className="grid gap-3 md:grid-cols-2">{field('ot1Contact','Persona de contacto OT1')}{field('ot1Email','Correo OT1','email')}{field('ot2Contact','Persona de contacto OT2')}{field('ot2Email','Correo OT2','email')}{field('verifierContact','Persona de contacto verificadora')}{field('verifierEmail','Correo verificadora','email')}</div></details>
              {data.route && data.route!=='mask' && field('naturecoUser','Usuario de Natureco, si está confirmado')}
              <p className="text-xs text-text-muted">Nunca se solicitan contraseñas. Si regresas desde la revisión del correo y cambias la configuración, se regenerará el texto propuesto.</p></div>}
            {step===4 && <div className="space-y-4"><div className="rounded-lg bg-navy-50 p-3 text-sm"><p><strong>De:</strong> {sender.email}</p><p><strong>Para:</strong> {data.contact} · {data.recipient}</p><p><strong>Fichas:</strong> {data.sheets.join(', ')}</p></div>
              <Field label="Asunto" value={email.subject} onChange={subject=>setEmail(c=>({...c,subject}))} /><label className="block text-sm font-semibold">Texto propuesto<textarea rows={13} className={`${inputClass} mt-1`} value={email.body} onChange={e=>setEmail(c=>({...c,body:e.target.value}))} /></label>
              <h3 className="font-bold">Documentos para adjuntar manualmente</h3>{welcomeHandoffPlan(data).files.map(a=><div key={a.key} className="rounded-lg border border-surface-3 p-3 text-sm"><strong>{a.name}</strong><p>{a.description}</p></div>)}
              {welcomeHandoffPlan(data).draft && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><strong>Disponible para prueba; pack definitivo pendiente</strong><ul className="mt-2 list-disc pl-5">{welcomeHandoffPlan(data).missing.map(a=><li key={a.key}>{a.name} · pendiente de incorporar</li>)}{welcomeHandoffPlan(data).contactsMissing && <li>Contactos de OT / verificadora pendientes</li>}</ul><p className="mt-2">El correo se prepara con [PRUEBA] y enumera únicamente los archivos disponibles. Puedes poner tu propio correo como destinatario para comprobar el recorrido.</p></div>}
              <div className="rounded-lg bg-navy-50 p-3 text-sm"><strong>Cómo enviarlo</strong><p className="mt-2">Puedes descargar el correo .eml con los documentos disponibles ya adjuntos y abrirlo en Outlook. Si utilizas «Abrir correo», descarga el ZIP y adjunta sus archivos manualmente. Comprueba el remitente antes de enviar. Se abrirá la aplicación de correo predeterminada de tu equipo.</p><p className="mt-2">El CRM registra «Correo preparado» y no puede comprobar el envío. Si no se abre ninguna aplicación, crea el mensaje manualmente con el destinatario, asunto y texto de este diálogo.</p></div>
              <div className="flex flex-wrap gap-2">
                <button onClick={download} disabled={busy||!active} className="flex items-center gap-2 rounded-lg border border-navy-200 px-3 py-2 text-sm font-semibold text-navy-600"><Download size={16} />Descargar documentos disponibles</button>
                <button onClick={downloadEmail} disabled={busy||!active} className="rounded-lg bg-navy-600 px-3 py-2 text-sm font-semibold text-white">Descargar correo (.eml)</button>
                <button onClick={copyEmail} disabled={busy} className="rounded-lg border border-navy-200 px-3 py-2 text-sm font-semibold text-navy-600">Copiar texto</button>
                <button onClick={openDesktopMail} disabled={busy||!active} className="rounded-lg bg-navy-600 px-3 py-2 text-sm font-semibold text-white">Abrir correo (Outlook)</button>
              </div>
            </div>}
          </>}
          {error && <div role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {notice && <div role="status" className="mt-4 rounded-lg bg-navy-50 p-3 text-sm text-navy-700">{notice}</div>}
        </div>
        {!loading && data && <footer className="flex flex-wrap justify-end gap-2 border-t border-surface-3 p-4 text-sm">
          {busy && <Loader2 className="animate-spin" size={18} />}
          <button disabled={busy} onClick={close} className="rounded-lg px-3 py-2">Cerrar y conservar</button>
          {step>1 && <button disabled={busy} onClick={()=>{setStep(s=>s-1);setError('');}} className="rounded-lg border border-surface-3 px-3 py-2">Anterior</button>}
          <button disabled={busy||!active} onClick={()=>save(false)} className="rounded-lg border border-navy-200 px-3 py-2 text-navy-600">Guardar borrador</button>
          {step<4 ? <button disabled={busy||!active} onClick={next} className="rounded-lg bg-brand-500 px-3 py-2 font-semibold text-white">Continuar</button> : <button disabled={busy||!active} onClick={()=>save(true)} className="rounded-lg bg-navy-600 px-3 py-2 font-semibold text-white">Registrar correo preparado</button>}
        </footer>}
      </section>
    </div>}
  </>;
}
