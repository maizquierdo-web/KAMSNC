import { WELCOME_ROUTES, WELCOME_VERSION, welcomeAttachments } from './welcomePack.mjs';
export async function createWelcomePackDocx(data, { draft = true } = {}) {
  const { patchDocument, PatchType, TextRun } = await import('docx');
  const response = await fetch(`${import.meta.env?.BASE_URL || '/'}welcome-pack/${data.route === 'mask' ? 'mask' : 'natureco'}.docx`);
  if (!response.ok) throw new Error('No se ha podido cargar la plantilla de welcome pack.');
  const contact = prefix => [data[`${prefix}Contact`], data[`${prefix}Email`]].filter(Boolean).join(' · ') || 'Contacto pendiente de confirmar';
  const values = {
    company: data.company, cif: data.cif, contact: data.contact, contact_details: `${data.recipient} · ${data.phone}`,
    start_date: data.startDate, kam: data.kamName, kam_details: `${data.kamEmail} · ${data.kamPhone}`,
    business_unit: 'Retail', kind: data.kind, route: WELCOME_ROUTES.find(r => r.value === data.route)?.label || '',
    sheets: data.sheets.join(' · '), ot1: data.ot1, ot2: data.ot2, verifier: data.verifier,
    ot1_contact: contact('ot1'), ot2_contact: contact('ot2'), verifier_contact: contact('verifier'),
    natureco_user: data.naturecoUser || 'Usuario pendiente de confirmar con el equipo de alta',
    operational: welcomeAttachments(data).slice(1).map(a => `${a.name}: ${a.description}${a.available ? '' : ' (documento pendiente de incorporar)'}.`).join('\n'),
    version: `${draft ? 'BORRADOR · NO ENVIAR AL CANAL · ' : ''}${WELCOME_VERSION}`,
  };
  return patchDocument({ outputType: 'blob', data: await response.arrayBuffer(), keepOriginalStyles: true,
    patches: Object.fromEntries(Object.entries(values).map(([key,value]) => [key, { type: PatchType.PARAGRAPH,
      children: String(value).split('\n').map((line,i) => new TextRun({ text: line, ...(i ? { break: 1 } : {}) })) }])) });
}
export function downloadWelcomeBlob(blob, name) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
