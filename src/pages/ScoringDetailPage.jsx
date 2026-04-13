import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTenant } from 'core-saas'; // Nuevo motor SaaS compartido
import { supabase } from '../lib/supabase';
import { calculateScore, getScoreThreshold } from '../lib/scoringEngine';
import { useQueryClient } from '@tanstack/react-query';
import { useDealDetails } from '../hooks/useQueries';
import Spinner from '../components/Spinner';

// ─── SVG Pulse Chart (Command Center Style) ──────────────────────────────────
const PulseChart = ({ data, color }) => {
  if (!data || data.length < 1) return null;
  const chartData = data.length === 1 ? [data[0], data[0]] : data;
  const W = 800; const H = 120;
  const values = chartData.map(d => d.value);
  const min = Math.min(...values) - 5;
  const max = Math.max(...values) + 5;
  const sx = (i) => (i / (chartData.length - 1)) * W;
  const sy = (v) => H - ((v - min) / (max - min || 1)) * H;
  const pts = chartData.map((d, i) => `${sx(i)},${sy(d.value)}`).join(' ');
  const gradId = `pulseGrad${color.replace('#', '')}`;

  return (
    <div className="relative group">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[120px] drop-shadow-[0_0_8px_rgba(0,212,255,0.3)]" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`M 0,${H} ${pts.split(' ').map((p, i) => (i === 0 ? 'L ' + p : 'L ' + p)).join(' ')} L ${W},${H} Z`} fill={`url(#${gradId})`} />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" className="animate-pulse" style={{ transition: 'all 0.5s ease' }} />
        {chartData.map((d, i) => (
          <circle key={i} cx={sx(i)} cy={sy(d.value)} r="2" fill={color} className="opacity-0 group-hover:opacity-100 transition-opacity" />
        ))}
      </svg>
      <div className="flex justify-between mt-2 px-1">
        <span className="text-[8px] font-bold text-[#333] tracking-widest uppercase">{chartData[0].label}</span>
        <span className="text-[8px] font-bold text-[#333] tracking-widest uppercase">{chartData[chartData.length-1].label}</span>
      </div>
    </div>
  );
};

const NEON = { green: '#00FF87', red: '#FF3B5C', blue: '#00D4FF', yellow: '#FFD600', orange: '#FF7A00', dim: '#3a3a3a' };

