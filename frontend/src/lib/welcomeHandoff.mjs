import { validEmail, welcomeAttachments, WELCOME_ROUTES } from './welcomePack.mjs';
import { createWelcomePackDocx } from './welcomePackDocx.mjs';

export function welcomeHandoffPlan(data) {
  const attachments = welcomeAttachments(data);
  const missing = attachments.filter(file => !file.available || file.key !== 'welcome' && !file.url);
  const contactsMissing = ['ot1Contact', 'ot2Contact', 'verifierContact'].some(key => !String(data[key] || '').trim()) || ['ot1Email', 'ot2Email', 'verifierEmail'].some(key => !validEmail(data[key]));
  const draft = missing.length > 0 || contactsMissing;
  const files = attachments.filter(file => file.key === 'welcome' || file.available && file.url)
    .map(file => ({ ...file, name: file.key === 'welcome' && draft ? 'BORRADOR_' + file.name : file.name }));
  return { files, missing, contactsMissing, draft };
}
export function welcomeDesktopEmail(data, sender) {
  const plan = welcomeHandoffPlan(data);
  return {
    subject: `${plan.draft ? '[PRUEBA] ' : ''}Welcome pack CAE · ${data.company}`,
    body: `Hola, ${data.contact}:\n\n${plan.draft ? 'Este mensaje es una prueba de preparación del welcome pack CAE. El documento adjunto es un borrador; la documentación operativa definitiva sigue pendiente.' : 'Os enviamos la documentación de bienvenida para comenzar la operativa CAE con Naturgy' + (data.route === 'promoter_ot' ? ' como Promotor + OT.' : '.')}\n\n${plan.draft ? 'Documento de prueba para revisar' : 'Adjuntamos'}:\n${plan.files.map(file => `• ${file.name}: ${file.description}.`).join('\n')}\n\nOs invitamos a revisar ${plan.files.length === 1 ? 'el documento' : 'los adjuntos'}${!plan.draft && data.route !== 'mask' ? ' y comprobar el acceso a Natureco antes de iniciar las primeras cargas' : ''}.${!plan.draft && data.route === 'promoter_ot' ? ' Consultad también el procedimiento específico de OCA antes de tramitar la preoferta.' : ''} Para cualquier duda, podéis contactar conmigo.\n\nUn saludo,\n${sender.name}\n${sender.email}`,
  };
}
// mailto delega en la aplicación configurada por el usuario. No puede fijar
// el remitente ni incorporar adjuntos, ni permite confirmar el envío.
export function buildWelcomeMailto({ recipient, subject, body = '' }) {
  const to = String(recipient || '').trim();
  if (!validEmail(to) || /[\r\n]/.test(to) || /[\r\n]/.test(String(subject || ''))) throw new Error('Dirección o asunto no válidos para abrir el correo.');
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;
}
export function welcomeMailtoHandoff(email, recipient, maxLength = 1800) {
  const full = buildWelcomeMailto({ ...email, recipient });
  // Umbral conservador: la capacidad efectiva depende del navegador y cliente.
  return full.length <= maxLength ? { url: full, copyBody: false }
    : { url: buildWelcomeMailto({ recipient, subject: email.subject }), copyBody: true };
}
export async function createWelcomeDownload(data) {
  const { default: JSZip } = await import('jszip');
  const plan = welcomeHandoffPlan(data);
  const zip = new JSZip();
  const word = await createWelcomePackDocx(data, { draft: plan.draft });
  zip.file(plan.files.find(file => file.key === 'welcome').name, await word.arrayBuffer());
  for (const file of plan.files.filter(file => file.key !== 'welcome')) {
    const response = await fetch(file.url);
    if (!response.ok) throw new Error(`No se pudo descargar ${file.name}. No se ha generado un pack incompleto.`);
    zip.file(file.name, await response.arrayBuffer());
  }
  const modality = WELCOME_ROUTES.find(route => route.value === data.route)?.label || data.route;
  zip.file('LEEME.txt', `Welcome pack · ${data.company}\nModalidad: ${modality}\n\nArchivos incluidos:\n${plan.files.map(file => '- ' + file.name).join('\n')}\n\n${plan.draft ? 'PRUEBA: pack incompleto. No utilizar como documentación operativa definitiva.\nPendientes: ' + plan.missing.map(file => file.name).join(', ') + (plan.contactsMissing ? '\nContactos de OT/verificadora pendientes.' : '') : 'Antes del envío, comprobar que los archivos y los datos son correctos.'}\n\nExtrae este ZIP y adjunta los archivos al correo. El CRM no puede adjuntarlos automáticamente ni verificar su envío. Comprueba la cuenta remitente en tu aplicación de correo.\n`);
  const name = plan.files.find(file => file.key === 'welcome').name.replace(/\.docx$/i, '.zip');
  return { blob: await zip.generateAsync({ type: 'blob' }), name, plan };
}

function mimeBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).match(/.{1,76}/g)?.join('\r\n') || '';
}
export async function createWelcomeEmailFile(data, email, sender) {
  const { default: JSZip } = await import('jszip');
  // Reutiliza la generación verificada: solo se incluyen documentos reales.
  const pack = await createWelcomeDownload(data);
  const zip = await JSZip.loadAsync(await pack.blob.arrayBuffer());
  const header = value => String(value || '').replace(/[\r\n]/g, ' ');
  if (!validEmail(data.recipient) || !validEmail(sender.email)) throw new Error('Revisa los correos de destino y remitente.');
  const encoded = value => '=?UTF-8?B?' + btoa(unescape(encodeURIComponent(header(value)))) + '?=';
  const boundary = 'welcome_' + crypto.randomUUID();
  const parts = [
    `From: ${header(sender.email)}`, `To: ${header(data.recipient)}`,
    `Subject: ${encoded(email.subject)}`, 'X-Unsent: 1', 'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64', '', mimeBase64(new TextEncoder().encode(email.body)),
  ];
  for (const file of pack.plan.files) {
    const bytes = await zip.file(file.name).async('uint8array');
    const fallback = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    parts.push(`--${boundary}`, 'Content-Type: application/octet-stream',
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      '', mimeBase64(bytes));
  }
  parts.push(`--${boundary}--`, '');
  return { blob: new Blob([parts.join('\r\n')], { type: 'message/rfc822' }), name: pack.name.replace(/\.zip$/i, '.eml') };
}
