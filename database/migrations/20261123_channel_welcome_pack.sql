BEGIN;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS caes_assigned_sheets text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS welcome_pack_config jsonb NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS public.channel_welcome_packs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
 created_by uuid NOT NULL REFERENCES public.profiles(id), data jsonb NOT NULL DEFAULT '{}', email_draft jsonb NOT NULL DEFAULT '{}',
 sender_email text NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','prepared')),
 template_version text NOT NULL DEFAULT '2026-11-v1', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(channel_id,created_by)
);
ALTER TABLE public.channel_welcome_packs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS welcome_packs_own_read ON public.channel_welcome_packs;
CREATE POLICY welcome_packs_own_read ON public.channel_welcome_packs FOR SELECT TO authenticated
 USING(created_by=auth.uid() AND EXISTS(SELECT 1 FROM public.channels c WHERE c.id=channel_id));
DROP POLICY IF EXISTS welcome_packs_own_insert ON public.channel_welcome_packs;
CREATE POLICY welcome_packs_own_insert ON public.channel_welcome_packs FOR INSERT TO authenticated
 WITH CHECK(created_by=auth.uid() AND EXISTS(SELECT 1 FROM public.channels c WHERE c.id=channel_id));
DROP POLICY IF EXISTS welcome_packs_own_update ON public.channel_welcome_packs;
CREATE POLICY welcome_packs_own_update ON public.channel_welcome_packs FOR UPDATE TO authenticated
 USING(created_by=auth.uid() AND EXISTS(SELECT 1 FROM public.channels c WHERE c.id=channel_id))
 WITH CHECK(created_by=auth.uid() AND EXISTS(SELECT 1 FROM public.channels c WHERE c.id=channel_id));
