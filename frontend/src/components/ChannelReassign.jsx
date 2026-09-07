import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from './AuthProvider';
import { Users, ChevronDown, Check, Loader2, ArrowRightLeft, X } from 'lucide-react';

/**
 * Single channel reassign - shows current KAM and allows manager to change it.
 * Only visible for managers/directors.
 */
export function ChannelReassign({ channel, onReassigned }) {
  const { isManager } = useAuthContext();
  const [kams, setKams] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentKam, setCurrentKam] = useState(null);

  useEffect(() => {
    if (isManager) { loadKams(); loadCurrentKam(); }
  }, [channel?.id]);

  async function loadKams() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, zone, role')
      .eq('role', 'kam')
      .eq('is_active', true)
      .order('full_name');
    setKams(data || []);
  }

  async function loadCurrentKam() {
    if (!channel?.assigned_to) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, zone')
      .eq('id', channel.assigned_to)
      .single();
    setCurrentKam(data);
  }

  async function reassign(kamId) {
    if (!channel?.id || kamId === channel.assigned_to) { setOpen(false); return; }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('channels')
        .update({ assigned_to: kamId })
        .eq('id', channel.id);
      if (error) throw error;

      const newKam = kams.find(k => k.id === kamId);
      setCurrentKam(newKam);
      setOpen(false);
      if (onReassigned) onReassigned(kamId, newKam);
    } catch (err) {
      console.error('Error reasignando canal:', err);
    } finally {
      setSaving(false);
    }
  }

  if (!isManager) return null;

  return (
    <div className="bg-white border border-surface-3 rounded-xl overflow-hidden mb-4">
      <div className="flex items-center justify-between p-3.5">
        <div className="flex items-center gap-2">
          <ArrowRightLeft size={15} className="text-navy-500" />
          <span className="text-sm font-bold text-text-primary">KAM asignado</span>
        </div>
        {saving && <Loader2 size={14} className="animate-spin text-brand-400" />}
      </div>

      <div className="px-3.5 pb-3.5">
        {/* Current KAM */}
        <button onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-surface-1 border border-surface-3 rounded-xl hover:border-surface-4 transition-colors">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-xs font-bold text-white">
              {currentKam?.full_name?.charAt(0) || '?'}
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-text-primary">{currentKam?.full_name || 'Sin asignar'}</div>
              {currentKam?.zone && <div className="text-[10px] text-text-muted">Zona {currentKam.zone}</div>}
            </div>
          </div>
          <ChevronDown size={14} className={`text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {/* KAM dropdown */}
        {open && (
          <div className="mt-2 border border-surface-3 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
            {kams.map(kam => {
              const isCurrent = kam.id === channel?.assigned_to;
              return (
                <button key={kam.id} onClick={() => reassign(kam.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left border-b border-surface-3 last:border-0 transition-colors ${
                    isCurrent ? 'bg-brand-50' : 'hover:bg-surface-1'
                  }`}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ background: isCurrent ? '#E87A1E' : '#003E6B' }}>
                    {kam.full_name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-text-primary">{kam.full_name}</div>
                    <div className="text-[9px] text-text-muted">Zona {kam.zone || '-'}</div>
                  </div>
                  {isCurrent && <Check size={14} className="text-brand-500 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Bulk reassign modal - select multiple channels from a KAM and reassign to another.
 * Accessible from manager views.
 */
export function BulkReassignModal({ onClose, onDone, initialFromKam }) {
  const [kams, setKams] = useState([]);
  const [fromKam, setFromKam] = useState(initialFromKam || '');
  const [toKam, setToKam] = useState('');
  const [channels, setChannels] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => { loadKams(); }, []);

  useEffect(() => { if (fromKam) loadChannels(); }, [fromKam]);

  async function loadKams() {
    // Antes solo listaba role='kam'. Ahora incluye también managers/directores
    // como posible ORIGEN, ya que un manager puede acumular canales reasignados
    // (por ejemplo, tras dar de baja a un KAM) y necesita poder repartirlos.
    const { data } = await supabase.from('profiles')
      .select('id, full_name, zone, role')
      .in('role', ['kam', 'coordinator', 'manager', 'director'])
      .eq('is_active', true).order('full_name');
    setKams(data || []);
  }

  async function loadChannels() {
    setLoading(true);
    setSelected(new Set());
    const { data } = await supabase.from('channels')
      .select('id, name, pipeline_stage, city')
      .eq('assigned_to', fromKam).order('name');
    setChannels(data || []);
    setLoading(false);
  }

  function toggleAll() {
    if (selected.size === channels.length) setSelected(new Set());
    else setSelected(new Set(channels.map(c => c.id)));
  }

  function toggleChannel(id) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleReassign() {
    if (!toKam || selected.size === 0) return;
    setSaving(true);
    try {
      const ids = Array.from(selected);
      const { error } = await supabase.from('channels')
        .update({ assigned_to: toKam })
        .in('id', ids);
      if (error) throw error;
      setResult({ count: ids.length, toName: kams.find(k => k.id === toKam)?.full_name });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  const STAGE_LABELS = { lead: 'Lead', first_contact: 'Contacto', proposal: 'Propuesta', negotiation: 'Negociación', onboarding: 'Alta', active: 'Activo' };

  if (result) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-md p-6 text-center">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={28} className="text-green-600" />
          </div>
          <h2 className="text-lg font-extrabold text-text-primary mb-1">Reasignación completada</h2>
          <p className="text-sm text-text-secondary mb-5">
            {result.count} canales reasignados a <strong>{result.toName}</strong>
          </p>
          <button onClick={() => { if (onDone) onDone(); onClose(); }}
            className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-surface-3">
          <div>
            <h3 className="font-bold text-sm text-text-primary">Reasignar canales</h3>
            <p className="text-xs text-text-secondary mt-0.5">Transferir canales entre KAMs</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* From KAM */}
          <div>
            <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Origen</label>
            <select value={fromKam} onChange={(e) => setFromKam(e.target.value)}
              className="w-full px-3 py-2.5 bg-surface-0 border border-surface-3 rounded-xl text-sm focus:outline-none focus:border-brand-500">
              <option value="">Seleccionar origen...</option>
              {kams.map(k => <option key={k.id} value={k.id}>{k.full_name} ({k.role}) · Zona {k.zone || '-'}</option>)}
            </select>
          </div>

          {/* Channel list */}
          {fromKam && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                  Canales ({channels.length})
                </label>
                {channels.length > 0 && (
                  <button onClick={toggleAll}
                    className="text-[10px] font-semibold text-brand-500 hover:text-brand-600">
                    {selected.size === channels.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  </button>
                )}
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 size={16} className="animate-spin text-brand-400" />
                </div>
              ) : channels.length === 0 ? (
                <div className="text-center py-6 bg-surface-1 rounded-xl">
                  <p className="text-xs text-text-muted">Este KAM no tiene canales</p>
                </div>
              ) : (
                <div className="border border-surface-3 rounded-xl max-h-48 overflow-y-auto">
                  {channels.map(ch => (
                    <button key={ch.id} onClick={() => toggleChannel(ch.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left border-b border-surface-3 last:border-0 transition-colors ${
                        selected.has(ch.id) ? 'bg-brand-50' : 'hover:bg-surface-1'
                      }`}>
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                        selected.has(ch.id) ? 'bg-brand-500 border-brand-500' : 'border-surface-3'
                      }`}>
                        {selected.has(ch.id) && <Check size={10} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-text-primary truncate">{ch.name}</div>
                        <div className="text-[9px] text-text-muted">{STAGE_LABELS[ch.pipeline_stage] || ch.pipeline_stage}{ch.city ? ` · ${ch.city}` : ''}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* To KAM */}
          {selected.size > 0 && (
            <div>
              <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">
                Reasignar {selected.size} canal{selected.size > 1 ? 'es' : ''} a
              </label>
              <select value={toKam} onChange={(e) => setToKam(e.target.value)}
                className="w-full px-3 py-2.5 bg-surface-0 border border-surface-3 rounded-xl text-sm focus:outline-none focus:border-brand-500">
                <option value="">Seleccionar KAM destino...</option>
                {kams.filter(k => k.id !== fromKam).map(k => (
                  <option key={k.id} value={k.id}>{k.full_name} · Zona {k.zone || '-'}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-surface-3">
          <button onClick={handleReassign} disabled={saving || !toKam || selected.size === 0}
            className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
            {saving ? (
              <><Loader2 size={16} className="animate-spin" /> Reasignando...</>
            ) : (
              <><ArrowRightLeft size={16} /> Reasignar {selected.size || 0} canal{selected.size !== 1 ? 'es' : ''}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
