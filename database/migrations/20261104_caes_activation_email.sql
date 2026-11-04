BEGIN;

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS caes_ot_contact_name text,
  ADD COLUMN IF NOT EXISTS caes_ot_contact_email text,
  ADD COLUMN IF NOT EXISTS caes_verifier_contact_name text,
  ADD COLUMN IF NOT EXISTS caes_verifier_contact_email text;

-- Nullable: operations fills these fields AFTER activation. Existing channel RLS applies.
COMMENT ON COLUMN public.channels.caes_ot_contact_name IS 'Contacto de Oficina Técnica, cuando existe OT asignada.';
COMMENT ON COLUMN public.channels.caes_ot_contact_email IS 'Correo del contacto de Oficina Técnica.';
COMMENT ON COLUMN public.channels.caes_verifier_contact_name IS 'Nombre del contacto del verificador.';
COMMENT ON COLUMN public.channels.caes_verifier_contact_email IS 'Correo del contacto del verificador.';

CREATE TABLE IF NOT EXISTS public.caes_activation_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id),
  actor_id uuid NOT NULL,
  activation_transaction bigint NOT NULL,
  sender_email text NOT NULL DEFAULT 'maizquierdo@naturgy.com',
  recipient_email text NOT NULL DEFAULT 'mhugle@naturgy.com',
  cc_email text,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'blocked')),
  claim_token uuid,
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, activation_transaction)
);
ALTER TABLE public.caes_activation_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.caes_activation_emails FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.caes_activation_emails TO service_role;
CREATE INDEX IF NOT EXISTS caes_activation_emails_pending_idx
  ON public.caes_activation_emails(created_at) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.queue_caes_activation_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_actor_email text;
  v_is_caes boolean;
BEGIN
  -- Editing an already active account is NOT another activation.
  IF (coalesce(OLD.status = 'activo', false) OR coalesce(OLD.pipeline_stage = 'active', false))
     OR NOT (coalesce(NEW.status = 'activo', false) OR coalesce(NEW.pipeline_stage = 'active', false)) THEN
    RETURN NEW;
  END IF;
  v_is_caes := coalesce(NEW.channel_type, '') ILIKE '%cae%'
    OR coalesce(NEW.potencial_caes, '') <> ''
    OR EXISTS (
      SELECT 1 FROM public.channel_classifications AS assigned
      JOIN public.channel_classification AS classification ON classification.id = assigned.classification_id
      WHERE assigned.channel_id = NEW.id AND classification.canal ILIKE '%cae%'
    );
  -- Only an authenticated user's activation, not imports or service-role edits.
  IF NOT v_is_caes OR v_actor_id IS NULL THEN RETURN NEW; END IF;

  SELECT coalesce(nullif(btrim(profile.full_name), ''), 'Usuario del CRM'),
         nullif(btrim(account.email), '')
    INTO v_actor_name, v_actor_email
    FROM auth.users AS account
    LEFT JOIN public.profiles AS profile ON profile.id = account.id
    WHERE account.id = v_actor_id;
  v_actor_name := coalesce(v_actor_name, 'Usuario del CRM');

  INSERT INTO public.caes_activation_emails (
    channel_id, actor_id, activation_transaction, cc_email, subject, body, status, last_error
  ) VALUES (
    NEW.id, v_actor_id, txid_current(), v_actor_email,
    'Canal activado · ' || replace(replace(NEW.name, chr(13), ' '), chr(10), ' ') || ' · Completar datos técnicos',
    format(E'Hola, Marina:\n\n%s ha pasado el canal %s a estado Activo.\n\nPor favor, completa en su ficha la Oficina Técnica, cuando corresponda, y el verificador. Informa el nombre y correo del contacto de Oficina Técnica si tiene OT asignada.%s\n\nGracias.', v_actor_name, NEW.name, CASE WHEN NEW.caes_role = 'promoter_ot' THEN E'\nAl tener rol Promotor + OT, informa también el nombre y correo del contacto del verificador.' ELSE '' END),
    CASE WHEN v_actor_email IS NULL THEN 'blocked' ELSE 'pending' END,
    CASE WHEN v_actor_email IS NULL THEN 'El usuario que activa el canal no tiene correo de autenticación disponible.' END
  ) ON CONFLICT (channel_id, activation_transaction) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_caes_activation_email() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS queue_caes_activation_email_trigger ON public.channels;
CREATE TRIGGER queue_caes_activation_email_trigger
AFTER UPDATE OF status, pipeline_stage ON public.channels
FOR EACH ROW EXECUTE FUNCTION public.queue_caes_activation_email();

-- The Microsoft 365 flow claims one message atomically, then acknowledges it.
-- Uncertain deliveries remain processing for manual reconciliation, never replayed blindly.
CREATE OR REPLACE FUNCTION public.claim_caes_activation_email()
RETURNS SETOF public.caes_activation_emails
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  WITH candidate AS (
    SELECT e.id FROM public.caes_activation_emails AS e
    WHERE e.status = 'pending' ORDER BY e.created_at, e.id
    LIMIT 1 FOR UPDATE SKIP LOCKED
  )
  UPDATE public.caes_activation_emails AS e
  SET status = 'processing', claimed_at = now(), claim_token = gen_random_uuid()
  FROM candidate WHERE e.id = candidate.id RETURNING e.*;
$$;

CREATE OR REPLACE FUNCTION public.finish_caes_activation_email(
  p_id uuid, p_claim_token uuid, p_sent boolean, p_error text DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.caes_activation_emails AS e
  SET status = CASE WHEN p_sent THEN 'sent' ELSE 'failed' END,
      sent_at = CASE WHEN p_sent THEN now() END,
      last_error = CASE WHEN p_sent THEN NULL ELSE left(coalesce(p_error, 'Envío fallido'), 2000) END
  WHERE e.id = p_id AND e.status = 'processing' AND e.claim_token = p_claim_token;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_caes_activation_email() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_caes_activation_email(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_caes_activation_email() TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_caes_activation_email(uuid, uuid, boolean, text) TO service_role;
COMMIT;
