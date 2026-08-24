-- Seguimiento operativo de los canales que se encuentran en proceso de alta.
-- Los campos CAEs permanecen opcionales y solo se muestran en el frontend para
-- canales clasificados como CAEs.

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS onboarding_status text
    CHECK (onboarding_status IS NULL OR onboarding_status IN (
      'documentation_requested',
      'sauc_opening',
      'delayed_by_channel',
      'order_contract_activated',
      'user_created'
    )),
  ADD COLUMN IF NOT EXISTS caes_role text
    CHECK (caes_role IS NULL OR caes_role IN (
      'promoter',
      'promoter_ot',
      'promoter_ot_verifier'
    )),
  ADD COLUMN IF NOT EXISTS caes_contract_model text
    CHECK (caes_contract_model IS NULL OR caes_contract_model IN (
      'model_2_alternative_payer',
      'model_3_savings_facilitator'
    )),
  ADD COLUMN IF NOT EXISTS caes_remuneration_tier text
    CHECK (caes_remuneration_tier IS NULL OR caes_remuneration_tier IN (
      'tier_a',
      'tier_b',
      'tier_c'
    )),
  ADD COLUMN IF NOT EXISTS onboarding_status_changed_at timestamptz;

UPDATE public.channels
SET onboarding_status = COALESCE(onboarding_status, 'documentation_requested'),
    onboarding_status_changed_at = COALESCE(onboarding_status_changed_at, pipeline_stage_changed_at, now())
WHERE pipeline_stage = 'onboarding';

CREATE OR REPLACE FUNCTION public.set_channel_onboarding_evolution()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.pipeline_stage = 'onboarding' AND NEW.onboarding_status IS NULL THEN
    NEW.onboarding_status := 'documentation_requested';
  END IF;

  IF NEW.pipeline_stage = 'onboarding' THEN
    IF TG_OP = 'INSERT'
       OR OLD.pipeline_stage IS DISTINCT FROM NEW.pipeline_stage
       OR OLD.onboarding_status IS DISTINCT FROM NEW.onboarding_status THEN
      NEW.onboarding_status_changed_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_channel_onboarding_evolution_trigger ON public.channels;
CREATE TRIGGER set_channel_onboarding_evolution_trigger
BEFORE INSERT OR UPDATE ON public.channels
FOR EACH ROW EXECUTE FUNCTION public.set_channel_onboarding_evolution();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'channels_onboarding_status_required'
      AND conrelid = 'public.channels'::regclass
  ) THEN
    ALTER TABLE public.channels
      ADD CONSTRAINT channels_onboarding_status_required
      CHECK (pipeline_stage <> 'onboarding' OR onboarding_status IS NOT NULL);
  END IF;
END;
$$;

COMMENT ON COLUMN public.channels.onboarding_status IS 'Estado operativo del proceso de alta del canal.';
COMMENT ON COLUMN public.channels.caes_role IS 'Rol contractual del canal CAEs.';
COMMENT ON COLUMN public.channels.caes_contract_model IS 'Modelo de contrato del canal CAEs.';
COMMENT ON COLUMN public.channels.caes_remuneration_tier IS 'Tramo retributivo del canal CAEs.';
COMMENT ON COLUMN public.channels.onboarding_status_changed_at IS 'Fecha del último cambio de evolución dentro del proceso de alta.';
