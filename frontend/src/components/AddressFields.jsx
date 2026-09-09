import { useState, useRef, useEffect } from 'react';
import { MapPin, Search, Edit3 } from 'lucide-react';
import { normalizeSpanishGeography } from '../lib/spanishGeography';

/**
 * Autocompletado de localidad española usando Nominatim.
 * Devuelve localidad, provincia y comunidad autónoma.
 */
function LocalityAutocomplete({ value, onChange, onProvinceChange, onAutonomousCommunityChange, className }) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);

  useEffect(() => { setQuery(value || ''); }, [value]);

  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setShow(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleChange(val) {
    setQuery(val);
    onChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length < 2) { setSuggestions([]); setShow(false); return; }
    debounceRef.current = setTimeout(() => searchLocality(val), 400);
  }

  async function searchLocality(q) {
    setLoading(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
        `q=${encodeURIComponent(q)}&countrycodes=es&format=json&addressdetails=1` +
        `&limit=6&accept-language=es&featuretype=city`,
        { headers: { 'User-Agent': 'CRM-para-KAMs/1.0' } }
      );
      const data = await response.json();
      const seen = new Set();
      const results = data
        .map(item => {
          const city = item.address?.city || item.address?.town || item.address?.village || item.address?.municipality || '';
          const { province, autonomousCommunity } = normalizeSpanishGeography(item.address);
          return { city, province, autonomousCommunity, display: item.display_name };
        })
        .filter(r => {
          if (!r.city || seen.has(r.city + r.province)) return false;
          seen.add(r.city + r.province);
          return true;
        });
      setSuggestions(results);
      setShow(results.length > 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function select(s) {
    setQuery(s.city);
    onChange(s.city);
    if (onProvinceChange) onProvinceChange(s.province);
    if (onAutonomousCommunityChange) onAutonomousCommunityChange(s.autonomousCommunity);
    setShow(false);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input type="text" value={query} onChange={(e) => handleChange(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setShow(true); }}
        placeholder="Escribe la localidad..."
        className={className} />
      {loading && <div className="absolute right-3 top-1/2 -translate-y-1/2"><div className="w-3.5 h-3.5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" /></div>}
      {show && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-surface-3 rounded-xl shadow-lg z-30 max-h-48 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button key={i} type="button" onClick={() => select(s)}
              className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-surface-1 transition-colors border-b border-surface-3 last:border-0">
              <MapPin size={13} className="text-brand-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-text-primary">{s.city}</div>
                <div className="text-[10px] text-text-muted">
                  {[s.province, s.autonomousCommunity].filter(Boolean).join(' · ')}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Autocompletado de calle, filtrado por localidad.
 * Permite entrada manual si no se encuentra.
 */
function StreetAutocomplete({ value, onChange, locality, className }) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const [manual, setManual] = useState(false);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);

  useEffect(() => { setQuery(value || ''); }, [value]);

  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setShow(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleChange(val) {
    setQuery(val);
    if (manual) { onChange(val); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length < 3) { setSuggestions([]); setShow(false); return; }
    debounceRef.current = setTimeout(() => searchStreet(val), 400);
  }

  async function searchStreet(q) {
    if (!locality) {
      // Sin localidad, buscar en toda España
      setLoading(true);
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?` +
          `street=${encodeURIComponent(q)}&country=Spain&format=json&addressdetails=1` +
          `&limit=5&accept-language=es`,
          { headers: { 'User-Agent': 'CRM-para-KAMs/1.0' } }
        );
        const data = await response.json();
        processResults(data);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
        `street=${encodeURIComponent(q)}&city=${encodeURIComponent(locality)}&country=Spain` +
        `&format=json&addressdetails=1&limit=6&accept-language=es`,
        { headers: { 'User-Agent': 'CRM-para-KAMs/1.0' } }
      );
      const data = await response.json();
      processResults(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function processResults(data) {
    const seen = new Set();
    const results = data
      .map(item => {
        const road = item.address?.road || item.address?.pedestrian || item.address?.neighbourhood || '';
        const number = item.address?.house_number || '';
        const city = item.address?.city || item.address?.town || item.address?.village || '';
        return { road, number, city, full: road + (number ? `, ${number}` : '') };
      })
      .filter(r => {
        if (!r.road || seen.has(r.road)) return false;
        seen.add(r.road);
        return true;
      });
    setSuggestions(results);
    setShow(results.length > 0);
  }

  function select(s) {
    const val = s.full;
    setQuery(val);
    onChange(val);
    setShow(false);
  }

  function toggleManual() {
    setManual(!manual);
    setSuggestions([]);
    setShow(false);
    if (!manual) onChange(query);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input type="text" value={query} onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (suggestions.length > 0 && !manual) setShow(true); }}
          placeholder={manual ? 'Escribe la calle y número...' : 'Buscar calle...'}
          className={className} />
        {loading && <div className="absolute right-10 top-1/2 -translate-y-1/2"><div className="w-3.5 h-3.5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" /></div>}
        <button type="button" onClick={toggleManual}
          className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded transition-colors ${manual ? 'text-brand-500 bg-brand-50' : 'text-text-muted hover:text-text-secondary'}`}
          title={manual ? 'Volver a búsqueda' : 'Escribir manualmente'}>
          {manual ? <Search size={13} /> : <Edit3 size={13} />}
        </button>
      </div>
      {manual && <p className="text-[9px] text-brand-500 mt-0.5 ml-1">Modo manual · Pulsa 🔍 para volver a la búsqueda</p>}
      {show && !manual && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-surface-3 rounded-xl shadow-lg z-30 max-h-48 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button key={i} type="button" onClick={() => select(s)}
              className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-surface-1 transition-colors border-b border-surface-3 last:border-0">
              <MapPin size={13} className="text-brand-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-text-primary">{s.full}</div>
                {s.city && <div className="text-[10px] text-text-muted">{s.city}</div>}
              </div>
            </button>
          ))}
          <button type="button" onClick={toggleManual}
            className="w-full px-3 py-2 text-[11px] text-brand-500 font-semibold hover:bg-brand-50 transition-colors text-center">
            ✏️ No encuentro mi calle — escribir manualmente
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Componente completo de dirección: Localidad → Provincia (auto) → Calle
 */
export default function AddressFields({ form, update, fieldClass }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Localidad</label>
          <LocalityAutocomplete
            value={form.city}
            onChange={(v) => update('city', v)}
            onProvinceChange={(v) => update('province', v)}
            onAutonomousCommunityChange={(v) => update('comunidad_autonoma', v)}
            className={fieldClass}
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Provincia</label>
          <input type="text" value={form.province || ''} onChange={(e) => update('province', e.target.value)}
            placeholder="Se auto-rellena" className={fieldClass} />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Calle y número</label>
        <StreetAutocomplete
          value={form.address}
          onChange={(v) => update('address', v)}
          locality={form.city}
          className={fieldClass}
        />
      </div>
    </>
  );
}

export { LocalityAutocomplete, StreetAutocomplete };
