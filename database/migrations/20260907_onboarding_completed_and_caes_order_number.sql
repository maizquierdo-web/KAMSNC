-- Permite cerrar explícitamente la evolución del alta y conservar el número
-- de pedido opcional informado al activar un canal CAEs.

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS caes_order_number text;

ALTER TABLE public.channels
  DROP CONSTRAINT IF EXISTS channels_onboarding_status_check;

ALTER TABLE public.channels
  ADD CONSTRAINT channels_onboarding_status_check
  CHECK (onboarding_status IS NULL OR onboarding_status IN (
    'documentation_requested',
    'sauc_opening',
    'delayed_by_channel',
    'order_contract_activated',
    'user_created',
    'onboarding_completed'
  ));

COMMENT ON COLUMN public.channels.caes_order_number IS
  'Número de pedido opcional informado al activar un canal CAEs.';
