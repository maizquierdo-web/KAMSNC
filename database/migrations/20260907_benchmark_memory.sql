-- Memoria colectiva del asistente de Benchmark.
-- Primera fase: aportaciones manuales estructuradas y confirmadas por el KAM.

CREATE TABLE IF NOT EXISTS public.benchmark_competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  normalized_name text GENERATED ALWAYS AS (lower(btrim(name))) STORED,
  description text,
  website text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (normalized_name)
);

CREATE TABLE IF NOT EXISTS public.benchmark_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (
    source_type IN ('manual', 'meeting_minutes', 'conversation', 'document')
  ),
  title text,
  raw_content text NOT NULL CHECK (length(btrim(raw_content)) > 0),
  channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  source_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.benchmark_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.benchmark_sources(id) ON DELETE RESTRICT,
  competitor_id uuid REFERENCES public.benchmark_competitors(id) ON DELETE SET NULL,
  domain text NOT NULL CHECK (domain IN ('new_business', 'caes', 'cross')),
  subdomain text NOT NULL CHECK (
    subdomain IN ('wholesale', 'solar', 'sme', 'remote_sales', 'caes', 'cross')
  ),
  section text NOT NULL CHECK (
    section IN (
      'general', 'value_proposition', 'products_services', 'commercial_model',
      'operations', 'technology', 'incentives', 'communication', 'strengths',
      'weaknesses', 'risks', 'opportunities', 'economic_conditions',
      'organization_capabilities'
    )
  ),
  statement text NOT NULL CHECK (length(btrim(statement)) > 0),
  entry_type text NOT NULL DEFAULT 'evidence' CHECK (
    entry_type IN ('evidence', 'hypothesis', 'contradiction')
  ),
  reliability text NOT NULL DEFAULT 'market_information' CHECK (
    reliability IN ('confirmed', 'market_information', 'hypothesis')
  ),
  confidence smallint CHECK (confidence BETWEEN 0 AND 100),
  implication text,
  recommended_action text,
  tags text[] NOT NULL DEFAULT '{}',
  valid_until date,
  status text NOT NULL DEFAULT 'incorporated' CHECK (
    status IN ('candidate', 'incorporated', 'rejected', 'outdated')
  ),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.benchmark_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL CHECK (domain IN ('new_business', 'caes', 'cross')),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  conclusion text NOT NULL CHECK (length(btrim(conclusion)) > 0),
  recommended_action text,
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'validated', 'discarded', 'outdated')
  ),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  validated_by uuid REFERENCES public.profiles(id),
  validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.benchmark_insight_entries (
  insight_id uuid NOT NULL REFERENCES public.benchmark_insights(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES public.benchmark_entries(id) ON DELETE RESTRICT,
  PRIMARY KEY (insight_id, entry_id)
);

CREATE INDEX IF NOT EXISTS benchmark_entries_domain_idx
  ON public.benchmark_entries (domain, subdomain, status, created_at DESC);
CREATE INDEX IF NOT EXISTS benchmark_entries_competitor_idx
  ON public.benchmark_entries (competitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS benchmark_sources_channel_idx
  ON public.benchmark_sources (channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS benchmark_entries_search_idx
  ON public.benchmark_entries
  USING gin (to_tsvector('spanish', statement || ' ' || coalesce(implication, '')));

CREATE OR REPLACE FUNCTION public.benchmark_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS benchmark_competitors_updated_at ON public.benchmark_competitors;
CREATE TRIGGER benchmark_competitors_updated_at
  BEFORE UPDATE ON public.benchmark_competitors
  FOR EACH ROW EXECUTE FUNCTION public.benchmark_set_updated_at();

DROP TRIGGER IF EXISTS benchmark_entries_updated_at ON public.benchmark_entries;
CREATE TRIGGER benchmark_entries_updated_at
  BEFORE UPDATE ON public.benchmark_entries
  FOR EACH ROW EXECUTE FUNCTION public.benchmark_set_updated_at();

DROP TRIGGER IF EXISTS benchmark_insights_updated_at ON public.benchmark_insights;
CREATE TRIGGER benchmark_insights_updated_at
  BEFORE UPDATE ON public.benchmark_insights
  FOR EACH ROW EXECUTE FUNCTION public.benchmark_set_updated_at();

CREATE OR REPLACE FUNCTION public.is_active_benchmark_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.can_review_benchmark()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND (p.role IN ('coordinator', 'manager', 'director') OR p.can_manage_users = true)
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_benchmark_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_review_benchmark() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_benchmark_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_review_benchmark() TO authenticated;

ALTER TABLE public.benchmark_competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmark_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmark_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmark_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmark_insight_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS benchmark_competitors_read ON public.benchmark_competitors;
CREATE POLICY benchmark_competitors_read ON public.benchmark_competitors
  FOR SELECT TO authenticated USING (public.is_active_benchmark_user());
DROP POLICY IF EXISTS benchmark_competitors_create ON public.benchmark_competitors;
CREATE POLICY benchmark_competitors_create ON public.benchmark_competitors
  FOR INSERT TO authenticated WITH CHECK (
    public.is_active_benchmark_user() AND created_by = auth.uid()
  );
DROP POLICY IF EXISTS benchmark_competitors_update ON public.benchmark_competitors;
CREATE POLICY benchmark_competitors_update ON public.benchmark_competitors
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.can_review_benchmark())
  WITH CHECK (created_by = auth.uid() OR public.can_review_benchmark());

DROP POLICY IF EXISTS benchmark_sources_read ON public.benchmark_sources;
CREATE POLICY benchmark_sources_read ON public.benchmark_sources
  FOR SELECT TO authenticated USING (public.is_active_benchmark_user());
DROP POLICY IF EXISTS benchmark_sources_create ON public.benchmark_sources;
CREATE POLICY benchmark_sources_create ON public.benchmark_sources
  FOR INSERT TO authenticated WITH CHECK (
    public.is_active_benchmark_user() AND created_by = auth.uid()
  );
DROP POLICY IF EXISTS benchmark_sources_update ON public.benchmark_sources;
CREATE POLICY benchmark_sources_update ON public.benchmark_sources
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.can_review_benchmark())
  WITH CHECK (created_by = auth.uid() OR public.can_review_benchmark());

DROP POLICY IF EXISTS benchmark_entries_read ON public.benchmark_entries;
CREATE POLICY benchmark_entries_read ON public.benchmark_entries
  FOR SELECT TO authenticated USING (public.is_active_benchmark_user());
DROP POLICY IF EXISTS benchmark_entries_create ON public.benchmark_entries;
CREATE POLICY benchmark_entries_create ON public.benchmark_entries
  FOR INSERT TO authenticated WITH CHECK (
    public.is_active_benchmark_user()
    AND created_by = auth.uid()
    AND status IN ('candidate', 'incorporated')
  );
DROP POLICY IF EXISTS benchmark_entries_update ON public.benchmark_entries;
CREATE POLICY benchmark_entries_update ON public.benchmark_entries
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.can_review_benchmark())
  WITH CHECK (created_by = auth.uid() OR public.can_review_benchmark());

