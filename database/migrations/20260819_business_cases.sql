-- Business Case único y privado por canal
-- Ejecutar en Supabase antes de desplegar el frontend.

CREATE TABLE IF NOT EXISTS public.business_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL UNIQUE REFERENCES public.channels(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  file_size integer,
  file_type text,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_cases ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_channel(target_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.channels c
    WHERE c.id = target_channel_id
      AND (
        c.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles assigned_profile
          WHERE assigned_profile.id = c.assigned_to
            AND assigned_profile.reports_to = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM public.profiles current_profile
          WHERE current_profile.id = auth.uid()
            AND current_profile.can_manage_users = true
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_channel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_channel(uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can read accessible business cases" ON public.business_cases;
CREATE POLICY "Users can read accessible business cases"
  ON public.business_cases FOR SELECT
  TO authenticated
  USING (public.can_access_channel(channel_id));

DROP POLICY IF EXISTS "Users can create accessible business cases" ON public.business_cases;
CREATE POLICY "Users can create accessible business cases"
  ON public.business_cases FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND public.can_access_channel(channel_id)
  );

DROP POLICY IF EXISTS "Users can replace accessible business cases" ON public.business_cases;
CREATE POLICY "Users can replace accessible business cases"
  ON public.business_cases FOR UPDATE
  TO authenticated
  USING (public.can_access_channel(channel_id))
  WITH CHECK (
    uploaded_by = auth.uid()
    AND public.can_access_channel(channel_id)
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('business-cases', 'business-cases', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Users can read accessible business case files" ON storage.objects;
CREATE POLICY "Users can read accessible business case files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'business-cases'
    AND public.can_access_channel(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "Users can upload accessible business case files" ON storage.objects;
CREATE POLICY "Users can upload accessible business case files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'business-cases'
    AND public.can_access_channel(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "Users can delete replaced business case files" ON storage.objects;
CREATE POLICY "Users can delete replaced business case files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'business-cases'
    AND public.can_access_channel(((storage.foldername(name))[1])::uuid)
  );
