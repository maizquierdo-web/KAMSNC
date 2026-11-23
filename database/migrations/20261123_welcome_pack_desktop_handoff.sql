BEGIN;

-- Solo actualiza el texto de trazabilidad; conserva permisos y validaciones.
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
   'Welcome pack PREPARADO · NO ENVIADO. Remitente: '||saved.sender_email||'. Destinatario confirmado: '||(p_data->>'recipient')||'. Modalidad: '||(p_data->>'route')||'. Fichas CAE: '||(p_data->'sheets')::text||'. Entrega manual desde la aplicación de correo. Comprobar remitente y adjuntar los documentos descargados. Plantilla: '||saved.template_version);
 END IF;
 RETURN saved;
END;
$$;

COMMIT;
