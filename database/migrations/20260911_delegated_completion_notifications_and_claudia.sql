ALTER TABLE public.alerts
  DROP CONSTRAINT IF EXISTS alerts_alert_type_check;

ALTER TABLE public.alerts
  ADD CONSTRAINT alerts_alert_type_check
  CHECK (
    alert_type IN (
      'task',
      'followup_overdue',
      'pipeline_stalled',
      'channel_inactive',
      'plan_review',
      'system',
      'channel_reassigned',
      'channel_critical_change',
      'onboarding_blocked',
      'benchmark_signal',
      'team_risk',
      'high_potential_movement',
      'delegated_action_completed'
    )
  );

DO $$
DECLARE
  claudia_ids uuid[];
  owner_ids uuid[];
  claudia_id uuid;
  delegated_owner_id uuid;
BEGIN
  SELECT array_agg(id ORDER BY id)
  INTO claudia_ids
  FROM public.profiles
  WHERE is_active = true
    AND lower(btrim(full_name)) ~ '^claudia([[:space:]]|$)';

  IF coalesce(cardinality(claudia_ids), 0) <> 1 THEN
    RAISE EXCEPTION 'No se encontró un único perfil activo de Claudia. Coincidencias: %', coalesce(cardinality(claudia_ids), 0);
  END IF;

  SELECT array_agg(id ORDER BY id)
  INTO owner_ids
  FROM public.profiles
  WHERE is_active = true
    AND (
      lower(btrim(full_name)) ~ '^lucía([[:space:]]|$)'
      OR lower(btrim(full_name)) ~ '^lucia([[:space:]]|$)'
      OR lower(btrim(full_name)) ~ '^andrea([[:space:]]|$)'
    );

  IF coalesce(cardinality(owner_ids), 0) <> 2 THEN
    RAISE EXCEPTION 'No se encontraron exactamente los perfiles activos de Lucía y Andrea. Coincidencias: %', coalesce(cardinality(owner_ids), 0);
  END IF;

  claudia_id := claudia_ids[1];
  FOREACH delegated_owner_id IN ARRAY owner_ids LOOP
    INSERT INTO public.action_completion_delegates (delegate_id, owner_id)
    VALUES (claudia_id, delegated_owner_id)
    ON CONFLICT (delegate_id, owner_id) DO NOTHING;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_delegated_action_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  owner_id uuid;
  target_channel_id uuid;
  target_visit_id uuid;
  actor_name text;
  channel_name text;
  notification_title text;
  notification_detail text;
  notification_key text;
  action_label text;
  action_result text;
  action_reason text;
BEGIN
  IF actor_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'channel_interactions' THEN
    IF coalesce(OLD.is_completed, false) = true
       OR coalesce(NEW.is_completed, false) = false THEN
      RETURN NEW;
    END IF;
    owner_id := NEW.user_id;
    target_channel_id := NEW.channel_id;
    action_label := coalesce(NEW.interaction_type, 'acción');
    action_result := NEW.result;
    action_reason := NEW.notes;
    notification_key := format('delegated-completion:interaction:%s', NEW.id);

  ELSIF TG_TABLE_NAME = 'planned_visits' THEN
    IF coalesce(OLD.is_completed, false) = true
       OR coalesce(NEW.is_completed, false) = false THEN
      RETURN NEW;
    END IF;
    IF NEW.visit_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.visits linked_visit
      WHERE linked_visit.id = NEW.visit_id
        AND linked_visit.administrative_closed_at IS NOT NULL
    ) THEN
      RETURN NEW;
    END IF;
    owner_id := NEW.kam_id;
    target_channel_id := NEW.channel_id;
    action_label := 'visita planificada';
    action_reason := NEW.notes;
    notification_key := format('delegated-completion:planned-visit:%s', NEW.id);

  ELSIF TG_TABLE_NAME = 'visits' THEN
    owner_id := NEW.kam_id;
    target_channel_id := NEW.channel_id;
    target_visit_id := NEW.id;

    IF OLD.administrative_closed_at IS NULL
       AND NEW.administrative_closed_at IS NOT NULL THEN
      action_label := 'visita';
      action_result := NEW.result;
      action_reason := NEW.administrative_close_reason;
      notification_key := format('delegated-completion:visit:%s', NEW.id);
    ELSIF OLD.next_action_date IS NOT NULL
          AND NEW.next_action_date IS NULL THEN
      action_label := 'seguimiento';
      action_reason := OLD.next_steps;
      notification_key := format('delegated-completion:visit-followup:%s:%s', NEW.id, OLD.next_action_date);
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  IF owner_id = actor_id OR NOT EXISTS (
    SELECT 1
    FROM public.action_completion_delegates delegation
    WHERE delegation.delegate_id = actor_id
      AND delegation.owner_id = owner_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(profile.full_name, 'Coordinación')
  INTO actor_name
  FROM public.profiles profile
  WHERE profile.id = actor_id;

  SELECT coalesce(channel.name, 'el canal')
  INTO channel_name
  FROM public.channels channel
  WHERE channel.id = target_channel_id;

  notification_title := CASE
    WHEN action_label = 'visita' THEN 'Visita finalizada por coordinación'
    ELSE 'Acción completada por coordinación'
  END;

  notification_detail := format(
    '%s ha cerrado %s en %s.%s%s',
    coalesce(actor_name, 'Coordinación'),
    action_label,
    coalesce(channel_name, 'el canal'),
    CASE
      WHEN nullif(btrim(action_result), '') IS NOT NULL
        THEN ' Resultado: ' || action_result || '.'
      ELSE ''
    END,
    CASE
      WHEN nullif(btrim(action_reason), '') IS NOT NULL
        THEN ' Motivo: ' || action_reason
      ELSE ''
    END
  );

  INSERT INTO public.alerts (
    user_id,
    channel_id,
    visit_id,
    alert_type,
    title,
    detail,
    priority,
    event_key,
    action_path
  ) VALUES (
    owner_id,
    target_channel_id,
    target_visit_id,
    'delegated_action_completed',
    notification_title,
    notification_detail,
    'medium',
    notification_key,
    '/channels?detail=' || target_channel_id::text
  )
  ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_delegated_interaction_completion ON public.channel_interactions;
CREATE TRIGGER notify_delegated_interaction_completion
  AFTER UPDATE OF is_completed ON public.channel_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_delegated_action_completion();

DROP TRIGGER IF EXISTS notify_delegated_planned_visit_completion ON public.planned_visits;
CREATE TRIGGER notify_delegated_planned_visit_completion
  AFTER UPDATE OF is_completed ON public.planned_visits
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_delegated_action_completion();

DROP TRIGGER IF EXISTS notify_delegated_visit_completion ON public.visits;
CREATE TRIGGER notify_delegated_visit_completion
  AFTER UPDATE OF administrative_closed_at, next_action_date ON public.visits
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_delegated_action_completion();

REVOKE ALL ON FUNCTION public.notify_delegated_action_completion() FROM PUBLIC;

COMMENT ON FUNCTION public.notify_delegated_action_completion() IS
  'Avisa al KAM titular cuando coordinación completa una acción mediante una delegación explícita.';
