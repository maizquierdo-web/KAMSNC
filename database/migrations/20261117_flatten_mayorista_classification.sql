BEGIN;

LOCK TABLE public.channel_classification, public.channel_classifications IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  mayorista_id uuid;
  energia_label text;
  mayorista_order integer;
BEGIN
  SELECT id INTO mayorista_id
  FROM public.channel_classification
  WHERE lower(btrim(canal)) IN ('energia', 'energía')
    AND lower(btrim(subcanal)) = 'mayorista'
    AND nullif(btrim(tipo), '') IS NULL
  ORDER BY (tipo IS NULL) DESC, is_active DESC NULLS LAST, sort_order, id
  LIMIT 1;

  SELECT canal, sort_order INTO energia_label, mayorista_order
  FROM public.channel_classification
  WHERE lower(btrim(canal)) IN ('energia', 'energía')
    AND lower(btrim(subcanal)) = 'mayorista'
  ORDER BY sort_order, id
  LIMIT 1;

  IF energia_label IS NULL THEN
    SELECT canal INTO energia_label
    FROM public.channel_classification
    WHERE lower(btrim(canal)) IN ('energia', 'energía') AND is_active IS TRUE
    ORDER BY sort_order, id
    LIMIT 1;
  END IF;

  IF mayorista_id IS NULL THEN
    INSERT INTO public.channel_classification (canal, subcanal, tipo, sort_order, is_active)
    VALUES (coalesce(energia_label, 'Energia'), 'Mayorista', NULL, coalesce(mayorista_order, 0), true)
    RETURNING id INTO mayorista_id;
  ELSE
    UPDATE public.channel_classification
    SET subcanal = 'Mayorista', tipo = NULL, is_active = true
    WHERE id = mayorista_id;
  END IF;

  -- Una ficha puede tener varias subetiquetas antiguas. Conserva una sola
  -- asignación por ficha antes de sustituir el identificador.
  WITH ranked AS (
    SELECT assignment.id, row_number() OVER (
      PARTITION BY assignment.channel_id
      ORDER BY (assignment.classification_id = mayorista_id) DESC,
               assignment.created_at, assignment.id
    ) AS position
    FROM public.channel_classifications AS assignment
    JOIN public.channel_classification AS option ON option.id = assignment.classification_id
    WHERE lower(btrim(option.canal)) IN ('energia', 'energía')
      AND lower(btrim(option.subcanal)) = 'mayorista'
  )
  DELETE FROM public.channel_classifications AS assignment
  USING ranked
  WHERE assignment.id = ranked.id AND ranked.position > 1;

  UPDATE public.channel_classifications AS assignment
  SET classification_id = mayorista_id
  FROM public.channel_classification AS option
  WHERE option.id = assignment.classification_id AND option.id <> mayorista_id
    AND lower(btrim(option.canal)) IN ('energia', 'energía')
    AND lower(btrim(option.subcanal)) = 'mayorista';

  UPDATE public.channel_classification
  SET is_active = false
  WHERE id <> mayorista_id
    AND lower(btrim(canal)) IN ('energia', 'energía')
    AND lower(btrim(subcanal)) = 'mayorista'
    AND is_active IS DISTINCT FROM false;
END;
$$;

COMMIT;
