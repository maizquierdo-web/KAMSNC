ALTER TABLE public.business_cases
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'business_case',
  ADD COLUMN IF NOT EXISTS extracted_text text;

ALTER TABLE public.business_cases
  DROP CONSTRAINT IF EXISTS business_cases_document_type_check;

ALTER TABLE public.business_cases
  ADD CONSTRAINT business_cases_document_type_check
  CHECK (document_type IN ('business_case', 'hunter_canvas'));

ALTER TABLE public.business_cases
  DROP CONSTRAINT IF EXISTS business_cases_channel_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS business_cases_channel_document_type_uidx
  ON public.business_cases (channel_id, document_type);

COMMENT ON COLUMN public.business_cases.document_type IS
  'Tipo de documento comercial asociado al canal: Business Case o Hunter Canvas.';

COMMENT ON COLUMN public.business_cases.extracted_text IS
  'Texto legible extraído en el navegador para incorporarlo al contexto de los asistentes de IA.';
