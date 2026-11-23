BEGIN;

-- La vista de Agenda usa security_invoker y hereda esta política.
ALTER TABLE public.channel_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teams_meetings_private_until_confirmed ON public.channel_interactions;
CREATE POLICY teams_meetings_private_until_confirmed
ON public.channel_interactions AS RESTRICTIVE
FOR ALL TO PUBLIC
USING (
  interaction_type IS DISTINCT FROM 'meeting'
  OR coalesce(notes, '') NOT LIKE 'Teams: %'
  OR is_completed IS TRUE
  OR user_id = (SELECT auth.uid())
)
WITH CHECK (
  interaction_type IS DISTINCT FROM 'meeting'
  OR coalesce(notes, '') NOT LIKE 'Teams: %'
  OR is_completed IS TRUE
  OR user_id = (SELECT auth.uid())
);

-- El cierre por suplencia es SECURITY DEFINER y puede eludir RLS.
CREATE OR REPLACE FUNCTION public.guard_pending_teams_meeting()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.interaction_type = 'meeting'
    AND coalesce(OLD.notes, '') LIKE 'Teams: %'
    AND OLD.is_completed IS NOT TRUE THEN
    IF auth.uid() IS DISTINCT FROM OLD.user_id AND auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Solo el KAM que registró la reunión puede confirmarla o modificarla'
        USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' THEN
      IF NEW.user_id IS DISTINCT FROM OLD.user_id OR
        (NEW.is_completed IS NOT TRUE AND (
          NEW.interaction_type IS DISTINCT FROM 'meeting' OR coalesce(NEW.notes, '') NOT LIKE 'Teams: %'
        )) THEN
        RAISE EXCEPTION 'La reunión de Teams debe seguir siendo privada hasta su confirmación';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_pending_teams_meeting ON public.channel_interactions;
CREATE TRIGGER guard_pending_teams_meeting
BEFORE UPDATE OR DELETE ON public.channel_interactions
FOR EACH ROW EXECUTE FUNCTION public.guard_pending_teams_meeting();

COMMIT;
