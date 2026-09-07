import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../components/AuthProvider';
import { useGeolocation, getDistanceMeters } from '../hooks/useGeolocation';
import { onlineOrQueue } from '../lib/offline';
import {
  MapPin, Clock, X, Check, Loader2, Camera,
  Navigation, AlertCircle, Building2, ChevronDown
} from 'lucide-react';

const OBJECTIVES = [
  { value: 'first_contact', label: 'Primera toma de contacto' },
  { value: 'commercial_proposal', label: 'Presentar propuesta comercial' },
  { value: 'follow_up', label: 'Seguimiento de acuerdo' },
  { value: 'plan_review', label: 'Revisión de plan de cuenta' },
  { value: 'development', label: 'Desarrollo del canal' },
  { value: 'issue_resolution', label: 'Resolución de incidencia' },
  { value: 'other', label: 'Otro' },
];

const RESULTS = [
  { value: 'positive', label: 'Positiva — Avanza', color: 'text-green-400', bg: 'bg-green-500/20', border: 'border-green-500/40' },
  { value: 'neutral', label: 'Neutral — Requiere seguimiento', color: 'text-amber-400', bg: 'bg-amber-500/20', border: 'border-amber-500/40' },
  { value: 'negative', label: 'Negativa — Bloqueada', color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/40' },
];

// Persistencia del check-in activo en localStorage
function getActiveCheckin() {
  try {
    const stored = localStorage.getItem('fieldforce_active_checkin');
    return stored ? JSON.parse(stored) : null;
  } catch { return null; }
}

function setActiveCheckinStorage(data) {
  if (data) {
    localStorage.setItem('fieldforce_active_checkin', JSON.stringify(data));
  } else {
    localStorage.removeItem('fieldforce_active_checkin');
  }
}

// ============ MODAL DE SELECCIÓN DE CANAL ============
function ChannelPicker({ channels, position, gpsLoading, gpsError, permissionState, onRetryGps, onSelect, onClose }) {
  const [search, setSearch] = useState('');

  // Ordenar por distancia si tenemos posición
  const sorted = [...channels].map(ch => ({
    ...ch,
    distance: (ch.latitude && ch.longitude && position)
      ? getDistanceMeters(position.latitude, position.longitude, ch.latitude, ch.longitude)
      : null,
  })).sort((a, b) => {
    if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
    if (a.distance !== null) return -1;
    return 0;
  }).filter(ch =>
    search === '' || ch.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-surface-1 border border-surface-3 rounded-2xl w-full max-w-md max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-surface-3">
          <h3 className="font-bold">Selecciona el canal</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={20} />
          </button>
        </div>

        <div className="p-3 border-b border-surface-3">
          {gpsLoading && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-navy-100 bg-navy-50/50 p-3 text-xs font-semibold text-navy-600">
              <Loader2 size={15} className="animate-spin" />
              Obteniendo una ubicación nueva…
            </div>
          )}
          {gpsError && (
            <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="flex items-start gap-2 text-xs text-amber-400">
                <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold">{gpsError}</p>
                  <p className="mt-1 text-text-secondary">
                    {permissionState === 'denied'
                      ? 'El navegador ha bloqueado nuevos avisos. Abre los permisos del sitio desde el icono de la barra de direcciones, cambia Ubicación a Permitir y vuelve aquí.'
                      : 'Comprueba que la ubicación del dispositivo esté encendida y vuelve a intentarlo.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onRetryGps}
                disabled={gpsLoading}
                className="mt-2 w-full rounded-lg border border-amber-500/30 px-3 py-2 text-xs font-bold text-amber-400 disabled:opacity-50"
              >
                {gpsLoading ? 'Obteniendo ubicación...' : permissionState === 'denied' ? 'Ya he activado la ubicación' : 'Reintentar ubicación'}
              </button>
            </div>
          )}
          {!gpsLoading && !gpsError && !position && (
            <div className="mb-3 rounded-xl border border-surface-3 bg-surface-0 p-3 text-xs text-text-secondary">
              Necesitamos una ubicación actual antes de seleccionar el canal.
            </div>
          )}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar canal..."
            className="w-full px-3 py-2 bg-surface-0 border border-surface-3 rounded-lg text-sm placeholder-text-muted focus:outline-none focus:border-brand-500"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {sorted.map(ch => (
            <button
              key={ch.id}
              type="button"
              disabled={!position || gpsLoading}
              onClick={() => onSelect(ch)}
              className="w-full flex items-center gap-3 p-3 rounded-xl text-left hover:bg-surface-2 transition-colors disabled:cursor-not-allowed disabled:opacity-45"
            >
              <div className="w-10 h-10 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center text-sm font-extrabold flex-shrink-0">
                {ch.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{ch.name}</div>
                <div className="text-[11px] text-text-secondary">{ch.address || 'Sin dirección'}</div>
              </div>
              {ch.distance !== null && (
                <span className="text-[11px] text-text-muted font-semibold flex-shrink-0">
                  {ch.distance > 1000 ? `${(ch.distance / 1000).toFixed(1)} km` : `${ch.distance}m`}
                </span>
              )}
            </button>
          ))}
          {sorted.length === 0 && (
            <div className="text-center py-8 text-sm text-text-secondary">
              No se encontraron canales
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ FORMULARIO DE FICHA DE VISITA ============
function VisitForm({ activeCheckin, gpsError, onSave, onCancel }) {
  const [form, setForm] = useState({
    objective: '',
    result: '',
    result_notes: '',
    next_steps: '',
    next_action_date: '',
  });
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState([]);

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const duration = activeCheckin?.checkin_at
    ? Math.round((Date.now() - new Date(activeCheckin.checkin_at).getTime()) / 60000)
    : 0;

  async function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Comprimir imagen
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = async () => {
      const maxWidth = 800;
      const scale = maxWidth / img.width;
      canvas.width = maxWidth;
      canvas.height = img.height * scale;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        const fileName = `visit_${activeCheckin.visitId}_${Date.now()}.jpg`;
        const { data, error } = await supabase.storage
          .from('visit-photos')
          .upload(fileName, blob, { contentType: 'image/jpeg' });

        if (!error) {
          const { data: urlData } = supabase.storage
            .from('visit-photos')
            .getPublicUrl(fileName);
          setPhotos(prev => [...prev, urlData.publicUrl]);
        }
      }, 'image/jpeg', 0.7);
    };

    img.src = URL.createObjectURL(file);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        ...form,
        photos,
        next_action_date: form.next_action_date || null,
      });
    } finally {
      setSaving(false);
    }
  }

  const fieldClass = "w-full px-3 py-2.5 bg-surface-0 border border-surface-3 rounded-xl text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-500 transition-colors";

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
      <div className="bg-surface-1 border border-surface-3 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-5">
          <h2 className="text-lg font-extrabold text-center mb-1">Ficha de visita</h2>
          <p className="text-xs text-text-secondary text-center mb-5">
            {activeCheckin?.channelName} · {duration} min de visita
          </p>

          <div className="space-y-4">
            {/* Objetivo */}
            <div>
              <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Objetivo de la visita</label>
              <select value={form.objective} onChange={(e) => update('objective', e.target.value)} className={fieldClass}>
                <option value="">Seleccionar...</option>
                {OBJECTIVES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Resultado */}
            <div>
              <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5">Resultado</label>
              <div className="space-y-2">
                {RESULTS.map(r => (
                  <button
                    key={r.value}
                    onClick={() => update('result', r.value)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                      form.result === r.value
                        ? `${r.bg} ${r.color} ${r.border}`
                        : 'bg-surface-0 border-surface-3 text-text-secondary hover:border-surface-4'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notas */}
            <div>
              <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Notas y observaciones</label>
              <textarea
                value={form.result_notes}
                onChange={(e) => update('result_notes', e.target.value)}
                placeholder="¿Qué ha pasado en la visita?"
                rows={3}
                className={`${fieldClass} resize-none`}
              />
            </div>

            {/* Próximos pasos */}
            <div>
              <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Próximos pasos</label>
              <textarea
                value={form.next_steps}
                onChange={(e) => update('next_steps', e.target.value)}
                placeholder="¿Qué hay que hacer después de esta visita?"
                rows={2}
                className={`${fieldClass} resize-none`}
              />
            </div>

            {/* Fecha próxima acción */}
            <div>
              <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Fecha próxima acción</label>
              <input
                type="date"
                value={form.next_action_date}
                onChange={(e) => update('next_action_date', e.target.value)}
                className={fieldClass}
              />
            </div>

            {/* Fotos */}
            <div>
              <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5">Fotos</label>
              <div className="flex gap-2 flex-wrap">
                {photos.map((url, i) => (
                  <div key={i} className="w-16 h-16 rounded-lg overflow-hidden border border-surface-3">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
                {photos.length < 3 && (
                  <label className="w-16 h-16 rounded-lg border border-dashed border-surface-4 flex items-center justify-center cursor-pointer hover:border-brand-500 transition-colors">
                    <Camera size={18} className="text-text-muted" />
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhoto}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Botones */}
            {gpsError && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400">
                <div className="flex items-start gap-2">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">{gpsError}</p>
                    <p className="mt-1 text-text-secondary">
                      La ficha no se ha perdido. Activa Ubicación desde el candado del navegador y pulsa de nuevo Guardar visita.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Check size={16} />
                  Guardar visita
                </>
              )}
            </button>

            <button
              onClick={onCancel}
              className="w-full py-2.5 text-text-secondary text-sm font-semibold hover:text-text-primary transition-colors"
            >
              Cancelar (descartar visita)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ COMPONENTE PRINCIPAL DE CHECK-IN ============
export function CheckInButton({ className = '' }) {
  const { user } = useAuthContext();
  const { position, loading: gpsLoading, error: gpsError, permissionState, refreshPermission, getPosition } = useGeolocation();
  const [activeCheckin, setActiveCheckin] = useState(getActiveCheckin);
  const [channels, setChannels] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [showVisitForm, setShowVisitForm] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // Cargar canales del KAM
  useEffect(() => {
    if (user) {
      supabase
        .from('channels')
        .select('id, name, address, latitude, longitude')
        .eq('assigned_to', user.id)
        .then(({ data }) => setChannels(data || []));
    }
  }, [user]);

  // Toast auto-hide
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // Iniciar check-in: obtener GPS → seleccionar canal
  async function startCheckin() {
    setLoading(true);
    setShowPicker(true);
    try {
      await getPosition();
    } catch {
      // El selector permanece abierto con las instrucciones de recuperación.
    } finally {
      setLoading(false);
    }
  }

  async function retryLocation() {
    await refreshPermission();
    return getPosition();
  }

  // Canal seleccionado → mostrar confirmación
  function handleChannelSelected(channel) {
    setSelectedChannel(channel);
    setShowPicker(false);
    setShowConfirm(true);
  }

  // Confirmar check-in
  async function confirmCheckin() {
    setLoading(true);

    try {
      // Confirmar siempre con una lectura recién obtenida. No usamos el estado
      // previo porque podría pertenecer a un intento anterior.
      const pos = await getPosition();

      const { data, error } = await supabase
        .from('visits')
        .insert({
          channel_id: selectedChannel.id,
          kam_id: user.id,
          checkin_at: new Date().toISOString(),
          checkin_lat: pos.latitude,
          checkin_lng: pos.longitude,
          checkin_accuracy: pos.accuracy,
          is_gps_verified: pos.latitude !== null,
        })
        .select()
        .single();

      if (error) throw error;

      const checkinData = {
        visitId: data.id,
        channelId: selectedChannel.id,
        channelName: selectedChannel.name,
        checkin_at: data.checkin_at,
      };

      setActiveCheckin(checkinData);
      setActiveCheckinStorage(checkinData);
      setShowConfirm(false);
      setToast({ type: 'success', message: `Check-in en ${selectedChannel.name}` });
    } catch (err) {
      setShowConfirm(true);
      setToast({ type: 'error', message: 'No se ha registrado el check-in: ' + err.message });
    } finally {
      setLoading(false);
    }
  }

  // Iniciar check-out
  function startCheckout() {
    setShowVisitForm(true);
  }

  // Guardar visita (check-out)
  async function handleSaveVisit(formData) {
    try {
      // El check-out también debe registrar una lectura actual. Si falla, el
      // formulario permanece abierto para poder corregir el permiso y reintentar.
      const pos = await getPosition();

      const { error } = await supabase
        .from('visits')
        .update({
          checkout_at: new Date().toISOString(),
          checkout_lat: pos.latitude,
          checkout_lng: pos.longitude,
          objective: formData.objective || null,
          result: formData.result || null,
          result_notes: formData.result_notes || null,
          next_steps: formData.next_steps || null,
          next_action_date: formData.next_action_date || null,
          photos: formData.photos.length > 0 ? formData.photos : null,
        })
        .eq('id', activeCheckin.visitId);

      if (error) throw error;

      setActiveCheckin(null);
      setActiveCheckinStorage(null);
      setShowVisitForm(false);
      setToast({ type: 'success', message: 'Visita guardada correctamente' });
    } catch (err) {
      setToast({ type: 'error', message: 'No se ha guardado la visita: ' + err.message });
    }
  }

  // Cancelar visita (descartar)
  async function handleCancelVisit() {
    try {
      await supabase.from('visits').delete().eq('id', activeCheckin.visitId);
    } catch (err) {
      console.error('Error descartando visita:', err);
    }
    setActiveCheckin(null);
    setActiveCheckinStorage(null);
    setShowVisitForm(false);
  }

  // Tiempo activo
  const activeDuration = activeCheckin?.checkin_at
    ? Math.round((Date.now() - new Date(activeCheckin.checkin_at).getTime()) / 60000)
    : 0;

  // Distancia al canal seleccionado
  const distanceToChannel = selectedChannel && position && selectedChannel.latitude
    ? getDistanceMeters(position.latitude, position.longitude, selectedChannel.latitude, selectedChannel.longitude)
    : null;

  return (
    <>
      {/* Botón principal o banner activo */}
      {activeCheckin ? (
        <div className={`bg-gradient-to-r from-green-600 to-green-500 rounded-2xl p-4 ${className}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                <span className="text-sm font-bold text-white">Check-in activo</span>
              </div>
              <div className="text-xs text-white/70">
                {activeCheckin.channelName} · {activeDuration} min
              </div>
            </div>
            <button
              onClick={startCheckout}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 border-2 border-white rounded-xl text-sm font-bold text-white transition-colors"
            >
              Check-out
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={startCheckin}
          disabled={loading}
          className={`w-full py-4 bg-gradient-to-r from-brand-500 to-brand-700 hover:from-brand-400 hover:to-brand-600 disabled:opacity-50 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-500/20 ${className}`}
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Obteniendo ubicación...
            </>
          ) : (
            <>
              <MapPin size={18} />
              Hacer Check-in
            </>
          )}
        </button>
      )}

      {/* Modal: selección de canal */}
      {showPicker && (
        <ChannelPicker
          channels={channels}
          position={position}
          gpsLoading={gpsLoading}
          gpsError={gpsError}
          permissionState={permissionState}
          onRetryGps={() => retryLocation().catch(() => {})}
          onSelect={handleChannelSelected}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* Modal: confirmación de check-in */}
      {showConfirm && selectedChannel && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-1 border border-surface-3 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-extrabold text-center mb-1">Check-in</h3>
            <p className="text-xs text-text-secondary text-center mb-5">
              {selectedChannel.name}
              {distanceToChannel !== null && ` · ${distanceToChannel}m de distancia`}
            </p>

            <div className="flex items-center justify-center mb-5">
              <div className="w-20 h-20 rounded-full bg-brand-500/20 flex items-center justify-center">
                <MapPin size={32} className="text-brand-400" />
              </div>
            </div>

            {position && (
              <div className="text-center text-xs text-green-400 font-semibold mb-5">
                <Navigation size={12} className="inline mr-1" />
                GPS verificado · Precisión: {position.accuracy}m
              </div>
            )}

            {!position && (
              <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400">
                <div className="flex items-start gap-2">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">{gpsError || 'Es necesario obtener tu ubicación actual.'}</p>
                    <p className="mt-1 text-text-secondary">
                      Si el permiso está bloqueado, actívalo desde el candado de la barra del navegador.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={confirmCheckin}
              disabled={loading}
              className="w-full py-3.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 mb-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {loading ? 'Comprobando ubicación...' : position ? 'Confirmar Check-in' : 'Reintentar y confirmar'}
            </button>

            <button
              onClick={() => setShowConfirm(false)}
              className="w-full py-2.5 text-text-secondary text-sm font-semibold hover:text-text-primary transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal: ficha de visita (check-out) */}
      {showVisitForm && activeCheckin && (
        <VisitForm
          activeCheckin={activeCheckin}
          gpsError={gpsError}
          onSave={handleSaveVisit}
          onCancel={handleCancelVisit}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-4 right-4 z-[60] px-4 py-3 rounded-xl text-center text-sm font-bold shadow-xl ${
          toast.type === 'success'
            ? 'bg-green-500 text-white shadow-green-500/30'
            : 'bg-red-500 text-white shadow-red-500/30'
        }`}>
          {toast.message}
        </div>
      )}
    </>
  );
}

export default CheckInButton;
