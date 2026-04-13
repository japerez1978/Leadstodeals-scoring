import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useDashboardData } from '../hooks/useQueries';

// ─── Neon palette ─────────────────────────────────────────────────────────────
const NEON = {
  green: '#00FF87',
  red: '#FF3B5C',
  blue: '#00D4FF',
  yellow: '#FFD600',
  orange: '#FF7A00',
  dim: '#3a3a3a',
  text: '#8a8a8a',
  bg: '#0a0a0a',
  card: '#111111',
  border: '#1e1e1e',
};

// ─── Stage → % éxito mapping ─────────────────────────────────────────────────
const STAGE_PROBABILITY = {
  // Won / Lost are handled by pipeline metadata
  // Default probabilities by common stage names (fallback)
  'appointmentscheduled': 20,
  'qualifiedtobuy': 40,
  'presentationscheduled': 60,
  'decisionmakerboughtin': 80,
  'contractsent': 90,
  'closedwon': 100,
  'closedlost': 0,
};

// ─── Mini sparkline SVG ──────────────────────────────────────────────────────
const MiniBar = ({ value, max = 100, color }) => (
  <div className="w-12 h-3 bg-[#1a1a1a] rounded-sm overflow-hidden">
    <div className="h-full rounded-sm transition-all" style={{
      width: `${Math.min(100, Math.max(0, (value / max) * 100))}%`,
      backgroundColor: color,
      boxShadow: `0 0 6px ${color}80`,
    }} />
  </div>
);

// ─── Neon value display ──────────────────────────────────────────────────────
const NeonVal = ({ value, color }) => (
  <span className="font-mono font-bold text-xs tabular-nums" style={{ color, textShadow: `0 0 8px ${color}60` }}>
    {value}
  </span>
);

