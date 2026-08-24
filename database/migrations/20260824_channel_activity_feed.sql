-- Modelo común de lectura para toda la actividad comercial.
--
-- Esta primera fase no mueve ni elimina datos. Mantiene las tablas actuales y
-- ofrece una única fuente compatible para Agenda, ficha de canal, inicio e IA.
-- La vista usa los permisos/RLS de las tablas de origen.

CREATE OR REPLACE VIEW public.channel_activity_feed
WITH (security_invoker = true)
AS

-- Llamadas, reuniones, emails y demás interacciones.
SELECT
  'interaction:' || interaction.id::text                         AS activity_key,
  'channel_interactions'::text                                   AS source_table,
  interaction.id                                                 AS source_id,
  interaction.channel_id,
  interaction.user_id,
  interaction.interaction_type                                   AS activity_type,
  CASE
    WHEN COALESCE(interaction.is_completed, false) THEN 'completed'
    WHEN interaction.planned_date < CURRENT_DATE THEN 'overdue'
    ELSE 'planned'
  END::text                                                       AS status,
  interaction.planned_date                                       AS scheduled_date,
  interaction.planned_time                                       AS scheduled_time,
  CASE
    WHEN COALESCE(interaction.is_completed, false)
      THEN interaction.created_at
    ELSE NULL
  END                                                             AS occurred_at,
  interaction.subject,
  interaction.notes,
  interaction.result,
  interaction.contact_person,
  NULL::uuid                                                      AS linked_visit_id,
  interaction.created_at
FROM public.channel_interactions AS interaction

UNION ALL

-- Visitas planificadas. Si están vinculadas a una visita real, incorporan el
-- resultado del check-in y representan ambos registros como una sola actividad.
SELECT
  'planned_visit:' || plan.id::text                               AS activity_key,
  'planned_visits'::text                                          AS source_table,
  plan.id                                                         AS source_id,
  plan.channel_id,
  plan.kam_id                                                     AS user_id,
  'visit'::text                                                   AS activity_type,
  CASE
    WHEN actual.id IS NOT NULL AND actual.checkout_at IS NULL THEN 'in_progress'
    WHEN actual.id IS NOT NULL OR COALESCE(plan.is_completed, false) THEN 'completed'
    WHEN plan.planned_date < CURRENT_DATE THEN 'overdue'
    ELSE 'planned'
  END::text                                                       AS status,
  plan.planned_date                                               AS scheduled_date,
  plan.planned_time                                               AS scheduled_time,
  actual.checkin_at                                               AS occurred_at,
  'Visita'::text                                                  AS subject,
  COALESCE(actual.result_notes, plan.notes)                        AS notes,
  actual.result,
  NULL::text                                                      AS contact_person,
  actual.id                                                       AS linked_visit_id,
  plan.created_at
FROM public.planned_visits AS plan
LEFT JOIN public.visits AS actual
  ON actual.id = plan.visit_id

UNION ALL

-- Visitas reales que todavía no están enlazadas a una planificación. Se
-- excluyen las enlazadas para que una misma visita no aparezca dos veces.
SELECT
  'visit:' || actual.id::text                                     AS activity_key,
  'visits'::text                                                  AS source_table,
  actual.id                                                       AS source_id,
  actual.channel_id,
  actual.kam_id                                                   AS user_id,
  'visit'::text                                                   AS activity_type,
  CASE
    WHEN actual.checkout_at IS NULL THEN 'in_progress'
    ELSE 'completed'
  END::text                                                       AS status,
  actual.checkin_at::date                                         AS scheduled_date,
  actual.checkin_at::time                                         AS scheduled_time,
  actual.checkin_at                                               AS occurred_at,
  COALESCE(actual.objective, 'Visita')                             AS subject,
  actual.result_notes                                             AS notes,
  actual.result,
  NULL::text                                                      AS contact_person,
  actual.id                                                       AS linked_visit_id,
  actual.checkin_at                                               AS created_at
FROM public.visits AS actual
WHERE NOT EXISTS (
  SELECT 1
  FROM public.planned_visits AS plan
  WHERE plan.visit_id = actual.id
)

UNION ALL

-- Compatibilidad temporal con próximos pasos guardados dentro de una visita.
-- Las nuevas pantallas deberán crear estas acciones en channel_interactions.
SELECT
  'visit_followup:' || actual.id::text                            AS activity_key,
  'visit_followup'::text                                          AS source_table,
  actual.id                                                       AS source_id,
  actual.channel_id,
  actual.kam_id                                                   AS user_id,
  'follow_up'::text                                               AS activity_type,
  CASE
    WHEN actual.next_action_date < CURRENT_DATE THEN 'overdue'
    ELSE 'planned'
  END::text                                                       AS status,
  actual.next_action_date                                         AS scheduled_date,
  NULL::time                                                      AS scheduled_time,
  NULL::timestamptz                                               AS occurred_at,
  'Seguimiento'::text                                             AS subject,
  actual.next_steps                                               AS notes,
  NULL::text                                                      AS result,
  NULL::text                                                      AS contact_person,
  actual.id                                                       AS linked_visit_id,
  actual.checkin_at                                               AS created_at
FROM public.visits AS actual
WHERE actual.next_action_date IS NOT NULL
  AND NULLIF(BTRIM(actual.next_steps), '') IS NOT NULL;

COMMENT ON VIEW public.channel_activity_feed IS
  'Fuente canónica de lectura de actividad comercial, compatible con las tablas históricas.';

GRANT SELECT ON public.channel_activity_feed TO authenticated;

-- Índices para las consultas habituales de canal, usuario y periodo.
CREATE INDEX IF NOT EXISTS channel_interactions_channel_planned_idx
  ON public.channel_interactions (channel_id, planned_date);

CREATE INDEX IF NOT EXISTS channel_interactions_user_planned_idx
  ON public.channel_interactions (user_id, planned_date);

CREATE INDEX IF NOT EXISTS planned_visits_channel_planned_idx
  ON public.planned_visits (channel_id, planned_date);

CREATE INDEX IF NOT EXISTS planned_visits_kam_planned_idx
  ON public.planned_visits (kam_id, planned_date);

CREATE INDEX IF NOT EXISTS planned_visits_visit_id_idx
  ON public.planned_visits (visit_id)
  WHERE visit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS visits_channel_checkin_idx
  ON public.visits (channel_id, checkin_at);

CREATE INDEX IF NOT EXISTS visits_kam_checkin_idx
  ON public.visits (kam_id, checkin_at);
