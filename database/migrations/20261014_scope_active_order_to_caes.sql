BEGIN;

-- The previous CHECK required a CAEs order for every business line.
-- Use the same CAEs signals as the Pipeline, including classifications.
CREATE OR REPLACE FUNCTION public.require_active_caes_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  is_caes boolean;
BEGIN
  IF NEW.pipeline_stage IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;

  is_caes := coalesce(NEW.channel_type, '') ILIKE '%cae%'
    OR coalesce(NEW.potencial_caes, '') <> ''
    OR EXISTS (
      SELECT 1
      FROM public.channel_classifications AS assigned_classification
      JOIN public.channel_classification AS classification
        ON classification.id = assigned_classification.classification_id
      WHERE assigned_classification.channel_id = NEW.id
        AND classification.canal ILIKE '%cae%'
    );

  IF is_caes AND nullif(btrim(NEW.caes_order_number), '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Para activar un canal CAEs debes informar el número de pedido.',
      CONSTRAINT = 'channels_active_order_required';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.require_active_caes_order() FROM PUBLIC;

DROP TRIGGER IF EXISTS require_active_caes_order_trigger ON public.channels;
CREATE TRIGGER require_active_caes_order_trigger
BEFORE INSERT OR UPDATE ON public.channels
FOR EACH ROW EXECUTE FUNCTION public.require_active_caes_order();

ALTER TABLE public.channels
  DROP CONSTRAINT IF EXISTS channels_active_order_required;

COMMENT ON FUNCTION public.require_active_caes_order() IS
  'Exige pedido solo para canales CAEs activos. Nuevos Negocios no requiere campos CAEs. No modifica registros existentes.';

COMMIT;
