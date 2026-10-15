BEGIN;

ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS channel_status_at_checkin text;

CREATE OR REPLACE FUNCTION public.capture_rvc_visit_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.channel_id IS NOT DISTINCT FROM OLD.channel_id
       AND NEW.checkin_at IS NOT DISTINCT FROM OLD.checkin_at THEN
      NEW.channel_status_at_checkin := OLD.channel_status_at_checkin;
      RETURN NEW;
    END IF;
  END IF;

  -- Backdated/offline visits require historical review, not today's status.
  NEW.channel_status_at_checkin := NULL;
  IF NEW.checkin_at BETWEEN statement_timestamp() - interval '5 minutes'
                        AND statement_timestamp() + interval '30 seconds' THEN
    SELECT channel.status INTO NEW.channel_status_at_checkin
    FROM public.channels AS channel WHERE channel.id = NEW.channel_id
    FOR SHARE;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_rvc_visit_status() FROM PUBLIC;
DROP TRIGGER IF EXISTS capture_rvc_visit_status_trigger ON public.visits;
CREATE TRIGGER capture_rvc_visit_status_trigger
BEFORE INSERT OR UPDATE ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.capture_rvc_visit_status();

COMMENT ON COLUMN public.visits.channel_status_at_checkin IS
  'Estado capturado por el servidor al check-in. Se conserva al cerrar administrativamente. NULL requiere reconstrucción o revisión histórica; nunca se rellena con el estado actual de forma retroactiva.';

COMMIT;
