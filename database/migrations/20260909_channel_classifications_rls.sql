CREATE OR REPLACE FUNCTION public.can_access_channel(target_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE team_ids AS (
    SELECT profile.id
    FROM public.profiles profile
    WHERE profile.reports_to = auth.uid()
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
        channel.assigned_to = auth.uid()
        OR channel.assigned_to IN (SELECT id FROM team_ids)
        OR EXISTS (
          SELECT 1
          FROM public.profiles profile
          WHERE profile.id = auth.uid()
            AND profile.is_active = true
            AND (
              profile.role = 'director'
              OR profile.can_manage_users = true
            )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_channel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_channel(uuid) TO authenticated;

ALTER TABLE public.channel_classifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channel_classifications_read_accessible ON public.channel_classifications;
CREATE POLICY channel_classifications_read_accessible
  ON public.channel_classifications FOR SELECT
  TO authenticated
  USING (public.can_access_channel(channel_id));

DROP POLICY IF EXISTS channel_classifications_create_accessible ON public.channel_classifications;
CREATE POLICY channel_classifications_create_accessible
  ON public.channel_classifications FOR INSERT
  TO authenticated
  WITH CHECK (public.can_access_channel(channel_id));

DROP POLICY IF EXISTS channel_classifications_update_accessible ON public.channel_classifications;
CREATE POLICY channel_classifications_update_accessible
  ON public.channel_classifications FOR UPDATE
  TO authenticated
  USING (public.can_access_channel(channel_id))
  WITH CHECK (public.can_access_channel(channel_id));

DROP POLICY IF EXISTS channel_classifications_delete_accessible ON public.channel_classifications;
CREATE POLICY channel_classifications_delete_accessible
  ON public.channel_classifications FOR DELETE
  TO authenticated
  USING (public.can_access_channel(channel_id));
