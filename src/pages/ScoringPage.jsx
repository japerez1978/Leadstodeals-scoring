import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from 'core-saas'; // Nuevo motor SaaS
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
        .insert({ 
          matrix_id: matrixId, 
          name, 
          hubspot_property: hubspotProperty,
          weight: parseFloat(weight) || 10, 
          type, 
          sort_order: nextOrder, 
          active: true, 
          code: `P${nextOrder + 1}` 
        })
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
        const chunkSize = 50;
        for (let i = 0; i < opts.length; i += chunkSize) {
          const chunk = opts.slice(i, i + chunkSize);
          const { error: optsError } = await supabase.from('criterion_options').insert(chunk);
          if (optsError) throw optsError;
        }
      }
      onSaved();
    } catch (e) {
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
        style={{ fontFamily: "monospace" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e1e]">
          <div className="flex items-center gap-2">
            <span style={{ color: NEON.blue }}>+</span>
            <span className="text-xs font-bold uppercase tracking-widest text-white">Añadir Criterio</span>
          </div>
          <button onClick={onClose} className="text-[#3a3a3a] hover:text-white transition-colors text-xs">✕</button>
        </div>
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          <div className="md:w-1/2 flex flex-col border-r border-[#1e1e1e] overflow-hidden">
            <div className="px-3 pt-3 pb-2">
              <div className="flex items-center gap-2 bg-[#0a0a0a] border border-[#1e1e1e] rounded px-2 py-1.5">
                <span className="text-[#3a3a3a] text-xs">⌕</span>
                <input type="text" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className="bg-transparent text-white text-[11px] font-mono focus:outline-none flex-1" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-3">
              {loadingProps ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : (
                Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([group, props]) => (
                  <div key={group}>
                    <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: NEON.dim }}>{group}</p>
                    <div className="space-y-0.5">
                      {props.map((prop) => (
                        <button key={prop.name} onClick={() => handleSelectProp(prop)}
                          className={`w-full text-left px-2 py-1.5 rounded transition-colors text-[11px] ${
                            selectedProp?.name === prop.name ? 'bg-[#00D4FF10] border-[#00D4FF30] text-white' : 'text-[#8a8a8a] hover:bg-[#1a1a1a]'
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
          <div className="md:w-1/2 flex flex-col overflow-y-auto px-4 py-3 space-y-3">
            {selectedProp && (
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
                    <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}><option value="options">options</option><option value="range">range</option><option value="text">text</option></select>
                  </div>
                  <div className="w-20">
                    <label className="block text-[9px] font-bold uppercase tracking-widest text-[#555] mb-1">Peso</label>
                    <input type="number" step="1" value={weight} onChange={(e) => setWeight(e.target.value)} className={inputCls + ' text-center'} />
                  </div>
                </div>
                {error && <div className="text-xs px-2 py-1.5 rounded border" style={{ color: NEON.red, borderColor: NEON.red + '30' }}>{error}</div>}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#1e1e1e]">
          <button onClick={onClose} className="px-3 py-1.5 text-[#555] hover:text-white text-xs">Cancelar</button>
          <button onClick={handleSave} disabled={!selectedProp || saving} className="px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider" style={{ color: NEON.green, border: `1px solid ${NEON.green}50` }}>
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
  const { user } = useAuth();
  const { data: tenantData, isLoading: tenantLoading } = useTenant(user?.id, user?.email);
  const tenantId = tenantData?.tenant_id;
  
  const { data: matrices = [], isLoading: matricesLoading, refetch: fetchMatrices } = useScoringMatrices(tenantId);
  const [selectedMatrixId, setSelectedMatrixId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedCriteria, setExpandedCriteria] = useState({});

  const toggleExpand = (cid) => {
    setExpandedCriteria(prev => ({ ...prev, [cid]: !prev[cid] }));
  };

  const selectedMatrix = useMemo(() => {
    if (!matrices.length) return null;
    return matrices.find(m => m.id === selectedMatrixId) || matrices[0];
  }, [matrices, selectedMatrixId]);

  useEffect(() => {
    if (matrices.length > 0 && !selectedMatrixId) { setSelectedMatrixId(matrices[0].id); }
  }, [matrices, selectedMatrixId]);

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
    if (!window.confirm(`¿Eliminar "${criterion.name}"?`)) return;
    try {
      await supabase.from('criteria').delete().eq('id', criterion.id);
      await fetchMatrices();
    } catch (error) { console.error('Error deleting criterion:', error); }
  };

  const weightTotal = (selectedMatrix?.criteria || []).reduce((s, c) => s + (c.weight || 0), 0);
  const weightOk = weightTotal === 100;

  if (tenantLoading || matricesLoading) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center">
      <Spinner />
      <p className="mt-4 text-xs font-mono" style={{ color: NEON.blue }}>CARGANDO CONFIGURACIÓN...</p>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in-up font-sans px-2 pb-20">
      {/* Header & Matrix Selector */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight uppercase italic">
            SCORING <span className="text-accent-500">CONFIG</span>
          </h1>
          <p className="text-[10px] text-steel-500 font-bold uppercase tracking-[0.3em] mt-1 pl-1 border-l-2 border-accent-500">
            {tenantData?.tenants?.nombre || 'Panel de Control'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-surface-700/50 p-1.5 rounded-2xl border border-white/5 backdrop-blur-xl shadow-2xl">
          <div className="px-3 py-1 text-[9px] font-black text-white uppercase tracking-widest border-r border-white/5 mr-1 text-center">Matrices</div>
          {matrices.map(matrix => (
            <button 
              key={matrix.id} 
              onClick={() => setSelectedMatrixId(matrix.id)} 
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all duration-300 ${
                selectedMatrix?.id === matrix.id 
                  ? 'bg-accent-500 text-white shadow-lg shadow-accent-500/20' 
                  : 'text-steel-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {matrix.name}
            </button>
          ))}
        </div>
      </div>

      {selectedMatrix ? (
        <div className="space-y-6">
          {/* Active Status & Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass-card p-4 rounded-2xl border border-white/5 flex items-center justify-between group hover:border-accent-500/30 transition-colors">
              <div>
                <p className="text-[9px] font-black text-white uppercase tracking-widest mb-1 opacity-60">Estado</p>
                <h3 className="text-white font-bold uppercase text-xs flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${selectedMatrix.active ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                  {selectedMatrix.active ? 'Matriz Activa' : 'Inactiva'}
                </h3>
              </div>
              <div className="text-[10px] font-mono text-steel-600">ID: {selectedMatrix.id.split('-')[0]}</div>
            </div>

            <div className={`glass-card p-4 rounded-2xl border flex items-center justify-between transition-all ${weightOk ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/20 bg-amber-500/5'}`}>
              <div>
                <p className="text-[9px] font-black text-white uppercase tracking-widest mb-1 opacity-60">Total Pesos</p>
                <h3 className={`text-xl font-black ${weightOk ? 'text-emerald-400' : 'text-amber-400'}`}>Σ {weightTotal} / 100</h3>
              </div>
              <div className={`text-[10px] font-bold px-2 py-1 rounded-lg ${weightOk ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                {weightOk ? 'EQUILIBRADO' : 'AJUSTAR PESOS'}
              </div>
            </div>

            <button 
              onClick={() => setShowAddModal(true)}
              className="glass-card p-4 rounded-2xl border border-accent-500/20 bg-accent-500/5 flex items-center justify-center gap-3 hover:bg-accent-500/10 hover:border-accent-500/40 transition-all group"
            >
              <div className="w-8 h-8 rounded-xl bg-accent-500 flex items-center justify-center shadow-lg shadow-accent-500/30 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-white text-lg">add</span>
              </div>
              <span className="text-xs font-black text-white uppercase tracking-widest">Añadir Criterio</span>
            </button>
          </div>

          {/* Criteria List */}
          <div className="space-y-4">
            {(selectedMatrix.criteria || []).length === 0 ? (
              <div className="py-20 text-center glass-card rounded-3xl border border-dashed border-white/10">
                <p className="text-steel-600 text-xs font-bold uppercase italic tracking-widest">No hay criterios configurados en esta matriz</p>
              </div>
            ) : (
              (selectedMatrix.criteria || []).map((criterion, idx) => (
                <div key={criterion.id} className="glass-card rounded-3xl border border-white/5 overflow-hidden hover:border-white/10 transition-colors group">
                  {/* Criterion Header */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 gap-4 bg-white/[0.02]">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-2xl bg-surface-700 flex items-center justify-center border border-white/5 text-accent-500 font-black text-[10px] tabular-nums">
                        {criterion.code || (idx + 1)}
                      </div>
                      <div>
                        <h4 className="text-white font-black uppercase text-sm">{criterion.name}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-steel-500 font-mono tracking-tighter">{criterion.hubspot_property}</span>
                          <span className="w-1 h-1 rounded-full bg-steel-700" />
                          <span className="text-[9px] text-accent-500 font-black uppercase">{criterion.type}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 w-full sm:w-auto">
                      <div className="flex-1 sm:flex-none">
                        <label className="block text-[8px] font-black text-steel-600 uppercase tracking-[0.2em] mb-1 pl-1">Peso (%)</label>
                        <div className="relative group/input">
                          <input 
                            type="number" 
                            defaultValue={criterion.weight} 
                            onBlur={(e) => updateCriterion(criterion.id, 'weight', parseFloat(e.target.value))} 
                            className="w-24 px-4 py-2 bg-black/40 border border-white/5 rounded-xl text-accent-400 font-black text-sm text-center outline-none focus:border-accent-500/50 transition-all"
                          />
                        </div>
                      </div>
                      <button 
                        onClick={() => deleteCriterion(criterion)}
                        className="p-3 rounded-xl text-steel-600 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <span className="material-symbols-outlined text-lg">delete</span>
                      </button>
                    </div>
                  </div>

                  {/* Options / Config Area */}
                  {criterion.type === 'options' || criterion.criterion_options?.length > 0 ? (
                    <div className="p-5 bg-black/20">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {(() => {
                          const opts = criterion.criterion_options || [];
                          const isExpanded = expandedCriteria[criterion.id];
                          const threshold = 12;
                          const showMore = opts.length > threshold && !isExpanded;
                          const display = showMore ? opts.slice(0, threshold) : opts;

                          return (
                            <>
                              {display.map(opt => (
                                <div key={opt.id} className="flex items-center justify-between gap-3 px-4 py-3 bg-surface-700/30 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
                                  <span className="text-[10px] font-bold text-steel-300 uppercase truncate" title={opt.label}>{opt.label}</span>
                                  <select 
                                    value={opt.multiplier} 
                                    onChange={(e) => updateOption(opt.id, 'multiplier', parseFloat(e.target.value))} 
                                    className={`bg-black/40 border-none rounded-lg text-[10px] font-black px-2 py-1 outline-none transition-colors ${
                                      opt.multiplier > 0 ? 'text-emerald-400' : opt.multiplier < 0 ? 'text-red-400' : 'text-steel-500'
                                    }`}
                                  >
                                    <option value="1" className="bg-surface-800 text-white">Muy Alto</option>
                                    <option value="0.5" className="bg-surface-800 text-white">Alto</option>
                                    <option value="0" className="bg-surface-800 text-white">Medio</option>
                                    <option value="-0.5" className="bg-surface-800 text-white">Bajo</option>
                                    <option value="-1" className="bg-surface-800 text-white">Muy Bajo</option>
                                  </select>
                                </div>
                              ))}
                              {opts.length > threshold && (
                                <button 
                                  onClick={() => toggleExpand(criterion.id)}
                                  className="flex items-center justify-center gap-2 px-4 py-3 bg-accent-500/5 rounded-2xl border border-accent-500/10 hover:bg-accent-500/10 hover:border-accent-500/30 transition-all text-accent-400 font-black text-[10px] uppercase tracking-widest col-span-1"
                                >
                                  <span className="material-symbols-outlined text-sm">
                                    {isExpanded ? 'unfold_less' : 'unfold_more'}
                                  </span>
                                  {isExpanded ? 'Cerrar Lista' : `Ver todas (${opts.length})`}
                                </button>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-black/10 border-t border-white/5">
                      <p className="text-[10px] text-steel-600 italic text-center">Configuración por defecto o basada en rangos numéricos</p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="py-32 text-center glass-card rounded-3xl border border-dashed border-white/10 animate-pulse">
           <span className="material-symbols-outlined text-4xl text-steel-700 mb-4 block">layers</span>
           <p className="text-steel-600 text-sm font-bold uppercase tracking-[0.3em]">Selecciona una matriz para configurar</p>
        </div>
      )}
      
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
