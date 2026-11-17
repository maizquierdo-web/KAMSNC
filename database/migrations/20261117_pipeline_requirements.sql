BEGIN;

CREATE OR REPLACE FUNCTION public.require_pipeline_transition_documents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  missing text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id = 'channel-documents'
      AND name = NEW.informe_economico_url
      AND pg_catalog.starts_with(name, 'informes/' || NEW.id::text || '/')
  ) THEN
    missing := array_append(missing, 'adjuntar el informe económico de INFORMA');
  END IF;

  IF NEW.volume_amount IS NULL OR NEW.volume_amount <= 0
    OR NEW.volume_amount::text IN ('NaN', 'Infinity', '-Infinity')
    OR nullif(btrim(NEW.volume_unit), '') IS NULL
  THEN
    missing := array_append(missing, 'registrar el volumen anual negociado (importe mayor que cero y unidad)');
  END IF;

  IF cardinality(missing) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Para cambiar de fase, debes ' || array_to_string(missing, ' y ') || '.',
      CONSTRAINT = 'pipeline_transition_requirements';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.require_pipeline_transition_documents() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS require_pipeline_transition_documents ON public.channels;
CREATE TRIGGER require_pipeline_transition_documents
AFTER UPDATE ON public.channels
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.pipeline_stage IS DISTINCT FROM NEW.pipeline_stage)
EXECUTE FUNCTION public.require_pipeline_transition_documents();

COMMIT;
