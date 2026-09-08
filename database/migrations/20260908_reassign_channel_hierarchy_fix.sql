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
  requester_can_manage boolean := false;
  updated_channel_id uuid;
BEGIN
  IF requester_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = target_assignee_id
      AND profile.is_active = true
      AND profile.role IN ('kam', 'coordinator', 'manager')
  ) THEN
    RAISE EXCEPTION 'El responsable seleccionado no es válido';
  END IF;

  WITH RECURSIVE team_ids AS (
    SELECT profile.id
    FROM public.profiles profile
    WHERE profile.reports_to = requester_id
      AND profile.is_active = true

    UNION

    SELECT profile.id
    FROM public.profiles profile
    JOIN team_ids team_member ON profile.reports_to = team_member.id
    WHERE profile.is_active = true
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.channels channel
    WHERE channel.id = target_channel_id
      AND (
        channel.assigned_to = requester_id
        OR channel.assigned_to IN (SELECT id FROM team_ids)
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = requester_id
      AND profile.is_active = true
      AND (
        profile.role = 'director'
        OR profile.can_manage_users = true
      )
  )
  INTO requester_can_manage;

  IF NOT requester_can_manage THEN
    RAISE EXCEPTION 'No tienes permiso para reasignar este canal';
  END IF;

  UPDATE public.channels
  SET assigned_to = target_assignee_id,
      updated_at = now()
  WHERE id = target_channel_id
  RETURNING id INTO updated_channel_id;

  IF updated_channel_id IS NULL THEN
    RAISE EXCEPTION 'El canal indicado no existe';
  END IF;

  RETURN updated_channel_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_channel_open(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reassign_channel_open(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.reassign_channel_open(uuid, uuid) IS
  'Reasigna un canal propio o de la jerarquía del usuario sin depender de funciones auxiliares.';
