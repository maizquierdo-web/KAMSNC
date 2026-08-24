import { useEffect, useState } from 'react';
import { Check, Loader2, Settings2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const TECHNICAL_OFFICES = [
  { value: 'sinceo2', label: 'SINCEO2' },
  { value: 'e_program', label: 'E-PROGRAM' },
  { value: 'unassigned', label: 'Sin OT asignada' },
];

const VERIFIERS = [
  { value: 'margube', label: 'MARGUBE' },
  { value: 'eqa', label: 'EQA' },
  { value: 'unassigned', label: 'Sin verificador asignado' },
];

function Field({ label, value, options, disabled, onChange }) {
  return <label className="block min-w-0">
    <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-wider text-text-muted">{label} · obligatorio</span>
    <select value={value || 'unassigned'} disabled={disabled} onChange={event => onChange(event.target.value)}
      className="w-full rounded-lg border border-surface-3 bg-white px-3 py-2.5 text-xs font-semibold text-text-primary focus:border-teal-500 focus:outline-none disabled:opacity-60">
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}

export default function ChannelCaesActiveDetails({ channel, onUpdate }) {
  const [values, setValues] = useState({
    caes_technical_office: channel.caes_technical_office || 'unassigned',
    caes_verifier: channel.caes_verifier || 'unassigned',
  });
  const [savingField, setSavingField] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setValues({
      caes_technical_office: channel.caes_technical_office || 'unassigned',
      caes_verifier: channel.caes_verifier || 'unassigned',
    });
  }, [channel.id, channel.caes_technical_office, channel.caes_verifier]);

  async function updateField(field, value) {
    const previous = values[field];
    setValues(current => ({ ...current, [field]: value }));
    setSavingField(field);
    setSaved(false);
    setError('');
    try {
      const { error: updateError } = await supabase.from('channels')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('id', channel.id);
      if (updateError) throw updateError;
      onUpdate?.({ [field]: value });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (updateError) {
      console.error('No se pudo actualizar la asignación CAEs:', updateError);
      setValues(current => ({ ...current, [field]: previous }));
      setError('No se pudo guardar el cambio.');
    } finally {
      setSavingField('');
    }
  }

  return <section className="mb-4 overflow-hidden rounded-xl border border-teal-200 bg-white">
    <div className="flex items-center justify-between border-b border-teal-100 bg-teal-50/50 px-4 py-3">
      <div className="flex items-center gap-2">
        <Settings2 size={16} className="text-teal-600" />
        <div><div className="text-sm font-bold text-text-primary">Operativa CAEs</div><div className="text-[10px] text-text-muted">Asignaciones del canal activo</div></div>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold">
        {savingField && <><Loader2 size={12} className="animate-spin text-teal-600" /><span className="text-text-muted">Guardando…</span></>}
        {saved && !savingField && <><Check size={12} className="text-green-600" /><span className="text-green-600">Guardado</span></>}
      </div>
    </div>
    {error && <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-[10px] text-red-600">{error}</div>}
    <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
      <Field label="Oficina técnica" value={values.caes_technical_office} options={TECHNICAL_OFFICES} disabled={Boolean(savingField)} onChange={value => updateField('caes_technical_office', value)} />
      <Field label="Verificador" value={values.caes_verifier} options={VERIFIERS} disabled={Boolean(savingField)} onChange={value => updateField('caes_verifier', value)} />
    </div>
  </section>;
}
