const MAX_EXTRACTED_CHARACTERS = 16000;
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const documentTextCache = new Map();

function compact(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_EXTRACTED_CHARACTERS);
}

export async function extractMeetingDocumentText(file) {
  if (!file) return { text: '', supported: false };
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (['txt', 'md', 'csv'].includes(extension)) {
    return { text: compact(await file.text()), supported: true };
  }

  if (extension === 'docx') {
    const mammoth = await import('mammoth/mammoth.browser');
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { text: compact(result.value), supported: true };
  }

  if (extension === 'pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => item.str).join(' '));
      if (pages.join(' ').length >= MAX_EXTRACTED_CHARACTERS) break;
    }
    return { text: compact(pages.join('\n')), supported: true };
  }

  if (['xlsx', 'xls'].includes(extension)) {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const text = workbook.SheetNames.map(name => `${name}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`).join('\n');
    return { text: compact(text), supported: true };
  }

  return {
    text: '',
    supported: false,
    reason: 'El contenido de este formato no puede leerse automáticamente. Las notas del acta sí se analizarán.',
  };
}

export async function extractMeetingDocumentTextFromUrl({ url, fileName, fileSize }, fetchImpl = fetch) {
  if (!url || !fileName) return { text: '', supported: false };
  if (fileSize && fileSize > MAX_DOCUMENT_BYTES) {
    return { text: '', supported: false, reason: 'El archivo supera el tamaño máximo de lectura automática.' };
  }

  const cached = documentTextCache.get(url);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`No se pudo descargar el acta (${response.status})`);
    const blob = await response.blob();
    if (blob.size > MAX_DOCUMENT_BYTES) {
      return { text: '', supported: false, reason: 'El archivo supera el tamaño máximo de lectura automática.' };
    }
    const fileLike = {
      name: fileName,
      text: () => blob.text(),
      arrayBuffer: () => blob.arrayBuffer(),
    };
    const extracted = await extractMeetingDocumentText(fileLike);
    documentTextCache.set(url, extracted);
    return extracted;
  } finally {
    clearTimeout(timeout);
  }
}
