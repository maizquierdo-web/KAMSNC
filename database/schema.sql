-- ============================================================
-- CRM para KAMs — Esquema completo de la base de datos
-- Generado desde Supabase (proyecto gjnhyesrqhizdekljzhm)
-- Fecha de generación: 19 de junio de 2026
--
-- IMPORTANTE: este archivo es una REFERENCIA, no un script de
-- migración. La fuente de verdad real es la base de datos en
-- Supabase. Si necesitas regenerar este archivo, ejecuta:
--
--   SELECT table_name, column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns WHERE table_schema = 'public'
--   ORDER BY table_name, ordinal_position;
-- ============================================================

CREATE TABLE account_plan_actions (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  plan_id                uuid NOT NULL,
  title                  text NOT NULL,
  description            text,
  due_date               date,
  status                 text DEFAULT 'pending'::text,
  completed_at           timestamptz,
  sort_order             integer DEFAULT 0,
  created_at             timestamptz DEFAULT now()
);

CREATE TABLE account_plan_documents (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  plan_id                uuid NOT NULL,
  file_name              text NOT NULL,
  file_url               text NOT NULL,
  file_size              integer,
  file_type              text,
  uploaded_by            uuid NOT NULL,
  created_at             timestamptz DEFAULT now()
);

CREATE TABLE account_plans (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  channel_id             uuid NOT NULL,
  kam_id                 uuid NOT NULL,
  year                   integer NOT NULL DEFAULT EXTRACT(year FROM CURRENT_DATE),
  objective              text,
  strategy               text,
  status                 text DEFAULT 'active'::text,
  review_date            date,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now(),
  completion_pct         integer DEFAULT 0
);

CREATE TABLE business_cases (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  channel_id             uuid NOT NULL UNIQUE,
  file_name              text NOT NULL,
  storage_path           text NOT NULL,
  file_size              integer,
  file_type              text,
  uploaded_by            uuid NOT NULL,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

CREATE TABLE alerts (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL,
  channel_id             uuid,
  visit_id               uuid,
  alert_type             text NOT NULL,
  title                  text NOT NULL,
  detail                 text,
  due_date               date,
  priority               text DEFAULT 'medium'::text,
  is_read                boolean DEFAULT false,
  is_dismissed           boolean DEFAULT false,
  created_at             timestamptz DEFAULT now()
);

CREATE TABLE badges (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL,
  badge_type             text NOT NULL,
  badge_name             text NOT NULL,
  badge_description      text,
  badge_icon             text,
  earned_at              timestamptz DEFAULT now(),
  period                 text,
  period_key             text
);

CREATE TABLE channel_classification (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  canal                  text NOT NULL,
  subcanal               text,
  tipo                   text,
  sort_order             integer DEFAULT 0,
  is_active              boolean DEFAULT true,
  created_at             timestamptz DEFAULT now()
);

CREATE TABLE channel_classifications (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  channel_id             uuid NOT NULL,
  classification_id      uuid NOT NULL,
  custom_text            text,
  created_at             timestamptz DEFAULT now()
);

CREATE TABLE channel_contact_prep (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  channel_id             uuid NOT NULL,
  research_notes         text,
  strategy               text,
  key_questions          text,
  value_proposition      text,
  updated_at             timestamptz DEFAULT now(),
  created_at             timestamptz DEFAULT now()
);

CREATE TABLE channel_interactions (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  channel_id             uuid NOT NULL,
  user_id                uuid NOT NULL,
  interaction_type       text NOT NULL,
  direction              text NOT NULL DEFAULT 'outbound'::text,
  subject                text,
  notes                  text,
  duration_minutes       integer,
  result                 text,
  contact_person         text,
  created_at             timestamptz DEFAULT now(),
  planned_date           date,
  planned_time           time,
  is_completed           boolean DEFAULT true
);

CREATE TABLE channel_notes (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  channel_id             uuid NOT NULL,
  user_id                uuid NOT NULL,
  content                text NOT NULL,
  created_at             timestamptz DEFAULT now()
);

CREATE TABLE channel_pipeline_history (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  channel_id             uuid NOT NULL,
  from_stage             text,
  to_stage               text NOT NULL,
  changed_by             uuid,
  created_at             timestamptz DEFAULT now()
);

CREATE TABLE channels (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  name                   text NOT NULL,
  address                text,
  city                   text,
  postal_code            text,
  latitude               double precision,
  longitude              double precision,
  phone                  text,
  email                  text,
  contact_name           text,
  channel_type           text NOT NULL DEFAULT 'other'::text,
  status                 text NOT NULL DEFAULT 'prospect'::text,
  pipeline_stage         text DEFAULT 'lead'::text,
  assigned_to            uuid NOT NULL,
  notes                  text,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now(),
  informe_economico_url  text,
  informe_economico_name text,
  cif                    text,
  website                text,
  google_rating          numeric,
  province               text,
  pipeline_stage_changed_at timestamptz DEFAULT now(),
  lead_source            text[],
  volume_amount          numeric,
  volume_unit            text,
  canal_caes_type        text,
  sector_cae_objetivo    text[],
  potencial_caes         text,
  potencial_venta_energia text,
  comunidad_autonoma     text,
  potencial_energia      text
);

CREATE TABLE kam_playbook (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  section                text NOT NULL,
  content                text NOT NULL,
  sort_order             integer DEFAULT 0,
  is_active              boolean DEFAULT true,
  created_at             timestamptz DEFAULT now()
);

CREATE TABLE leaderboard_monthly (
  kam_id                 uuid,
  full_name              text,
  zone                   text,
  reports_to             uuid,
  visits                 bigint,
  positive               bigint,
  unique_channels        bigint,
  new_channels           bigint,
  score                  bigint
);

CREATE TABLE leaderboard_weekly (
  kam_id                 uuid,
  full_name              text,
  zone                   text,
  avatar_url             text,
  reports_to             uuid,
  visits                 bigint,
  positive               bigint,
  negative               bigint,
  avg_duration           integer,
  unique_channels        bigint,
  pipeline_active        bigint,
  new_channels           bigint,
  score                  bigint
);

CREATE TABLE planned_visits (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  channel_id             uuid NOT NULL,
  kam_id                 uuid NOT NULL,
  planned_date           date NOT NULL,
  planned_time           time,
  notes                  text,
  visit_id               uuid,
  is_completed           boolean DEFAULT false,
  created_at             timestamptz DEFAULT now()
);

CREATE TABLE profiles (
  id                     uuid NOT NULL,
  full_name              text NOT NULL,
  email                  text NOT NULL,
  role                   text NOT NULL,
  reports_to             uuid,
  zone                   text,
  phone                  text,
  avatar_url             text,
  is_active              boolean DEFAULT true,
  can_manage_users       boolean DEFAULT false,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

CREATE TABLE visits (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  channel_id             uuid NOT NULL,
  kam_id                 uuid NOT NULL,
  checkin_at             timestamptz NOT NULL,
  checkin_lat            double precision,
  checkin_lng            double precision,
  checkin_accuracy       integer,
  checkout_at            timestamptz,
  checkout_lat           double precision,
  checkout_lng           double precision,
  objective              text,
  result                 text,
  result_notes           text,
  next_steps             text,
  next_action_date       date,
  photos                 text[],
  is_gps_verified        boolean DEFAULT true,
  is_offline_sync        boolean DEFAULT false,
  duration_minutes       integer
);
