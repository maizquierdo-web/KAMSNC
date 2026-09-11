ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS administrative_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS administrative_closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS administrative_close_reason text;

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
  delegated_owner_id uuid;
  planned_channel_id uuid;
  planned_on date;
  matched_visit_id uuid;
BEGIN
  IF target_source = 'channel_interactions' THEN
    UPDATE public.channel_interactions interaction
    SET is_completed = true,
        result = coalesce(completion_result, interaction.result),
        notes = CASE
          WHEN nullif(btrim(completion_notes), '') IS NULL THEN interaction.notes
          WHEN nullif(btrim(interaction.notes), '') IS NULL THEN completion_notes
          ELSE interaction.notes || E'\n\nResultado: ' || completion_notes
        END,
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
    IF nullif(btrim(completion_result), '') IS NULL
       OR nullif(btrim(completion_notes), '') IS NULL THEN
      RAISE EXCEPTION 'El resultado y el motivo son obligatorios para finalizar administrativamente una visita.';
    END IF;

    SELECT planned_visit.kam_id,
           planned_visit.channel_id,
           planned_visit.planned_date,
           planned_visit.visit_id
    INTO delegated_owner_id,
         planned_channel_id,
         planned_on,
         matched_visit_id
    FROM public.planned_visits planned_visit
    WHERE planned_visit.id = target_action_id
      AND coalesce(planned_visit.is_completed, false) = false
      AND EXISTS (
        SELECT 1
        FROM public.action_completion_delegates delegation
        WHERE delegation.delegate_id = auth.uid()
          AND delegation.owner_id = planned_visit.kam_id
      )
    FOR UPDATE;

    IF delegated_owner_id IS NULL THEN
      RAISE EXCEPTION 'La visita no existe, ya está completada o no está delegada al usuario autenticado.';
    END IF;

    IF matched_visit_id IS NULL THEN
      SELECT actual_visit.id
      INTO matched_visit_id
      FROM public.visits actual_visit
      WHERE actual_visit.kam_id = delegated_owner_id
        AND actual_visit.channel_id = planned_channel_id
        AND actual_visit.checkin_at::date = planned_on
        AND actual_visit.checkout_at IS NULL
        AND actual_visit.administrative_closed_at IS NULL
      ORDER BY actual_visit.checkin_at DESC
      LIMIT 1;
    END IF;

    IF matched_visit_id IS NOT NULL THEN
      UPDATE public.visits actual_visit
      SET administrative_closed_at = now(),
          administrative_closed_by = auth.uid(),
          administrative_close_reason = completion_notes,
          result = completion_result,
          result_notes = CASE
            WHEN nullif(btrim(actual_visit.result_notes), '') IS NULL THEN completion_notes
            ELSE actual_visit.result_notes || E'\n\nCierre administrativo: ' || completion_notes
          END
      WHERE actual_visit.id = matched_visit_id
        AND actual_visit.kam_id = delegated_owner_id
        AND actual_visit.checkout_at IS NULL
        AND actual_visit.administrative_closed_at IS NULL;
    END IF;

    UPDATE public.planned_visits planned_visit
    SET is_completed = true,
        visit_id = coalesce(planned_visit.visit_id, matched_visit_id),
        notes = CASE
          WHEN nullif(btrim(planned_visit.notes), '') IS NULL THEN 'Cierre administrativo: ' || completion_notes
          ELSE planned_visit.notes || E'\n\nCierre administrativo: ' || completion_notes
        END
    WHERE planned_visit.id = target_action_id
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

CREATE OR REPLACE VIEW public.channel_activity_feed
WITH (security_invoker = true)
AS
SELECT
  'interaction:' || interaction.id::text AS activity_key,
  'channel_interactions'::text AS source_table,
  interaction.id AS source_id,
  interaction.channel_id,
  interaction.user_id,
  interaction.interaction_type AS activity_type,
  CASE
    WHEN coalesce(interaction.is_completed, false) THEN 'completed'
    WHEN interaction.planned_date < CURRENT_DATE THEN 'overdue'
    ELSE 'planned'
  END::text AS status,
  interaction.planned_date AS scheduled_date,
  interaction.planned_time AS scheduled_time,
  CASE WHEN coalesce(interaction.is_completed, false) THEN interaction.created_at ELSE NULL END AS occurred_at,
  interaction.subject,
  interaction.notes,
  interaction.result,
  interaction.contact_person,
  NULL::uuid AS linked_visit_id,
  interaction.created_at
