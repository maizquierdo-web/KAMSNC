BEGIN;

CREATE OR REPLACE FUNCTION public.require_new_business_onboarding_case()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = NEW.assigned_to
      AND lower(btrim(full_name)) ~ '^(andrea|lucía|lucia|claudia)([[:space:]]|$)'
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.business_cases AS bc
    JOIN storage.objects AS obj
      ON obj.bucket_id = 'business-cases' AND obj.name = bc.storage_path
    WHERE bc.channel_id = NEW.id
      AND bc.document_type = 'business_case'
      AND pg_catalog.starts_with(obj.name, NEW.id::text || '/')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Para cambiar de fase, debes adjuntar el Business Case antes de pasar a En proceso de alta.',
      CONSTRAINT = 'new_business_onboarding_case';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.require_new_business_onboarding_case() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS require_new_business_onboarding_case ON public.channels;
CREATE TRIGGER require_new_business_onboarding_case
AFTER UPDATE ON public.channels
FOR EACH ROW
WHEN (
  (NEW.status = 'en_proceso_alta' OR NEW.pipeline_stage = 'onboarding')
  AND (OLD.status = 'en_proceso_alta' OR OLD.pipeline_stage = 'onboarding') IS NOT TRUE
)
EXECUTE FUNCTION public.require_new_business_onboarding_case();

COMMIT;
