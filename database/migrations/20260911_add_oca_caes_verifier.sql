DO $$
DECLARE
  verifier_constraint text;
BEGIN
  FOR verifier_constraint IN
    SELECT constraint_row.conname
    FROM pg_constraint constraint_row
    JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
    JOIN pg_namespace schema_row ON schema_row.oid = table_row.relnamespace
    WHERE schema_row.nspname = 'public'
      AND table_row.relname = 'channels'
      AND constraint_row.contype = 'c'
      AND pg_get_constraintdef(constraint_row.oid) ILIKE '%caes_verifier%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.channels DROP CONSTRAINT %I',
      verifier_constraint
    );
  END LOOP;
END;
$$;

ALTER TABLE public.channels
  ADD CONSTRAINT channels_caes_verifier_check
  CHECK (caes_verifier IN ('margube', 'eqa', 'oca', 'unassigned'));

COMMENT ON COLUMN public.channels.caes_verifier IS
  'Verificador asignado al canal CAEs activo: MARGUBE, EQA, OCA o pendiente de asignación.';
