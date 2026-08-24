import { useEffect, useState } from 'react';
import { ArrowRight, FileWarning } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function ChannelBusinessCasePrompt({ channelId, isCaes = false }) {
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    if (!channelId || !isCaes) {
      setMissing(false);
      return () => { active = false; };
    }
    supabase.from('business_cases').select('id').eq('channel_id', channelId).limit(1)
      .then(({ data, error }) => {
        if (error) throw error;
        if (active) setMissing(!data?.length);
      })
      .catch(error => console.error('No se pudo comprobar el Business Case:', error));
    return () => { active = false; };
  }, [channelId, isCaes]);

  if (!isCaes || !missing) return null;

  return (
    <button
      onClick={() => document.getElementById('channel-business-case')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      className="mb-4 flex w-full items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-left text-blue-600 transition-colors hover:bg-blue-100/70"
    >
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/70">
        <FileWarning size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold">Business Case opcional</div>
        <div className="mt-0.5 text-[10px] opacity-80">Funcionalidad en estudio para canales CAEs.</div>
      </div>
      <span className="flex flex-shrink-0 items-center gap-1 text-[10px] font-bold">
        Añadir si procede <ArrowRight size={11} />
      </span>
    </button>
  );
}