// ─── Deal row component ──────────────────────────────────────────────────────
const DealRow = ({ deal, stageLabel, probability, navigate, rank, ownerMap, companyMap }) => {
  const pot = deal.score;
  const health = deal.healthScore;
  const dmi = deal.dmi;
  const amount = deal.properties.amount ? parseFloat(deal.properties.amount) : 0;
  const potColor = pot >= 70 ? NEON.green : pot >= 45 ? NEON.yellow : NEON.red;
  const healthColor = health != null ? (health >= 70 ? NEON.green : health >= 45 ? NEON.yellow : NEON.red) : NEON.dim;
  const dmiColor = dmi != null ? (dmi >= 75 ? NEON.green : dmi >= 50 ? NEON.yellow : dmi >= 25 ? NEON.red : NEON.dim) : NEON.dim;
  const action = dmi == null ? null
    : dmi >= 75 ? { label: 'ACELERAR', color: NEON.green }
    : dmi >= 50 ? { label: 'VIGILAR',  color: NEON.yellow }
    : dmi >= 25 ? { label: 'RESCATAR', color: NEON.red }
    : { label: 'SOLTAR', color: NEON.dim };

  return (
    <tr
      className="border-b border-[#1a1a1a] hover:bg-[#0f1a0f] cursor-pointer transition-colors group"
      onClick={() => navigate(`/deal/${deal.id}`)}
      style={{ display: 'flex', width: '100%' }}
    >
      {/* Rank */}
      <td className="pl-2 pr-1 py-1.5 text-center flex-shrink-0" style={{ width: '24px' }}>
        <span className="font-mono text-[9px] text-[#3a3a3a]">{rank}</span>
      </td>
      {/* Deal name */}
      <td className="px-1.5 py-1.5" style={{ flex: 2 }}>
        <p className="text-white text-[11px] font-medium leading-tight group-hover:text-[#00FF87] transition-colors whitespace-normal break-words">
          {deal.properties.dealname}
        </p>
      </td>
      {/* Unidad de negocio */}
      <td className="px-1.5 py-1.5 hidden xl:table-cell" style={{ flex: 1 }}>
        <span className="text-[10px] text-[#666] truncate block">{deal.properties.unidad_de_negocio_deal || '—'}</span>
      </td>
      {/* Propietario */}
      <td className="px-1.5 py-1.5 hidden xl:table-cell" style={{ flex: 1 }}>
        <span className="text-[10px] text-[#666] truncate block">
          {ownerMap?.[String(deal.properties.hubspot_owner_id)] || deal.properties.hubspot_owner_id || '—'}
        </span>
      </td>
      {/* Stage + % */}
      <td className="px-1.5 py-1.5 hidden lg:table-cell" style={{ flex: 0.8 }}>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[#666] truncate">{stageLabel}</span>
          <span className="font-mono text-[9px] px-1 rounded text-nowrap"
            style={{
              color: probability === 100 ? NEON.green : probability === 0 ? NEON.red : NEON.blue,
              backgroundColor: probability === 100 ? '#00FF8710' : probability === 0 ? '#FF3B5C10' : '#00D4FF10',
            }}>
            {probability}%
          </span>
        </div>
      </td>
      {/* Amount */}
      <td className="px-1.5 py-1.5 text-right hidden sm:table-cell flex-shrink-0" style={{ flex: 0.8 }}>
        <span className="font-mono text-[11px] text-white text-nowrap">
          {amount ? `€${amount.toLocaleString('es-ES', { minimumFractionDigits: 0 })}` : '—'}
        </span>
      </td>
      {/* Potentiality */}
      <td className="px-1.5 py-1.5 text-center flex-shrink-0" style={{ width: '50px' }}>
        <div className="flex items-center justify-center gap-1">
          <NeonVal value={pot} color={potColor} />
        </div>
      </td>
      {/* Health */}
      <td className="px-1.5 py-1.5 text-center hidden md:table-cell flex-shrink-0" style={{ width: '50px' }}>
        <div className="flex items-center justify-center gap-1">
          <NeonVal value={health ?? '—'} color={healthColor} />
        </div>
      </td>
      {/* DMI */}
      <td className="px-1.5 py-1.5 text-center flex-shrink-0" style={{ width: '50px' }}>
        <div className="flex items-center justify-center gap-1">
          <NeonVal value={dmi ?? '—'} color={dmiColor} />
        </div>
      </td>
      {/* Acción */}
      <td className="px-1.5 py-1.5 text-center hidden sm:table-cell flex-shrink-0" style={{ width: '70px' }}>
        {action ? (
          <span className="font-mono text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded"
            style={{ color: action.color, background: action.color + '15', border: `1px solid ${action.color}30`, textShadow: `0 0 8px ${action.color}60` }}>
            {action.label}
          </span>
        ) : <span className="text-[#2a2a2a] font-mono text-[9px]">—</span>}
      </td>
      {/* Arrow */}
      <td className="flex-shrink-0" style={{ width: '24px', paddingRight: '8px' }}>
        <span className="material-symbols-outlined text-[13px] text-[#2a2a2a] group-hover:text-[#00FF87] transition-colors">chevron_right</span>
      </td>
    </tr>
  );
};

// ─── Section header ──────────────────────────────────────────────────────────
const SectionHeader = ({ icon, title, count, color, totalAmount }) => (
  <div className="flex items-center justify-between px-3 py-2 bg-[#0d0d0d] border border-[#1e1e1e] rounded-t-lg">
    <div className="flex items-center gap-2">
      <span style={{ color, textShadow: `0 0 10px ${color}50` }} className="text-sm">{icon}</span>
      <span className="text-xs font-bold uppercase tracking-widest" style={{ color }}>{title}</span>
      <span className="font-mono text-[10px] bg-[#1a1a1a] text-[#8a8a8a] px-1.5 py-0.5 rounded">{count}</span>
    </div>
    <span className="font-mono text-[11px] text-[#8a8a8a]">
      Vol: <span className="text-white">€{totalAmount.toLocaleString('es-ES', { minimumFractionDigits: 0 })}</span>
    </span>
  </div>
);

// ─── Table header ────────────────────────────────────────────────────────────
const TableHead = () => (
  <thead style={{ display: 'block' }}>
    <tr className="border-b border-[#1e1e1e]" style={{ display: 'flex', width: '100%' }}>
      <th className="pl-2 pr-1 py-1.5 text-[9px] text-[#3a3a3a] font-mono font-bold uppercase tracking-widest flex-shrink-0" style={{ width: '24px' }}>
        #
      </th>
      <th className="px-1.5 py-1.5 text-left text-[9px] font-bold uppercase tracking-widest text-[#555]" style={{ flex: 2 }}>
        Deal
      </th>
      <th className="px-1.5 py-1.5 text-left text-[9px] font-bold uppercase tracking-widest text-[#555] hidden xl:block" style={{ flex: 1 }}>
        U.Negocio
      </th>
      <th className="px-1.5 py-1.5 text-left text-[9px] font-bold uppercase tracking-widest text-[#555] hidden xl:block" style={{ flex: 1 }}>
        Propietario
      </th>
      <th className="px-1.5 py-1.5 text-left text-[9px] font-bold uppercase tracking-widest text-[#555] hidden lg:block" style={{ flex: 0.8 }}>
        Etapa
      </th>
      <th className="px-1.5 py-1.5 text-right text-[9px] font-bold uppercase tracking-widest text-[#555] hidden sm:block" style={{ flex: 0.8 }}>
        Importe
      </th>
      <th className="px-1.5 py-1.5 text-center text-[9px] font-bold uppercase tracking-widest flex-shrink-0" style={{ color: NEON.green, width: '50px' }}>
        CAL
      </th>
      <th className="px-1.5 py-1.5 text-center text-[9px] font-bold uppercase tracking-widest hidden md:block flex-shrink-0" style={{ color: NEON.blue, width: '50px' }}>
        SAL
      </th>
      <th className="px-1.5 py-1.5 text-center text-[9px] font-bold uppercase tracking-widest flex-shrink-0" style={{ color: NEON.orange, width: '50px' }}>
        DMI
      </th>
      <th className="px-1.5 py-1.5 text-center text-[9px] font-bold uppercase tracking-widest hidden sm:block flex-shrink-0" style={{ color: '#555', width: '70px' }}>
        ACCIÓN
      </th>
      <th className="flex-shrink-0" style={{ width: '24px', paddingRight: '8px' }}></th>
    </tr>
  </thead>
);

// ─── Custom Neon MultiSelect ────────────────────────────────────────────────
const MultiSelect = ({ label, options, selected, onChange, color = NEON.green }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (val) => {
    const next = selected.includes(val) ? selected.filter(s => s !== val) : [...selected, val];
    onChange(next);
  };

  const getDisplayText = () => {
    if (selected.length === 0) return 'TODOS';
    if (selected.length === 1) {
      const opt = options.find(o => o.id === selected[0]);
      return opt ? opt.name.toUpperCase() : '1 SELECC.';
    }
    return 'VARIOS';
  };

  return (
    <div className="relative" ref={containerRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-[#0d0d0d] border border-[#1e1e1e] rounded px-3 py-1.5 hover:border-[#333] transition-all min-w-[150px]"
        style={selected.length > 0 ? { borderColor: color + '50', backgroundColor: color + '08' } : {}}
      >
        <span className="text-[9px] font-black uppercase tracking-widest absolute -top-2 left-2 px-1 bg-[#0a0a0a] z-10" style={{ color: NEON.green }}>
          {label}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest truncate max-w-[120px]" style={{ color: selected.length > 0 ? color : '#8a8a8a' }}>
          {getDisplayText()}
        </span>
        <span className={`material-symbols-outlined text-[14px] text-[#3a3a3a] transition-transform ml-auto ${isOpen ? 'rotate-180' : ''}`}>expand_more</span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-[#0d0d0d] border border-[#1e1e1e] rounded shadow-2xl z-[100] max-h-60 overflow-y-auto p-1 custom-scrollbar">
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#1e1e1e] mb-1">
            <span className="text-[9px] font-bold text-[#555] uppercase tracking-widest">{label}</span>
            <button onClick={() => onChange([])} className="text-[9px] text-[#00FF87] hover:underline uppercase">Limpiar</button>
          </div>
          {options.map(opt => {
            const isSelected = selected.includes(opt.id);
            return (
              <label key={opt.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#1a1a1a] cursor-pointer rounded transition-colors group">
                <input type="checkbox" checked={isSelected} onChange={() => toggleOption(opt.id)} className="hidden" />
                <div className={`w-3 h-3 rounded-sm border transition-all flex items-center justify-center ${isSelected ? 'bg-[#00FF87] border-[#00FF87]' : 'border-[#333]'}`}>
                  {isSelected && <span className="material-symbols-outlined text-[10px] text-black font-bold">check</span>}
                </div>
                <span className={`text-[10px] uppercase font-bold tracking-wider transition-colors ${isSelected ? 'text-white' : 'text-[#666] group-hover:text-[#aaa]'}`}>
                  {opt.name}
                </span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
const DashboardPage = () => {
  const { tenant } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState(['live']);
  const [selectedUnits, setSelectedUnits] = useState([]);
  const [selectedOwners, setSelectedOwners] = useState([]);
  const [clock, setClock] = useState(new Date());

  // Clock tick for header
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { data: dashboardData, isLoading: loading, isFetching: refreshing } = useDashboardData(tenant?.id);

  const deals = dashboardData?.deals || [];
  const stageLabels = dashboardData?.labels || {};
  const stageProbabilities = dashboardData?.probs || {};
  const ownerMap = dashboardData?.ownerMap || {};
  const companyMap = dashboardData?.companyMap || {};
  const cacheTimestamp = dashboardData?.timestamp;
  const cacheAge = cacheTimestamp ? Date.now() - cacheTimestamp : 0;

  // ── Categorize deals ─────────────────────────────────────────────────────
  const getProb = (stageId) => {
    if (stageProbabilities[stageId] != null) return stageProbabilities[stageId];
    const label = (stageLabels[stageId] || stageId || '').toLowerCase().replace(/\s+/g, '');
    if (STAGE_PROBABILITY[label] != null) return STAGE_PROBABILITY[label];
    return 50; // default
  };

  const { wonDeals, lostDeals, liveDeals } = useMemo(() => {
    const won = [], lost = [], live = [];
    for (const d of deals) {
      const p = getProb(d.properties.dealstage);
      if (p === 100) won.push(d);
      else if (p === 0) lost.push(d);
      else live.push(d);
    }
    // Sort live by DMI desc
    live.sort((a, b) => (b.dmi ?? 0) - (a.dmi ?? 0));
    won.sort((a, b) => (b.dmi ?? 0) - (a.dmi ?? 0));
    lost.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return { wonDeals: won, lostDeals: lost, liveDeals: live };
  }, [deals, stageProbabilities, stageLabels]);

  const { businessUnits, owners } = useMemo(() => {
    const units = new Set(deals.map(d => d.properties.unidad_de_negocio_deal).filter(Boolean));
    const ownerIds = new Set(deals.map(d => d.properties.hubspot_owner_id).filter(Boolean));
    
    return {
      businessUnits: Array.from(units).sort(),
      owners: Array.from(ownerIds).map(id => ({
        id: String(id),
        name: ownerMap[id] || `ID: ${id}`
      })).sort((a, b) => a.name.localeCompare(b.name))
    };
  }, [deals, ownerMap]);

  const filtered = useMemo(() => {
    // Determine which deals to show based on selected statuses
    let source = [];
    const statuses = selectedStatuses.length === 0 ? ['live', 'won', 'lost'] : selectedStatuses;
    if (statuses.includes('live')) source = [...source, ...liveDeals];
    if (statuses.includes('won')) source = [...source, ...wonDeals];
    if (statuses.includes('lost')) source = [...source, ...lostDeals];

    // Deduplicate and re-sort by DMI
    source = Array.from(new Set(source)).sort((a, b) => (b.dmi ?? 0) - (a.dmi ?? 0));

    return source.filter(d => {
      const matchSearch = !searchTerm || d.properties.dealname?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchUnit = selectedUnits.length === 0 || selectedUnits.includes(d.properties.unidad_de_negocio_deal);
      const matchOwner = selectedOwners.length === 0 || selectedOwners.includes(String(d.properties.hubspot_owner_id));
      return matchSearch && matchUnit && matchOwner;
    });
  }, [liveDeals, wonDeals, lostDeals, searchTerm, selectedStatuses, selectedUnits, selectedOwners]);

  const topDeals = useMemo(() =>
    [...liveDeals].sort((a, b) => (b.dmi ?? 0) - (a.dmi ?? 0)).slice(0, 10),
    [liveDeals]
  );

  const totalAmount = (arr) => arr.reduce((s, d) => s + (d.properties.amount ? parseFloat(d.properties.amount) : 0), 0);

  // ── Averages per active tab ──────────────────────────────────────────────
  const averages = useMemo(() => {
    const source = filtered;
    if (source.length === 0) return { cal: 0, sal: 0, dmi: 0 };
    const cal = Math.round(source.reduce((s, d) => s + (d.score ?? 0), 0) / source.length);
    const salDeals = source.filter(d => d.healthScore != null);
    const sal = salDeals.length ? Math.round(salDeals.reduce((s, d) => s + d.healthScore, 0) / salDeals.length) : 0;
    const dmiDeals = source.filter(d => d.dmi != null);
    const dmi = dmiDeals.length ? Math.round(dmiDeals.reduce((s, d) => s + d.dmi, 0) / dmiDeals.length) : 0;
    return { cal, sal, dmi };
  }, [filtered]);

  const getStageLabel = (id) => stageLabels[id] || id;

  // ── Loading Screen (New & Improved UX) ───────────────────────────────────
  if (loading) return (
    <div className="fixed inset-0 bg-[#060606] flex flex-col items-center justify-center z-50">
      <div className="relative">
        {/* Glow effect background */}
        <div className="absolute inset-0 rounded-full blur-2xl opacity-20" style={{ backgroundColor: NEON.green }} />
        
        {/* Neon Spinner */}
        <div className="w-20 h-20 border-4 border-neutral-900 border-t-[#00FF87] rounded-full animate-spin shadow-[0_0_20px_rgba(0,255,135,0.3)]" />
      </div>
      
      <div className="mt-12 text-center space-y-4">
        <h2 className="text-white text-xs font-mono font-black uppercase tracking-[0.4em] animate-pulse">
          Sincronizando negocios desde HubSpot
        </h2>
        <div className="flex items-center justify-center gap-1">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="w-1 h-1 rounded-full bg-[#00FF87] animate-bounce" 
              style={{ animationDelay: `${i * 0.2}s` }} />
          ))}
        </div>
        <p className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest pt-4">
          Estableciendo conexión segura con la terminal...
        </p>
      </div>
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────────
  const tabData = { live: liveDeals, won: wonDeals, lost: lostDeals };
  const tabConfig = {
    live:  { icon: '◉', label: 'EN CURSO', color: NEON.blue,  sectionIcon: '◉', sectionTitle: 'NEGOCIOS EN CURSO' },
    won:   { icon: '▲', label: 'GANADOS',  color: NEON.green, sectionIcon: '▲', sectionTitle: 'NEGOCIOS GANADOS' },
    lost:  { icon: '▼', label: 'PERDIDOS', color: NEON.red,   sectionIcon: '▼', sectionTitle: 'NEGOCIOS PERDIDOS' },
  };
  const displayStatuses = selectedStatuses.length === 1 ? selectedStatuses : (selectedStatuses.length === 0 ? ['live', 'won', 'lost'] : selectedStatuses);
  const tc = displayStatuses.length === 1 ? tabConfig[displayStatuses[0]] : {
    icon: '◉',
    label: 'VARIOS',
    color: NEON.blue,
    sectionIcon: '◉',
    sectionTitle: 'NEGOCIOS FILTRADOS'
  };

  return (
    <div className="space-y-4" style={{ fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace" }}>

      {/* ── Header bar ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black text-white tracking-tight" style={{ fontFamily: 'inherit' }}>
            DEAL INTELLIGENCE TERMINAL
          </h1>
          <p className="text-[10px] text-[#3a3a3a] mt-0.5">
            {deals.length} activos &middot; Última actualización {clock.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {refreshing ? (
            <div className="flex items-center gap-1.5 bg-[#0d0d0d] border border-[#1e1e1e] rounded px-2 py-1">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: NEON.yellow }} />
              <span className="text-[10px] font-mono" style={{ color: NEON.yellow }}>ACTUALIZANDO</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-[#0d0d0d] border border-[#1e1e1e] rounded px-2 py-1">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: NEON.green }} />
              <span className="text-[10px] font-mono" style={{ color: NEON.green }}>
                {cacheAge > 0 ? `CACHÉ ${Math.round(cacheAge / 60000)}m` : 'LIVE'}
              </span>
            </div>
          )}
          <button onClick={() => queryClient.invalidateQueries({ queryKey: ['dashboard_data', tenant?.id] })}
            className="flex items-center gap-1 px-2 py-1 bg-[#0d0d0d] border border-[#1e1e1e] rounded hover:border-[#00FF87] transition-colors">
            <span className={`material-symbols-outlined text-[14px] text-[#555] ${refreshing ? 'animate-spin' : ''}`}>refresh</span>
          </button>
        </div>
      </div>

      {/* ── Summary strip ── */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded px-3 py-2">
          <p className="text-[9px] text-[#555] uppercase">Total</p>
          <p className="text-white text-lg font-black">{deals.length}</p>
        </div>
        <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded px-3 py-2">
          <p className="text-[9px] uppercase" style={{ color: NEON.blue }}>En curso</p>
          <p className="text-lg font-black" style={{ color: NEON.blue, textShadow: `0 0 10px ${NEON.blue}40` }}>{liveDeals.length}</p>
        </div>
        <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded px-3 py-2">
          <p className="text-[9px] uppercase" style={{ color: NEON.green }}>Ganados</p>
          <p className="text-lg font-black" style={{ color: NEON.green, textShadow: `0 0 10px ${NEON.green}40` }}>{wonDeals.length}</p>
        </div>
        <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded px-3 py-2">
          <p className="text-[9px] uppercase" style={{ color: NEON.red }}>Perdidos</p>
          <p className="text-lg font-black" style={{ color: NEON.red, textShadow: `0 0 10px ${NEON.red}40` }}>{lostDeals.length}</p>
        </div>
      </div>

      {/* ── TOP 10 Auto-scrolling Ticker ── */}
      {topDeals.length > 0 && (
        <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded overflow-hidden">
          <style>{`
            @keyframes ticker-scroll {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
            .ticker-track { animation: ticker-scroll 30s linear infinite; }
            .ticker-track:hover { animation-play-state: paused; }
          `}</style>
          <div className="flex items-center gap-2 px-3 py-1 border-b border-[#1e1e1e]">
            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: NEON.orange }}>TOP 10 DMI</span>
            <div className="flex-1 h-px bg-[#1e1e1e]" />
            <span className="text-[9px] font-mono text-[#3a3a3a]">€{totalAmount(topDeals).toLocaleString('es-ES')}</span>
          </div>
          {/* Infinite auto-scroll: duplicate list for seamless loop */}
          <div className="overflow-hidden p-2">
            <div className="flex ticker-track" style={{ width: 'max-content', gap: '8px' }}>
              {[...topDeals, ...topDeals].map((deal, i) => {
                const idx = i % topDeals.length;
                const isLast = idx === topDeals.length - 1;
                const dmiColor = (deal.dmi ?? 0) >= 75 ? NEON.green : (deal.dmi ?? 0) >= 50 ? NEON.yellow : (deal.dmi ?? 0) >= 25 ? NEON.red : NEON.dim;
                const amt = deal.properties.amount ? parseFloat(deal.properties.amount) : 0;
                return (
                  <React.Fragment key={`${deal.id}-${i}`}>
                    <button onClick={() => navigate(`/deal/${deal.id}`)}
                      className="flex-none bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg p-4 text-left hover:border-[#333] transition-all group flex flex-col justify-between"
                      style={{ width: '280px', height: '140px' }}>
                      {/* Top row: Rank + name + DMI */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-base font-black" style={{ color: NEON.orange, textShadow: `0 0 8px ${NEON.orange}60` }}>
                            #{idx + 1}
                          </span>
                        </div>
                        <p className="font-black leading-snug flex-1 group-hover:text-[#00FF87] transition-colors"
                          style={{
                            fontSize: '15px',
                            color: '#e8ffe8',
                            textShadow: '0 0 16px rgba(0,255,135,0.55), 0 0 4px rgba(255,255,255,0.9)',
                            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                          }}>
                            {deal.properties.dealname}
                        </p>
                        <span className="font-mono text-2xl font-black shrink-0" style={{ color: dmiColor, textShadow: `0 0 14px ${dmiColor}80` }}>
                          {deal.dmi ?? '—'}
                        </span>
                      </div>
                      {/* Bottom row: scores + amount */}
                      <div className="flex items-center gap-3 pt-2 border-t border-[#1e1e1e]">
                        <span className="font-mono text-xs font-bold" style={{ color: NEON.green, textShadow: `0 0 6px ${NEON.green}50` }}>CAL {deal.score}</span>
                        <span className="font-mono text-xs font-bold" style={{ color: NEON.blue, textShadow: `0 0 6px ${NEON.blue}50` }}>SAL {deal.healthScore ?? '—'}</span>
                        {amt > 0 && (
                          <span className="font-mono text-[16px] font-bold text-white ml-auto">€{(amt / 1000).toFixed(0)}k</span>
                        )}
                      </div>
                    </button>
                    {/* Gap of one card width between #10 and #1 */}
                    {isLast && (
                      <div className="flex-none flex items-center justify-center" style={{ width: '208px' }}>
                        <div className="h-3/4 w-px" style={{ background: `linear-gradient(to bottom, transparent, ${NEON.orange}80, transparent)` }} />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
      )}


      {/* ── Averages strip ── */}
      <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded flex items-center justify-between px-4 py-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-[#555]">
          MEDIAS {tc.label}
        </span>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase font-bold" style={{ color: NEON.green }}>CAL</span>
            <span className="font-mono text-sm font-black" style={{ color: NEON.green, textShadow: `0 0 10px ${NEON.green}40` }}>{averages.cal}</span>
            <MiniBar value={averages.cal} color={NEON.green} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase font-bold" style={{ color: NEON.blue }}>SAL</span>
            <span className="font-mono text-sm font-black" style={{ color: NEON.blue, textShadow: `0 0 10px ${NEON.blue}40` }}>{averages.sal}</span>
            <MiniBar value={averages.sal} color={NEON.blue} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase font-bold" style={{ color: NEON.orange }}>DMI</span>
            <span className="font-mono text-sm font-black" style={{ color: NEON.orange, textShadow: `0 0 10px ${NEON.orange}40` }}>{averages.dmi}</span>
            <MiniBar value={averages.dmi} color={NEON.orange} />
          </div>
        </div>
      </div>

      {/* ── Tab bar + Search ── */}
      <div className="flex items-center gap-2">
        {/* ── Status MultiSelect ── */}
        <MultiSelect 
          label="ESTADO"
          options={[
            { id: 'live', name: 'EN CURSO' },
            { id: 'won',  name: 'GANADOS' },
            { id: 'lost', name: 'PERDIDOS' }
          ]}
          selected={selectedStatuses}
          onChange={setSelectedStatuses}
          color={selectedStatuses.includes('won') ? NEON.green : selectedStatuses.includes('lost') ? NEON.red : NEON.blue}
        />

        <div className="h-4 w-px bg-[#1e1e1e] mx-1" />

        {/* ── MultiSelect Filters ── */}
        <div className="flex items-center gap-2">
          <MultiSelect 
            label="NEGOCIO"
            options={businessUnits.map(u => ({ id: u, name: u }))}
            selected={selectedUnits}
            onChange={setSelectedUnits}
            color={NEON.blue}
          />
          <MultiSelect 
            label="PROPIETARIO"
            options={owners}
            selected={selectedOwners}
            onChange={setSelectedOwners}
            color={NEON.orange}
          />
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2 bg-[#0d0d0d] border border-[#333] rounded px-3 py-1.5 transition-all focus-within:border-[#00FF87] focus-within:shadow-[0_0_15px_rgba(0,255,135,0.1)]">
          <span className="material-symbols-outlined text-[18px] text-[#00FF87] drop-shadow-[0_0_8px_rgba(0,255,135,0.5)]">search</span>
          <input type="text" placeholder="BUSCAR NEGOCIO..." value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent text-[#FFFFFF] placeholder-[#FFFFFF] placeholder-opacity-40 text-xs font-mono font-bold focus:outline-none w-64 tracking-widest"
            style={{ textShadow: '0 0 10px rgba(255,255,255,0.3)' }} />
        </div>
      </div>

      {/* ── Deal table ── */}
      <div className="border border-[#1e1e1e] rounded-lg overflow-hidden">
        <SectionHeader
          icon={tc.sectionIcon}
          title={tc.sectionTitle}
          count={filtered.length}
          color={tc.color}
          totalAmount={totalAmount(filtered)}
        />

        {filtered.length === 0 ? (
          <div className="py-12 text-center bg-[#0a0a0a]">
            <span className="text-[#2a2a2a] text-sm font-mono">SIN RESULTADOS</span>
          </div>
        ) : (
          <div className="overflow-x-auto bg-[#0a0a0a]">
            <table className="w-full" style={{ display: 'block' }}>
              <TableHead />
              <tbody style={{ display: 'block' }}>
                {filtered.map((deal, i) => (
                  <DealRow
                    key={deal.id}
                    deal={deal}
                    stageLabel={getStageLabel(deal.properties.dealstage)}
                    probability={getProb(deal.properties.dealstage)}
                    navigate={navigate}
                    rank={i + 1}
                    ownerMap={ownerMap}
                    companyMap={companyMap}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#0d0d0d] border-t border-[#1e1e1e]">
          <span className="text-[9px] font-mono text-[#3a3a3a]">
            {filtered.length} de {deals.length} deals &middot; CAL=Calidad &middot; SAL=Salud &middot; DMI=Momentum
          </span>
          <span className="text-[9px] font-mono text-[#3a3a3a]">
            {clock.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
