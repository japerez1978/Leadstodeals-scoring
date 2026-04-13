import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useScoringMatrices } from '../hooks/useQueries';
import { supabase } from '../lib/supabase';
import Spinner from '../components/Spinner';

const NEON = { green: '#00FF87', red: '#FF3B5C', blue: '#00D4FF', yellow: '#FFD600', orange: '#FF7A00', dim: '#3a3a3a' };

const PROVINCIAS_ESPANA = [
  "Álava", "Albacete", "Alicante", "Almería", "Asturias", "Ávila", "Badajoz", "Barcelona", "Burgos", "Cáceres", "Cádiz", "Cantabria", "Castellón", "Ciudad Real", "Córdoba", "La Coruña", "Cuenca", "Gerona", "Granada", "Guadalajara", "Guipúzcoa", "Huelva", "Huesca", "Islas Baleares", "Jaén", "León", "Lérida", "Lugo", "Madrid", "Málaga", "Murcia", "Navarra", "Orense", "Palencia", "Las Palmas", "Pontevedra", "La Rioja", "Salamanca", "Segovia", "Sevilla", "Soria", "Tarragona", "Santa Cruz de Tenerife", "Teruel", "Toledo", "Valencia", "Valladolid", "Vizcaya", "Zamora", "Zaragoza", "Ceuta", "Melilla"
];

