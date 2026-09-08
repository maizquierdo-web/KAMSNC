-- Amplía la taxonomía y añade la lente de Benchmark al perfil general.
-- Es una migración aditiva: conserva todos los valores y datos existentes.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS benchmark_profile text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_benchmark_profile_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_benchmark_profile_check
  CHECK (
    benchmark_profile IS NULL
    OR benchmark_profile IN ('caes', 'new_business', 'integrated')
  );

COMMENT ON COLUMN public.profiles.benchmark_profile IS
  'Lente predeterminada del agente Benchmark: CAEs, Nuevos Negocios o visión integrada.';

-- Asignación inicial solicitada. Se mantiene NULL para el resto de usuarios.
UPDATE public.profiles
SET benchmark_profile = 'caes'
WHERE lower(btrim(full_name)) ~ '^(judith|egoitz|miguel ángel|miguel angel|marina)([[:space:]]|$)';

UPDATE public.profiles
SET benchmark_profile = 'new_business'
WHERE lower(btrim(full_name)) ~ '^(claudia|lucía|lucia|andrea)([[:space:]]|$)';

UPDATE public.profiles
SET benchmark_profile = 'integrated'
WHERE lower(btrim(full_name)) ~ '^amelia([[:space:]]|$)';

-- Se conserva "sme" para compatibilidad histórica y se añade el valor correcto
-- para las nuevas aportaciones de Residencial.
ALTER TABLE public.benchmark_entries
  DROP CONSTRAINT IF EXISTS benchmark_entries_subdomain_check;

ALTER TABLE public.benchmark_entries
  ADD CONSTRAINT benchmark_entries_subdomain_check
  CHECK (
    subdomain IN (
      'wholesale', 'solar', 'sme', 'residential',
      'remote_sales', 'caes', 'cross'
    )
  );
