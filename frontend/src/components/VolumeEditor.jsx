import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Save, BarChart3 } from 'lucide-react';

const VOLUME_UNITS = [
  { key: 'residencial', label: 'Residencial', unit: 'SWE+SWG', color: '#3b82f6', bg: '#eff6ff' },
  { key: 'pymes', label: 'PYMEs', unit: 'GWh', color: '#8b5cf6', bg: '#f3eeff' },
  { key: 'caes', label: 'CAEs', unit: 'GWh', color: '#16a34a', bg: '#e6f5ed' },
  { key: 'solar', label: 'Solar', unit: 'kWp', color: '#f59e0b', bg: '#fffbeb' },
];

export function formatVolume(amount, unitKey) {
  if (amount == null || amount === '') return null;
  const num = parseFloat(amount);
  if (isNaN(num)) return null;
  if (unitKey === 'residencial') return num >= 1000 ? `${(num / 1000).toFixed(1)}K` : String(Math.round(num));
  return num.toFixed(1);
}

export function getVolumeConfig(unitKey) {
  return VOLUME_UNITS.find(u => u.key === unitKey) || VOLUME_UNITS[0];
}

export { VOLUME_UNITS };

export default function VolumeEditor({ channel, onChannelUpdate }) {
  const [amount, setAmount] = useState(channel?.volume_amount ?? '');
  const [unit, setUnit] = useState(channel?.volume_unit || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setAmount(channel?.volume_amount ?? '');
    setUnit(channel?.volume_unit || '');
  }, [channel?.id]);

  async function save() {
    if (!channel?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('channels').update({
        volume_amount: amount !== '' ? parseFloat(amount) : null,
        volume_unit: unit || null,
      }).eq('id', channel.id);
      if (error) throw error;

      if (onChannelUpdate) {
        onChannelUpdate({ ...channel, volume_amount: amount !== '' ? parseFloat(amount) : null, volume_unit: unit || null });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Error guardando volumen:', err);
    } finally {
      setSaving(false);
    }
  }

  const selectedUnit = VOLUME_UNITS.find(u => u.key === unit);
  const hasChanged = (amount !== (channel?.volume_amount ?? '')) || (unit !== (channel?.volume_unit || ''));

  return (
    <div className="bg-white border border-surface-3 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 p-3.5 border-b border-surface-3">
        <BarChart3 size={16} className="text-brand-500" />
        <span className="text-sm font-bold text-text-primary">Volumen Anual Negociado</span>
        {channel?.volume_amount != null && channel?.volume_unit && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: getVolumeConfig(channel.volume_unit).bg, color: getVolumeConfig(channel.volume_unit).color }}>
            {formatVolume(channel.volume_amount, channel.volume_unit)} {getVolumeConfig(channel.volume_unit).unit}
          </span>
        )}
      </div>

      <div className="p-3.5 space-y-3">
        {/* Unit selector */}
        <div>
          <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5">Tipo de volumen</label>
          <div className="grid grid-cols-4 gap-1.5">
            {VOLUME_UNITS.map(u => (
              <button key={u.key} type="button" onClick={() => setUnit(u.key)}
                className="min-h-[42px] px-1.5 py-1 rounded-lg text-center transition-all"
                style={{
                  background: unit === u.key ? u.bg : '#f7f8fa',
                  border: `1.5px solid ${unit === u.key ? u.color : '#dde1e8'}`,
                }}>
                <div className="text-[10px] font-bold leading-tight" style={{ color: unit === u.key ? u.color : '#8b90a0' }}>
                  {u.label}
                </div>
                <div className="text-[8px] leading-tight mt-0.5" style={{ color: unit === u.key ? u.color : '#c5cbd6' }}>
                  {u.unit}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Amount input */}
        <div>
          <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Volumen anual</label>
          <div className="relative">
            <input type="number" value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={unit === 'residencial' ? 'Ej: 2200' : 'Ej: 5.2'}
              step={unit === 'residencial' ? '1' : '0.1'}
              className="w-full px-3 py-2.5 pr-24 bg-surface-0 border border-surface-3 rounded-xl text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-500" />
            {selectedUnit && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold px-2 py-0.5 rounded"
                style={{ background: selectedUnit.bg, color: selectedUnit.color }}>
                {selectedUnit.unit}
              </span>
            )}
          </div>
        </div>

        {/* Save button */}
        {hasChanged && (
          <button onClick={save} disabled={saving || !unit}
            className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5">
            {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <><span>✓</span> Guardado</> : <><Save size={13} /> Guardar volumen</>}
          </button>
        )}
      </div>
    </div>
  );
}
