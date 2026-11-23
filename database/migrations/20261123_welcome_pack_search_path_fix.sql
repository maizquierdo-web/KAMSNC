BEGIN;
-- Las políticas/funciones existentes del CRM consultan profiles sin esquema.
-- Mantener SECURITY INVOKER y RLS; fijar public antes de pg_temp.
ALTER FUNCTION public.save_channel_welcome_pack(uuid,jsonb,jsonb,boolean,boolean) SET search_path = public, pg_temp;
ALTER FUNCTION public.check_channel_welcome_pack() SET search_path = public, pg_temp;
COMMIT;
