BEGIN;

-- Limita la lista preexistente a los perfiles del acuerdo, conservando sus UUID.
DELETE FROM public.anerr_access AS a
USING public.profiles AS p
WHERE p.id = a.user_id
  AND lower(btrim(translate(p.full_name, 'ÁáÍí', 'AaIi'))) !~
      '^(judith martinez|amelia sadornil|miguel (angel )?izquierdo)([[:space:]]|$)';

CREATE OR REPLACE FUNCTION public.anerr_require_access()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF NOT public.anerr_can_access() AND current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      IF num_nonnulls(NEW.anerr_link, NEW.anerr_delegate, NEW.anerr_territory, NEW.anerr_presented_on, NEW.anerr_alias) > 0 THEN
        RAISE EXCEPTION 'Acceso ANERR denegado' USING ERRCODE = '42501';
      END IF;
    ELSIF ROW(NEW.anerr_link, NEW.anerr_delegate, NEW.anerr_territory, NEW.anerr_presented_on, NEW.anerr_alias)
        IS DISTINCT FROM ROW(OLD.anerr_link, OLD.anerr_delegate, OLD.anerr_territory, OLD.anerr_presented_on, OLD.anerr_alias) THEN
      RAISE EXCEPTION 'Acceso ANERR denegado' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS anerr_require_access ON public.channels;
CREATE TRIGGER anerr_require_access
BEFORE INSERT OR UPDATE OF anerr_link, anerr_delegate, anerr_territory, anerr_presented_on, anerr_alias
ON public.channels FOR EACH ROW EXECUTE FUNCTION public.anerr_require_access();

COMMIT;
