ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS event_key text,
  ADD COLUMN IF NOT EXISTS action_path text;

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
      'high_potential_movement'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS alerts_event_key_unique_idx
  ON public.alerts (event_key)
  WHERE event_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS alerts_user_active_created_idx
  ON public.alerts (user_id, is_dismissed, created_at DESC);

CREATE OR REPLACE FUNCTION public.notify_relevant_channel_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  actor_name text;
  previous_owner_name text;
  status_label text;
  manager_record record;
  is_high_potential boolean;
BEGIN
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    SELECT full_name INTO previous_owner_name
    FROM public.profiles
    WHERE id = OLD.assigned_to;

    INSERT INTO public.alerts (
      user_id, channel_id, alert_type, title, detail, priority,
      event_key, action_path
    ) VALUES (
      NEW.assigned_to,
      NEW.id,
      'channel_reassigned',
      'Canal reasignado',
      format(
        '%s se te ha asignado%s.',
        NEW.name,
        CASE
          WHEN previous_owner_name IS NOT NULL THEN ' desde ' || previous_owner_name
          ELSE ''
        END
      ),
      'high',
      format('channel-reassigned:%s:%s:%s', NEW.id, NEW.assigned_to, txid_current()),
      '/channels?detail=' || NEW.id
    )
    ON CONFLICT DO NOTHING;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status IN ('activo', 'rechazado', 'cierre_sin_acuerdo') THEN
    status_label := CASE NEW.status
      WHEN 'activo' THEN 'Activo'
      WHEN 'rechazado' THEN 'Rechazado'
      WHEN 'cierre_sin_acuerdo' THEN 'Cierre sin acuerdo'
      ELSE NEW.status
    END;

    IF actor_id IS NOT NULL AND actor_id IS DISTINCT FROM NEW.assigned_to THEN
      SELECT full_name INTO actor_name
      FROM public.profiles
      WHERE id = actor_id;

      INSERT INTO public.alerts (
        user_id, channel_id, alert_type, title, detail, priority,
        event_key, action_path
      ) VALUES (
        NEW.assigned_to,
        NEW.id,
        'channel_critical_change',
        'Cambio crítico en un canal',
        format(
          '%s ha pasado a “%s” por %s.',
          NEW.name,
          status_label,
          coalesce(actor_name, 'otro usuario')
        ),
        'high',
        format('channel-critical:%s:%s:%s:%s', NEW.id, NEW.assigned_to, NEW.status, txid_current()),
        '/channels?detail=' || NEW.id
      )
      ON CONFLICT DO NOTHING;
    END IF;

    is_high_potential := lower(coalesce(NEW.potencial_caes, '')) IN ('alto', 'muy alto')
      OR lower(coalesce(NEW.potencial_energia, '')) IN ('alto', 'muy alto')
      OR lower(coalesce(NEW.potencial_venta_energia, '')) IN ('alto', 'muy alto');

    IF is_high_potential THEN
      FOR manager_record IN
        WITH RECURSIVE management_chain(id) AS (
          SELECT reports_to
          FROM public.profiles
          WHERE id = NEW.assigned_to AND reports_to IS NOT NULL

          UNION

          SELECT p.reports_to
          FROM public.profiles p
          JOIN management_chain chain ON p.id = chain.id
          WHERE p.reports_to IS NOT NULL
        )
        SELECT DISTINCT p.id
        FROM management_chain chain
        JOIN public.profiles p ON p.id = chain.id
        WHERE p.is_active = true
          AND (p.role IN ('coordinator', 'manager', 'director') OR p.can_manage_users = true)
      LOOP
        INSERT INTO public.alerts (
          user_id, channel_id, alert_type, title, detail, priority,
          event_key, action_path
        ) VALUES (
          manager_record.id,
          NEW.id,
          'high_potential_movement',
          'Movimiento comercial importante',
          format('%s, canal de alto potencial, ha pasado a “%s”.', NEW.name, status_label),
          'high',
          format('high-potential:%s:%s:%s:%s', NEW.id, manager_record.id, NEW.status, txid_current()),
          '/channels?detail=' || NEW.id
        )
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS relevant_channel_change_notifications ON public.channels;
CREATE TRIGGER relevant_channel_change_notifications
  AFTER UPDATE OF assigned_to, status ON public.channels
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_relevant_channel_change();

