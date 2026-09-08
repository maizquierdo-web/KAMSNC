-- Memoria conversacional persistente del copiloto de cada canal.
-- Es aditiva y no modifica el historial de actividad ni los indicadores del CRM.

CREATE TABLE IF NOT EXISTS public.channel_copilot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (char_length(btrim(content)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS channel_copilot_messages_channel_created_idx
  ON public.channel_copilot_messages (channel_id, created_at DESC);

ALTER TABLE public.channel_copilot_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channel_copilot_messages_read ON public.channel_copilot_messages;
CREATE POLICY channel_copilot_messages_read
  ON public.channel_copilot_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.channels
      WHERE channels.id = channel_copilot_messages.channel_id
    )
  );

DROP POLICY IF EXISTS channel_copilot_messages_create ON public.channel_copilot_messages;
CREATE POLICY channel_copilot_messages_create
  ON public.channel_copilot_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.channels
      WHERE channels.id = channel_copilot_messages.channel_id
    )
  );

GRANT SELECT, INSERT ON public.channel_copilot_messages TO authenticated;

COMMENT ON TABLE public.channel_copilot_messages IS
  'Historial persistente del copiloto de canal, separado de la actividad comercial.';