/* ─────────────────────────────────────────────
   Add Criterion Modal (terminal style)
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
  const [useSpainProvinces, setUseSpainProvinces] = useState(false);

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
      p.label?.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q) || p.groupName?.toLowerCase().includes(q)
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
    const isLocation = prop.name.toLowerCase().includes('provinc') || prop.label.toLowerCase().includes('provinc');
    setUseSpainProvinces(isLocation);
    
    if (prop.type === 'enumeration' || prop.type === 'number' || isLocation) setType('options');
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
        let opts = [];
        if (useSpainProvinces) {
          opts = PROVINCIAS_ESPANA.map((label, idx) => ({
            criterion_id: newCriterion.id, label, hubspot_value: label, multiplier: 0, sort_order: idx,
          }));
        } else if (selectedProp.type === 'enumeration' && selectedProp.options?.length > 0) {
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
        
        // Split into chunks if there are many provinces to avoid potential payload limits
        const chunkSize = 50;
        for (let i = 0; i < opts.length; i += chunkSize) {
          const chunk = opts.slice(i, i + chunkSize);
          const { error: optsError } = await supabase.from('criterion_options').insert(chunk);
          if (optsError) throw optsError;
        }
      }
      onSaved();
    } catch (e) {
      console.error(e);
      setError(e.message || 'Error al guardar el criterio.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full px-3 py-2 bg-[#0a0a0a] border border-[#1e1e1e] rounded text-white text-xs font-mono focus:outline-none focus:border-[#00D4FF] transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[#111] border border-[#1e1e1e] rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        style={{ fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e1e]">
          <div className="flex items-center gap-2">
            <span style={{ color: NEON.blue }}>+</span>
            <span className="text-xs font-bold uppercase tracking-widest text-white">Añadir Criterio</span>
          </div>
          <button onClick={onClose} className="text-[#3a3a3a] hover:text-white transition-colors text-xs">✕</button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Left: property picker */}
          <div className="md:w-1/2 flex flex-col border-r border-[#1e1e1e] overflow-hidden">
            <div className="px-3 pt-3 pb-2">
              <div className="flex items-center gap-2 bg-[#0a0a0a] border border-[#1e1e1e] rounded px-2 py-1.5">
                <span className="text-[#3a3a3a] text-xs">⌕</span>
                <input type="text" placeholder="Buscar propiedades..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className="bg-transparent text-white text-[11px] font-mono placeholder-[#3a3a3a] focus:outline-none flex-1" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-3">
              {loadingProps ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : Object.keys(grouped).length === 0 ? (
                <p className="text-[#3a3a3a] text-xs text-center py-4">SIN RESULTADOS</p>
              ) : (
                Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([group, props]) => (
                  <div key={group}>
                    <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: NEON.dim }}>{group}</p>
                    <div className="space-y-0.5">
                      {props.map((prop) => (
                        <button key={prop.name} onClick={() => handleSelectProp(prop)}
                          className={`w-full text-left px-2 py-1.5 rounded transition-colors text-[11px] ${
                            selectedProp?.name === prop.name
                              ? 'bg-[#00D4FF10] border border-[#00D4FF30] text-white'
                              : 'border border-transparent hover:bg-[#1a1a1a] text-[#8a8a8a]'
                          }`}>
                          <span className="text-white block">{prop.label}</span>
                          <span className="text-[#3a3a3a] font-mono text-[9px]">{prop.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: form */}
          <div className="md:w-1/2 flex flex-col overflow-y-auto px-4 py-3 space-y-3">
            {!selectedProp ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <span className="text-[#1e1e1e] text-2xl mb-2">⚙</span>
                <p className="text-[#3a3a3a] text-xs">Selecciona una propiedad</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-[#555] mb-1">Nombre</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-[#555] mb-1">Propiedad HubSpot</label>
                  <input type="text" value={hubspotProperty} onChange={(e) => setHubspotProperty(e.target.value)} className={inputCls} />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-[9px] font-bold uppercase tracking-widest text-[#555] mb-1">Tipo</label>
                    <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
                      <option value="options">options</option>
                      <option value="range">range</option>
                      <option value="text">text</option>
                    </select>
                  </div>
                  <div className="w-20">
                    <label className="block text-[9px] font-bold uppercase tracking-widest text-[#555] mb-1">Peso</label>
                    <input type="number" step="1" value={weight} onChange={(e) => setWeight(e.target.value)} className={inputCls + ' text-center'} />
                  </div>
                </div>

                {/* Province seeder hint */}
                {(hubspotProperty.toLowerCase().includes('provinc') || name.toLowerCase().includes('provinc')) && (
                  <div className="bg-[#00FF8710] border border-[#00FF8730] rounded p-2 flex items-center justify-between">
                    <span className="text-[10px] text-[#00FF87]">¿Cargar las 52 provincias de España?</span>
                    <button onClick={() => setUseSpainProvinces(!useSpainProvinces)}
                      className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${
                        useSpainProvinces ? 'bg-[#00FF87] text-black' : 'border border-[#00FF87] text-[#00FF87]'
                      }`}>
                      {useSpainProvinces ? 'SÍ' : 'NO'}
                    </button>
                  </div>
                )}

                {type === 'options' && !useSpainProvinces && selectedProp.options?.length > 0 && (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[#555] mb-1">Opciones HubSpot ({selectedProp.options.length})</p>
                    <div className="bg-[#0a0a0a] border border-[#1e1e1e] rounded p-2 space-y-0.5 max-h-32 overflow-y-auto">
                      {selectedProp.options.map((opt) => (
                        <div key={opt.value} className="flex items-center justify-between text-[10px]">
                          <span className="text-white">{opt.label}</span>
                          <span className="text-[#3a3a3a] font-mono">{opt.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {error && (
                  <div className="text-xs px-2 py-1.5 rounded border" style={{ color: NEON.red, borderColor: NEON.red + '30', backgroundColor: NEON.red + '10' }}>
                    {error}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#1e1e1e]">
          <button onClick={onClose} className="px-3 py-1.5 text-[#555] hover:text-white text-xs transition-colors">Cancelar</button>
          <button onClick={handleSave} disabled={!selectedProp || saving}
            className="px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-30"
            style={{ color: NEON.green, border: `1px solid ${NEON.green}50`, backgroundColor: NEON.green + '10' }}>
            {saving ? 'GUARDANDO...' : 'AÑADIR'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Main Page — Terminal Style
   ───────────────────────────────────────────── */
const ScoringPage = () => {
  const { tenant } = useAuth();
  const { data: matrices = [], isLoading: loading, refetch: fetchMatrices } = useScoringMatrices(tenant?.id);
  const [selectedMatrixId, setSelectedMatrixId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Derive selected matrix from ID to ensure reactivity
  const selectedMatrix = useMemo(() => {
    if (!matrices.length) return null;
    return matrices.find(m => m.id === selectedMatrixId) || matrices[0];
  }, [matrices, selectedMatrixId]);

  useEffect(() => {
    if (matrices.length > 0 && !selectedMatrixId) {
      setSelectedMatrixId(matrices[0].id);
    }
  }, [matrices, selectedMatrixId]);

  const updateCriterion = async (criterionId, field, value) => {
    try {
      const { error } = await supabase.from('criteria').update({ [field]: value }).eq('id', criterionId);
      if (error) throw error;
      await fetchMatrices();
    } catch (error) { console.error('Error updating criterion:', error); }
  };

  const updateOption = async (optionId, field, value) => {
    try {
      const { error } = await supabase.from('criterion_options').update({ [field]: value }).eq('id', optionId);
      if (error) throw error;
      await fetchMatrices();
    } catch (error) { console.error('Error updating option:', error); }
  };

  const deleteCriterion = async (criterion) => {
    if (!window.confirm(`¿Eliminar el criterio "${criterion.name}"?`)) return;
    try {
      const { error } = await supabase.from('criteria').delete().eq('id', criterion.id);
      if (error) throw error;
      await fetchMatrices();
    } catch (error) { console.error('Error deleting criterion:', error); }
  };

  const weightTotal = (selectedMatrix?.criteria || []).reduce((s, c) => s + (c.weight || 0), 0);
  const weightOk = weightTotal === 100;

  if (loading) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center">
      <Spinner />
      <p className="mt-4 text-xs font-mono" style={{ color: NEON.blue }}>CARGANDO CONFIGURACIÓN...</p>
    </div>
  );

  return (
    <div className="space-y-4" style={{ fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black text-white tracking-tight">SCORING CONFIG</h1>
          <p className="text-[10px] text-[#3a3a3a] mt-0.5">Criterios y pesos para puntuación automática</p>
        </div>
      </div>

      <div className="flex gap-4 items-start">
        {/* Matrices sidebar */}
        <div className="w-44 shrink-0">
          <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-[#1e1e1e]">
              <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: NEON.blue }}>MATRICES</span>
            </div>
            <div className="space-y-0.5 p-1">
              {matrices.map(matrix => (
                <button key={matrix.id} onClick={() => setSelectedMatrixId(matrix.id)}
                  className={`w-full text-left px-2 py-2 rounded transition-colors text-[11px] ${
                    selectedMatrix?.id === matrix.id
                      ? 'bg-[#00D4FF10] border border-[#00D4FF30] text-white'
                      : 'text-[#8a8a8a] hover:bg-[#1a1a1a] hover:text-white border border-transparent'
                  }`}>
                  <p className="font-medium truncate">{matrix.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] text-[#3a3a3a]">{matrix.criteria?.length || 0} crit.</span>
                    <span className="text-[9px] px-1 rounded" style={{
                      color: matrix.active ? NEON.green : NEON.red,
                      backgroundColor: matrix.active ? NEON.green + '10' : NEON.red + '10',
                    }}>{matrix.active ? 'ON' : 'OFF'}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-4">
          {selectedMatrix ? (
            <>
              {/* Matrix header */}
              <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg p-3 flex items-center justify-between">
                <div>
                  <h2 className="text-white font-bold text-sm">{selectedMatrix.name}</h2>
                  {selectedMatrix.description && (
                    <p className="text-[#3a3a3a] text-[10px] mt-0.5">{selectedMatrix.description}</p>
                  )}
                </div>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded" style={{
                  color: selectedMatrix.active ? NEON.green : NEON.red,
                  backgroundColor: selectedMatrix.active ? NEON.green + '10' : NEON.red + '10',
                  border: `1px solid ${selectedMatrix.active ? NEON.green : NEON.red}30`,
                }}>
                  {selectedMatrix.active ? 'ACTIVA' : 'INACTIVA'}
                </span>
              </div>

              {/* Criteria */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: NEON.orange }}>CRITERIOS</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded border" style={{
                      color: weightOk ? NEON.green : NEON.yellow,
                      borderColor: (weightOk ? NEON.green : NEON.yellow) + '30',
                      backgroundColor: (weightOk ? NEON.green : NEON.yellow) + '10',
                    }}>
                      Σ {weightTotal}/100 {weightOk ? '✓' : '⚠'}
                    </span>
                    <button onClick={() => setShowAddModal(true)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase transition-all"
                      style={{ color: NEON.green, border: `1px solid ${NEON.green}50`, backgroundColor: NEON.green + '10' }}>
                      + AÑADIR
                    </button>
                  </div>
                </div>

                {selectedMatrix.criteria?.length > 0 ? (
                  <div className="border border-[#1e1e1e] rounded-lg overflow-hidden">
                    {selectedMatrix.criteria.map((criterion, idx) => (
                      <div key={criterion.id} className={`${idx > 0 ? 'border-t border-[#1e1e1e]' : ''}`}>
                        {/* Criterion header */}
                        <div className="flex items-center justify-between px-3 py-2 bg-[#0d0d0d]">
                          <div className="flex-1 min-w-0">
                            <span className="text-white text-xs font-bold">{criterion.name}</span>
                            <span className="text-[#3a3a3a] text-[9px] font-mono ml-2">{criterion.hubspot_property}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            {(criterion.hubspot_property.toLowerCase().includes('provinc') || criterion.name.toLowerCase().includes('provinc')) && (
                              <button onClick={async () => {
                                if (!window.confirm("¿Cargar las 52 provincias de España en este criterio?")) return;
                                const opts = PROVINCIAS_ESPANA.map((label, idx) => ({
                                  criterion_id: criterion.id, label, hubspot_value: label, multiplier: 0, sort_order: idx,
                                }));
                                const { error } = await supabase.from('criterion_options').insert(opts);
                                if (error) alert("Error al sincronizar: " + error.message);
                                else await fetchMatrices();
                              }}
                              className="px-2 py-0.5 rounded text-[8px] font-bold border border-[#00D4FF30] text-[#00D4FF] hover:bg-[#00D4FF10] transition-all">
                                SYNC PROVINCIAS
                              </button>
                            )}
                            <label className="text-[9px] text-[#555]">PESO</label>
                            <input type="number" step="0.1" defaultValue={criterion.weight}
                              onBlur={(e) => {
                                const v = parseFloat(e.target.value);
                                if (!isNaN(v) && v !== criterion.weight) updateCriterion(criterion.id, 'weight', v);
                              }}
                              className="w-14 px-1.5 py-0.5 bg-[#0a0a0a] border border-[#1e1e1e] rounded text-white font-mono text-[10px] focus:outline-none focus:border-[#00D4FF] text-center" />
                            <button onClick={() => deleteCriterion(criterion)}
                              className="text-[#3a3a3a] hover:text-[#FF3B5C] transition-colors text-[10px]">✕</button>
                          </div>
                        </div>

                        {/* Options */}
                        {criterion.criterion_options?.length > 0 && (
                          <div className="bg-[#0a0a0a] px-3 py-1.5 space-y-0.5">
                            {criterion.criterion_options.map(option => {
                              const m = option.multiplier;
                              let mColor = NEON.dim;
                              if (m === 1) mColor = NEON.green; // Muy Alto
                              else if (m === 0.5) mColor = '#70FFAD'; // Alto (suave)
                              else if (m === 0) mColor = NEON.yellow; // Medio
                              else if (m === -0.5) mColor = '#FF7A00'; // Bajo (suave)
                              else if (m === -1) mColor = NEON.red; // Muy Bajo

                              return (
                                <div key={option.id} className="flex items-center justify-between py-1 text-[10px]">
                                  <div className="flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full" style={{ 
                                      backgroundColor: mColor,
                                      boxShadow: m === 1 || m === -1 ? `0 0 5px ${mColor}80` : 'none'
                                    }} />
                                    <span className="text-white">{option.label}</span>
                                    <span className="text-[#3a3a3a] font-mono text-[9px]">{option.hubspot_value}</span>
                                  </div>
                                  <select value={option.multiplier}
                                    onChange={(e) => updateOption(option.id, 'multiplier', parseFloat(e.target.value))}
                                    className="px-1.5 py-0.5 bg-[#111] border rounded text-white text-[10px] font-mono focus:outline-none cursor-pointer transition-colors"
                                    style={{ borderColor: mColor + '40', color: mColor }}>
                                    <option value={1}>+1.0 Muy Alto</option>
                                    <option value={0.5}>+0.5 Alto</option>
                                    <option value={0}>0.0 Medio</option>
                                    <option value={-0.5}>-0.5 Bajo</option>
                                    <option value={-1}>-1.0 Muy Bajo</option>
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        )}

                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg py-8 text-center">
                    <p className="text-[#3a3a3a] text-xs font-mono">SIN CRITERIOS CONFIGURADOS</p>
                    <button onClick={() => setShowAddModal(true)}
                      className="mt-3 px-3 py-1.5 rounded text-[10px] font-bold uppercase"
                      style={{ color: NEON.green, border: `1px solid ${NEON.green}50`, backgroundColor: NEON.green + '10' }}>
                      + AÑADIR CRITERIO
                    </button>
                  </div>
                )}
              </div>

              {/* Thresholds */}
              <div className="space-y-3">
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: NEON.orange }}>SEMÁFOROS</span>
                {selectedMatrix.score_thresholds?.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {selectedMatrix.score_thresholds.map(threshold => {
                      const c = threshold.color === 'green' ? NEON.green : threshold.color === 'yellow' ? NEON.yellow : NEON.red;
                      return (
                        <div key={threshold.id} className="bg-[#0d0d0d] border rounded-lg px-3 py-2" style={{ borderColor: c + '30' }}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c, boxShadow: `0 0 6px ${c}80` }} />
                            <span className="font-bold text-[10px]" style={{ color: c }}>{threshold.label}</span>
                          </div>
                          <span className="text-[#8a8a8a] text-[10px] font-mono">{threshold.min_score} – {threshold.max_score}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg p-4 text-center">
                    <p className="text-[#3a3a3a] text-xs font-mono">SIN SEMÁFOROS</p>
                  </div>
                )}
              </div>

              {/* Formula */}
              <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg px-3 py-2">
                <p className="text-[10px] font-mono text-[#555]">
                  <span style={{ color: NEON.blue }}>ƒ</span> = ((Σ(peso × multiplicador) + totalPesos) / (totalPesos × 2)) × 100
                </p>
              </div>
            </>
          ) : (
            <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg py-16 text-center">
              <p className="text-[#3a3a3a] text-xs font-mono">SELECCIONA UNA MATRIZ</p>
            </div>
          )}
        </div>
      </div>

      {showAddModal && selectedMatrix && (
        <AddCriterionModal matrixId={selectedMatrix.id}
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); fetchMatrices(); }} />
      )}
    </div>
  );
};

export default ScoringPage;
