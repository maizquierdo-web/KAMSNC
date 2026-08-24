-- Asignaciones operativas de los canales CAEs activos.
-- Se utiliza un valor explícito "unassigned" para distinguir una asignación
-- pendiente de un dato accidentalmente vacío.

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS caes_technical_office text NOT NULL DEFAULT 'unassigned'
    CHECK (caes_technical_office IN ('sinceo2', 'e_program', 'unassigned')),
  ADD COLUMN IF NOT EXISTS caes_verifier text NOT NULL DEFAULT 'unassigned'
    CHECK (caes_verifier IN ('margube', 'eqa', 'unassigned'));

COMMENT ON COLUMN public.channels.caes_technical_office IS 'Oficina técnica asignada al canal CAEs activo.';
COMMENT ON COLUMN public.channels.caes_verifier IS 'Verificador asignado al canal CAEs activo.';
