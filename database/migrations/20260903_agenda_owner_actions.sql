-- Garantiza que cada KAM pueda gestionar sus propias acciones de Agenda.
-- Los permisos de lectura del equipo se mantienen separados: coordinadores y
-- managers pueden consultar la actividad ajena, pero no modificarla.

ALTER TABLE public.channel_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planned_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agenda_owner_update_interactions ON public.channel_interactions;
CREATE POLICY agenda_owner_update_interactions
  ON public.channel_interactions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS agenda_owner_delete_interactions ON public.channel_interactions;
CREATE POLICY agenda_owner_delete_interactions
  ON public.channel_interactions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS agenda_owner_update_planned_visits ON public.planned_visits;
CREATE POLICY agenda_owner_update_planned_visits
  ON public.planned_visits
  FOR UPDATE
  TO authenticated
  USING (kam_id = auth.uid())
  WITH CHECK (kam_id = auth.uid());

DROP POLICY IF EXISTS agenda_owner_delete_planned_visits ON public.planned_visits;
CREATE POLICY agenda_owner_delete_planned_visits
  ON public.planned_visits
  FOR DELETE
  TO authenticated
  USING (kam_id = auth.uid());

DROP POLICY IF EXISTS agenda_owner_update_visit_followups ON public.visits;
CREATE POLICY agenda_owner_update_visit_followups
  ON public.visits
  FOR UPDATE
  TO authenticated
  USING (kam_id = auth.uid())
  WITH CHECK (kam_id = auth.uid());

