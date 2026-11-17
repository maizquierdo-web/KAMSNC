BEGIN;

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS anerr_link text CHECK (anerr_link IN ('ANERR', 'ORIGEN ANERR')),
  ADD COLUMN IF NOT EXISTS anerr_delegate text,
  ADD COLUMN IF NOT EXISTS anerr_territory text,
  ADD COLUMN IF NOT EXISTS anerr_presented_on date,
  ADD COLUMN IF NOT EXISTS anerr_alias text;

CREATE OR REPLACE FUNCTION public.anerr_check_origin_link()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF NEW.anerr_link = 'ORIGEN ANERR' AND OLD.anerr_link IS DISTINCT FROM NEW.anerr_link
    AND (OLD.status IN ('activo', 'en_proceso_alta') OR NEW.status IN ('activo', 'en_proceso_alta')
      OR OLD.pipeline_stage IN ('active', 'onboarding') OR NEW.pipeline_stage IN ('active', 'onboarding'))
  THEN
    RAISE EXCEPTION 'ORIGEN ANERR solo se puede asignar antes de iniciar el alta del canal';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS anerr_check_origin_link ON public.channels;
CREATE TRIGGER anerr_check_origin_link
BEFORE UPDATE OF anerr_link ON public.channels
FOR EACH ROW EXECUTE FUNCTION public.anerr_check_origin_link();

CREATE TABLE IF NOT EXISTS public.anerr_access (
  user_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE
);
ALTER TABLE public.anerr_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.anerr_access FROM PUBLIC, anon, authenticated;

