import { EVIDENCE_LABELS } from './hunterCanvas.mjs';

export async function createHunterDocx({ draft, name, date, kind }) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
  const p = (text, options = {}) => new Paragraph({ children: [new TextRun(text)], spacing: { after: 110 }, ...options });
  const paragraphs = [
    p(kind === 'meeting' ? 'Preparación de reunión' : 'Hunter Canvas', { heading: HeadingLevel.TITLE }),
    p(name, { heading: HeadingLevel.HEADING_1 }),
    p(`Naturgy Captación · ${date} · Elaborado con asistencia de IA`),
    p('Documento revisable. Las hipótesis y los datos pendientes requieren validación del KAM.'),
    p(draft.summary),
  ];
  draft.sections.forEach((section, index) => {
    paragraphs.push(p(`${index + 1}. ${section.title}`, { heading: HeadingLevel.HEADING_1, keepNext: true }));
    section.items.forEach(item => {
      paragraphs.push(new Paragraph({ spacing: { after: 70 }, children: [
        new TextRun({ text: `${EVIDENCE_LABELS[item.kind]}  `, bold: true }), new TextRun(item.text),
      ] }));
      paragraphs.push(p(`Fuente: ${item.source}`, { spacing: { after: 150 }, style: 'Source' }));
    });
  });
  const doc = new Document({
    creator: 'KAMSNC', title: `${kind === 'meeting' ? 'Preparación de reunión' : 'Hunter Canvas'} ${name}`,
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22, color: '202438' }, paragraph: { spacing: { line: 276 } } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { size: 38, bold: true, color: '000000' }, paragraph: { spacing: { after: 160 } } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', run: { size: 26, bold: true, color: '000000' }, paragraph: { spacing: { before: 220, after: 100 }, keepNext: true } },
        { id: 'Source', name: 'Source', basedOn: 'Normal', run: { size: 18, color: '596175' } },
      ],
    },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1000, bottom: 1000, left: 1050, right: 1050 } } }, children: paragraphs }],
  });
  return Packer.toBlob(doc);
}

export function hunterFileName(name, date, kind) {
  const safe = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 70) || 'canal';
  return `${kind === 'meeting' ? 'Preparacion_reunion' : 'Hunter_Canvas'}_${safe}_${date}.docx`;
}
