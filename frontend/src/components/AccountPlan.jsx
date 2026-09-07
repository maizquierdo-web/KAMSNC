import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../components/AuthProvider';
import {
  Loader2, Plus, Check, X, Target, Edit3, FileText,
  Calendar, ChevronDown, ChevronUp, Trash2, Upload, Download, Paperclip
} from 'lucide-react';

const ACTION_STATUS = {
  pending: { label: 'Pendiente', bg: 'bg-gray-100', text: 'text-gray-500', dot: 'bg-gray-400' },
  in_progress: { label: 'En curso', bg: 'bg-navy-50', text: 'text-navy-600', dot: 'bg-navy-500' },
  completed: { label: 'Completada', bg: 'bg-green-50', text: 'text-green-600', dot: 'bg-green-500' },
  cancelled: { label: 'Cancelada', bg: 'bg-red-50', text: 'text-red-500', dot: 'bg-red-400' },
};

const PLAN_STATUS = {
  draft: { label: 'Borrador', color: 'text-gray-500', bg: 'bg-gray-100' },
  active: { label: 'Activo', color: 'text-green-600', bg: 'bg-green-50' },
  completed: { label: 'Completado', color: 'text-green-600', bg: 'bg-green-50' },
  cancelled: { label: 'Cancelado', color: 'text-red-500', bg: 'bg-red-50' },
};

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ============ ACTION ITEM ============
function ActionItem({ action, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(action.title);
  const [dueDate, setDueDate] = useState(action.due_date || '');
  const status = ACTION_STATUS[action.status] || ACTION_STATUS.pending;
  const isOverdue = action.due_date && new Date(action.due_date) < new Date() && action.status === 'pending';

  async function cycleStatus() {
    const order = ['pending', 'in_progress', 'completed'];
    const current = order.indexOf(action.status);
    const next = order[(current + 1) % order.length];
    await onUpdate(action.id, {
      status: next,
      completed_at: next === 'completed' ? new Date().toISOString() : null,
    });
  }

  async function saveEdit() {
    await onUpdate(action.id, { title, due_date: dueDate || null });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex gap-2 p-2 bg-surface-2 rounded-lg">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
          className="flex-1 px-2 py-1.5 bg-white border border-surface-3 rounded-lg text-sm focus:outline-none focus:border-brand-500" autoFocus />
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
          className="px-2 py-1.5 bg-white border border-surface-3 rounded-lg text-xs w-32 focus:outline-none focus:border-brand-500" />
        <button onClick={saveEdit} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><Check size={14} /></button>
        <button onClick={() => setEditing(false)} className="p-1.5 text-text-muted hover:bg-surface-2 rounded-lg"><X size={14} /></button>
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-2.5 p-2.5 rounded-lg group transition-colors ${
      action.status === 'completed' ? 'opacity-60' : ''
    } ${isOverdue ? 'bg-red-50' : 'hover:bg-surface-2'}`}>
      <button onClick={cycleStatus}
        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
          action.status === 'completed' ? 'bg-green-500 border-green-500'
            : action.status === 'in_progress' ? 'border-navy-400 bg-navy-50'
            : 'border-surface-4 hover:border-brand-400'
        }`}>
        {action.status === 'completed' && <Check size={11} className="text-white" strokeWidth={3} />}
        {action.status === 'in_progress' && <div className="w-2 h-2 rounded-sm bg-navy-500" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className={`text-sm ${action.status === 'completed' ? 'line-through text-text-muted' : 'text-text-primary'}`}>{action.title}</div>
        {action.due_date && (
          <div className={`text-[10px] mt-0.5 flex items-center gap-1 ${isOverdue ? 'text-red-500 font-semibold' : 'text-text-muted'}`}>
            <Calendar size={10} />
            {new Date(action.due_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
            {isOverdue && ' · Vencida'}
          </div>
        )}
      </div>
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button onClick={() => setEditing(true)} className="p-1 text-text-muted hover:text-text-primary rounded"><Edit3 size={12} /></button>
        <button onClick={() => onDelete(action.id)} className="p-1 text-text-muted hover:text-red-500 rounded"><Trash2 size={12} /></button>
      </div>
    </div>
  );
}

// ============ DOCUMENT ITEM ============
function DocumentItem({ doc, onDelete }) {
  const ext = doc.file_name.split('.').pop()?.toLowerCase() || '';
  const iconColor = ['pdf'].includes(ext) ? 'text-red-500' : ['doc', 'docx'].includes(ext) ? 'text-blue-600' : ['xls', 'xlsx'].includes(ext) ? 'text-green-600' : 'text-text-secondary';

  return (
    <div className="flex items-center gap-2.5 p-2.5 bg-surface-2 rounded-lg group">
      <FileText size={16} className={`${iconColor} flex-shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-text-primary truncate">{doc.file_name}</div>
        <div className="text-[10px] text-text-muted">
          {formatFileSize(doc.file_size)} · {new Date(doc.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
        </div>
      </div>
      <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
        className="p-1.5 text-text-muted hover:text-brand-500 rounded-lg transition-colors">
        <Download size={13} />
      </a>
      <button onClick={() => onDelete(doc.id, doc.file_url)}
        className="p-1.5 text-text-muted hover:text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ============ MAIN COMPONENT ============
export default function AccountPlan({ channelId, channelName }) {
  const { user } = useAuthContext();
  const [plan, setPlan] = useState(null);
  const [actions, setActions] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [newAction, setNewAction] = useState('');
  const [expanded, setExpanded] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [objective, setObjective] = useState('');
  const [strategy, setStrategy] = useState('');
  const [reviewDate, setReviewDate] = useState('');
  const [completionPct, setCompletionPct] = useState(0);

  const currentYear = new Date().getFullYear();

  useEffect(() => { if (channelId) loadPlan(); }, [channelId]);

  async function loadPlan() {
    setLoading(true);
    try {
      const { data: planData } = await supabase
        .from('account_plans').select('*')
        .eq('channel_id', channelId).eq('year', currentYear).single();

      if (planData) {
        setPlan(planData);
        setObjective(planData.objective || '');
        setStrategy(planData.strategy || '');
        setReviewDate(planData.review_date || '');
        setCompletionPct(planData.completion_pct || 0);

        const [actionsRes, docsRes] = await Promise.all([
          supabase.from('account_plan_actions').select('*')
            .eq('plan_id', planData.id).order('sort_order').order('created_at'),
          supabase.from('account_plan_documents').select('*')
            .eq('plan_id', planData.id).order('created_at', { ascending: false }),
        ]);

        setActions(actionsRes.data || []);
        setDocuments(docsRes.data || []);
      }
    } catch (err) {
      // No plan yet
    } finally {
      setLoading(false);
    }
  }

  async function createPlan() {
    try {
      const { data, error } = await supabase.from('account_plans').insert({
        channel_id: channelId, kam_id: user.id, year: currentYear,
        objective: '', strategy: '', status: 'draft', completion_pct: 0,
      }).select().single();
      if (error) throw error;
      setPlan(data);
      setEditing(true);
    } catch (err) { console.error('Error creando plan:', err); }
  }

  async function savePlan() {
    try {
      const { error } = await supabase.from('account_plans').update({
        objective, strategy,
        review_date: reviewDate || null,
        completion_pct: completionPct,
        status: plan.status === 'draft' ? 'active' : plan.status,
      }).eq('id', plan.id);
      if (error) throw error;
      setPlan(prev => ({
        ...prev, objective, strategy,
        review_date: reviewDate || null,
        completion_pct: completionPct,
        status: prev.status === 'draft' ? 'active' : prev.status,
      }));
      setEditing(false);
    } catch (err) { console.error('Error guardando plan:', err); }
  }

  async function addAction() {
    if (!newAction.trim() || !plan) return;
    try {
      const { data, error } = await supabase.from('account_plan_actions').insert({
        plan_id: plan.id, title: newAction.trim(), sort_order: actions.length,
      }).select().single();
      if (error) throw error;
      setActions(prev => [...prev, data]);
      setNewAction('');
    } catch (err) { console.error(err); }
  }

  async function updateAction(actionId, updates) {
    try {
      const { error } = await supabase.from('account_plan_actions').update(updates).eq('id', actionId);
      if (error) throw error;
      setActions(prev => prev.map(a => a.id === actionId ? { ...a, ...updates } : a));
    } catch (err) { console.error(err); }
  }

  async function deleteAction(actionId) {
    try {
      await supabase.from('account_plan_actions').delete().eq('id', actionId);
      setActions(prev => prev.filter(a => a.id !== actionId));
    } catch (err) { console.error(err); }
  }

  // ---- Document functions ----
  async function handleDocUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !plan) return;

    setUploading(true);
    try {
      const fileName = `${plan.id}/${Date.now()}_${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('plan-documents').upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('plan-documents').getPublicUrl(fileName);

      const { data: docData, error: docError } = await supabase.from('account_plan_documents').insert({
        plan_id: plan.id,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_size: file.size,
        file_type: file.type,
        uploaded_by: user.id,
      }).select().single();

      if (docError) throw docError;
      setDocuments(prev => [docData, ...prev]);
    } catch (err) {
      console.error('Error subiendo documento:', err);
      alert('Error al subir el documento: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function deleteDocument(docId, fileUrl) {
    try {
      // Extract path from URL for storage deletion
      const path = fileUrl.split('/plan-documents/')[1];
      if (path) {
        await supabase.storage.from('plan-documents').remove([decodeURIComponent(path)]);
      }
      await supabase.from('account_plan_documents').delete().eq('id', docId);
      setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch (err) { console.error(err); }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-6"><Loader2 size={18} className="animate-spin text-brand-400" /></div>;
  }

  if (!plan) {
    return (
      <div className="bg-white border border-surface-3 rounded-xl p-4">
        <div className="text-center py-4">
          <Target size={24} className="mx-auto mb-2 text-text-muted" />
          <p className="text-sm text-text-secondary mb-1">Sin plan de cuenta para {currentYear}</p>
          <p className="text-xs text-text-muted mb-3">Define objetivos y acciones para desarrollar este canal</p>
          <button onClick={createPlan}
            className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-1.5">
            <Plus size={14} /> Crear plan {currentYear}
          </button>
        </div>
      </div>
    );
  }

  const actionCompletedCount = actions.filter(a => a.status === 'completed').length;
  const actionProgressPct = actions.length > 0 ? Math.round((actionCompletedCount / actions.length) * 100) : 0;
  const planStatus = PLAN_STATUS[plan.status] || PLAN_STATUS.draft;
  const displayPct = plan.completion_pct || 0;

  return (
    <div className="bg-white border border-surface-3 rounded-xl overflow-hidden">
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-surface-1 transition-colors">
        <div className="flex items-center gap-2.5">
          <Target size={16} className="text-brand-500" />
          <span className="text-sm font-bold text-text-primary">Plan de cuenta {currentYear}</span>
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${planStatus.bg} ${planStatus.color}`}>
            {planStatus.label}
          </span>
          {displayPct > 0 && (
            <span className="text-[10px] font-bold text-brand-500">{displayPct}%</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {documents.length > 0 && (
            <span className="text-[10px] text-text-muted flex items-center gap-1">
              <Paperclip size={10} /> {documents.length}
            </span>
          )}
          {actions.length > 0 && (
            <span className="text-[10px] text-text-secondary font-semibold">
              {actionCompletedCount}/{actions.length} acciones
            </span>
          )}
          {expanded ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-surface-3 pt-3">

          {/* % Cumplimiento */}
          <div className="mb-4">
            <div className="flex justify-between items-center text-[10px] text-text-muted mb-1">
              <span className="font-bold uppercase tracking-wider">Cumplimiento del plan</span>
              <span className="text-sm font-extrabold text-brand-500">{displayPct}%</span>
            </div>
            <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  displayPct >= 80 ? 'bg-green-500' : displayPct >= 50 ? 'bg-brand-500' : displayPct > 0 ? 'bg-amber-500' : 'bg-surface-3'
                }`}
                style={{ width: `${displayPct}%` }}
              />
            </div>
          </div>

          {/* Objetivo y estrategia */}
          {editing ? (
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Objetivo anual</label>
                <textarea value={objective} onChange={(e) => setObjective(e.target.value)}
                  placeholder="¿Qué quieres conseguir con este canal este año?"
                  rows={2} className="w-full px-3 py-2 bg-surface-1 border border-surface-3 rounded-lg text-sm resize-none focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Estrategia</label>
                <textarea value={strategy} onChange={(e) => setStrategy(e.target.value)}
                  placeholder="¿Cómo vas a conseguirlo? Enfoque, palancas clave..."
                  rows={2} className="w-full px-3 py-2 bg-surface-1 border border-surface-3 rounded-lg text-sm resize-none focus:outline-none focus:border-brand-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">% Cumplimiento</label>
                  <div className="flex items-center gap-2">
                    <input type="range" min="0" max="100" step="5" value={completionPct}
                      onChange={(e) => setCompletionPct(parseInt(e.target.value))}
                      className="flex-1 h-1.5 accent-brand-500" />
                    <span className="text-sm font-bold text-brand-500 w-10 text-right">{completionPct}%</span>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Próxima revisión</label>
                  <input type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-1 border border-surface-3 rounded-lg text-sm focus:outline-none focus:border-brand-500" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={savePlan}
                  className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-1">
                  <Check size={12} /> Guardar
                </button>
                <button onClick={() => { setEditing(false); setObjective(plan.objective || ''); setStrategy(plan.strategy || ''); setReviewDate(plan.review_date || ''); setCompletionPct(plan.completion_pct || 0); }}
                  className="px-4 py-2 text-text-secondary text-xs font-semibold hover:text-text-primary transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-4">
              {(plan.objective || plan.strategy) ? (
                <div className="space-y-2">
                  {plan.objective && (
                    <div className="p-2.5 bg-surface-1 rounded-lg">
                      <div className="text-[9px] font-bold text-text-muted uppercase tracking-wider mb-0.5">Objetivo</div>
                      <p className="text-xs text-text-primary leading-relaxed">{plan.objective}</p>
                    </div>
                  )}
                  {plan.strategy && (
                    <div className="p-2.5 bg-surface-1 rounded-lg">
                      <div className="text-[9px] font-bold text-text-muted uppercase tracking-wider mb-0.5">Estrategia</div>
                      <p className="text-xs text-text-secondary leading-relaxed">{plan.strategy}</p>
                    </div>
                  )}
                  {plan.review_date && (
                    <div className="text-[10px] text-text-muted flex items-center gap-1">
                      <Calendar size={10} />
                      Revisión: {new Date(plan.review_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-text-muted italic">Sin objetivo ni estrategia definidos</p>
              )}
              <button onClick={() => setEditing(true)}
                className="mt-2 text-[11px] text-brand-500 font-semibold hover:text-brand-600 transition-colors inline-flex items-center gap-1">
                <Edit3 size={11} /> Editar objetivo y estrategia
              </button>
            </div>
          )}

          {/* Acciones */}
          <div className="mb-4">
            <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
              Acciones clave
              {actions.length > 0 && (
                <span className="ml-2 text-text-secondary normal-case">({actionCompletedCount}/{actions.length} completadas)</span>
              )}
            </div>
            <div className="space-y-0.5 mb-3">
              {actions.map(action => (
                <ActionItem key={action.id} action={action} onUpdate={updateAction} onDelete={deleteAction} />
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" value={newAction} onChange={(e) => setNewAction(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addAction()}
                placeholder="Nueva acción..."
                className="flex-1 px-3 py-2 bg-surface-1 border border-surface-3 rounded-lg text-sm placeholder-text-muted focus:outline-none focus:border-brand-500 transition-colors" />
              <button onClick={addAction} disabled={!newAction.trim()}
                className="px-3 py-2 bg-surface-3 hover:bg-surface-4 disabled:opacity-30 text-text-primary rounded-lg transition-colors">
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Documentos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                <Paperclip size={10} />
                Documentos
                {documents.length > 0 && <span className="text-text-secondary normal-case">({documents.length})</span>}
              </div>
              <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg cursor-pointer transition-colors ${
                uploading ? 'bg-surface-2 text-text-muted' : 'bg-surface-2 text-brand-500 hover:bg-surface-3'
              }`}>
                {uploading ? (
                  <><Loader2 size={12} className="animate-spin" /> Subiendo...</>
                ) : (
                  <><Upload size={12} /> Subir archivo</>
                )}
                <input type="file" onChange={handleDocUpload} className="hidden" disabled={uploading}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png" />
              </label>
            </div>

            {documents.length === 0 ? (
              <div className="text-center py-4 bg-surface-1 rounded-lg border border-dashed border-surface-3">
                <FileText size={18} className="mx-auto mb-1.5 text-text-muted" />
                <p className="text-[11px] text-text-muted">Sin documentos adjuntos</p>
                <p className="text-[10px] text-text-muted mt-0.5">PDF, Word, Excel, imágenes...</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {documents.map(doc => (
                  <DocumentItem key={doc.id} doc={doc} onDelete={deleteDocument} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
