import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../components/AuthProvider';
import {
  UserPlus, Users, Shield, Trash2, X, Check, Loader2,
  AlertCircle, Edit3, Mail, MapPin, ChevronDown
} from 'lucide-react';
import { BENCHMARK_PROFILE_LABELS, BENCHMARK_PROFILE_OPTIONS } from '../lib/benchmarkProfiles';

const ROLE_OPTIONS = [
  { value: 'kam', label: 'KAM' },
  { value: 'coordinator', label: 'Coordinador' },
  { value: 'manager', label: 'Manager' },
  { value: 'director', label: 'Director' },
];

const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS.map(r => [r.value, r.label]));

// ============ FORMULARIO DE ALTA ============
function InviteUserForm({ onInvited, allUsers }) {
  const [form, setForm] = useState({
    email: '', full_name: '', role: 'kam', zone: '', reports_to: '', phone: '', password: '', benchmark_profile: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  // Posibles managers/directores a los que reportar (cualquiera con rol
  // coordinator/manager/director, no tiene sentido reportar a un kam)
  const possibleManagers = allUsers.filter(u => ['coordinator', 'manager', 'director'].includes(u.role));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!form.email.trim() || !form.full_name.trim()) {
      setError('Email y nombre completo son obligatorios');
      return;
    }
    if (!form.password || form.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setSaving(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('manage-users', {
        body: {
          action: 'invite_user',
          email: form.email.trim(),
          full_name: form.full_name.trim(),
          role: form.role,
          zone: form.zone.trim() || null,
          reports_to: form.reports_to || null,
          phone: form.phone.trim() || null,
          password: form.password,
        },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      const { data: updatedProfile, error: profileError } = await supabase.from('profiles')
        .update({ benchmark_profile: form.benchmark_profile || null })
        .ilike('email', form.email.trim())
        .select('id')
        .maybeSingle();
      if (profileError) throw profileError;
      if (!updatedProfile) throw new Error('El usuario se ha creado, pero no se pudo asignar su perfil Benchmark. Edítalo desde la lista de usuarios.');

      setSuccess(`Usuario ${form.full_name} creado correctamente. Ya puede acceder al CRM con su email y la contraseña que le has asignado.`);
      setForm({ email: '', full_name: '', role: 'kam', zone: '', reports_to: '', phone: '', password: '', benchmark_profile: '' });
      onInvited();
    } catch (err) {
      setError(err.message || 'Error al crear el usuario');
    } finally {
      setSaving(false);
    }
  }

  const fieldClass = "w-full px-3 py-2.5 bg-white border border-surface-3 rounded-xl text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-500 transition-colors";

  return (
    <div className="bg-surface-1 border border-surface-3 rounded-2xl p-4 mb-5">
      <div className="flex items-center gap-2 mb-4">
        <UserPlus size={18} className="text-brand-500" />
        <h2 className="text-base font-bold text-text-primary">Crear nuevo usuario</h2>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mb-3 text-sm text-red-600">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />{error}
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 mb-3 text-sm text-green-700">
          <Check size={15} className="flex-shrink-0 mt-0.5" />{success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Nombre completo *</label>
            <input type="text" value={form.full_name} onChange={(e) => update('full_name', e.target.value)}
              placeholder="Nombre y apellidos" className={fieldClass} required />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Email *</label>
            <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)}
              placeholder="usuario@naturgy.com" className={fieldClass} required />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Perfil Benchmark</label>
          <select value={form.benchmark_profile} onChange={(e) => update('benchmark_profile', e.target.value)} className={fieldClass}>
            {BENCHMARK_PROFILE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Rol *</label>
            <select value={form.role} onChange={(e) => update('role', e.target.value)} className={fieldClass}>
              {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Zona</label>
            <input type="text" value={form.zone} onChange={(e) => update('zone', e.target.value)}
              placeholder="Ej. Norte, Levante..." className={fieldClass} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Reporta a</label>
            <select value={form.reports_to} onChange={(e) => update('reports_to', e.target.value)} className={fieldClass}>
              <option value="">Sin asignar</option>
              {possibleManagers.map(m => (
                <option key={m.id} value={m.id}>{m.full_name} ({ROLE_LABELS[m.role]})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Teléfono</label>
            <input type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)}
              placeholder="+34 600 000 000" className={fieldClass} />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Contraseña temporal *</label>
          <input type="text" value={form.password} onChange={(e) => update('password', e.target.value)}
            placeholder="Mínimo 6 caracteres" className={fieldClass} required />
          <p className="text-[10px] text-text-muted mt-1">Comunícasela al usuario por un canal seguro. Podrá cambiarla después desde su perfil.</p>
        </div>

        <button type="submit" disabled={saving}
          className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
          {saving ? <><Loader2 size={16} className="animate-spin" /> Creando usuario...</> : <><UserPlus size={16} /> Crear usuario</>}
        </button>
      </form>
    </div>
  );
}

// ============ FILA DE USUARIO (con edición inline) ============
function UserRow({ user: u, allUsers, onUpdated, onDeactivated, currentUserId }) {
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ role: u.role, zone: u.zone || '', reports_to: u.reports_to || '', phone: u.phone || '', benchmark_profile: u.benchmark_profile || '' });
  const [saving, setSaving] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [rowError, setRowError] = useState('');
  const [showResetPwd, setShowResetPwd] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [mfaResetting, setMfaResetting] = useState(false);

  const possibleManagers = allUsers.filter(other => other.id !== u.id && ['coordinator', 'manager', 'director'].includes(other.role));
  const managerName = allUsers.find(other => other.id === u.reports_to)?.full_name;

  function startEdit() {
    setEditForm({ role: u.role, zone: u.zone || '', reports_to: u.reports_to || '', phone: u.phone || '', benchmark_profile: u.benchmark_profile || '' });
    setEditing(true);
    setRowError('');
  }

  async function saveEdit() {
    setSaving(true);
    setRowError('');
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          role: editForm.role,
          zone: editForm.zone || null,
          reports_to: editForm.reports_to || null,
          phone: editForm.phone || null,
          benchmark_profile: editForm.benchmark_profile || null,
        })
        .eq('id', u.id);
      if (error) throw error;
      onUpdated();
      setEditing(false);
    } catch (err) {
      setRowError(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  const fieldClass = "px-2.5 py-1.5 bg-white border border-surface-3 rounded-lg text-xs focus:outline-none focus:border-brand-500";

  async function reactivateUser() {
    setSaving(true);
    setRowError('');
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: true })
        .eq('id', u.id);
      if (error) throw error;
      onUpdated();
      setEditing(false);
    } catch (err) {
      setRowError(err.message || 'Error al reactivar');
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword() {
    if (!newPassword || newPassword.length < 6) {
      setRowError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    setSaving(true);
    setRowError('');
    setResetSuccess('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('manage-users', {
        body: { action: 'reset_password', user_id: u.id, new_password: newPassword },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setResetSuccess('Contraseña cambiada correctamente');
      setNewPassword('');
      setShowResetPwd(false);
    } catch (err) {
      setRowError(err.message || 'Error al cambiar contraseña');
    } finally {
      setSaving(false);
    }
  }

  async function resetMfa() {
    setMfaResetting(true);
    setRowError('');
    setResetSuccess('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('manage-users', {
        body: { action: 'reset_mfa', user_id: u.id },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setResetSuccess('MFA reseteado. En su próximo login le saldrá el QR para configurarlo de nuevo.');
    } catch (err) {
      setRowError(err.message || 'Error al resetear MFA');
    } finally {
      setMfaResetting(false);
    }
  }

  if (editing) {
    return (
      <div className="bg-surface-1 border border-brand-300 rounded-xl p-3 mb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-text-primary">{u.full_name}</span>
          <button onClick={() => setEditing(false)} className="text-text-muted hover:text-text-primary"><X size={16} /></button>
        </div>
        {rowError && <div className="text-xs text-red-600 mb-2">{rowError}</div>}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <select value={editForm.role} onChange={(e) => setEditForm(prev => ({ ...prev, role: e.target.value }))} className={fieldClass}>
            {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <input type="text" value={editForm.zone} onChange={(e) => setEditForm(prev => ({ ...prev, zone: e.target.value }))}
            placeholder="Zona" className={fieldClass} />
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <select value={editForm.reports_to} onChange={(e) => setEditForm(prev => ({ ...prev, reports_to: e.target.value }))} className={fieldClass}>
            <option value="">Sin asignar</option>
            {possibleManagers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
          <input type="tel" value={editForm.phone} onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
            placeholder="Teléfono" className={fieldClass} />
        </div>
        <div className="mb-3">
          <select value={editForm.benchmark_profile} onChange={(e) => setEditForm(prev => ({ ...prev, benchmark_profile: e.target.value }))} className={`${fieldClass} w-full`}>
            {BENCHMARK_PROFILE_OPTIONS.map(option => <option key={option.value} value={option.value}>Benchmark · {option.label}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={saveEdit} disabled={saving}
            className="flex-1 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Guardar cambios
          </button>
          {u.is_active === false && (
            <button onClick={reactivateUser} disabled={saving}
              className="py-2 px-3 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5">
              Reactivar
            </button>
          )}
        </div>
        {u.is_active === false && (
          <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-700">
            Al reactivar, el usuario podrá volver a acceder al CRM, pero sus canales no se restauran automáticamente — fueron reasignados durante la baja. Tendrás que asignarle canales manualmente desde la pantalla de Canales → Reasignar.
          </div>
        )}
        {u.id !== currentUserId && (
          <div className="mt-2">
            {resetSuccess && (
              <div className="flex items-center gap-1.5 text-[11px] text-green-600 mb-2">
                <Check size={12} /> {resetSuccess}
              </div>
            )}
            {showResetPwd ? (
              <div className="flex items-center gap-2">
                <input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nueva contraseña (mín. 6 caracteres)"
                  className="flex-1 px-3 py-2 bg-white border border-surface-3 rounded-lg text-xs focus:outline-none focus:border-brand-500" />
                <button onClick={resetPassword} disabled={saving}
                  className="px-3 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg">
                  {saving ? '...' : 'Guardar'}
                </button>
                <button onClick={() => { setShowResetPwd(false); setNewPassword(''); }}
                  className="px-2 py-2 text-text-muted text-xs hover:text-text-primary">
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button onClick={() => { setShowResetPwd(true); setResetSuccess(''); }}
                  className="text-[11px] font-semibold text-brand-500 hover:text-brand-600">
                  🔑 Cambiar contraseña
                </button>
                <button onClick={resetMfa} disabled={mfaResetting}
                  className="text-[11px] font-semibold text-brand-500 hover:text-brand-600 disabled:opacity-50">
                  {mfaResetting ? '⏳ Reseteando...' : '📱 Resetear MFA'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-surface-1 border border-surface-3 rounded-xl p-3 mb-2">
      {rowError && <div className="text-xs text-red-600 mb-2">{rowError}</div>}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary truncate">{u.full_name}</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-600 flex-shrink-0">
              {ROLE_LABELS[u.role] || u.role}
            </span>
            {u.id === currentUserId && (
              <span className="text-[10px] text-text-muted flex-shrink-0">(tú)</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-text-secondary">
            <Mail size={11} className="flex-shrink-0" /><span className="truncate">{u.email}</span>
          </div>
          {u.zone && (
            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-text-secondary">
              <MapPin size={11} className="flex-shrink-0" /><span>{u.zone}</span>
            </div>
          )}
          {managerName && (
            <div className="text-[11px] text-text-muted mt-0.5">Reporta a: {managerName}</div>
          )}
          {u.benchmark_profile && (
            <div className="mt-1 inline-flex rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700">
              Benchmark · {BENCHMARK_PROFILE_LABELS[u.benchmark_profile] || u.benchmark_profile}
            </div>
          )}
          {u.is_active === false && (
            <div className="text-[11px] font-semibold text-red-500 mt-1">Dado de baja</div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={startEdit} className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text-primary transition-colors">
            <Edit3 size={14} />
          </button>
          {u.id !== currentUserId && u.is_active !== false && (
            <button onClick={() => setShowDeactivateModal(true)} className="p-1.5 rounded-lg hover:bg-red-50 text-text-muted hover:text-red-500 transition-colors">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
      {showDeactivateModal && (
        <DeactivateUserModal
          user={u}
          allUsers={allUsers}
          onClose={() => setShowDeactivateModal(false)}
          onDeactivated={() => { setShowDeactivateModal(false); onDeactivated(); }}
        />
      )}
    </div>
  );
}

// ============ MODAL DE BAJA DE USUARIO ============
function DeactivateUserModal({ user: u, allUsers, onClose, onDeactivated }) {
  const [channelCount, setChannelCount] = useState(null);
  const [loadingCount, setLoadingCount] = useState(true);
  const [reassignTo, setReassignTo] = useState('');
  const [deactivating, setDeactivating] = useState(false);
  const [error, setError] = useState('');

  const possibleRecipients = allUsers.filter(other => other.id !== u.id);

  useEffect(() => {
    async function loadCount() {
      setLoadingCount(true);
      const { count } = await supabase
        .from('channels').select('id', { count: 'exact', head: true }).eq('assigned_to', u.id);
      setChannelCount(count || 0);
      setLoadingCount(false);
    }
    loadCount();
  }, [u.id]);

  async function handleConfirm() {
    if (channelCount > 0 && !reassignTo) {
      setError('Indica a quién reasignar los canales');
      return;
    }
    setDeactivating(true);
    setError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('manage-users', {
        body: { action: 'deactivate_user', user_id: u.id, reassign_to: reassignTo || null },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      onDeactivated();
    } catch (err) {
      setError(err.message || 'Error al dar de baja al usuario');
    } finally {
      setDeactivating(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-surface-3 rounded-2xl w-full max-w-sm p-5">
        <h3 className="font-bold text-sm text-text-primary mb-1">Dar de baja a {u.full_name}</h3>
        <p className="text-xs text-text-secondary mb-4">
          No se borrará ningún dato. El usuario quedará bloqueado (no podrá acceder al CRM)
          y se conservan sus canales, visitas y notas.
        </p>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mb-3 text-xs text-red-600">
            <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />{error}
          </div>
        )}

        {loadingCount ? (
          <div className="flex items-center gap-2 text-xs text-text-secondary py-3">
            <Loader2 size={14} className="animate-spin" /> Comprobando canales asignados...
          </div>
        ) : channelCount > 0 ? (
          <div className="mb-4">
            <p className="text-xs text-text-secondary mb-2">
              Tiene <strong>{channelCount} canal(es)</strong> asignado(s). Elige a quién se reasignan:
            </p>
            <select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-surface-3 rounded-xl text-sm focus:outline-none focus:border-brand-500">
              <option value="">Selecciona destinatario...</option>
              {possibleRecipients.map(r => (
                <option key={r.id} value={r.id}>{r.full_name} ({ROLE_LABELS[r.role] || r.role})</option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-xs text-text-secondary mb-4">No tiene canales asignados actualmente.</p>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} disabled={deactivating}
            className="flex-1 py-2.5 border border-surface-3 text-text-secondary text-sm font-semibold rounded-xl hover:bg-surface-1 transition-colors">
            Cancelar
          </button>
          <button onClick={handleConfirm} disabled={deactivating || loadingCount}
            className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-colors">
            {deactivating ? <Loader2 size={14} className="animate-spin" /> : 'Confirmar baja'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ PÁGINA PRINCIPAL ============
export default function UserAdminPage() {
  const { profile, user } = useAuthContext();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const isDirector = profile?.role === 'director' || profile?.can_manage_users;

  useEffect(() => {
    if (isDirector) loadUsers();
  }, [isDirector]);

  async function loadUsers() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');
      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Error cargando usuarios:', err);
    } finally {
      setLoading(false);
    }
  }

  if (!isDirector) {
    return (
      <div className="text-center py-16">
        <Shield size={32} className="mx-auto mb-3 text-text-muted" />
        <p className="text-sm text-text-secondary">No tienes permiso para acceder a esta página.</p>
        <p className="text-xs text-text-muted mt-1">No tienes permisos para gestionar usuarios.</p>
      </div>
    );
  }

  const filtered = users.filter(u =>
    search === '' ||
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Users size={20} className="text-text-primary" />
        <h1 className="text-xl font-extrabold tracking-tight">Administración de usuarios</h1>
      </div>

      <InviteUserForm onInvited={loadUsers} allUsers={users} />

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-text-secondary">Usuarios existentes ({users.length})</h2>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por nombre o email..."
        className="w-full px-3 py-2.5 bg-surface-2 border border-surface-3 rounded-xl text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-500 mb-3"
      />

      {loading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={22} className="animate-spin text-brand-400" />
        </div>
      )}

      {!loading && filtered.map(u => (
        <UserRow key={u.id} user={u} allUsers={users} onUpdated={loadUsers} onDeactivated={loadUsers} currentUserId={user?.id} />
      ))}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-10">
          <p className="text-sm text-text-secondary">No se encontraron usuarios</p>
        </div>
      )}
    </div>
  );
}
