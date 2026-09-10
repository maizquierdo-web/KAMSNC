CREATE TABLE IF NOT EXISTS public.channel_access_scopes (
  viewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel_status text NOT NULL CHECK (channel_status IN ('en_proceso_alta', 'activo')),
  can_edit boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (viewer_id, owner_id, channel_status)
);

ALTER TABLE public.channel_access_scopes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channel_access_scopes_view_own ON public.channel_access_scopes;
CREATE POLICY channel_access_scopes_view_own
  ON public.channel_access_scopes
  FOR SELECT TO authenticated
  USING (viewer_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.channel_access_scopes FROM authenticated;
GRANT SELECT ON public.channel_access_scopes TO authenticated;

CREATE OR REPLACE FUNCTION public.has_scoped_channel_values(
  target_owner_id uuid,
  target_status text,
  require_edit boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.channel_access_scopes scope
    WHERE scope.viewer_id = auth.uid()
      AND scope.owner_id = target_owner_id
      AND scope.channel_status = target_status
      AND (NOT require_edit OR scope.can_edit = true)
  );
$$;

CREATE OR REPLACE FUNCTION public.has_scoped_channel_access(
  target_channel_id uuid,
  require_edit boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.channels channel
    WHERE channel.id = target_channel_id
      AND public.has_scoped_channel_values(channel.assigned_to, channel.status, require_edit)
  );
$$;

CREATE OR REPLACE FUNCTION public.has_scoped_profile_read(target_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.channel_access_scopes scope
    WHERE scope.viewer_id = auth.uid()
      AND scope.owner_id = target_profile_id
  );
$$;

REVOKE ALL ON FUNCTION public.has_scoped_channel_values(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_scoped_channel_access(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_scoped_profile_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_scoped_channel_values(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_scoped_channel_access(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_scoped_profile_read(uuid) TO authenticated;

DO $$
DECLARE
  marina_ids uuid[];
  owner_ids uuid[];
  marina_id uuid;
  owner_id uuid;
  target_status text;
BEGIN
  SELECT array_agg(id ORDER BY id)
  INTO marina_ids
  FROM public.profiles
  WHERE is_active = true
    AND lower(btrim(full_name)) ~ '^marina[[:space:]]+h.gle([[:space:]]|$)';

  IF coalesce(cardinality(marina_ids), 0) <> 1 THEN
    RAISE EXCEPTION 'No se encontró un único perfil activo de Marina Hügle. Coincidencias: %', coalesce(cardinality(marina_ids), 0);
  END IF;

  SELECT array_agg(id ORDER BY id)
  INTO owner_ids
  FROM public.profiles
  WHERE is_active = true
    AND (
      lower(btrim(full_name)) ~ '^judith([[:space:]]|$)'
      OR lower(btrim(full_name)) ~ '^egoitz([[:space:]]|$)'
      OR lower(btrim(full_name)) ~ '^miguel[[:space:]]+(ángel|angel)([[:space:]]|$)'
    );

  IF coalesce(cardinality(owner_ids), 0) <> 3 THEN
    RAISE EXCEPTION 'No se encontraron exactamente los tres perfiles activos de Judith, Egoitz y Miguel Ángel. Coincidencias: %', coalesce(cardinality(owner_ids), 0);
  END IF;

  marina_id := marina_ids[1];
  FOREACH owner_id IN ARRAY owner_ids LOOP
    FOREACH target_status IN ARRAY ARRAY['en_proceso_alta', 'activo'] LOOP
      INSERT INTO public.channel_access_scopes (
        viewer_id, owner_id, channel_status, can_edit
      ) VALUES (
        marina_id, owner_id, target_status, true
      )
      ON CONFLICT (viewer_id, owner_id, channel_status)
      DO UPDATE SET can_edit = true;
    END LOOP;
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS scoped_channel_read ON public.channels;
CREATE POLICY scoped_channel_read
  ON public.channels
  FOR SELECT TO authenticated
  USING (public.has_scoped_channel_values(assigned_to, status, false));

DROP POLICY IF EXISTS scoped_channel_update ON public.channels;
CREATE POLICY scoped_channel_update
  ON public.channels
  FOR UPDATE TO authenticated
  USING (public.has_scoped_channel_values(assigned_to, status, true))
  WITH CHECK (public.has_scoped_channel_values(assigned_to, status, true));

DROP POLICY IF EXISTS scoped_owner_profile_read ON public.profiles;
CREATE POLICY scoped_owner_profile_read
  ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_scoped_profile_read(id));

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'visits',
    'planned_visits',
    'channel_interactions',
    'channel_notes',
    'channel_meetings',
    'channel_pipeline_history',
    'channel_classifications',
    'channel_contact_prep',
    'channel_copilot_messages',
    'benchmark_sources',
    'business_cases',
    'account_plans'
  ] LOOP
    IF to_regclass('public.' || target_table) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS scoped_channel_read ON public.%I', target_table);
      EXECUTE format(
        'CREATE POLICY scoped_channel_read ON public.%I FOR SELECT TO authenticated USING (public.has_scoped_channel_access(channel_id, false))',
        target_table
      );
    END IF;
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS scoped_classification_insert ON public.channel_classifications;
CREATE POLICY scoped_classification_insert
  ON public.channel_classifications
  FOR INSERT TO authenticated
  WITH CHECK (public.has_scoped_channel_access(channel_id, true));

DROP POLICY IF EXISTS scoped_classification_update ON public.channel_classifications;
CREATE POLICY scoped_classification_update
  ON public.channel_classifications
  FOR UPDATE TO authenticated
  USING (public.has_scoped_channel_access(channel_id, true))
  WITH CHECK (public.has_scoped_channel_access(channel_id, true));

DROP POLICY IF EXISTS scoped_classification_delete ON public.channel_classifications;
CREATE POLICY scoped_classification_delete
  ON public.channel_classifications
  FOR DELETE TO authenticated
  USING (public.has_scoped_channel_access(channel_id, true));

DROP POLICY IF EXISTS scoped_pipeline_history_insert ON public.channel_pipeline_history;
CREATE POLICY scoped_pipeline_history_insert
  ON public.channel_pipeline_history
  FOR INSERT TO authenticated
  WITH CHECK (
    changed_by = auth.uid()
    AND public.has_scoped_channel_access(channel_id, true)
  );

DROP POLICY IF EXISTS scoped_business_case_file_read ON storage.objects;
CREATE POLICY scoped_business_case_file_read
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'business-cases'
    AND public.has_scoped_channel_access(((storage.foldername(name))[1])::uuid, false)
  );

COMMENT ON TABLE public.channel_access_scopes IS
  'Excepciones de acceso por responsable y estado, adicionales a la jerarquía ordinaria del CRM.';
