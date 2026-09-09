import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Check, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Selector de clasificación jerárquica para usar dentro de formularios.
 * NO guarda en BBDD — devuelve las selecciones via onChange.
 * 
 * Props:
 * - value: array de { classification_id, canal, custom_text? }
 * - onChange: (selections) => void
 * - error: string (mensaje de error de validación)
 * - required: muestra el campo como obligatorio (true por defecto)
 */
export default function ClassificationSelector({ value = [], onChange, error, required = true }) {
  const [allClassifications, setAllClassifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [customText, setCustomText] = useState('');

  useEffect(() => {
    loadClassifications();
  }, []);

  async function loadClassifications() {
    try {
      const { data, error: err } = await supabase
        .from('channel_classification')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      if (err) throw err;
      setAllClassifications(data || []);
    } catch (err) {
      console.error('Error cargando clasificaciones:', err);
    } finally {
      setLoading(false);
    }
  }

  function getTree() {
    const tree = {};
    allClassifications.forEach(c => {
      if (!tree[c.canal]) tree[c.canal] = {};
      if (c.subcanal) {
        if (!tree[c.canal][c.subcanal]) tree[c.canal][c.subcanal] = [];
        tree[c.canal][c.subcanal].push(c);
      } else {
        tree[c.canal]['_self'] = c;
      }
    });
    return tree;
  }

  function isSelected(classificationId) {
    return value.some(s => s.classification_id === classificationId);
  }

  function toggle(classification) {
    const exists = value.find(s => s.classification_id === classification.id);
    if (exists) {
      onChange(value.filter(s => s.classification_id !== classification.id));
    } else {
      const newItem = {
        classification_id: classification.id,
        canal: classification.canal,
        custom_text: classification.canal === 'Otros' && customText ? customText : null,
        _label: formatClassificationLabel(classification),
      };
      onChange([...value, newItem]);
      if (classification.canal === 'Otros') setCustomText('');
    }
  }

  function formatClassificationLabel(c) {
    let label = c.canal;
    if (c.subcanal) label += ' > ' + c.subcanal;
    if (c.tipo) label += ' > ' + c.tipo;
    return label;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3">
        <Loader2 size={14} className="animate-spin text-brand-400" />
        <span className="text-xs text-text-muted">Cargando clasificaciones...</span>
      </div>
    );
  }

  const tree = getTree();

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider">
          Clasificación{required ? ' *' : ''}
        </label>
        <button type="button" onClick={() => setExpanded(!expanded)} className="text-text-muted hover:text-text-secondary">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Tags de seleccionados */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((s, i) => {
            const cls = allClassifications.find(c => c.id === s.classification_id);
            const label = s._label || (cls ? formatClassificationLabel(cls) : '');
            return (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-brand-500/10 text-brand-600 rounded-lg text-[10px] font-semibold">
                {label}{s.custom_text ? `: ${s.custom_text}` : ''}
                <button type="button" onClick={() => toggle(cls || { id: s.classification_id, canal: s.canal })}
                  className="hover:text-red-400 transition-colors ml-0.5">
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}

      {value.length === 0 && !expanded && (
        <button type="button" onClick={() => setExpanded(true)}
          className="w-full py-2.5 border border-dashed border-surface-3 rounded-xl text-xs text-text-muted hover:border-brand-500 hover:text-brand-500 transition-colors">
          Pulsa para seleccionar clasificación
        </button>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-500 mt-1 mb-1">{error}</p>
      )}

      {/* Selector expandido */}
      {expanded && (
        <div className="border border-surface-3 rounded-xl overflow-hidden max-h-[350px] overflow-y-auto">
          {Object.entries(tree).map(([canal, subcanales]) => (
            <div key={canal}>
              <div className="px-3 py-2 bg-surface-2 border-b border-surface-3">
                <span className="text-[10px] font-bold text-text-primary uppercase tracking-wider">{canal}</span>
              </div>

              <div className="p-2 space-y-0.5">
                {Object.entries(subcanales).map(([subcanal, items]) => {
                  if (subcanal === '_self') {
                    const cls = items;
                    const checked = isSelected(cls.id);
                    return (
                      <div key={cls.id}>
                        <button type="button" onClick={() => { if (customText.trim() || checked) toggle(cls); }}
                          disabled={!checked && !customText.trim() && cls.canal === 'Otros'}
                          className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors ${
                            checked ? 'bg-brand-500/10' : 'hover:bg-surface-1'
                          }`}>
                          <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                            checked ? 'bg-brand-500 border-brand-500' : 'border-surface-3'
                          }`}>
                            {checked && <Check size={10} className="text-white" />}
                          </div>
                          <span className="text-xs text-text-secondary">Otro (especificar abajo)</span>
                        </button>
                        {!checked && (
                          <div className="flex gap-2 mt-1 ml-6 mb-1">
                            <input type="text" value={customText} onChange={(e) => setCustomText(e.target.value)}
                              placeholder="Escribe el tipo..."
                              className="flex-1 px-2.5 py-1.5 bg-white border border-surface-3 rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-500" />
                            <button type="button"
                              onClick={() => { if (customText.trim()) toggle(cls); }}
                              disabled={!customText.trim()}
                              className="px-2.5 py-1.5 bg-brand-500 text-white text-xs font-semibold rounded-lg disabled:opacity-30">
                              Añadir
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  }

                  const hasTypes = items.some(it => it.tipo);

                  if (!hasTypes) {
                    const cls = items[0];
                    const checked = isSelected(cls.id);
                    return (
                      <button key={cls.id} type="button" onClick={() => toggle(cls)}
                        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors ${
                          checked ? 'bg-brand-500/10' : 'hover:bg-surface-1'
                        }`}>
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                          checked ? 'bg-brand-500 border-brand-500' : 'border-surface-3'
                        }`}>
                          {checked && <Check size={10} className="text-white" />}
                        </div>
                        <span className="text-xs text-text-secondary">{subcanal}</span>
                      </button>
                    );
                  }

                  return (
                    <div key={subcanal} className="ml-1 mb-1 border border-surface-3 rounded-lg overflow-hidden">
                      <div className="text-[9px] font-bold text-text-muted uppercase tracking-wider px-3 py-1.5 bg-surface-1 border-b border-surface-3">
                        {subcanal}
                      </div>
                      <div className="p-1">
                        {items.map(cls => {
                          const checked = isSelected(cls.id);
                          return (
                            <button key={cls.id} type="button" onClick={() => toggle(cls)}
                              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                                checked ? 'bg-brand-500/10' : 'hover:bg-surface-1'
                              }`}>
                              <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                                checked ? 'bg-brand-500 border-brand-500' : 'border-surface-3'
                              }`}>
                                {checked && <Check size={10} className="text-white" />}
                              </div>
                              <span className="text-xs text-text-secondary">{cls.tipo}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
