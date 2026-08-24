-- Reasignación horizontal de canales.
-- Un usuario autenticado puede reasignar un canal que tiene asignado o que
-- pertenece a su equipo, hacia un KAM o responsable de coordinación activo.

CREATE OR REPLACE FUNCTION public.reassign_channel_open(
  target_channel_id uuid,
  target_assignee_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_id uuid := auth.uid();
BEGIN
  IF requester_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = target_assignee_id
      AND p.is_active = true
      AND p.role IN ('kam', 'coordinator', 'manager')
  ) THEN
    RAISE EXCEPTION 'El responsable seleccionado no es válido';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = target_channel_id
      AND (
        c.assigned_to = requester_id
        OR c.assigned_to IN (SELECT public.get_team_ids(requester_id))
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = requester_id AND p.role = 'director'
        )
      )
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para reasignar este canal';
  END IF;

  UPDATE public.channels
  SET assigned_to = target_assignee_id,
      updated_at = now()
  WHERE id = target_channel_id;

  RETURN target_channel_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_channel_open(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reassign_channel_open(uuid, uuid) TO authenticated;

