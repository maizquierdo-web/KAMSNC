BEGIN;

DROP TRIGGER IF EXISTS require_pipeline_transition_documents ON public.channels;
CREATE TRIGGER require_pipeline_transition_documents
AFTER UPDATE ON public.channels
FOR EACH ROW
WHEN (NEW.status = 'en_evaluacion' AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.require_pipeline_transition_documents();

COMMIT;
