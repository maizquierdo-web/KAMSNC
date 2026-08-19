import { useEffect, useRef, useState } from 'react';
import { ExternalLink, FileText, Loader2, RefreshCw, Upload } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from './AuthProvider';

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function BusinessCase({ channelId }) {
  const { user } = useAuthContext();
  const inputRef = useRef(null);
  const [businessCase, setBusinessCase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (channelId) loadBusinessCase();
  }, [channelId]);

  async function loadBusinessCase() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('business_cases')
        .select('*')
        .eq('channel_id', channelId)
        .maybeSingle();

      if (error) throw error;
      setBusinessCase(data);
    } catch (error) {
      console.error('Error cargando Business Case:', error);
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
      console.error('Error abriendo Business Case:', error);
      alert('No se pudo abrir el Business Case: ' + error.message);
    } finally {
      setOpening(false);
    }
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file || !channelId || !user) return;

    setUploading(true);
    const storagePath = `${channelId}/${Date.now()}_${file.name}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from('business-cases')
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      const record = {
        channel_id: channelId,
        file_name: file.name,
        storage_path: storagePath,
        file_size: file.size,
        file_type: file.type,
        uploaded_by: user.id,
        updated_at: new Date().toISOString(),
      };

      const { data, error: saveError } = await supabase
        .from('business_cases')
        .upsert(record, { onConflict: 'channel_id' })
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
      console.error('Error adjuntando Business Case:', error);
      alert('No se pudo adjuntar el Business Case: ' + error.message);
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
      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
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
      <div className="bg-white border border-surface-3 rounded-xl p-4">
        <div className="text-center py-4">
          <FileText size={24} className="mx-auto mb-2 text-text-muted" />
          <p className="text-sm text-text-secondary mb-1">Business Case no adjuntado</p>
          <p className="text-xs text-text-muted mb-3">
            Adjunta el Business Case para centralizar la información económica y comercial del canal.
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-1.5"
          >
            {uploading ? (
              <><Loader2 size={14} className="animate-spin" /> Adjuntando...</>
            ) : (
              <><Upload size={14} /> Adjuntar Business Case</>
            )}
          </button>
          {fileInput}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-surface-3 rounded-xl p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
            <FileText size={19} className="text-brand-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-text-primary">Business Case</p>
            <p className="text-xs text-text-secondary truncate">{businessCase.file_name}</p>
            <p className="text-[10px] text-text-muted">
              {formatFileSize(businessCase.file_size)}
              {businessCase.updated_at && ` · Actualizado ${new Date(businessCase.updated_at).toLocaleDateString('es-ES')}`}
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
