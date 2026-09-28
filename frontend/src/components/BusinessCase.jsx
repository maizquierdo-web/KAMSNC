import { useEffect, useRef, useState } from 'react';
import { ExternalLink, FileText, Loader2, RefreshCw, Target, Upload } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from './AuthProvider';
import { extractMeetingDocumentText } from '../lib/meetingDocumentText';

const DOCUMENT_CONFIG = {
  business_case: {
    title: 'Business Case',
    missingTitle: 'Business Case no adjuntado',
    description: 'Adjunta el Business Case para centralizar la información económica y comercial del canal.',
    uploadLabel: 'Adjuntar Business Case',
    icon: FileText,
    accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx',
    requiresReadableText: false,
  },
  hunter_canvas: {
    title: 'Hunter Canvas',
    missingTitle: 'Hunter Canvas no adjuntado',
    description: 'Adjunta el Hunter Canvas para incorporar su contenido al análisis y a las recomendaciones de IA.',
    uploadLabel: 'Adjuntar Hunter Canvas',
    icon: Target,
    accept: '.pdf,.docx,.xls,.xlsx,.txt,.md,.csv',
    requiresReadableText: true,
  },
};

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function BusinessCase({ channelId, documentType = 'business_case' }) {
  const { user } = useAuthContext();
  const config = DOCUMENT_CONFIG[documentType] || DOCUMENT_CONFIG.business_case;
  const DocumentIcon = config.icon;
  const inputRef = useRef(null);
  const [businessCase, setBusinessCase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (channelId) loadBusinessCase();
  }, [channelId, documentType]);

  async function loadBusinessCase() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('business_cases')
        .select('*')
        .eq('channel_id', channelId)
        .eq('document_type', documentType)
        .maybeSingle();

      if (error) throw error;
      setBusinessCase(data);
    } catch (error) {
      console.error(`Error cargando ${config.title}:`, error);
    } finally {
      setLoading(false);
    }
  }

  async function openBusinessCase() {
    if (!businessCase?.storage_path) return;
    setOpening(true);
    try {
      const { data, error } = await supabase.storage
        .from('business-cases')
        .createSignedUrl(businessCase.storage_path, 60 * 10);

      if (error) throw error;
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error(`Error abriendo ${config.title}:`, error);
      alert(`No se pudo abrir el ${config.title}: ${error.message}`);
    } finally {
      setOpening(false);
    }
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file || !channelId || !user) return;

    setUploading(true);
    const extension = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const storagePath = `${channelId}/${documentType}/${Date.now()}.${extension}`;

    try {
      let extractedText = null;
      if (config.requiresReadableText) {
        const extracted = await extractMeetingDocumentText(file);
        extractedText = extracted.text?.trim() || '';
        if (!extracted.supported || !extractedText) {
          throw new Error('El archivo no contiene texto que la IA pueda leer. Usa un DOCX, XLSX, TXT o un PDF con texto seleccionable.');
        }
      }

      const { error: uploadError } = await supabase.storage
        .from('business-cases')
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      const record = {
        channel_id: channelId,
        document_type: documentType,
        file_name: file.name,
        storage_path: storagePath,
        file_size: file.size,
        file_type: file.type,
        uploaded_by: user.id,
        extracted_text: extractedText,
        updated_at: new Date().toISOString(),
      };

      const { data, error: saveError } = await supabase
        .from('business_cases')
        .upsert(record, { onConflict: 'channel_id,document_type' })
        .select()
        .single();

      if (saveError) {
        await supabase.storage.from('business-cases').remove([storagePath]);
        throw saveError;
      }

      if (businessCase?.storage_path && businessCase.storage_path !== storagePath) {
        const { error: removeError } = await supabase.storage
          .from('business-cases')
          .remove([businessCase.storage_path]);

        if (removeError) {
          console.warn('No se pudo eliminar el archivo sustituido:', removeError);
        }
      }

      setBusinessCase(data);
    } catch (error) {
      console.error(`Error adjuntando ${config.title}:`, error);
      alert(`No se pudo adjuntar el ${config.title}: ${error.message}`);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      onChange={handleUpload}
      className="hidden"
      accept={config.accept}
    />
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 size={18} className="animate-spin text-brand-400" />
      </div>
    );
  }

  if (!businessCase) {
    return (
      <div className="bg-white border border-surface-3 rounded-xl p-3.5">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:text-left">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-surface-1">
            <DocumentIcon size={19} className="text-text-muted" />
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-sm font-semibold text-text-secondary">{config.missingTitle}</p>
            <p className="mt-0.5 text-xs text-text-muted">
              {config.description}
            </p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
          >
            {uploading ? (
              <><Loader2 size={14} className="animate-spin" /> Adjuntando...</>
            ) : (
              <><Upload size={14} /> {config.uploadLabel}</>
            )}
          </button>
          {fileInput}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-surface-3 rounded-xl p-3.5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
            <DocumentIcon size={19} className="text-brand-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-text-primary">{config.title}</p>
            <p className="text-xs text-text-secondary truncate">{businessCase.file_name}</p>
            <p className="text-[10px] text-text-muted">
              {formatFileSize(businessCase.file_size)}
              {businessCase.updated_at && ` · Actualizado ${new Date(businessCase.updated_at).toLocaleDateString('es-ES')}`}
              {documentType === 'hunter_canvas' && businessCase.extracted_text && ' · Disponible para la IA'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={openBusinessCase}
            disabled={opening}
            className="px-3 py-2 bg-surface-2 hover:bg-surface-3 disabled:opacity-60 text-text-secondary text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5"
          >
            {opening ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}
            Abrir
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="px-3 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-1.5"
          >
            {uploading ? (
              <><Loader2 size={13} className="animate-spin" /> Sustituyendo...</>
            ) : (
              <><RefreshCw size={13} /> Sustituir</>
            )}
          </button>
          {fileInput}
        </div>
      </div>
    </div>
  );
}