INSERT INTO public.anerr_access (user_id)
SELECT id FROM public.profiles
WHERE lower(btrim(full_name)) ~ '^(judith|amelia)([[:space:]]|$)'
   OR lower(btrim(translate(full_name, 'Áá', 'Aa'))) ~ '^miguel (angel([[:space:]]|$)|izquierdo([[:space:]]|$))'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.anerr_can_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.anerr_access a JOIN public.profiles p ON p.id = a.user_id
    WHERE a.user_id = auth.uid() AND p.is_active IS TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.anerr_normalize(value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT regexp_replace(translate(lower(coalesce(value, '')), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.anerr_import(payload jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  incoming public.channels;
  matched public.channels;
  matches uuid[];
  tax_id text;
  names text[];
BEGIN
  IF NOT public.anerr_can_access() THEN
    RAISE EXCEPTION 'Acceso ANERR denegado' USING ERRCODE = '42501';
  END IF;
  incoming := jsonb_populate_record(NULL::public.channels, payload);
  incoming.anerr_link := nullif(upper(btrim(incoming.anerr_link)), '');
  IF incoming.anerr_link NOT IN ('ANERR', 'ORIGEN ANERR') THEN RETURN 'invalid'; END IF;
  tax_id := public.anerr_normalize(incoming.cif);
  names := array_remove(ARRAY[public.anerr_normalize(incoming.name), public.anerr_normalize(incoming.anerr_alias)], '');
  IF cardinality(names) = 0 OR (incoming.anerr_presented_on IS NOT NULL AND incoming.anerr_presented_on > current_date) THEN
    RETURN 'invalid';
  END IF;

  -- Evita que dos cargas o un alta ordinaria escriban entre el cotejo y el registro.
  LOCK TABLE public.channels IN SHARE ROW EXCLUSIVE MODE;

  IF tax_id <> '' THEN
    SELECT array_agg(id) INTO matches FROM public.channels
    WHERE public.anerr_normalize(cif) = tax_id;
  END IF;

  IF coalesce(cardinality(matches), 0) = 0 THEN
    SELECT array_agg(id) INTO matches FROM public.channels
    WHERE (tax_id = '' OR public.anerr_normalize(cif) = '')
      AND (public.anerr_normalize(name) = ANY(names) OR public.anerr_normalize(anerr_alias) = ANY(names));
  END IF;

  IF cardinality(matches) > 1 THEN RETURN 'ambiguous'; END IF;
  IF cardinality(matches) = 1 THEN
    SELECT * INTO matched FROM public.channels WHERE id = matches[1];
    IF matched.anerr_link IS NULL THEN
      IF matched.status IN ('activo', 'en_proceso_alta') OR matched.pipeline_stage IN ('active', 'onboarding') THEN
        RETURN 'excluded';
      END IF;
      IF incoming.anerr_link = 'ANERR' THEN RETURN 'mismatch'; END IF;
      IF incoming.anerr_presented_on IS NULL THEN RETURN 'awaiting'; END IF;
    ELSIF incoming.anerr_link IS NOT NULL AND incoming.anerr_link <> matched.anerr_link THEN
      RETURN 'mismatch';
    END IF;
    UPDATE public.channels
    SET anerr_link = coalesce(matched.anerr_link, 'ORIGEN ANERR'),
        anerr_delegate = coalesce(nullif(incoming.anerr_delegate, ''), matched.anerr_delegate),
        anerr_territory = coalesce(nullif(incoming.anerr_territory, ''), matched.anerr_territory),
        anerr_alias = coalesce(nullif(incoming.anerr_alias, ''), matched.anerr_alias),
        anerr_presented_on = coalesce(matched.anerr_presented_on, incoming.anerr_presented_on)
    WHERE id = matched.id;
    RETURN CASE WHEN matched.anerr_link IS NULL THEN 'linked' ELSE 'updated' END;
  END IF;

  IF incoming.anerr_link = 'ORIGEN ANERR' THEN RETURN 'mismatch'; END IF;

  INSERT INTO public.channels (
    name, contact_name, phone, email, cif, website, google_rating, lead_source, potencial_caes,
    potencial_energia, comunidad_autonoma, volume_amount, volume_unit, address, city, province,
    status, pipeline_stage, notes, assigned_to, anerr_link, anerr_delegate, anerr_territory, anerr_presented_on, anerr_alias
  ) VALUES (
    incoming.name, incoming.contact_name, incoming.phone, incoming.email, incoming.cif, incoming.website,
    incoming.google_rating, ARRAY['anerr']::text[], incoming.potencial_caes, incoming.potencial_energia,
    incoming.comunidad_autonoma, incoming.volume_amount, incoming.volume_unit, incoming.address, incoming.city,
    incoming.province, 'pendiente_contacto', 'lead', incoming.notes, auth.uid(), 'ANERR',
    incoming.anerr_delegate, incoming.anerr_territory, incoming.anerr_presented_on, incoming.anerr_alias
  );
  RETURN 'created';
END;
$$;

CREATE OR REPLACE FUNCTION public.anerr_followup()
RETURNS TABLE (
  id uuid, name text, anerr_link text, delegate text, territory text, responsible text, status text,
  stage text, presented_on date, first_contact date, first_meeting date, planned_meeting date,
  action_on date, action text, activated_on date, closed_on date, close_reason text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT c.id, c.name, c.anerr_link, c.anerr_delegate, c.anerr_territory, p.full_name, c.status,
         c.pipeline_stage, c.anerr_presented_on,
         least(activity.first_contact, minutes.first_meeting), least(activity.first_meeting, minutes.first_meeting),
         activity.planned_meeting, next_action.scheduled_date, next_action.subject,
         milestones.activated_on, milestones.closed_on, c.rejection_reason
  FROM public.channels c
  LEFT JOIN public.profiles p ON p.id = c.assigned_to
  LEFT JOIN LATERAL (
    SELECT min((f.occurred_at AT TIME ZONE 'Europe/Madrid')::date) FILTER (
      WHERE f.status IN ('completed', 'in_progress') AND f.activity_type IN ('call', 'email', 'whatsapp', 'meeting', 'visit')
    ) AS first_contact,
    min((f.occurred_at AT TIME ZONE 'Europe/Madrid')::date) FILTER (
      WHERE f.status = 'completed' AND f.activity_type = 'meeting'
    ) AS first_meeting,
    min(f.scheduled_date) FILTER (
      WHERE f.status IN ('planned', 'overdue') AND f.activity_type = 'meeting'
    ) AS planned_meeting
    FROM public.channel_activity_feed f
    WHERE f.channel_id = c.id
      AND coalesce((f.occurred_at AT TIME ZONE 'Europe/Madrid')::date, f.scheduled_date) >= c.anerr_presented_on
  ) activity ON true
  LEFT JOIN LATERAL (
    SELECT min(m.meeting_date::date) AS first_meeting
    FROM public.channel_meetings m WHERE m.channel_id = c.id AND m.meeting_date::date >= c.anerr_presented_on
      AND m.meeting_date::date <= (now() AT TIME ZONE 'Europe/Madrid')::date
  ) minutes ON true
  LEFT JOIN LATERAL (
    SELECT f.scheduled_date, coalesce(nullif(f.subject, ''), f.activity_type) AS subject
    FROM public.channel_activity_feed f
    WHERE f.channel_id = c.id AND f.scheduled_date IS NOT NULL AND f.status IN ('planned', 'overdue')
    ORDER BY f.scheduled_date, f.scheduled_time NULLS LAST, f.activity_key
    LIMIT 1
  ) next_action ON true
  LEFT JOIN LATERAL (
    SELECT min((h.created_at AT TIME ZONE 'Europe/Madrid')::date) FILTER (WHERE h.to_stage = 'active') AS activated_on,
           min((h.created_at AT TIME ZONE 'Europe/Madrid')::date) FILTER (WHERE h.to_stage = 'closed_no_deal') AS closed_on
    FROM public.channel_pipeline_history h
    WHERE h.channel_id = c.id
      AND (h.created_at AT TIME ZONE 'Europe/Madrid')::date >= coalesce(c.anerr_presented_on, (c.created_at AT TIME ZONE 'Europe/Madrid')::date)
  ) milestones ON true
  WHERE public.anerr_can_access() AND c.anerr_link IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.anerr_can_access(), public.anerr_import(jsonb), public.anerr_followup() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anerr_can_access(), public.anerr_import(jsonb), public.anerr_followup() TO authenticated;

COMMIT;