const Prop = ({ icon, label, value, highlight, color }) => (
  <div className="flex items-start gap-3 py-2 border-b border-white/5 last:border-none">
    <span className="material-symbols-outlined text-[16px] mt-0.5 opacity-60" style={{ color: '#888' }}>{icon}</span>
    <div>
      <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[#ccc] mb-0.5">{label}</p>
      <p className="font-mono text-[11px] font-black leading-none uppercase" style={{ color: color || (highlight ? NEON.blue : '#eee') }}>
        {value || '—'}
      </p>
    </div>
  </div>
);

const ScoringDetailPage = () => {
  const { dealId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: tenantData, isLoading: tenantLoading } = useTenant(user?.id, user?.email);
  const tenantId = tenantData?.tenant_id;
  const tenant = tenantData?.tenants;

  const queryClient = useQueryClient();
  const { data: detailsData, isLoading: dataLoading, isFetching: refreshing, refetch } = useDealDetails(tenantId, dealId);

  const handleSync = async () => {
    await queryClient.invalidateQueries({ queryKey: ['deal', tenantId, dealId] });
    refetch();
  };

  const loading = tenantLoading || dataLoading;
  const deal = detailsData?.deal || null;
  const healthChartData = detailsData?.healthChartData || [];
  const stageLabels = detailsData?.labels || {};
  const hubspotUrl = detailsData?.hubspotUrl || null;

  const getStageLabel = (id) => stageLabels[id] || id;

  if (loading) return (
    <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center z-50">
      <div className="w-16 h-16 border-2 border-white/5 border-t-[#00FF87] rounded-full animate-spin" />
      <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.5em] text-[#333] animate-pulse">Sincronizando Terminal...</p>
    </div>
  );

  if (!deal) return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center p-10">
      <span className="material-symbols-outlined text-[80px] mb-6 text-white/5">monitoring</span>
      <p className="font-mono text-xs mb-8 text-[#aaa] tracking-[0.3em]">DEAL_DATA_NOT_FOUND</p>
      <button onClick={() => navigate('/dashboard')} className="px-6 py-3 border border-white/10 font-mono text-[10px] uppercase tracking-widest hover:border-white/40 transition-all text-white">Regresar al Terminal</button>
    </div>
  );

  const p = deal.properties || {};
  const potScore = deal.score;
  const healthScore = deal.healthScore;
  const dmi = deal.dmi;

  // Day in stage color logic (semaforo)
  const potColor = potScore >= 70 ? NEON.green : potScore >= 45 ? NEON.yellow : NEON.red;
  const healthColor = healthScore != null ? (healthScore >= 70 ? NEON.green : healthScore >= 45 ? NEON.yellow : NEON.red) : NEON.dim;
  const dmiColor = dmi != null ? (dmi >= 75 ? NEON.green : dmi >= 50 ? NEON.yellow : dmi >= 25 ? NEON.red : NEON.dim) : NEON.dim;

  const formatAmount = (v) => {
    if (!v) return '—';
    const n = parseFloat(v);
    return isNaN(n) ? '—' : n.toLocaleString('es-ES', { minimumFractionDigits: 0 }) + ' €';
  };

  const stageLabel = getStageLabel(p.dealstage);
  
  // Calculate days in stage from history
  const stageHistory = deal.propertiesWithHistory?.dealstage || [];
  const daysInStage = stageHistory.length > 0 
    ? Math.floor((Date.now() - new Date(stageHistory[0].timestamp).getTime()) / 86400000)
    : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20 animate-fade-in-up" style={{ fontFamily: 'monospace' }}>
      {/* Mini Breadcrumb */}
      <div className="flex items-center gap-3 transition-opacity">
        <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: NEON.green }}>OBRA Y PROYECTO</span>
        <span className="text-[8px] text-white/20">|</span>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/dashboard')} className="text-[9px] text-white uppercase tracking-widest hover:text-[#00FF87] transition-colors">Terminal</button>
          <span className="text-[8px] text-white/30">/</span>
          <span className="text-[9px] text-white uppercase tracking-widest font-bold">{p.dealname}</span>
        </div>
      </div>

      {/* Header Info */}
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-white uppercase tracking-tight leading-none mb-1">{p.dealname || '—'}</h1>
          <p className="text-[10px] text-[#aaa] font-bold uppercase tracking-widest leading-none mt-1">
            NEGOCIO &middot; <span className="text-[#00FF87]">{(deal.matrixName || 'GENERAL').replace(/Obra\/Proyecto\s*/i, '').trim()}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <a href={hubspotUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest hover:bg-white/10 transition-all text-white">HubSpot</a>
          <button 
            onClick={handleSync} 
            disabled={refreshing}
            className="px-4 py-2 bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest hover:bg-white/10 transition-all text-white disabled:opacity-50"
          >
            {refreshing ? 'Sincronizando...' : 'Sync'}
          </button>
        </div>
      </div>

      {/* Primary Indicators (Neon Mode) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-6 border-y border-white/5">
        {[
          { label: 'CALIDAD', val: potScore, color: potColor },
          { label: 'SALUD', val: healthScore, color: healthColor },
          { label: 'MOMENTUM', val: dmi, color: dmiColor }
        ].map(ind => (
          <div key={ind.label} className="flex flex-col items-center">
            <p className="text-[10px] font-black text-[#ccc] uppercase tracking-[0.3em] mb-4">{ind.label}</p>
            <div className="flex items-baseline gap-2 relative">
              <span className="text-8xl font-black tabular-nums transition-all" style={{ color: ind.color, textShadow: `0 0 30px ${ind.color}40` }}>{ind.val ?? '—'}</span>
              <span className="text-xs font-black uppercase" style={{ color: ind.color, opacity: 0.6 }}>de 100</span>
              <div className="absolute -inset-8 blur-3xl opacity-10 pointer-events-none" style={{ backgroundColor: ind.color }} />
            </div>
          </div>
        ))}
      </div>

      {/* Body: Chart & Props */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-[#0a0a0a] border border-white/5 p-6 rounded-2xl relative overflow-hidden group">
            <div className="flex items-center justify-between mb-8">
              <p className="text-[10px] font-black text-[#eee] uppercase tracking-widest">Evolución Salud</p>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#00D4FF] animate-pulse" />
                <span className="text-[8px] font-bold text-[#444] uppercase tracking-widest">
                  {healthChartData.every(d => d.value === healthChartData[0]?.value) ? 'Momentum Inicial' : 'Live Pulse'}
                </span>
              </div>
            </div>
            {healthChartData.length > 0 ? (
              <PulseChart data={healthChartData} color={NEON.blue} />
            ) : (
              <div className="h-[120px] flex items-center justify-center border border-dashed border-white/5 rounded-lg">
                <p className="font-mono text-[9px] text-[#222] uppercase tracking-[0.3em]">Analizando trayectoria...</p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-[#0a0a0a] border border-white/5 p-6 rounded-2xl h-full">
            <p className="text-[10px] font-black text-[#eee] uppercase tracking-widest mb-6 border-b border-white/5 pb-4">Propiedades Críticas</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1">
              <Prop icon="payments" label="Valor" value={formatAmount(p.amount)} color={NEON.green} />
              <Prop icon="calendar_today" label="Fecha Inicio" value={p.hs_createdate ? new Date(p.hs_createdate).toLocaleDateString() : '—'} />
              <Prop icon="swap_horiz" label="Etapa" value={stageLabel} />
              <Prop icon="business" label="Sector" value={p.sector} />
              <Prop icon="timer" label="En Etapa" value={`${daysInStage}d`} color={daysInStage > 30 ? NEON.red : NEON.blue} />
              <Prop icon="location_on" label="Provincia" value={p.province} />
              <Prop icon="social_leaderboard" label="Nivel Cliente" value={p.nivel_de_cliente} color={NEON.yellow} />
              <Prop icon="trending_up" label="Nivel Partida" value={p.nivel_de_cliente_partida} />
              <Prop icon="history" label="Última Actividad" value={p.notes_last_activity ? new Date(p.notes_last_activity).toLocaleDateString() : '—'} />
              <Prop icon="event_upcoming" label="Próx. Actividad" value={p.hs_next_activity_date ? new Date(p.hs_next_activity_date).toLocaleDateString() : '—'} highlight />
            </div>
          </div>
        </div>
      </div>

      {/* Breakdown */}
      <div className="space-y-4">
        <p className="text-[10px] font-black text-[#444] uppercase tracking-[0.4em]">── Análisis de Criterios</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(deal.detail || []).map((item, idx) => (
            <div key={idx} className="bg-[#0a0a0a] border border-white/5 p-4 rounded-xl hover:border-white/20 transition-all flex items-center justify-between group">
              <div>
                <p className="text-[9px] font-bold text-[#888] uppercase tracking-widest mb-1">
                  <span className="text-accent-500 mr-1.5">[{item.code || 'PX'}]</span>
                  {item.criterion}
                </p>
                <p className="text-[10px] font-black text-white uppercase">{item.matchedLabel || 'N/A'}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-black italic" style={{ color: item.multiplier > 0 ? NEON.green : NEON.red, textShadow: `0 0 10px ${item.multiplier > 0 ? NEON.green : NEON.red}30` }}>
                  {(item.weight * item.multiplier).toFixed(1)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ScoringDetailPage;
