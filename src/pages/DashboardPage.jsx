import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useTenant } from 'core-saas'; // Importamos el motor de identidad del Core
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

const NeonVal = ({ value, color }) => (
  <span className="font-mono font-bold text-xs tabular-nums" style={{ color, textShadow: `0 0 8px ${color}60` }}>
    {value}
  </span>
);

// ─── Ticker Component ─────────────────────────────────────────────────────────
const Ticker = ({ deals }) => {
  const navigate = useNavigate();
  if (!deals.length) return null;
  const items = [...deals, ...deals]; // Double for seamless loop
  return (
    <div className="bg-black/40 border-y border-white/5 py-2 overflow-hidden mask-fade-edges relative min-h-[52px] flex items-center group">
      <div className="inline-block animate-ticker whitespace-nowrap group-hover:[animation-play-state:paused]">
        {items.map((d, i) => (
          <div 
            key={`${d.id}-${i}`} 
            onClick={() => navigate(`/deal/${d.id}`)}
            className="inline-flex items-center gap-6 px-10 border-r border-white/5 last:border-none align-middle cursor-pointer hover:bg-white/5 transition-colors group/item"
          >
            <div className="flex items-start gap-3 min-w-[170px] max-w-[240px]">
              <span className="text-[14px] font-black text-[#00FF87] leading-none -mt-0.5">
                {(i % deals.length) + 1}º
              </span>
              <div className="flex flex-col justify-center">
                <span className="text-[10.5px] font-medium text-zinc-100 uppercase tracking-tight whitespace-normal leading-[1.2] break-words line-clamp-2 group-hover/item:text-[#00FF87]">
                  {d.properties.dealname}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2.5 flex-shrink-0 bg-black/20 py-1 px-2 rounded-sm border border-white/5 group-hover/item:border-[#FF8F00]/30">
              <span className={`text-[12px] font-mono font-black ${d.dmi >= 75 ? 'text-[#00FF87]' : d.dmi >= 50 ? 'text-[#FFD600]' : 'text-[#FF3B5C]'}`}>
                 {d.dmi ?? 0}
              </span>
              <span className={`material-symbols-outlined text-[14px] ${d.dmi >= 50 ? 'text-[#00FF87]' : 'text-[#FF3B5C]'}`}>
                 {d.dmi >= 50 ? 'arrow_upward' : 'arrow_downward'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

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
    : { label: 'SOLTAR', color: '#ffffff' }; // "SOLTAR" en blanco

  return (
    <tr
      className="border-b border-[#1a1a1a] hover:bg-[#0f1a0f] cursor-pointer transition-colors group"
      onClick={() => navigate(`/deal/${deal.id}`)}
      style={{ display: 'flex', width: '100%' }}
    >
      <td className="pl-2 pr-1 py-1.5 text-center flex-shrink-0" style={{ width: '32px' }}>
        <span className="font-mono text-[9px] text-[#555]">{rank}</span>
      </td>
      <td className="px-1.5 py-1.5" style={{ flex: 1.8 }}>
        <p className="text-white text-[11px] font-bold leading-tight group-hover:text-[#00FF87] transition-colors whitespace-normal break-words line-clamp-2">
          {deal.properties.dealname}
        </p>
      </td>
      <td className="px-1.5 py-1.5 hidden xl:table-cell" style={{ flex: 1.1 }}>
        <span className="text-[10px] text-[#bbb] font-medium truncate block">
          {deal.properties.unidad_de_negocio_deal || deal.properties.unidad_de_negocio || deal.properties.unidad_negocio || deal.properties.negocio || '—'}
        </span>
      </td>
      <td className="px-1.5 py-1.5 hidden xl:table-cell" style={{ flex: 1.1 }}>
        <span className="text-[10px] text-[#bbb] font-medium truncate block">
          {ownerMap?.[String(deal.properties.hubspot_owner_id)] || deal.properties.hubspot_owner_id || '—'}
        </span>
      </td>
      <td className="px-1.5 py-1.5 hidden lg:table-cell" style={{ flex: 0.9 }}>
        <span className="text-[10px] text-white font-bold uppercase tracking-wider truncate block">
          {deal.properties.nivel_de_cliente || '—'}
        </span>
      </td>
      <td className="px-1.5 py-1.5 hidden lg:table-cell" style={{ flex: 1.3 }}>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[#bbb] truncate">{stageLabel}</span>
          <span className="font-mono text-[9px] px-1 rounded text-nowrap"
            style={{
              color: probability === 100 ? NEON.green : probability === 0 ? NEON.red : NEON.blue,
              backgroundColor: probability === 100 ? '#00FF8710' : probability === 0 ? '#FF3B5C10' : '#00D4FF10',
            }}>
            {probability}%
          </span>
        </div>
      </td>
      <td className="px-1.5 py-1.5 text-right hidden sm:table-cell flex-shrink-0" style={{ flex: 1.1 }}>
        <span className="font-mono text-[11px] text-[#efefef] font-bold text-nowrap">
          {amount ? `${amount.toLocaleString('es-ES', { minimumFractionDigits: 0 })} €` : '—'}
        </span>
      </td>
      <td className="px-1.5 py-1.5 text-center flex-shrink-0" style={{ width: '65px' }}>
        <NeonVal value={pot} color={potColor} />
      </td>
      <td className="px-1.5 py-1.5 text-center hidden md:table-cell flex-shrink-0" style={{ width: '65px' }}>
        <NeonVal value={health ?? '—'} color={healthColor} />
      </td>
      <td className="px-1.5 py-1.5 text-center flex-shrink-0" style={{ width: '65px' }}>
        <NeonVal value={dmi ?? '—'} color={dmiColor} />
      </td>
      <td className="px-1.5 py-1.5 text-center hidden sm:table-cell flex-shrink-0" style={{ width: '85px' }}>
        {action ? (
          <span className="font-mono text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded"
            style={{ color: action.color, background: action.color + '15', border: `1px solid ${action.color}30`, textShadow: `0 0 8px ${action.color}60` }}>
          {action.label}
          </span>
        ) : <span className="text-[#2a2a2a] font-mono text-[9px]">—</span>}
      </td>
      <td className="flex-shrink-0" style={{ width: '24px', paddingRight: '8px' }}>
        <span className="material-symbols-outlined text-[13px] text-[#2a2a2a] group-hover:text-[#00FF87] transition-colors">chevron_right</span>
      </td>
    </tr>
  );
};

const SectionHeader = ({ icon, title, count, color, totalAmount }) => (
  <div className="flex items-center justify-between px-3 py-2 bg-[#0d0d0d] border border-[#1e1e1e] rounded-t-lg">
    <div className="flex items-center gap-2">
      <span style={{ color, textShadow: `0 0 10px ${color}50` }} className="text-sm">{icon}</span>
      <span className="text-xs font-bold uppercase tracking-widest" style={{ color }}>{title}</span>
      <span className="font-mono text-[10px] bg-[#1a1a1a] text-[#8a8a8a] px-1.5 py-0.5 rounded">{count}</span>
    </div>
    <span className="font-mono text-[11px] text-[#aaa]">
      Vol: <span className="text-white">€{totalAmount.toLocaleString('es-ES', { minimumFractionDigits: 0 })}</span>
    </span>
  </div>
);

const Tooltip = ({ text }) => (
  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-[#0d0d0d] border border-[#333] rounded shadow-2xl z-[200] pointer-events-none">
    <p className="text-[10px] leading-relaxed text-[#8a8a8a] font-normal lowercase tracking-normal">
      {text}
    </p>
    <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-[#333]" />
  </div>
);

const TableHead = () => (
  <thead style={{ display: 'block' }}>
    <tr className="border-b border-[#1e1e1e]" style={{ display: 'flex', width: '100%' }}>
      <th className="pl-2 pr-1 py-1.5 text-[9px] text-[#3a3a3a] font-mono font-bold uppercase tracking-widest flex-shrink-0" style={{ width: '32px' }}>#</th>
      <th className="px-1.5 py-1.5 text-left text-[9px] font-bold uppercase tracking-widest text-[#aaa]" style={{ flex: 1.8 }}>Deal</th>
      <th className="px-1.5 py-1.5 text-left text-[9px] font-bold uppercase tracking-widest text-[#aaa] hidden xl:block" style={{ flex: 1.1 }}>U.Negocio</th>
      <th className="px-1.5 py-1.5 text-left text-[9px] font-bold uppercase tracking-widest text-[#aaa] hidden xl:block" style={{ flex: 1.1 }}>Propietario</th>
      <th className="px-1.5 py-1.5 text-left text-[9px] font-bold uppercase tracking-widest text-[#aaa] hidden lg:block" style={{ flex: 0.9 }}>Nivel</th>
      <th className="px-1.5 py-1.5 text-left text-[9px] font-bold uppercase tracking-widest text-[#aaa] hidden lg:block" style={{ flex: 1.3 }}>Etapa</th>
      <th className="px-1.5 py-1.5 text-right text-[9px] font-bold uppercase tracking-widest text-[#aaa] hidden sm:block" style={{ flex: 1.1 }}>Importe</th>
      <th className="px-1.5 py-1.5 text-center text-[9px] font-bold uppercase tracking-widest flex-shrink-0 relative group cursor-pointer" style={{ color: NEON.green, width: '65px' }}>
        CAL
        <Tooltip text="Calidad: Mide el encaje del negocio según tus criterios de scoring." />
      </th>
      <th className="px-1.5 py-1.5 text-center text-[9px] font-bold uppercase tracking-widest hidden md:block flex-shrink-0 relative group cursor-pointer" style={{ color: NEON.blue, width: '65px' }}>
        SAL
        <Tooltip text="Salud: Evalúa el nivel de compromiso y actividad real." />
      </th>
      <th className="px-1.5 py-1.5 text-center text-[9px] font-bold uppercase tracking-widest flex-shrink-0 relative group cursor-pointer" style={{ color: NEON.orange, width: '65px' }}>
        DMI
        <Tooltip text="Momentum: Prioridad máxima. Fórmula: (CAL × 0.50) + (SAL × 0.30) + (TREND × 0.20)" />
      </th>
      <th className="px-1.5 py-1.5 text-center text-[9px] font-bold uppercase tracking-widest hidden sm:block flex-shrink-0" style={{ color: '#555', width: '85px' }}>ACCIÓN</th>
      <th className="flex-shrink-0" style={{ width: '32px', paddingRight: '8px' }}></th>
    </tr>
  </thead>
);

const MultiSelect = ({ label, options, selected, onChange, color = NEON.green }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false); };
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
      <button onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-[#0d0d0d] border border-[#1e1e1e] rounded px-3 py-1.5 hover:border-[#333] transition-all min-w-[150px]"
        style={selected.length > 0 ? { borderColor: color + '50', backgroundColor: color + '08' } : {}}
      >
        <span className="text-[9px] font-black uppercase tracking-widest absolute -top-2 left-2 px-1 bg-[#0a0a0a] z-10" style={{ color: NEON.green }}>{label}</span>
        <span className="text-[10px] font-bold uppercase tracking-widest truncate max-w-[120px]" style={{ color: selected.length > 0 ? color : '#8a8a8a' }}>{getDisplayText()}</span>
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
                <span className={`text-[10px] uppercase font-bold tracking-wider transition-colors ${isSelected ? 'text-white' : 'text-[#666] group-hover:text-[#aaa]'}`}>{opt.name}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  );
};

// ─── DASHBOARD PAGE COMPONENT ───────────────────────────────────────────────
const DashboardPage = () => {
  const { user } = useAuth(); // Sesión de Auth pura
  const { data: tenantData, isLoading: tenantLoading } = useTenant(user?.id, user?.email); // Motor SaaS
  
  const tenantId = tenantData?.tenant_id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState(['live']);
  const [selectedUnits, setSelectedUnits] = useState([]);
  const [selectedOwners, setSelectedOwners] = useState([]);
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { data: dashboardData, isLoading: dataLoading, isFetching: refreshing } = useDashboardData(tenantId);

  const loading = tenantLoading || dataLoading;
  const deals = dashboardData?.deals || [];
  const stageLabels = dashboardData?.labels || {};
  const stageProbabilities = dashboardData?.probs || {};
  const ownerMap = dashboardData?.ownerMap || {};
  const cacheTimestamp = dashboardData?.timestamp;
  const cacheAge = cacheTimestamp ? Date.now() - cacheTimestamp : 0;

  const getProb = (stageId) => {
    if (stageProbabilities[stageId] != null) return stageProbabilities[stageId];
    const label = (stageLabels[stageId] || stageId || '').toLowerCase().replace(/\s+/g, '');
    if (STAGE_PROBABILITY[label] != null) return STAGE_PROBABILITY[label];
    return 50;
  };

  const getStageLabel = (id) => stageLabels[id] || id;

  const { wonDeals, lostDeals, liveDeals } = useMemo(() => {
    const won = [], lost = [], live = [];
    for (const d of deals) {
      const p = getProb(d.properties.dealstage);
      if (p === 100) won.push(d);
      else if (p === 0) lost.push(d);
      else live.push(d);
    }
    live.sort((a, b) => (b.dmi ?? 0) - (a.dmi ?? 0));
    won.sort((a, b) => (b.dmi ?? 0) - (a.dmi ?? 0));
    lost.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return { wonDeals: won, lostDeals: lost, liveDeals: live };
  }, [deals, stageProbabilities, stageLabels]);

  const { businessUnits, owners } = useMemo(() => {
    const units = new Set(deals.map(d => 
      d.properties.unidad_de_negocio_deal || 
      d.properties.unidad_de_negocio || 
      d.properties.unidad_negocio ||
      d.properties.negocio
    ).filter(Boolean));
    const ownerIds = new Set(deals.map(d => d.properties.hubspot_owner_id).filter(Boolean));
    return {
      businessUnits: Array.from(units).sort(),
      owners: Array.from(ownerIds).map(id => ({ id: String(id), name: ownerMap[id] || `ID: ${id}` })).sort((a, b) => a.name.localeCompare(b.name))
    };
  }, [deals, ownerMap]);

  const filtered = useMemo(() => {
    let source = [];
    const statuses = selectedStatuses.length === 0 ? ['live', 'won', 'lost'] : selectedStatuses;
    if (statuses.includes('live')) source = [...source, ...liveDeals];
    if (statuses.includes('won')) source = [...source, ...wonDeals];
    if (statuses.includes('lost')) source = [...source, ...lostDeals];
    source = Array.from(new Set(source)).sort((a, b) => (b.dmi ?? 0) - (a.dmi ?? 0));
    return source.filter(d => {
      const matchSearch = !searchTerm || d.properties.dealname?.toLowerCase().includes(searchTerm.toLowerCase());
      const dUnit = d.properties.unidad_de_negocio_deal || d.properties.unidad_de_negocio || d.properties.unidad_negocio || d.properties.negocio;
      const matchUnit = selectedUnits.length === 0 || selectedUnits.includes(dUnit);
      const matchOwner = selectedOwners.length === 0 || selectedOwners.includes(String(d.properties.hubspot_owner_id));
      return matchSearch && matchUnit && matchOwner;
    });
  }, [liveDeals, wonDeals, lostDeals, searchTerm, selectedStatuses, selectedUnits, selectedOwners]);

  const topDeals = useMemo(() => [...liveDeals].slice(0, 10), [liveDeals]);
  const totalAmount = (arr) => arr.reduce((s, d) => s + (d.properties.amount ? parseFloat(d.properties.amount) : 0), 0);
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

  if (loading) return (
    <div className="fixed inset-0 bg-[#060606] flex flex-col items-center justify-center z-50">
      <div className="w-20 h-20 border-4 border-neutral-900 border-t-[#00FF87] rounded-full animate-spin" />
      <h2 className="mt-8 text-white text-xs font-mono font-black uppercase tracking-[0.4em] animate-pulse">Sincronizando Terminal SaaS...</h2>
    </div>
  );

  const tc = selectedStatuses.length === 1 ? {
    live:  { icon: '◉', title: 'NEGOCIOS EN CURSO', color: NEON.blue },
    won:   { icon: '▲', title: 'NEGOCIOS GANADOS', color: NEON.green },
    lost:  { icon: '▼', title: 'NEGOCIOS PERDIDOS', color: NEON.red },
  }[selectedStatuses[0]] : { icon: '◉', title: 'NEGOCIOS FILTRADOS', color: NEON.blue };

  return (
    <div className="space-y-4" style={{ fontFamily: "monospace" }}>
      <Ticker deals={topDeals} />
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black text-white uppercase">DEAL INTELLIGENCE TERMINAL</h1>
          <p className="text-[10px] text-[#3a3a3a] uppercase">{deals.length} ACTIVOS &middot; {tenantData?.tenants?.nombre || 'GRUPO RUIZ'}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded px-2 py-1 flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: refreshing ? NEON.yellow : NEON.green }} />
            <span className="text-[10px] font-mono" style={{ color: refreshing ? NEON.yellow : NEON.green }}>{refreshing ? 'ACTUALIZANDO' : 'CORE LIVE'}</span>
          </div>
          <button onClick={() => queryClient.invalidateQueries({ queryKey: ['dashboard', tenantId] })}
            className="flex items-center gap-1 px-2 py-1 bg-[#0d0d0d] border border-[#1e1e1e] rounded hover:border-[#00FF87]">
            <span className={`material-symbols-outlined text-[14px] text-[#555] ${refreshing ? 'animate-spin' : ''}`}>refresh</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[{ l: 'Total', v: deals.length, c: 'white' }, { l: 'En curso', v: liveDeals.length, c: NEON.blue }, { l: 'Ganados', v: wonDeals.length, c: NEON.green }, { l: 'Perdidos', v: lostDeals.length, c: NEON.red }].map((s, i) => (
          <div key={i} className="bg-[#0d0d0d] border border-[#1e1e1e] rounded px-3 py-2">
            <p className="text-[9px] text-[#ccc] uppercase">{s.l}</p>
            <p className="text-lg font-black" style={{ color: s.c }}>{s.v}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded flex items-center justify-between px-4 py-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-[#aaa]">MEDIAS {selectedStatuses.join(', ')}</span>
        <div className="flex items-center gap-6">
          {[
            { n: 'CAL', v: averages.cal, c: NEON.green, t: 'Calidad: Mide el encaje del negocio según tus criterios de scoring.' }, 
            { n: 'SAL', v: averages.sal, c: NEON.blue, t: 'Salud: Evalúa el nivel de compromiso y actividad real.' }, 
            { n: 'DMI', v: averages.dmi, c: NEON.orange, t: 'Momentum: Prioridad máxima. Fórmula: (CAL × 0.50) + (SAL × 0.30) + (TREND × 0.20)' }
          ].map((m, i) => (
            <div key={i} className="flex items-center gap-2 relative group cursor-help px-1 rounded hover:bg-white/5 transition-colors">
              <span className="text-[9px] font-bold" style={{ color: m.c }}>{m.n}</span>
              <span className="font-mono text-sm font-black" style={{ color: m.c }}>{m.v}</span>
              <MiniBar value={m.v} color={m.c} />
              <Tooltip text={m.t} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <MultiSelect label="ESTADO" options={[{ id: 'live', name: 'EN CURSO' }, { id: 'won', name: 'GANADOS' }, { id: 'lost', name: 'PERDIDOS' }]} selected={selectedStatuses} onChange={setSelectedStatuses} color={NEON.blue} />
        <MultiSelect label="NEGOCIO" options={businessUnits.map(u => ({ id: u, name: u }))} selected={selectedUnits} onChange={setSelectedUnits} />
        <MultiSelect label="PROPIETARIO" options={owners} selected={selectedOwners} onChange={setSelectedOwners} color={NEON.orange} />
        <div className="flex-1" />
        <div className="flex items-center gap-2 bg-[#0d0d0d] border border-[#1e1e1e] rounded px-3 py-1.5 focus-within:border-[#00FF87]">
          <span className="material-symbols-outlined text-[18px] text-[#00FF87]">search</span>
          <input type="text" placeholder="BUSCAR..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-transparent text-white text-xs font-mono focus:outline-none w-48" />
        </div>
      </div>

      <div className="border border-[#1e1e1e] rounded-lg overflow-hidden">
        <SectionHeader icon={tc.icon} title={tc.title} count={filtered.length} color={tc.color} totalAmount={totalAmount(filtered)} />
        <div className="overflow-x-auto bg-[#0a0a0a]">
          <table className="w-full" style={{ display: 'block' }}>
            <TableHead />
            <tbody style={{ display: 'block' }}>
              {filtered.map((deal, i) => (
                <DealRow key={deal.id} deal={deal} stageLabel={getStageLabel(deal.properties.dealstage)} probability={getProb(deal.properties.dealstage)} navigate={navigate} rank={i + 1} ownerMap={ownerMap} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
