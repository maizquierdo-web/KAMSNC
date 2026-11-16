import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export function useAnerrAccess(userId) {
  const [grantedTo, setGrantedTo] = useState(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase.rpc('anerr_can_access').then(({ data }) => {
      if (!cancelled) setGrantedTo(data === true ? userId : null);
    });
    return () => { cancelled = true; };
  }, [userId]);

  return Boolean(userId && grantedTo === userId);
}

export function isoAnerrDate(value, parseExcelDate) {
  if (!value) return null;
  const european = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  let parts;
  if (iso) parts = iso.slice(1);
  else if (european) parts = [european[3], european[2], european[1]];
  else if (/^\d{5}$/.test(value)) {
    const parsed = parseExcelDate(Number(value));
    if (parsed) parts = [parsed.y, parsed.m, parsed.d];
  }
  if (!parts) return null;
  const date = parts.map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0')).join('-');
  const timestamp = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date ? date : null;
}
