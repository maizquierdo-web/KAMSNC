CREATE TABLE IF NOT EXISTS public.action_completion_delegates (
  delegate_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (delegate_id, owner_id),
  CHECK (delegate_id <> owner_id)
);

ALTER TABLE public.action_completion_delegates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS action_completion_delegates_view_own ON public.action_completion_delegates;
CREATE POLICY action_completion_delegates_view_own
  ON public.action_completion_delegates
  FOR SELECT TO authenticated
  USING (delegate_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.action_completion_delegates FROM authenticated;
GRANT SELECT ON public.action_completion_delegates TO authenticated;

DO $$
DECLARE
  miguel_ids uuid[];
  owner_ids uuid[];
  miguel_id uuid;
  delegated_owner_id uuid;
BEGIN
  SELECT array_agg(id ORDER BY id)
  INTO miguel_ids
  FROM public.profiles
  WHERE is_active = true
    AND lower(btrim(full_name)) ~ '^miguel[[:space:]]+(ángel|angel)[[:space:]]+izquierdo([[:space:]]|$)';

  IF coalesce(cardinality(miguel_ids), 0) <> 1 THEN
    RAISE EXCEPTION 'No se encontró un único perfil activo de Miguel Ángel Izquierdo. Coincidencias: %', coalesce(cardinality(miguel_ids), 0);
  END IF;

  SELECT array_agg(id ORDER BY id)
  INTO owner_ids
  FROM public.profiles
  WHERE is_active = true
    AND (
      lower(btrim(full_name)) ~ '^judith([[:space:]]|$)'
      OR lower(btrim(full_name)) ~ '^egoitz([[:space:]]|$)'
    );

  IF coalesce(cardinality(owner_ids), 0) <> 2 THEN
    RAISE EXCEPTION 'No se encontraron exactamente los perfiles activos de Judith y Egoitz. Coincidencias: %', coalesce(cardinality(owner_ids), 0);
  END IF;

  miguel_id := miguel_ids[1];
  FOREACH delegated_owner_id IN ARRAY owner_ids LOOP
    INSERT INTO public.action_completion_delegates (delegate_id, owner_id)
    VALUES (miguel_id, delegated_owner_id)
    ON CONFLICT (delegate_id, owner_id) DO NOTHING;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_delegated_action(
  target_source text,
  target_action_id uuid,
  completion_result text DEFAULT NULL,
  completion_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  completed_id uuid;
BEGIN
  IF target_source = 'channel_interactions' THEN
    UPDATE public.channel_interactions interaction
    SET is_completed = true,
        result = coalesce(completion_result, interaction.result),
        notes = coalesce(completion_notes, interaction.notes),
        created_at = now()
    WHERE interaction.id = target_action_id
      AND coalesce(interaction.is_completed, false) = false
      AND EXISTS (
        SELECT 1
        FROM public.action_completion_delegates delegation
        WHERE delegation.delegate_id = auth.uid()
          AND delegation.owner_id = interaction.user_id
      )
    RETURNING interaction.id INTO completed_id;
  ELSIF target_source = 'planned_visit' THEN
    UPDATE public.planned_visits planned_visit
    SET is_completed = true,
        notes = coalesce(completion_notes, planned_visit.notes)
    WHERE planned_visit.id = target_action_id
      AND coalesce(planned_visit.is_completed, false) = false
      AND EXISTS (
        SELECT 1
        FROM public.action_completion_delegates delegation
        WHERE delegation.delegate_id = auth.uid()
          AND delegation.owner_id = planned_visit.kam_id
      )
    RETURNING planned_visit.id INTO completed_id;
  ELSIF target_source = 'visit_followup' THEN
    UPDATE public.visits visit
    SET next_action_date = NULL,
        next_steps = NULL
    WHERE visit.id = target_action_id
      AND visit.next_action_date IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.action_completion_delegates delegation
        WHERE delegation.delegate_id = auth.uid()
          AND delegation.owner_id = visit.kam_id
      )
    RETURNING visit.id INTO completed_id;
  ELSE
    RAISE EXCEPTION 'Tipo de acción no permitido: %', target_source;
  END IF;

  IF completed_id IS NULL THEN
    RAISE EXCEPTION 'La acción no existe, ya está completada o no está delegada al usuario autenticado.';
  END IF;

  RETURN completed_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_delegated_action(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_delegated_action(text, uuid, text, text) TO authenticated;

COMMENT ON TABLE public.action_completion_delegates IS
  'Delegaciones acotadas que permiten completar acciones ajenas sin editarlas, eliminarlas ni reprogramarlas.';

COMMENT ON FUNCTION public.complete_delegated_action(text, uuid, text, text) IS
  'Completa una acción ajena únicamente cuando existe una delegación explícita para el usuario autenticado.';
