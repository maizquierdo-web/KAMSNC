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
  { value: 'oca', label: 'OCA' },
  { value: 'unassigned', label: 'Sin verificador asignado' },
];

const ONBOARDING_OPTIONS = [
  { value: 'pending', label: 'Sin informar' },
  { value: 'documentation_requested', label: 'Documentación solicitada al canal' },
  { value: 'sauc_opening', label: 'Apertura de SAUC' },
  { value: 'delayed_by_channel', label: 'Proceso demorado por el canal' },
  { value: 'order_contract_activated', label: 'Pedido y contrato activados' },
  { value: 'user_created', label: 'Alta de usuario' },
  { value: 'onboarding_completed', label: 'Proceso de alta finalizado' },
];

const CAES_ROLE_OPTIONS = [
  { value: 'pending', label: 'Pendiente de definir' },
  { value: 'promoter', label: 'Promotor' },
  { value: 'promoter_ot', label: 'Promotor + OT' },
  { value: 'promoter_ot_verifier', label: 'Promotor + OT + Verificador' },
];

const CONTRACT_OPTIONS = [
  { value: 'pending', label: 'Pendiente de definir' },
  { value: 'model_2_alternative_payer', label: 'Modelo 2 · Pagador alternativo' },
  { value: 'model_3_savings_facilitator', label: 'Modelo 3 · Facilitador de ahorro' },
];

const TIER_OPTIONS = [
  { value: 'pending', label: 'Pendiente de definir' },
  { value: 'tier_a', label: 'Tramo A' },
  { value: 'tier_b', label: 'Tramo B' },
  { value: 'tier_c', label: 'Tramo C' },
];

function Field({ label, value, options, disabled, onChange, required = false }) {
  return <label className="block min-w-0">
    <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-wider text-text-muted">{label}{required ? ' · obligatorio' : ''}</span>
    <select value={value} disabled={disabled} onChange={event => onChange(event.target.value)}
      className="w-full rounded-lg border border-surface-3 bg-white px-3 py-2.5 text-xs font-semibold text-text-primary focus:border-navy-500 focus:outline-none disabled:opacity-60">
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}

export default function ChannelCaesActiveDetails({ channel, onUpdate }) {
  const [values, setValues] = useState({
    onboarding_status: channel.onboarding_status || 'pending',
    caes_role: channel.caes_role || 'pending',
    caes_contract_model: channel.caes_contract_model || 'pending',
    caes_remuneration_tier: channel.caes_remuneration_tier || 'pending',
    caes_technical_office: channel.caes_technical_office || 'unassigned',
    caes_verifier: channel.caes_verifier || 'unassigned',
    caes_order_number: channel.caes_order_number || '',
  });
  const [savingField, setSavingField] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setValues({
      onboarding_status: channel.onboarding_status || 'pending',
      caes_role: channel.caes_role || 'pending',
      caes_contract_model: channel.caes_contract_model || 'pending',
      caes_remuneration_tier: channel.caes_remuneration_tier || 'pending',
      caes_technical_office: channel.caes_technical_office || 'unassigned',
      caes_verifier: channel.caes_verifier || 'unassigned',
      caes_order_number: channel.caes_order_number || '',
    });
  }, [channel.id, channel.onboarding_status, channel.caes_role, channel.caes_contract_model, channel.caes_remuneration_tier, channel.caes_technical_office, channel.caes_verifier, channel.caes_order_number]);

  async function updateField(field, value, previousValue) {
    const previous = previousValue === undefined ? values[field] : previousValue;
    const storesPendingAsNull = ['onboarding_status', 'caes_role', 'caes_contract_model', 'caes_remuneration_tier'].includes(field);
    const normalizedValue = field === 'caes_order_number' ? value.trim() : value;
    const storedValue = (storesPendingAsNull && normalizedValue === 'pending') || normalizedValue === '' ? null : normalizedValue;
    setValues(current => ({ ...current, [field]: normalizedValue }));
    setSavingField(field);
    setSaved(false);
    setError('');
    try {
      const changedAt = new Date().toISOString();
      const changes = { [field]: storedValue, updated_at: changedAt };
      if (field === 'onboarding_status') changes.onboarding_status_changed_at = changedAt;
      const { error: updateError } = await supabase.from('channels')
        .update(changes)
        .eq('id', channel.id);
      if (updateError) throw updateError;
      onUpdate?.(field === 'onboarding_status'
        ? { [field]: storedValue, onboarding_status_changed_at: changedAt }
        : { [field]: storedValue });
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

  return <section className="mb-3 overflow-hidden rounded-xl border border-navy-100 bg-white">
    <div className="flex items-center justify-between border-b border-navy-100 bg-navy-50/40 px-3.5 py-2.5">
      <div className="flex items-center gap-2">
        <Settings2 size={16} className="text-navy-600" />
        <div><div className="text-sm font-bold text-text-primary">Configuración CAEs</div><div className="text-[10px] text-text-muted">Datos comerciales y operativos del canal activo</div></div>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold">
        {savingField && <><Loader2 size={12} className="animate-spin text-navy-600" /><span className="text-text-muted">Guardando…</span></>}
        {saved && !savingField && <><Check size={12} className="text-green-600" /><span className="text-green-600">Guardado</span></>}
      </div>
    </div>
    {error && <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-[10px] text-red-600">{error}</div>}
    <div className="grid grid-cols-1 gap-3 p-3.5 md:grid-cols-2 xl:grid-cols-3">
      <Field label="Estado del alta" value={values.onboarding_status} options={ONBOARDING_OPTIONS} disabled={Boolean(savingField)} onChange={value => updateField('onboarding_status', value)} />
      <Field label="Rol" value={values.caes_role} options={CAES_ROLE_OPTIONS} disabled={Boolean(savingField)} onChange={value => updateField('caes_role', value)} />
      <Field label="Modelo de contrato" value={values.caes_contract_model} options={CONTRACT_OPTIONS} disabled={Boolean(savingField)} onChange={value => updateField('caes_contract_model', value)} />
      <Field label="Tramo retributivo" value={values.caes_remuneration_tier} options={TIER_OPTIONS} disabled={Boolean(savingField)} onChange={value => updateField('caes_remuneration_tier', value)} />
      <Field label="Oficina técnica" value={values.caes_technical_office} options={TECHNICAL_OFFICES} required disabled={Boolean(savingField)} onChange={value => updateField('caes_technical_office', value)} />
      <Field label="Verificador" value={values.caes_verifier} options={VERIFIERS} required disabled={Boolean(savingField)} onChange={value => updateField('caes_verifier', value)} />
      <label className="block min-w-0">
        <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-wider text-text-muted">Número de Pedido · opcional</span>
        <input type="text" value={values.caes_order_number} disabled={Boolean(savingField)}
          onChange={event => setValues(current => ({ ...current, caes_order_number: event.target.value }))}
          onBlur={event => {
            const previous = channel.caes_order_number || '';
            if (event.target.value.trim() !== previous) updateField('caes_order_number', event.target.value, previous);
          }}
          onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
          placeholder="Sin número de pedido"
          className="w-full rounded-lg border border-surface-3 bg-white px-3 py-2.5 text-xs font-semibold text-text-primary focus:border-navy-500 focus:outline-none disabled:opacity-60" />
      </label>
    </div>
  </section>;
}