FROM public.channel_interactions interaction

UNION ALL

SELECT
  'planned_visit:' || plan.id::text AS activity_key,
  'planned_visits'::text AS source_table,
  plan.id AS source_id,
  plan.channel_id,
  plan.kam_id AS user_id,
  'visit'::text AS activity_type,
  CASE
    WHEN actual.id IS NOT NULL
      AND actual.checkout_at IS NULL
      AND actual.administrative_closed_at IS NULL THEN 'in_progress'
    WHEN actual.id IS NOT NULL OR coalesce(plan.is_completed, false) THEN 'completed'
    WHEN plan.planned_date < CURRENT_DATE THEN 'overdue'
    ELSE 'planned'
  END::text AS status,
  plan.planned_date AS scheduled_date,
  plan.planned_time AS scheduled_time,
  actual.checkin_at AS occurred_at,
  'Visita'::text AS subject,
  coalesce(actual.result_notes, plan.notes) AS notes,
  actual.result,
  NULL::text AS contact_person,
  actual.id AS linked_visit_id,
  plan.created_at
FROM public.planned_visits plan
LEFT JOIN public.visits actual ON actual.id = plan.visit_id

UNION ALL

SELECT
  'visit:' || actual.id::text AS activity_key,
  'visits'::text AS source_table,
  actual.id AS source_id,
  actual.channel_id,
  actual.kam_id AS user_id,
  'visit'::text AS activity_type,
  CASE
    WHEN actual.checkout_at IS NULL AND actual.administrative_closed_at IS NULL THEN 'in_progress'
    ELSE 'completed'
  END::text AS status,
  actual.checkin_at::date AS scheduled_date,
  actual.checkin_at::time AS scheduled_time,
  actual.checkin_at AS occurred_at,
  coalesce(actual.objective, 'Visita') AS subject,
  actual.result_notes AS notes,
  actual.result,
  NULL::text AS contact_person,
  actual.id AS linked_visit_id,
  actual.checkin_at AS created_at
FROM public.visits actual
WHERE NOT EXISTS (
  SELECT 1 FROM public.planned_visits plan WHERE plan.visit_id = actual.id
)

UNION ALL

SELECT
  'visit_followup:' || actual.id::text AS activity_key,
  'visit_followup'::text AS source_table,
  actual.id AS source_id,
  actual.channel_id,
  actual.kam_id AS user_id,
  'follow_up'::text AS activity_type,
  CASE WHEN actual.next_action_date < CURRENT_DATE THEN 'overdue' ELSE 'planned' END::text AS status,
  actual.next_action_date AS scheduled_date,
  NULL::time AS scheduled_time,
  NULL::timestamptz AS occurred_at,
  'Seguimiento'::text AS subject,
  actual.next_steps AS notes,
  NULL::text AS result,
  NULL::text AS contact_person,
  actual.id AS linked_visit_id,
  actual.checkin_at AS created_at
FROM public.visits actual
WHERE actual.next_action_date IS NOT NULL
  AND nullif(btrim(actual.next_steps), '') IS NOT NULL;

GRANT SELECT ON public.channel_activity_feed TO authenticated;

COMMENT ON COLUMN public.visits.administrative_closed_at IS
  'Fecha del cierre administrativo de una visita que conserva el check-in original y no genera check-out geolocalizado.';
COMMENT ON COLUMN public.visits.administrative_closed_by IS
  'Usuario que realizó el cierre administrativo de la visita.';
COMMENT ON COLUMN public.visits.administrative_close_reason IS
  'Motivo obligatorio del cierre administrativo.';
