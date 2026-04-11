import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import Spinner from '../components/Spinner';

/* ─────────────────────────────────────────────
   Add Criterion Modal
───────────────────────────────────────────── */
const AddCriterionModal = ({ matrixId, onClose, onSaved }) => {
  const [properties, setProperties] = useState([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedProp, setSelectedProp] = useState(null);
  const [name, setName] = useState('');
  const [hubspotProperty, setHubspotProperty] = useState('');
  const [type, setType] = useState('text');
  const [weight, setWeight] = useState(10);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProperties = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_PROXY_URL}/proxy/crm/v3/properties/deals`);
        const json = await res.json();
        setProperties(json.results || []);
      } catch (e) {
        setError('No se pudieron cargar las propiedades de HubSpot.');
      } finally {
        setLoadingProps(false);
      }
    };
    fetchProperties();
  }, []);

  const filteredProps = useMemo(() => {
    const q = search.toLowerCase();
    return properties.filter(p =>
      p.label?.toLowerCase().includes(q) ||
      p.name?.toLowerCase().includes(q) ||
      p.groupName?.toLowerCase().includes(q)
    );
  }, [properties, search]);

  const grouped = useMemo(() => {
    return filteredProps.reduce((acc, p) => {
      const g = p.groupName || 'Sin grupo';
      if (!acc[g]) acc[g] = [];
      acc[g].push(p);
      return acc;
    }, {});
  }, [filteredProps]);

  const handleSelectProp = (prop) => {
    setSelectedProp(prop);
    setName(prop.label || '');
    setHubspotProperty(prop.name || '');
    if (prop.type === 'enumeration' || prop.type === 'number') setType('options');
    else setType('text');
  };

  const handleSave = async () => {
    if (!selectedProp) return;
    setSaving(true);
    setError(null);
    try {
      const { data: existing } = await supabase
        .from('criteria').select('sort_order').eq('matrix_id', matrixId)
        .order('sort_order', { ascending: false }).limit(1);
      const nextOrder = existing?.length > 0 ? (existing[0].sort_order || 0) + 1 : 0;

      const { data: newCriterion, error: insertError } = await supabase
        .from('criteria')
        .insert({ matrix_id: matrixId, name, hubspot_property: hubspotProperty,
          weight: parseFloat(weight) || 10, type, sort_order: nextOrder, active: true, code: hubspotProperty })
        .select().single();
      if (insertError) throw insertError;

      if (type === 'options') {
        let opts;
        if (selectedProp.type === 'enumeration' && selectedProp.options?.length > 0) {
          opts = selectedProp.options.map((opt, idx) => ({
            criterion_id: newCriterion.id, label: opt.label, hubspot_value: opt.value, multiplier: 0, sort_order: idx,
          }));
        } else {
          opts = [
            { label: 'Muy Alto', hubspot_value: 'muy_alto', multiplier: 1, sort_order: 0 },
            { label: 'Alto',     hubspot_value: 'alto',     multiplier: 0.5, sort_order: 1 },
            { label: 'Medio',    hubspot_value: 'medio',    multiplier: 0, sort_order: 2 },
            { label: 'Bajo',     hubspot_value: 'bajo',     multiplier: -0.5, sort_order: 3 },
            { label: 'Muy Bajo', hubspot_value: 'muy_bajo', multiplier: -1, sort_order: 4 },
          ].map(o => ({ ...o, criterion_id: newCriterion.id }));
        }
        const { error: optsError } = await supabase.from('criterion_options').insert(opts);
        if (optsError) throw optsError;
      }
      onSaved();
    } catch (e) {
      console.error(e);
      setError(e.message || 'Error al guardar el criterio.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#1c1b1c] border border-[#44474a] rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#44474a]">
          <h2 className="text-base font-semibold text-white">Añadir criterio</h2>
          <button onClick={onClose} className="text-[#c5c6ca] hover:text-white transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Left: property picker */}
          <div className="md:w-1/2 flex flex-col border-r border-[#44474a] overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center gap-2 bg-[#131313] border border-[#44474a] rounded-lg px-3 py-2">
                <span className="material-symbols-outlined text-[16px] text-[#c5c6ca]">search</span>
                <input
                  type="text" placeholder="Buscar propiedades..."
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  className="bg-transparent text-white text-sm placeholder-[#44474a] focus:outline-none flex-1"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
              {loadingProps ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : Object.keys(grouped).length === 0 ? (
                <p className="text-[#c5c6ca] text-sm text-center py-4">Sin resultados</p>
              ) : (
                Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([group, props]) => (
                  <div key={group}>
                    <p className="text-[#c5c6ca] text-xs font-semibold uppercase tracking-wider mb-1.5">{group}</p>
                    <div className="space-y-1">
                      {props.map((prop) => (
                        <button
                          key={prop.name}
                          onClick={() => handleSelectProp(prop)}
                          className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                            selectedProp?.name === prop.name
                              ? 'bg-accent/15 border border-accent/50 text-white'
                              : 'bg-[#201f20] border border-transparent hover:border-[#44474a] text-[#c5c6ca]'
                          }`}
                        >
                          <span className="font-medium text-white text-sm block">{prop.label}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <code className="text-[#c5c6ca] text-xs font-mono">{prop.name}</code>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2a2a2a] text-[#c5c6ca]">{prop.fieldType}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: form */}
          <div className="md:w-1/2 flex flex-col overflow-y-auto px-5 py-4 space-y-4">
            {!selectedProp ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <span className="material-symbols-outlined text-[40px] text-[#44474a] mb-3">tune</span>
                <p className="text-[#c5c6ca] text-sm">Selecciona una propiedad</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-[#c5c6ca] text-xs font-medium mb-1.5">Nombre del criterio</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#131313] border border-[#44474a] rounded-lg text-white text-sm focus:outline-none focus:border-accent transition-colors" />
                </div>
                <div>
                  <label className="block text-[#c5c6ca] text-xs font-medium mb-1.5">Propiedad HubSpot</label>
                  <input type="text" value={hubspotProperty} onChange={(e) => setHubspotProperty(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#131313] border border-[#44474a] rounded-lg text-white font-mono text-sm focus:outline-none focus:border-accent transition-colors" />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-[#c5c6ca] text-xs font-medium mb-1.5">Tipo</label>
                    <select value={type} onChange={(e) => setType(e.target.value)}
                      className="w-full px-3 py-2.5 bg-[#131313] border border-[#44474a] rounded-lg text-white text-sm focus:outline-none focus:border-accent transition-colors">
                      <option value="options">options</option>
                      <option value="range">range</option>
                      <option value="text">text</option>
                    </select>
                  </div>
                  <div className="w-24">
                    <label className="block text-[#c5c6ca] text-xs font-medium mb-1.5">Peso</label>
                    <input type="number" step="1" value={weight} onChange={(e) => setWeight(e.target.value)}
                      className="w-full px-3 py-2.5 bg-[#131313] border border-[#44474a] rounded-lg text-white font-mono text-sm focus:outline-none focus:border-accent transition-colors" />
                  </div>
                </div>

                {type === 'options' && selectedProp.options?.length > 0 && (
                  <div>
                    <p className="text-[#c5c6ca] text-xs font-medium mb-2">Opciones ({selectedProp.options.length})</p>
                    <div className="bg-[#131313] border border-[#44474a] rounded-lg p-3 space-y-1 max-h-40 overflow-y-auto">
                      {selectedProp.options.map((opt) => (
                        <div key={opt.value} className="flex items-center justify-between text-xs">
                          <span className="text-white">{opt.label}</span>
                          <code className="text-[#c5c6ca] font-mono ml-2">{opt.value}</code>
                        </div>
                      ))}
                    </div>
                    <p className="text-[#c5c6ca] text-xs mt-1">Multiplicadores en 0 por defecto</p>
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                    <span className="material-symbols-outlined text-red-400 text-[14px]">error</span>
                    <p className="text-red-400 text-sm">{error}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#44474a]">
          <button onClick={onClose}
            className="px-4 py-2 text-[#c5c6ca] hover:text-white text-sm transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={!selectedProp || saving}
            className="px-4 py-2 bg-accent hover:bg-accent-dim text-white rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {saving ? 'Guardando...' : 'Añadir criterio'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Main Page
───────────────────────────────────────────── */
const ScoringPage = () => {
  const { tenant } = useAuth();
  const [matrices, setMatrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatrix, setSelectedMatrix] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    if (tenant) fetchMatrices();
  }, [tenant]);

  const fetchMatrices = async () => {
    try {
      const { data } = await supabase
        .from('scoring_matrices')
        .select('*, criteria(*, criterion_options(*)), score_thresholds(*)')
        .eq('tenant_id', tenant.id).order('name');
      setMatrices(data);
      setSelectedMatrix((prev) => {
        if (!prev) return data.length > 0 ? data[0] : null;
        return data.find((m) => m.id === prev.id) || data[0] || null;
      });
    } catch (error) {
      console.error('Error fetching matrices:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateCriterion = async (criterionId, field, value) => {
    try {
      await supabase.from('criteria').update({ [field]: value }).eq('id', criterionId);
      await fetchMatrices();
    } catch (error) { console.error('Error updating criterion:', error); }
  };

  const updateOption = async (optionId, field, value) => {
    try {
      await supabase.from('criterion_options').update({ [field]: value }).eq('id', optionId);
      await fetchMatrices();
    } catch (error) { console.error('Error updating option:', error); }
  };

  const deleteCriterion = async (criterion) => {
    if (!window.confirm(`¿Eliminar el criterio "${criterion.name}"?`)) return;
    try {
      await supabase.from('criteria').delete().eq('id', criterion.id);
      await fetchMatrices();
    } catch (error) { console.error('Error deleting criterion:', error); }
  };

  const weightTotal = (selectedMatrix?.criteria || []).reduce((s, c) => s + (c.weight || 0), 0);
  const weightOk = weightTotal === 100;

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <Spinner />
        <p className="mt-4 text-sm text-[#c5c6ca]">Cargando matrices...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Configuración de Scoring</h1>
        <p className="text-[#c5c6ca] text-sm mt-1">Define criterios y pesos para la puntuación automática</p>
      </div>

      <div className="flex gap-6 items-start">
        {/* Matrices sidebar */}
        <div className="w-48 shrink-0 space-y-1">
          <p className="text-xs font-semibold text-[#c5c6ca] uppercase tracking-wider mb-2">Matrices</p>
          {matrices.map(matrix => (
            <button
              key={matrix.id}
              onClick={() => setSelectedMatrix(matrix)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm ${
                selectedMatrix?.id === matrix.id
                  ? 'bg-accent/15 text-white border border-accent/30'
                  : 'text-[#c5c6ca] hover:bg-[#201f20] hover:text-white border border-transparent'
              }`}
            >
              <p className="font-medium truncate">{matrix.name}</p>
              <p className="text-xs opacity-60 mt-0.5">{matrix.criteria?.length || 0} criterios</p>
            </button>
          ))}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-5">
          {selectedMatrix ? (
            <>
              {/* Matrix header */}
              <div className="bg-[#1c1b1c] border border-[#44474a] rounded-lg p-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-white font-semibold">{selectedMatrix.name}</h2>
                  {selectedMatrix.description && (
                    <p className="text-[#c5c6ca] text-xs mt-1">{selectedMatrix.description}</p>
                  )}
                </div>
                <span className={`px-2.5 py-1 rounded text-xs font-medium ${
                  selectedMatrix.active ? 'bg-green-500/15 text-green-400' : 'bg-[#2a2a2a] text-[#c5c6ca]'
                }`}>
                  {selectedMatrix.active ? 'Activa' : 'Inactiva'}
                </span>
              </div>

              {/* Criteria */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h3 className="text-sm font-semibold text-[#c5c6ca] uppercase tracking-wider">Criterios</h3>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono px-2.5 py-1 rounded border ${
                      weightOk
                        ? 'border-green-500/40 text-green-400 bg-green-500/10'
                        : 'border-yellow-500/40 text-yellow-400 bg-yellow-500/10'
                    }`}>
                      Σ {weightTotal} / 100 {weightOk ? '✓' : '⚠'}
                    </span>
                    <button
                      onClick={() => setShowAddModal(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-dim text-white rounded-lg text-xs font-medium transition-colors"
                    >
                      <span className="material-symbols-outlined text-[14px]">add</span>
                      Añadir
                    </button>
                  </div>
                </div>

                {selectedMatrix.criteria?.length > 0 ? (
                  <div className="space-y-3">
                    {selectedMatrix.criteria.map(criterion => (
                      <div key={criterion.id} className="bg-[#1c1b1c] border border-[#44474a] rounded-lg overflow-hidden">
                        {/* Criterion header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-[#44474a]/50">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-white text-sm font-medium">{criterion.name}</h4>
                            <code className="text-[#c5c6ca] text-xs font-mono">{criterion.hubspot_property}</code>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 ml-3">
                            <div className="flex items-center gap-1.5">
                              <label className="text-[#c5c6ca] text-xs">Peso</label>
                              <input
                                type="number" step="0.1"
                                defaultValue={criterion.weight}
                                onBlur={(e) => {
                                  const v = parseFloat(e.target.value);
                                  if (!isNaN(v) && v !== criterion.weight) updateCriterion(criterion.id, 'weight', v);
                                }}
                                className="w-16 px-2 py-1 bg-[#131313] border border-[#44474a] rounded text-white font-mono text-xs focus:outline-none focus:border-accent text-center transition-colors"
                              />
                            </div>
                            <button
                              onClick={() => deleteCriterion(criterion)}
                              className="text-[#c5c6ca] hover:text-red-400 transition-colors p-1"
                            >
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                          </div>
                        </div>

                        {/* Options */}
                        {criterion.criterion_options?.length > 0 && (
                          <div className="p-3 space-y-1.5">
                            {criterion.criterion_options.map(option => (
                              <div key={option.id} className="flex items-center justify-between bg-[#131313] rounded px-3 py-2">
                                <div>
                                  <span className="text-white text-xs font-medium">{option.label}</span>
                                  <code className="text-[#c5c6ca] text-xs font-mono ml-2">{option.hubspot_value}</code>
                                </div>
                                <select
                                  value={option.multiplier}
                                  onChange={(e) => updateOption(option.id, 'multiplier', parseFloat(e.target.value))}
                                  className="px-2 py-1 bg-[#1c1b1c] border border-[#44474a] rounded text-white text-xs focus:outline-none focus:border-accent transition-colors cursor-pointer"
                                >
                                  <option value={1}>Muy Alto</option>
                                  <option value={0.5}>Alto</option>
                                  <option value={0}>Medio</option>
                                  <option value={-0.5}>Bajo</option>
                                  <option value={-1}>Muy Bajo</option>
                                </select>
                              </div>
                            ))}
                          </div>
                        )}

                        {criterion.type === 'range' && criterion.config?.ranges && (
                          <div className="p-3 space-y-1.5">
                            {criterion.config.ranges.map((range, idx) => (
                              <div key={idx} className="flex items-center justify-between bg-[#131313] rounded px-3 py-2 text-xs">
                                <span className="text-white">{range.min ?? '∞'} – {range.max ?? '∞'}</span>
                                <span className="text-accent font-mono">× {range.multiplier}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-[#1c1b1c] border border-[#44474a] rounded-lg p-8 text-center">
                    <span className="material-symbols-outlined text-[40px] text-[#44474a] block mb-3">tune</span>
                    <p className="text-[#c5c6ca] text-sm">No hay criterios configurados</p>
                    <button onClick={() => setShowAddModal(true)}
                      className="mt-3 px-4 py-2 bg-accent hover:bg-accent-dim text-white rounded-lg text-sm font-medium transition-colors">
                      Añadir primer criterio
                    </button>
                  </div>
                )}
              </div>

              {/* Thresholds */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-[#c5c6ca] uppercase tracking-wider">Semáforos</h3>
                {selectedMatrix.score_thresholds?.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {selectedMatrix.score_thresholds.map(threshold => {
                      const dotColor =
                        threshold.color === 'green' ? 'bg-green-500' :
                        threshold.color === 'yellow' ? 'bg-yellow-500' : 'bg-red-500';
                      return (
                        <div key={threshold.id} className="bg-[#1c1b1c] border border-[#44474a] rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                            <h4 className="font-medium text-white text-sm">{threshold.label}</h4>
                          </div>
                          <p className="text-[#c5c6ca] text-xs">{threshold.min_score} – {threshold.max_score} pts</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-[#1c1b1c] border border-[#44474a] rounded-lg p-6 text-center">
                    <p className="text-[#c5c6ca] text-sm">No hay semáforos configurados</p>
                  </div>
                )}
              </div>

              {/* Formula */}
              <div className="bg-[#1c1b1c] border border-[#44474a] rounded-lg px-4 py-3">
                <p className="text-[#c5c6ca] text-xs">
                  <span className="font-semibold text-white">Fórmula:</span>{' '}
                  ((Σ(peso × multiplicador) + totalPesos) / (totalPesos × 2)) × 100
                </p>
              </div>
            </>
          ) : (
            <div className="bg-[#1c1b1c] border border-[#44474a] rounded-lg p-12 text-center">
              <span className="material-symbols-outlined text-[48px] text-[#44474a] block mb-3">tune</span>
              <p className="text-[#c5c6ca]">Selecciona una matriz para comenzar</p>
            </div>
          )}
        </div>
      </div>

      {showAddModal && selectedMatrix && (
        <AddCriterionModal
          matrixId={selectedMatrix.id}
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); fetchMatrices(); }}
        />
      )}
    </div>
  );
};

export default ScoringPage;