CREATE OR REPLACE FUNCTION public.notify_relevant_benchmark_signal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient record;
  source_channel_id uuid;
  competitor_name text;
  domain_label text;
BEGIN
  IF NEW.status <> 'incorporated' OR NOT (
    (
      (coalesce(NEW.confidence, 0) >= 75 OR NEW.reliability = 'confirmed')
      AND (
        nullif(btrim(NEW.implication), '') IS NOT NULL
        OR nullif(btrim(NEW.recommended_action), '') IS NOT NULL
      )
    )
    OR (NEW.entry_type = 'contradiction' AND coalesce(NEW.confidence, 0) >= 70)
  ) THEN
    RETURN NEW;
  END IF;

  SELECT channel_id INTO source_channel_id
  FROM public.benchmark_sources
  WHERE id = NEW.source_id;

  SELECT name INTO competitor_name
  FROM public.benchmark_competitors
  WHERE id = NEW.competitor_id;

  domain_label := CASE NEW.domain
    WHEN 'caes' THEN 'CAEs'
    WHEN 'new_business' THEN 'Nuevos Negocios'
    ELSE 'transversal'
  END;

  FOR recipient IN
    SELECT p.id
    FROM public.profiles p
    WHERE p.is_active = true
      AND p.id IS DISTINCT FROM NEW.created_by
      AND (
        NEW.domain = 'cross'
        OR p.benchmark_profile = 'integrated'
        OR (NEW.domain = 'caes' AND p.benchmark_profile = 'caes')
        OR (NEW.domain = 'new_business' AND p.benchmark_profile = 'new_business')
      )
  LOOP
    INSERT INTO public.alerts (
      user_id, channel_id, alert_type, title, detail, priority,
      event_key, action_path
    ) VALUES (
      recipient.id,
      source_channel_id,
      'benchmark_signal',
      'Señal relevante de benchmark',
      left(
        format(
          '%s%s: %s',
          domain_label,
          CASE WHEN competitor_name IS NULL THEN '' ELSE ' · ' || competitor_name END,
          NEW.statement
        ),
        280
      ),
      'high',
      format('benchmark-signal:%s:%s', NEW.id, recipient.id),
      '/benchmark'
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS relevant_benchmark_signal_notifications ON public.benchmark_entries;
CREATE TRIGGER relevant_benchmark_signal_notifications
  AFTER INSERT ON public.benchmark_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_relevant_benchmark_signal();

CREATE OR REPLACE FUNCTION public.refresh_relevant_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  viewer_id uuid := auth.uid();
  viewer_role text;
  viewer_can_manage boolean;
  blocked_count integer := 0;
  blocked_kams integer := 0;
  blocked_signature text;
  inserted_count integer := 0;
BEGIN
  IF viewer_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT role, coalesce(can_manage_users, false)
  INTO viewer_role, viewer_can_manage
  FROM public.profiles
  WHERE id = viewer_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  UPDATE public.alerts alert
  SET is_dismissed = true
  WHERE alert.user_id = viewer_id
    AND alert.alert_type = 'onboarding_blocked'
    AND NOT EXISTS (
      SELECT 1
      FROM public.channels channel
      WHERE channel.id = alert.channel_id
        AND channel.assigned_to = viewer_id
        AND channel.pipeline_stage = 'onboarding'
        AND coalesce(
          channel.onboarding_status_changed_at,
          channel.pipeline_stage_changed_at,
          channel.updated_at,
          channel.created_at
        ) <= now() - interval '10 days'
    );

  INSERT INTO public.alerts (
    user_id, channel_id, alert_type, title, detail, priority,
    event_key, action_path
  )
  SELECT
    viewer_id,
    channel.id,
    'onboarding_blocked',
    'Alta bloqueada',
    format(
      '%s lleva %s días sin avanzar en el proceso de alta.',
      channel.name,
      floor(extract(epoch FROM (
        now() - coalesce(
          channel.onboarding_status_changed_at,
          channel.pipeline_stage_changed_at,
          channel.updated_at,
          channel.created_at
        )
      )) / 86400)::integer
    ),
    'high',
    format(
      'onboarding-blocked:%s:%s:%s',
      channel.id,
      viewer_id,
      extract(epoch FROM coalesce(
        channel.onboarding_status_changed_at,
        channel.pipeline_stage_changed_at,
        channel.updated_at,
        channel.created_at
      ))::bigint
    ),
    '/channels?detail=' || channel.id
  FROM public.channels channel
  WHERE channel.assigned_to = viewer_id
    AND channel.pipeline_stage = 'onboarding'
    AND coalesce(
      channel.onboarding_status_changed_at,
      channel.pipeline_stage_changed_at,
      channel.updated_at,
      channel.created_at
    ) <= now() - interval '10 days'
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF viewer_role IN ('coordinator', 'manager', 'director') OR viewer_can_manage THEN
    WITH RECURSIVE team AS (
      SELECT p.id, p.role
      FROM public.profiles p
      WHERE p.reports_to = viewer_id AND p.is_active = true

      UNION

      SELECT p.id, p.role
      FROM public.profiles p
      JOIN team parent ON p.reports_to = parent.id
      WHERE p.is_active = true
    ), blocked AS (
      SELECT channel.id, channel.assigned_to,
        coalesce(
          channel.onboarding_status_changed_at,
          channel.pipeline_stage_changed_at,
          channel.updated_at,
          channel.created_at
        ) AS blocked_since
      FROM public.channels channel
      JOIN team member ON member.id = channel.assigned_to
      WHERE channel.pipeline_stage = 'onboarding'
        AND coalesce(
          channel.onboarding_status_changed_at,
          channel.pipeline_stage_changed_at,
          channel.updated_at,
          channel.created_at
        ) <= now() - interval '10 days'
    )
    SELECT
      count(*)::integer,
      count(DISTINCT assigned_to)::integer,
      md5(string_agg(id::text || ':' || blocked_since::text, ',' ORDER BY id::text))
    INTO blocked_count, blocked_kams, blocked_signature
    FROM blocked;

    IF blocked_count > 0 THEN
      UPDATE public.alerts
      SET is_dismissed = true
      WHERE user_id = viewer_id
        AND alert_type = 'team_risk'
        AND event_key IS DISTINCT FROM format('team-risk:%s:%s', viewer_id, blocked_signature);

      INSERT INTO public.alerts (
        user_id, alert_type, title, detail, priority, event_key, action_path
      ) VALUES (
        viewer_id,
        'team_risk',
        'Riesgo en el equipo',
        format(
          '%s altas de %s KAM%s llevan más de 10 días sin avanzar.',
          blocked_count,
          blocked_kams,
          CASE WHEN blocked_kams = 1 THEN '' ELSE 's' END
        ),
        'high',
        format('team-risk:%s:%s', viewer_id, blocked_signature),
        '/dashboard'
      )
      ON CONFLICT DO NOTHING;

      GET DIAGNOSTICS blocked_count = ROW_COUNT;
      inserted_count := inserted_count + blocked_count;
    ELSE
      UPDATE public.alerts
      SET is_dismissed = true
      WHERE user_id = viewer_id AND alert_type = 'team_risk';
    END IF;
  END IF;

  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_relevant_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_relevant_notifications() TO authenticated;

COMMENT ON COLUMN public.alerts.event_key IS
  'Clave estable para evitar notificaciones duplicadas del mismo evento.';
COMMENT ON COLUMN public.alerts.action_path IS
  'Destino contextual al abrir la notificación.';
COMMENT ON FUNCTION public.refresh_relevant_notifications() IS
  'Actualiza las alertas temporales relevantes del usuario autenticado sin crear avisos de tareas vencidas.';
