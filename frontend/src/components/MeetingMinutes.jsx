import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from './AuthProvider';
import { FileText, Plus, Trash2, Upload, X, Loader2, Calendar, Users, ChevronDown } from 'lucide-react';

export default function MeetingMinutes({ channelId, onChange }) {
  const { user } = useAuthContext();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(true);

  // Form state
  const [form, setForm] = useState({ meeting_date: '', attendees: '', notes: '' });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (channelId) loadMeetings(); }, [channelId]);

  async function loadMeetings() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('channel_meetings')
        .select('*, profiles(full_name)')
        .eq('channel_id', channelId)
        .order('meeting_date', { ascending: false });
      setMeetings(data || []);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!form.meeting_date) { setError('La fecha de la reunión es obligatoria'); return; }
    setSaving(true);
    setError('');
    try {
      let file_url = null, file_name = null, file_size = null, file_type = null;

      // Upload file if selected
      if (file) {
        const ext = file.name.split('.').pop();
        const storagePath = `${channelId}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('meeting-documents').upload(storagePath, file);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('meeting-documents').getPublicUrl(storagePath);
        file_url = urlData.publicUrl;
        file_name = file.name;
        file_size = file.size;
        file_type = file.type;
      }

      const { error: insertError } = await supabase.from('channel_meetings').insert({
        channel_id: channelId,
        uploaded_by: user.id,
        meeting_date: form.meeting_date,
        attendees: form.attendees.trim() || null,
        notes: form.notes.trim() || null,
        file_url, file_name, file_size, file_type,
      });
      if (insertError) throw insertError;

      setForm({ meeting_date: '', attendees: '', notes: '' });
      setFile(null);
      setShowForm(false);
      loadMeetings();
      onChange?.();
    } catch (err) {
      setError(err.message || 'Error al guardar el acta');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(meeting) {
    if (!confirm('¿Eliminar esta acta?')) return;
    try {
      // Delete file from storage if exists
      if (meeting.file_url) {
        const path = meeting.file_url.split('/meeting-documents/')[1];
        if (path) {
          await supabase.storage.from('meeting-documents').remove([decodeURIComponent(path)]);
        }
      }
      await supabase.from('channel_meetings').delete().eq('id', meeting.id);
      loadMeetings();
      onChange?.();
    } catch (err) {
      console.error('Error al eliminar:', err);
    }
  }

  function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  const fieldClass = "w-full px-3 py-2.5 bg-white border border-surface-3 rounded-xl text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-500 transition-colors";

  return (
    <div className="bg-white border border-surface-3 rounded-2xl overflow-hidden mb-4">
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-surface-1 transition-colors">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-brand-500" />
          <span className="text-sm font-bold text-text-primary">Actas de reuniones</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-surface-2 text-text-muted">{meetings.length}</span>
        </div>
        <ChevronDown size={16} className={`text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          {/* Add button */}
          {!showForm && (
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-brand-500/10 hover:bg-brand-500/20 text-brand-500 text-xs font-semibold rounded-lg transition-colors mb-3">
              <Plus size={14} /> Nueva acta
            </button>
          )}

          {/* Form */}
          {showForm && (
            <div className="bg-surface-1 border border-surface-3 rounded-xl p-3 mb-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-text-primary">Nueva acta de reunión</span>
                <button onClick={() => { setShowForm(false); setError(''); }} className="text-text-muted hover:text-text-primary">
                  <X size={16} />
                </button>
              </div>

              {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 text-xs text-red-600">{error}</div>}

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Fecha de la reunión *</label>
                  <input type="date" value={form.meeting_date}
                    onChange={(e) => setForm(prev => ({ ...prev, meeting_date: e.target.value }))}
                    className={fieldClass} />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Asistentes</label>
                  <input type="text" value={form.attendees}
                    onChange={(e) => setForm(prev => ({ ...prev, attendees: e.target.value }))}
                    placeholder="Ej: Juan García, María López, Carlos Ruiz"
                    className={fieldClass} />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Notas / resumen</label>
                  <textarea value={form.notes}
                    onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Puntos tratados, acuerdos, próximos pasos..."
                    rows={3} className={`${fieldClass} resize-none`} />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Documento adjunto</label>
                  {file ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-white border border-surface-3 rounded-xl">
                      <FileText size={14} className="text-brand-500 flex-shrink-0" />
                      <span className="text-xs text-text-secondary truncate flex-1">{file.name}</span>
                      <span className="text-[10px] text-text-muted">{formatFileSize(file.size)}</span>
                      <button onClick={() => setFile(null)} className="text-text-muted hover:text-red-400"><X size={14} /></button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 px-3 py-3 border-2 border-dashed border-surface-3 rounded-xl cursor-pointer hover:border-brand-500 hover:bg-brand-500/5 transition-colors">
                      <Upload size={16} className="text-text-muted" />
                      <span className="text-xs text-text-muted">Adjuntar PDF, imagen o documento</span>
                      <input type="file" className="hidden"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif"
                        onChange={(e) => setFile(e.target.files?.[0] || null)} />
                    </label>
                  )}
                </div>

                <button onClick={handleSave} disabled={saving}
                  className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-colors">
                  {saving ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : 'Guardar acta'}
                </button>
              </div>
            </div>
          )}

          {/* List */}
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={16} className="animate-spin text-brand-400" />
            </div>
          ) : meetings.length === 0 && !showForm ? (
            <div className="text-center py-6 text-xs text-text-muted">
              Sin actas registradas
            </div>
          ) : (
            <div className="space-y-2">
              {meetings.map(m => (
                <div key={m.id} className="bg-surface-1 border border-surface-3 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar size={12} className="text-brand-500 flex-shrink-0" />
                        <span className="text-xs font-bold text-text-primary">
                          {new Date(m.meeting_date + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                      </div>
                      {m.attendees && (
                        <div className="flex items-center gap-1.5 mb-1">
                          <Users size={11} className="text-text-muted flex-shrink-0" />
                          <span className="text-[11px] text-text-secondary">{m.attendees}</span>
                        </div>
                      )}
                      {m.notes && (
                        <p className="text-[11px] text-text-secondary mt-1 whitespace-pre-line">{m.notes}</p>
                      )}
                      {m.file_url && (
                        <a href={m.file_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1.5 bg-brand-500/10 hover:bg-brand-500/20 text-brand-500 rounded-lg text-[11px] font-semibold transition-colors">
                          <FileText size={12} />
                          {m.file_name || 'Documento adjunto'}
                          {m.file_size ? ` (${formatFileSize(m.file_size)})` : ''}
                        </a>
                      )}
                      <div className="text-[10px] text-text-muted mt-1.5">
                        Subido por {m.profiles?.full_name || 'desconocido'}
                      </div>
                    </div>
                    <button onClick={() => handleDelete(m)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-text-muted hover:text-red-400 transition-colors flex-shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
