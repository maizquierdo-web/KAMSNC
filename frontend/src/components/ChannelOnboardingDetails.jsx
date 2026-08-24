import { useEffect, useState } from 'react';
import { Check, ClipboardCheck, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const ONBOARDING_OPTIONS = [
  { value: 'documentation_requested', label: 'Documentación solicitada al canal' },
  { value: 'sauc_opening', label: 'Apertura de SAUC' },
  { value: 'delayed_by_channel', label: 'Proceso demorado por el canal' },
  { value: 'order_contract_activated', label: 'Pedido y contrato activados' },
  { value: 'user_created', label: 'Alta de usuario' },
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

function daysSince(value) {
  if (!value) return 0;
  const then = new Date(value);
  const now = new Date();
  then.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((now - then) / 86400000));
}

function Field({ label, value, options, onChange, disabled, required = false }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-wider text-text-muted">{label}</span>
      <select value={value || ''} onChange={event => onChange(event.target.value || null)} disabled={disabled}
        className="w-full rounded-lg border border-surface-3 bg-white px-3 py-2.5 text-xs font-semibold text-text-primary focus:border-cyan-500 focus:outline-none disabled:opacity-60">
        {!required && <option value="">Seleccionar…</option>}
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export default function ChannelOnboardingDetails({ channel, isCaes = false, onUpdate }) {
  const [values, setValues] = useState({
    onboarding_status: channel.onboarding_status || '',
    caes_role: channel.caes_role || 'pending',
    caes_contract_model: channel.caes_contract_model || 'pending',
    caes_remuneration_tier: channel.caes_remuneration_tier || 'pending',
  });
  const [savingField, setSavingField] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const evolutionDays = daysSince(channel.onboarding_status_changed_at || channel.pipeline_stage_changed_at);

  useEffect(() => {
    setValues({
      onboarding_status: channel.onboarding_status || '',
      caes_role: channel.caes_role || 'pending',
      caes_contract_model: channel.caes_contract_model || 'pending',
      caes_remuneration_tier: channel.caes_remuneration_tier || 'pending',
    });
  }, [channel.id, channel.onboarding_status, channel.caes_role, channel.caes_contract_model, channel.caes_remuneration_tier]);

  async function updateField(field, value) {
    const previous = values[field];
    const storedValue = value === 'pending' ? null : value;
    setValues(current => ({ ...current, [field]: value || '' }));
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
      onUpdate?.(field === 'onboarding_status' ? { [field]: storedValue, onboarding_status_changed_at: changedAt } : { [field]: storedValue });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (updateError) {
      console.error('No se pudo actualizar el proceso de alta:', updateError);
      setValues(current => ({ ...current, [field]: previous }));
      setError('No se pudo guardar el cambio.');
    } finally {
      setSavingField('');
    }
  }

  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-cyan-200 bg-white">
      <div className="flex items-center justify-between border-b border-cyan-100 bg-cyan-50/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={16} className="text-cyan-600" />
          <div>
            <div className="text-sm font-bold text-text-primary">Proceso de alta</div>
            <div className="text-[10px] text-text-muted">Seguimiento operativo y configuración del canal</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-semibold">
          {!savingField && !saved && <span className={`rounded-full px-2 py-1 ${evolutionDays > 10 ? 'bg-red-50 text-red-600' : evolutionDays > 5 ? 'bg-amber-50 text-amber-700' : 'bg-cyan-100/70 text-cyan-700'}`}>
            {evolutionDays === 0 ? 'Actualizado hoy' : `${evolutionDays} ${evolutionDays === 1 ? 'día' : 'días'} sin cambios`}
          </span>}
          {savingField && <><Loader2 size={12} className="animate-spin text-cyan-600" /><span className="text-text-muted">Guardando…</span></>}
          {saved && !savingField && <><Check size={12} className="text-green-600" /><span className="text-green-600">Guardado</span></>}
        </div>
      </div>

      {error && <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-[10px] text-red-600">{error}</div>}

      <div className={`grid grid-cols-1 gap-3 p-4 ${isCaes ? 'md:grid-cols-2 xl:grid-cols-4' : ''}`}>
        <Field label="Estado del alta · obligatorio" value={values.onboarding_status || 'documentation_requested'} options={ONBOARDING_OPTIONS} required
          disabled={Boolean(savingField)} onChange={value => updateField('onboarding_status', value)} />
        {isCaes && <>
          <Field label="Rol" value={values.caes_role} options={CAES_ROLE_OPTIONS}
            disabled={Boolean(savingField)} onChange={value => updateField('caes_role', value)} />
          <Field label="Modelo de contrato" value={values.caes_contract_model} options={CONTRACT_OPTIONS}
            disabled={Boolean(savingField)} onChange={value => updateField('caes_contract_model', value)} />
          <Field label="Tramo retributivo" value={values.caes_remuneration_tier} options={TIER_OPTIONS}
            disabled={Boolean(savingField)} onChange={value => updateField('caes_remuneration_tier', value)} />
        </>}
      </div>
    </section>
  );
}