GRANT SELECT,INSERT,UPDATE ON public.channel_welcome_packs TO authenticated;
CREATE OR REPLACE FUNCTION public.check_channel_welcome_pack()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.channels%ROWTYPE; item text;
BEGIN
 IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuario no autorizado'; END IF;
 IF TG_OP='UPDATE' AND (NEW.channel_id IS DISTINCT FROM OLD.channel_id OR NEW.created_by IS DISTINCT FROM OLD.created_by) THEN RAISE EXCEPTION 'No se puede cambiar el canal ni el propietario'; END IF;
 SELECT * INTO c FROM public.channels WHERE id=NEW.channel_id FOR UPDATE;
 IF NOT FOUND OR c.status IS DISTINCT FROM 'activo' OR (c.pipeline_stage IS NOT NULL AND c.pipeline_stage<>'active') THEN RAISE EXCEPTION 'El welcome pack solo se puede preparar para un canal ACTIVO'; END IF;
 NEW.sender_email:=auth.jwt()->>'email';
 IF nullif(btrim(NEW.sender_email),'') IS NULL THEN RAISE EXCEPTION 'No se ha podido obtener el email del usuario del CRM'; END IF;
 NEW.updated_at:=now(); NEW.template_version:='2026-11-v1';
 IF jsonb_typeof(NEW.data)<>'object' OR octet_length(NEW.data::text)>100000 OR jsonb_typeof(NEW.email_draft)<>'object' OR octet_length(NEW.email_draft::text)>100000 THEN RAISE EXCEPTION 'El borrador no es válido'; END IF;
 IF NEW.data ? 'sheets' THEN
  IF jsonb_typeof(NEW.data->'sheets')<>'array' THEN RAISE EXCEPTION 'Las fichas deben ser una lista'; END IF;
  FOR item IN SELECT jsonb_array_elements_text(NEW.data->'sheets') LOOP
   IF item !~ '^[A-Z]{3}[0-9]{3}$' THEN RAISE EXCEPTION 'Código de ficha CAE no válido: %',item; END IF;
  END LOOP;
 END IF;
 IF NEW.status='prepared' THEN
  FOREACH item IN ARRAY ARRAY['company','cif','contact','phone','kamName','kamPhone','startDate','ot1','ot2','verifier'] LOOP
   IF nullif(btrim(NEW.data->>item),'') IS NULL THEN RAISE EXCEPTION 'Falta el dato obligatorio: %',item; END IF;
  END LOOP;
  IF coalesce(NEW.data->>'route','') NOT IN ('mask','natureco','promoter_ot') OR coalesce(NEW.data->>'kind','') NOT IN ('Agregador','Facilitador') THEN RAISE EXCEPTION 'Selecciona el canal de entrada y el tipo'; END IF;
  IF coalesce(NEW.data->>'recipient','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR coalesce(NEW.data->>'kamEmail','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Confirma los correos del destinatario y del KAM'; END IF;
  IF NOT(NEW.data ? 'sheets') OR jsonb_array_length(NEW.data->'sheets')=0 THEN RAISE EXCEPTION 'Selecciona al menos una ficha CAE'; END IF;
  IF nullif(btrim(NEW.email_draft->>'subject'),'') IS NULL OR nullif(btrim(NEW.email_draft->>'body'),'') IS NULL THEN RAISE EXCEPTION 'Completa asunto y correo'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS check_channel_welcome_pack ON public.channel_welcome_packs;
CREATE TRIGGER check_channel_welcome_pack BEFORE INSERT OR UPDATE ON public.channel_welcome_packs FOR EACH ROW EXECUTE FUNCTION public.check_channel_welcome_pack();
-- Seguridad del invocador: conserva las RLS del CRM y bloquea el canal durante la preparación.
CREATE OR REPLACE FUNCTION public.save_channel_welcome_pack(p_channel_id uuid,p_data jsonb,p_email jsonb,p_save_channel boolean DEFAULT false,p_prepared boolean DEFAULT false)
RETURNS public.channel_welcome_packs LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.channels%ROWTYPE; saved public.channel_welcome_packs%ROWTYPE; affected integer;
BEGIN
 SELECT * INTO c FROM public.channels WHERE id=p_channel_id FOR UPDATE;
 IF NOT FOUND OR c.status IS DISTINCT FROM 'activo' OR (c.pipeline_stage IS NOT NULL AND c.pipeline_stage<>'active') THEN RAISE EXCEPTION 'El welcome pack solo se puede preparar para un canal ACTIVO'; END IF;
 UPDATE public.channels SET updated_at=now() WHERE id=p_channel_id;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'No tienes permiso para actualizar este canal'; END IF;
 INSERT INTO public.channel_welcome_packs(channel_id,created_by,data,email_draft,sender_email,status)
 VALUES(p_channel_id,auth.uid(),p_data-'recipientConfirmed',p_email,auth.jwt()->>'email',CASE WHEN p_prepared THEN 'prepared' ELSE 'draft' END)
 ON CONFLICT(channel_id,created_by) DO UPDATE SET data=EXCLUDED.data,email_draft=EXCLUDED.email_draft,status=EXCLUDED.status RETURNING * INTO saved;
 IF p_save_channel THEN
  UPDATE public.channels SET name=coalesce(nullif(btrim(p_data->>'company'),''),name),cif=coalesce(nullif(btrim(p_data->>'cif'),''),cif),
   contact_name=coalesce(nullif(btrim(p_data->>'contact'),''),contact_name),phone=coalesce(nullif(btrim(p_data->>'phone'),''),phone),
   caes_assigned_sheets=ARRAY(SELECT DISTINCT jsonb_array_elements_text(coalesce(p_data->'sheets','[]'::jsonb))),welcome_pack_config=p_data-'recipientConfirmed'
  WHERE id=p_channel_id;
 END IF;
 IF p_prepared THEN
  INSERT INTO public.channel_notes(channel_id,user_id,content) VALUES(p_channel_id,auth.uid(),
   'Welcome pack PREPARADO · NO ENVIADO. Remitente: '||saved.sender_email||'. Destinatario confirmado: '||(p_data->>'recipient')||'. Modalidad: '||(p_data->>'route')||'. Fichas CAE: '||(p_data->'sheets')::text||'. Documentos operativos y conexión de correo pendientes. Plantilla: '||saved.template_version);
 END IF;
 RETURN saved;
END;
$$;
REVOKE ALL ON FUNCTION public.check_channel_welcome_pack() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_channel_welcome_pack(uuid,jsonb,jsonb,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_channel_welcome_pack(uuid,jsonb,jsonb,boolean,boolean) TO authenticated;
COMMIT;
