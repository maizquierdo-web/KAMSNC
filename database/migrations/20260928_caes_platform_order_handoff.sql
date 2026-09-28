ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS caes_platform text;

ALTER TABLE public.channels
  DROP CONSTRAINT IF EXISTS channels_caes_platform_check;

ALTER TABLE public.channels
  ADD CONSTRAINT channels_caes_platform_check
  CHECK (
    caes_platform IS NULL
    OR caes_platform IN ('mascara', 'natureco', 'smartfy')
  );

COMMENT ON COLUMN public.channels.caes_platform IS
  'Plataforma operativa elegida al iniciar el proceso de alta CAEs: Máscara, Natureco o Smartfy.';

ALTER TABLE public.channels
  DROP CONSTRAINT IF EXISTS channels_active_order_required;

ALTER TABLE public.channels
  ADD CONSTRAINT channels_active_order_required
  CHECK (
    pipeline_stage <> 'active'
    OR nullif(btrim(caes_order_number), '') IS NOT NULL
  ) NOT VALID;

COMMENT ON CONSTRAINT channels_active_order_required ON public.channels IS
  'Impide activar o modificar un canal activo sin número de pedido; se deja sin validar para no bloquear la migración por registros históricos.';

CREATE OR REPLACE FUNCTION public.notify_caes_order_ready_for_operations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  marina_id uuid;
BEGIN
  IF NEW.pipeline_stage = 'active'
     AND NEW.caes_platform IS NOT NULL
     AND nullif(btrim(NEW.caes_order_number), '') IS NOT NULL
     AND (
       OLD.pipeline_stage IS DISTINCT FROM NEW.pipeline_stage
       OR nullif(btrim(OLD.caes_order_number), '') IS NULL
     ) THEN
    SELECT profile.id
    INTO marina_id
    FROM public.profiles AS profile
    WHERE profile.is_active = true
      AND lower(btrim(profile.full_name)) LIKE 'marina h%gle%'
    ORDER BY profile.id
    LIMIT 1;

    IF marina_id IS NOT NULL THEN
      INSERT INTO public.alerts (
        user_id,
        channel_id,
        alert_type,
        title,
        detail,
        priority,
        event_key,
        action_path
      ) VALUES (
        marina_id,
        NEW.id,
        'channel_critical_change',
        'Pedido listo para completar el alta',
        format('%s ya está activo y tiene informado el pedido %s. Completa los datos operativos pendientes.', NEW.name, NEW.caes_order_number),
        'high',
        'caes-order-ready:' || NEW.id::text,
        '/channels?detail=' || NEW.id::text
      )
      ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_caes_order_ready_for_operations_trigger ON public.channels;

CREATE TRIGGER notify_caes_order_ready_for_operations_trigger
AFTER UPDATE OF pipeline_stage, caes_order_number ON public.channels
FOR EACH ROW
EXECUTE FUNCTION public.notify_caes_order_ready_for_operations();

REVOKE ALL ON FUNCTION public.notify_caes_order_ready_for_operations() FROM PUBLIC;

COMMENT ON FUNCTION public.notify_caes_order_ready_for_operations() IS
  'Avisa a Marina Húgle cuando un canal CAEs queda activo con el número de pedido informado.';
