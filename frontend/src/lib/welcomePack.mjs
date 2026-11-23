export const WELCOME_ROUTES = [
  { value: 'mask', label: 'Máscara / frontal / Smartfy' },
  { value: 'natureco', label: 'Natureco' },
  { value: 'promoter_ot', label: 'Natureco – Promotor + OT' },
];
export const WELCOME_SHEET_CODES = ['RES010', 'RES020', 'RES022', 'RES040', 'RES060', 'TRA050'];
export const WELCOME_VERSION = '2026-11-v1';
export const NATURECO_URL = 'https://environmental-markets.syntphony.com/login?alias=naturgy';
// Los documentos y contactos definitivos se incorporarán tras su validación.
// No se habilita ningún transporte de correo en esta primera entrega.
export const WELCOME_DOCUMENTS = {
  A: { name: 'Documento A', description: 'Preparación y carga mediante Máscara / frontal / Smartfy', available: false },
  B: { name: 'Documento B', description: 'Preparación y carga directa en Natureco', available: false },
  OCA: { name: 'Procedimiento de preoferta OCA', description: 'Documentación y pasos para gestionar la preoferta con OCA', available: false },
};
export function canPrepareWelcome(channel) {
  return channel?.status === 'activo' && (!channel.pipeline_stage || channel.pipeline_stage === 'active');
}
export function defaultAssignments(route, company) {
  return { ot1: route === 'mask' ? 'Sanwa' : route === 'promoter_ot' ? company : 'SinCO2', ot2: route === 'mask' ? 'Sanwa' : 'SinCO2', verifier: 'OCA' };
}
export function routeForChannel(channel) {
  if (['mascara', 'smartfy'].includes(channel.caes_platform)) return 'mask';
  if (channel.caes_platform === 'natureco') return channel.caes_role === 'promoter_ot' ? 'promoter_ot' : 'natureco';
  return '';
}
export function initialWelcome(channel, kam, classifications = []) {
  const saved = channel.welcome_pack_config || {};
  const route = saved.route || routeForChannel(channel);
  const names = { sinceo2: 'SinCO2', sinco2: 'SinCO2', e_program: 'E-PROGRAM', sanwa: 'Sanwa', oca: 'OCA', eqa: 'EQA', margube: 'MARGUBE' };
  const assignments = route ? defaultAssignments(route, channel.name) : { ot1: '', ot2: '', verifier: '' };
  const existingOffice = names[channel.caes_technical_office];
  const existingVerifier = names[channel.caes_verifier];
  if (existingOffice) assignments.ot1 = existingOffice;
  if (existingVerifier) assignments.verifier = existingVerifier;
  const detected = classifications.flatMap(c => [c.channel_classification?.tipo, c.channel_classification?.subcanal, c.custom_text])
    .flatMap(t => String(t || '').match(/\b[A-Z]{3}\d{3}\b/g) || []);
  return {
    company: channel.name || '', cif: channel.cif || '', contact: channel.contact_name || '', recipient: channel.email || '',
    phone: channel.phone || '', kamName: kam?.full_name || '', kamEmail: kam?.email || '', kamPhone: kam?.phone || '',
    startDate: '', kind: '', route, naturecoUser: '', businessUnit: 'Retail',
    ...assignments, ot1Email: '', ot1Contact: '', ot2Email: '', ot2Contact: '', verifierEmail: '', verifierContact: '',
    ...saved,
    sheets: channel.caes_assigned_sheets?.length ? channel.caes_assigned_sheets : saved.sheets || [...new Set(detected)],
    // El destinatario de cada envío se confirma de nuevo, aunque haya borrador.
    recipientConfirmed: false,
    exception: saved.exception ?? Boolean(route && (existingOffice && existingOffice !== defaultAssignments(route, channel.name).ot1 || existingVerifier && existingVerifier !== 'OCA')),
  };
}
export function welcomeAttachments(data) {
  const safe = (data.company || 'canal').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 70);
  const keys = data.route === 'mask' ? ['A'] : data.route === 'promoter_ot' ? ['B', 'OCA'] : data.route === 'natureco' ? ['B'] : [];
  return [{ key: 'welcome', name: `Welcome_Pack_${safe}.docx`, description: 'Datos del partner, configuración de arranque e interlocutores', available: true }, ...keys.map(key => ({ key, ...WELCOME_DOCUMENTS[key] }))];
}
export const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
export function welcomeErrors(data, senderEmail, step = 0) {
  const errors = [];
  if (!step || step === 1) {
    if (!validEmail(senderEmail)) errors.push('No se ha podido recuperar un correo válido del usuario del CRM.');
    if (!data.contact.trim()) errors.push('Persona destinataria');
    if (!validEmail(data.recipient)) errors.push('Correo válido del destinatario');
    if (!data.recipientConfirmed) errors.push('Confirmación del destinatario');
  }
  if (!step || step === 2) {
    for (const [key, label] of [['company','Razón social'],['cif','CIF'],['phone','Teléfono del contacto'],['kamName','KAM asignado'],['kamPhone','Teléfono del KAM'],['startDate','Fecha prevista de inicio']]) if (!String(data[key] || '').trim()) errors.push(label);
    if (!validEmail(data.kamEmail)) errors.push('Correo válido del KAM');
    if (!data.sheets?.length || data.sheets.some(code => !/^[A-Z]{3}\d{3}$/.test(code))) errors.push('Al menos una ficha CAE con código válido');
  }
  if (!step || step === 3) {
    if (!WELCOME_ROUTES.some(x => x.value === data.route)) errors.push('Canal de entrada');
    if (!['Agregador', 'Facilitador'].includes(data.kind)) errors.push('Tipo de canal');
    for (const [key,label] of [['ot1','OT1'],['ot2','OT2'],['verifier','Verificadora']]) if (!String(data[key] || '').trim()) errors.push(label);
    for (const key of ['ot1Email','ot2Email','verifierEmail']) if (data[key] && !validEmail(data[key])) errors.push(`Correo válido de ${key.replace('Email', '')}`);
    if (data.exception && !data.exceptionReason?.trim()) errors.push('Motivo de la asignación excepcional');
  }
  return errors;
}
export function welcomeEmail(data, sender) {
  const attachments = welcomeAttachments(data);
  return { subject: `Welcome pack CAE · ${data.company}`, body: `Hola, ${data.contact}:\n\nOs enviamos la documentación de bienvenida para comenzar la operativa CAE con Naturgy${data.route === 'promoter_ot' ? ' como Promotor + OT' : ''}.\n\nAdjuntamos:\n${attachments.map(a => `• ${a.name}: ${a.description}.`).join('\n')}\n\nOs invitamos a revisar los adjuntos${data.route === 'mask' ? ' antes de iniciar las primeras cargas' : ' y comprobar el acceso a Natureco antes de iniciar las primeras cargas'}.${data.route === 'promoter_ot' ? ' Consultad también el procedimiento específico de OCA antes de tramitar la preoferta.' : ''} Para cualquier duda durante el arranque, podéis contactar conmigo.\n\nUn saludo,\n${sender.name}\n${sender.email}` };
}
export function welcomeSendBlockers(data) {
  return [
    ...welcomeAttachments(data).filter(a => !a.available).map(a => `Falta incorporar ${a.name}`),
    ...[['ot1Email','Contacto de OT1'],['ot2Email','Contacto de OT2'],['verifierEmail','Contacto de verificadora']].filter(([key]) => !validEmail(data[key])).map(([,label]) => `${label} pendiente`),
    'Cuenta de correo del usuario todavía no conectada para enviar desde el CRM',
  ];
}
