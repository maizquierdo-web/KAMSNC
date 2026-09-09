import { useEffect, useState } from 'react';
import { Clock3, Lightbulb, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { useAuthContext } from './AuthProvider';
import { loadChannelAiContext } from '../lib/channelAiContext';
import { buildNextBestActionSystemPrompt, parseNextBestAction } from '../lib/nextBestAction';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

function generatedTime(value) {
  return value?.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function NextBestActionCard({ channel, refreshKey = 0 }) {
  const { profile } = useAuthContext();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatedAt, setGeneratedAt] = useState(null);

  useEffect(() => {
    setResult(null);
    setError('');
    setGeneratedAt(null);
  }, [channel.id, refreshKey]);

  async function generateRecommendation() {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const { context } = await loadChannelAiContext(channel);
      const response = await fetch(`${BACKEND_URL}/api/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: buildNextBestActionSystemPrompt({
            context,
            benchmarkProfile: profile?.benchmark_profile,
          }),
          messages: [{
            role: 'user',
            content: 'Evalúa el contexto y devuelve la Next Best Action siguiendo exactamente el formato indicado.',
          }],
        }),
      });
      if (!response.ok) throw new Error('No se pudo conectar con el servicio de IA.');
      const data = await response.json();
      const rawText = data.content?.map(item => item.text || '').join('').trim();
      setResult(parseNextBestAction(rawText));
      setGeneratedAt(new Date());
    } catch (requestError) {
      console.error('Error generando Next Best Action:', requestError);
      setError(requestError.message || 'No se pudo generar la recomendación.');
    } finally {
      setLoading(false);
    }
  }

  function hideRecommendation() {
    setResult(null);
    setError('');
    setGeneratedAt(null);
  }

  return (
    <section className="mb-3 overflow-hidden rounded-xl border border-navy-100 bg-navy-50/30">
      <div className="flex flex-col gap-3 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-navy-100 text-navy-600">
            <Lightbulb size={17} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-text-primary">Recomendación de la IA</h3>
              {generatedAt && <span className="flex items-center gap-1 text-[10px] text-text-muted"><Clock3 size={11} /> {generatedTime(generatedAt)}</span>}
            </div>
            {!result && !loading && !error && <p className="mt-0.5 text-[11px] text-text-secondary">Propone el siguiente movimiento sin cambiar la acción registrada.</p>}
            {loading && <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-text-secondary"><Loader2 size={12} className="animate-spin" /> Analizando el contexto del canal…</p>}
          </div>
        </div>

        {!result && !loading && (
          <button type="button" onClick={generateRecommendation}
            className="flex flex-shrink-0 items-center justify-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs font-bold text-navy-700 transition-colors hover:bg-navy-50">
            <Sparkles size={13} /> Obtener recomendación
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 border-t border-red-100 bg-red-50 px-3.5 py-2.5">
          <p className="text-xs text-red-600">{error}</p>
          <button type="button" onClick={generateRecommendation} className="flex items-center gap-1 text-xs font-bold text-red-700"><RefreshCw size={12} /> Reintentar</button>
        </div>
      )}

      {result && (
        <div className="border-t border-navy-100 bg-white/80 px-3.5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {result.status === 'recommendation' ? (
                <>
                  <p className="text-sm font-bold leading-snug text-navy-800">{result.action}</p>
                  {result.timeframe && <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-brand-500">{result.timeframe}</p>}
                  <p className="mt-2 text-xs leading-relaxed text-text-secondary">{result.why}</p>
                  {result.evidence.length > 0 && (
                    <div className="mt-2.5 border-t border-surface-3 pt-2">
                      <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-text-muted">Evidencias utilizadas</p>
                      <ul className="space-y-1">
                        {result.evidence.map((evidence, index) => <li key={`${evidence}-${index}`} className="flex gap-1.5 text-[11px] leading-relaxed text-text-secondary"><span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-navy-400" />{evidence}</li>)}
                      </ul>
                    </div>
                  )}
                </>
              ) : <p className="text-xs text-text-secondary">{result.why}</p>}
            </div>
            <button type="button" onClick={hideRecommendation} aria-label="Ocultar recomendación"
              className="flex-shrink-0 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"><X size={15} /></button>
          </div>
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={generateRecommendation} disabled={loading}
              className="flex items-center gap-1.5 text-[11px] font-bold text-navy-600 disabled:opacity-50">
              {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Actualizar recomendación
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