DROP POLICY IF EXISTS benchmark_insights_read ON public.benchmark_insights;
CREATE POLICY benchmark_insights_read ON public.benchmark_insights
  FOR SELECT TO authenticated USING (public.is_active_benchmark_user());
DROP POLICY IF EXISTS benchmark_insights_create ON public.benchmark_insights;
CREATE POLICY benchmark_insights_create ON public.benchmark_insights
  FOR INSERT TO authenticated WITH CHECK (
    public.can_review_benchmark() AND created_by = auth.uid()
  );
DROP POLICY IF EXISTS benchmark_insights_update ON public.benchmark_insights;
CREATE POLICY benchmark_insights_update ON public.benchmark_insights
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.can_review_benchmark())
  WITH CHECK (created_by = auth.uid() OR public.can_review_benchmark());

DROP POLICY IF EXISTS benchmark_insight_entries_read ON public.benchmark_insight_entries;
CREATE POLICY benchmark_insight_entries_read ON public.benchmark_insight_entries
  FOR SELECT TO authenticated USING (public.is_active_benchmark_user());
DROP POLICY IF EXISTS benchmark_insight_entries_manage ON public.benchmark_insight_entries;
CREATE POLICY benchmark_insight_entries_manage ON public.benchmark_insight_entries
  FOR ALL TO authenticated
  USING (public.can_review_benchmark())
  WITH CHECK (public.can_review_benchmark());

GRANT SELECT, INSERT, UPDATE ON public.benchmark_competitors TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.benchmark_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.benchmark_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.benchmark_insights TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.benchmark_insight_entries TO authenticated;

CREATE OR REPLACE FUNCTION public.add_manual_benchmark_entry(
  p_raw_content text,
  p_competitor_name text,
  p_domain text,
  p_subdomain text,
  p_section text,
  p_statement text,
  p_confidence smallint DEFAULT NULL,
  p_implication text DEFAULT NULL,
  p_recommended_action text DEFAULT NULL,
  p_tags text[] DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  new_source_id uuid;
  new_entry_id uuid;
  selected_competitor_id uuid;
BEGIN
  IF NOT public.is_active_benchmark_user() THEN
    RAISE EXCEPTION 'Usuario no autorizado para aportar información al benchmark';
  END IF;

  IF nullif(btrim(p_competitor_name), '') IS NOT NULL THEN
    INSERT INTO public.benchmark_competitors (name, created_by)
    VALUES (btrim(p_competitor_name), auth.uid())
    ON CONFLICT (normalized_name) DO NOTHING;

    SELECT id INTO selected_competitor_id
    FROM public.benchmark_competitors
    WHERE normalized_name = lower(btrim(p_competitor_name));
  END IF;

  INSERT INTO public.benchmark_sources (
    source_type, title, raw_content, created_by
  ) VALUES (
    'manual', 'Aportación directa de KAM', btrim(p_raw_content), auth.uid()
  )
  RETURNING id INTO new_source_id;

  INSERT INTO public.benchmark_entries (
    source_id, competitor_id, domain, subdomain, section, statement,
    entry_type, reliability, confidence, implication, recommended_action,
    tags, status, created_by, reviewed_by, reviewed_at
  ) VALUES (
    new_source_id, selected_competitor_id, p_domain, p_subdomain, p_section,
    btrim(p_statement), 'evidence', 'market_information', p_confidence,
    nullif(btrim(p_implication), ''), nullif(btrim(p_recommended_action), ''),
    coalesce(p_tags, '{}'), 'incorporated', auth.uid(), auth.uid(), now()
  )
  RETURNING id INTO new_entry_id;

  RETURN new_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_manual_benchmark_entry(
  text, text, text, text, text, text, smallint, text, text, text[]
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_manual_benchmark_entry(
  text, text, text, text, text, text, smallint, text, text, text[]
) TO authenticated;

COMMENT ON TABLE public.benchmark_entries IS
  'Memoria colectiva estructurada: evidencias, hipótesis y contradicciones confirmadas por usuarios.';
