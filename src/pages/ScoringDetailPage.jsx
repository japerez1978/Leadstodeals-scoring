import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { calculateScore, getScoreThreshold } from '../lib/scoringEngine';
import { useQueryClient } from '@tanstack/react-query';
import { useDealDetails } from '../hooks/useQueries';
import Spinner from '../components/Spinner';

// ─── SVG Stock Chart ──────────────────────────────────────────────────────────
const StockChart = ({ data, color }) => {
  if (!data || data.length < 1) return null;
  // If only 1 point, duplicate it to make a flat line
  const chartData = data.length === 1 ? [data[0], data[0]] : data;
  const W = 800; const H = 150; const PAD = 20;
  const values = chartData.map(d => d.value);
  const min = Math.min(...values) - 10;
  const max = Math.max(...values) + 10;
  const sx = (i) => PAD + (i / (chartData.length - 1)) * (W - PAD * 2);
  const sy = (v) => H - PAD - ((v - min) / (max - min || 1)) * (H - PAD * 2 - 20);
  const pts = chartData.map((d, i) => `${sx(i)},${sy(d.value)}`).join(' ');
  const area = `${sx(0)},${H} ${pts} ${sx(chartData.length - 1)},${H}`;
  const gradId = `grad${color.replace('#', '')}`;
  const lastX = sx(chartData.length - 1);
  const lastY = sy(values[values.length - 1]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 140 }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {[25, 50, 75].map(v => {
        const y = sy(v);
        if (y < 0 || y > H) return null;
        return <line key={v} x1={PAD} x2={W - PAD} y1={y} y2={y} stroke="#2a2a2a" strokeWidth="1" strokeDasharray="6,4" opacity="0.5" />;
      })}
      <polygon points={area} fill={`url(#${gradId})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {chartData.map((d, i) => {
        const x = sx(i);
        const y = sy(d.value);
        // For duplicated single-point, only render one node (at center)
        if (data.length === 1 && i === 1) return null;
        const cx = data.length === 1 ? W / 2 : x;
        const cy = data.length === 1 ? sy(d.value) : y;
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r="4" fill="#131313" stroke={color} strokeWidth="2.5" />
            <text x={cx} y={cy - 12} fill={color} fontSize="11" fontWeight="900" textAnchor="middle" letterSpacing="0.5">{d.value}</text>
          </g>
        );
      })}
      <circle cx={data.length === 1 ? W / 2 : lastX} cy={lastY} r="6" fill={color} opacity="0.9" />
      {data.map((d, i) => (
        <text key={i} x={data.length === 1 ? W / 2 : sx(i)} y={H - 2} fill="#666" fontSize="10" fontWeight="500" textAnchor="middle">{d.label}</text>
      ))}
    </svg>
  );
};

// ─── Neon palette (matches Dashboard) ────────────────────────────────────────
const NEON = {
  green:  '#00FF87',
  red:    '#FF3B5C',
  blue:   '#00D4FF',
  yellow: '#FFD600',
  orange: '#FF7A00',
  dim:    '#3a3a3a',
};

// ─── Prop helper (terminal style) ────────────────────────────────────────────
const Prop = ({ icon, label, value, highlight }) => (
  <div className="flex items-start gap-2">
    <span className="material-symbols-outlined text-[13px] mt-0.5" style={{ color: '#3a3a3a' }}>{icon}</span>
    <div>
      <p className="font-mono text-[9px] uppercase tracking-widest leading-none" style={{ color: '#444' }}>{label}</p>
      <p className="font-mono text-xs font-semibold leading-tight mt-0.5" style={{ color: highlight ? NEON.blue : '#e0e0e0' }}>
        {value || '—'}
      </p>
    </div>
  </div>
);

// ─── Color helpers (neon palette) ────────────────────────────────────────────
const sc  = (v) => v >= 70 ? NEON.green  : v >= 45 ? NEON.yellow : NEON.red;
const sb  = (v) => v >= 70 ? `border-[${NEON.green}30]`  : v >= 45 ? `border-[${NEON.yellow}30]`  : `border-[${NEON.red}30]`;
const sbg = (v) => v >= 70 ? `bg-[${NEON.green}05]`      : v >= 45 ? `bg-[${NEON.yellow}05]`      : `bg-[${NEON.red}05]`;

// ─── Main Page ────────────────────────────────────────────────────────────────
const ScoringDetailPage = () => {
  const { dealId } = useParams();
  const navigate = useNavigate();
  const { tenant } = useAuth();

  const queryClient = useQueryClient();
  const { data: detailsData, isLoading: loading } = useDealDetails(tenant?.id, dealId);

  const deal = detailsData?.deal || null;
  const healthChartData = detailsData?.healthChartData || [];
  const dmiChartData = detailsData?.dmiChartData || [];
  const hsHealthHistory = detailsData?.hsHealthHistory || [];
  const stageLabels = detailsData?.labels || {};
  const hubspotUrl = detailsData?.hubspotUrl || null;

  const getStageLabel = (id) => stageLabels[id] || id;

  if (loading) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center" style={{ background: '#0a0a0a' }}>
      <Spinner />
      <p className="mt-4 font-mono text-xs uppercase tracking-widest" style={{ color: '#3a3a3a' }}>Cargando datos...</p>
    </div>
  );
  if (!deal) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
      <span className="material-symbols-outlined text-[64px] mb-4" style={{ color: '#3a3a3a' }}>search_off</span>
      <p className="font-mono text-sm mb-4" style={{ color: '#555' }}>DEAL NOT FOUND</p>
      <button onClick={() => navigate('/dashboard')}
        className="font-mono text-xs uppercase tracking-widest px-4 py-2 rounded border transition-colors"
        style={{ borderColor: NEON.green + '40', color: NEON.green, background: NEON.green + '10' }}>
        ← Volver al Dashboard
      </button>
    </div>
  );

  const p = deal.properties && typeof deal.properties === 'object' && !Array.isArray(deal.properties)
    ? deal.properties
    : {};
  if (Object.keys(p).length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <span className="material-symbols-outlined text-[64px] mb-4" style={{ color: '#3a3a3a' }}>cloud_off</span>
        <p className="font-mono text-sm mb-2" style={{ color: '#555' }}>No se pudieron cargar las propiedades del deal</p>
        <p className="font-mono text-[10px] mb-4 max-w-md" style={{ color: '#444' }}>
          Revisa el proxy / permisos de HubSpot o que el ID del deal sea válido.
        </p>
        <button onClick={() => navigate('/dashboard')}
          className="font-mono text-xs uppercase tracking-widest px-4 py-2 rounded border transition-colors"
          style={{ borderColor: NEON.green + '40', color: NEON.green, background: NEON.green + '10' }}>
          ← Volver al Dashboard
        </button>
      </div>
    );
  }

  const potScore = deal.score;
  // Extract health score from whichever property has the value
  const healthScore = p.hs_deal_score
    ? Math.round(parseFloat(p.hs_deal_score))
    : (p.hs_predictive_deal_score
        ? Math.round(parseFloat(p.hs_predictive_deal_score))
        : null);
  // Delta from HubSpot's real history (not our Supabase snapshots which may all be the same)
  const prevHealth = hsHealthHistory.length >= 2
    ? hsHealthHistory[hsHealthHistory.length - 2]?.value : null;
  const healthDelta = healthScore != null && prevHealth != null ? healthScore - prevHealth : null;

  const daysCreated = daysSince(p.hs_createdate);

  // Calculate days in current stage
  const daysInStage = (() => {
    const stageHistory = deal.propertiesWithHistory?.dealstage || [];
    if (stageHistory.length === 0) return null;
    // Most recent entry is the current stage
    const latestEntry = stageHistory[stageHistory.length - 1];
    if (!latestEntry) return null;
    return daysSince(latestEntry.timestamp);
  })();

  const stageLabel = getStageLabel(p.dealstage);

  // Calculate DMI (Deal Momentum Index)
  // DMI = (Score 1 × 0.35) + (Score 2 × 0.45) + (Tendencia × 0.20)
  const healthTrend = healthDelta != null ? Math.max(-20, Math.min(20, healthDelta * 5)) : 0; // -20 to +20
  const dmi = potScore != null && healthScore != null
    ? Math.round((potScore * 0.35) + (healthScore * 0.45) + (healthTrend * 0.20))
    : null;
  const getDmiStatus = (value) => {
    if (value == null) return { label: 'N/A', icon: '?', color: '#44474a', bg: 'bg-[#44474a]/5' };
    if (value >= 75) return { label: 'Acelerar', icon: '🟢', color: '#4ade80', bg: 'border-green-500/20 bg-green-500/5' };
    if (value >= 50) return { label: 'Vigilar', icon: '🟡', color: '#facc15', bg: 'border-yellow-500/20 bg-yellow-500/5' };
    if (value >= 25) return { label: 'Rescatar', icon: '🔴', color: '#f87171', bg: 'border-red-500/20 bg-red-500/5' };
    return { label: 'Soltar', icon: '⚫', color: '#888888', bg: 'border-[#44474a] bg-[#44474a]/5' };
  };
  const dmiStatus = getDmiStatus(dmi);

  const potColor = sc(potScore);
  const hColor   = healthScore != null ? sc(healthScore) : NEON.dim;
  const dmiColor = dmiStatus.color;

  return (
    <div className="space-y-5" style={{ fontFamily: 'monospace' }}>

      {/* ── Breadcrumb + title ── */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/dashboard')}
          className="flex items-center gap-1 transition-colors text-xs font-mono uppercase tracking-widest"
          style={{ color: '#444' }}
          onMouseEnter={e => e.currentTarget.style.color = NEON.green}
          onMouseLeave={e => e.currentTarget.style.color = '#444'}>
          <span className="material-symbols-outlined text-[14px]">arrow_back</span>
          Dashboard
        </button>
        <span style={{ color: '#2a2a2a' }}>/</span>
        <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: '#333' }}>Deal</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <h1 className="font-black leading-tight" style={{ fontSize: '1.75rem', color: '#e8ffe8', textShadow: '0 0 20px rgba(0,255,135,0.2)' }}>
          {p.dealname || '—'}
        </h1>
        <div className="flex gap-2 shrink-0">
          <a href={hubspotUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded text-xs font-mono uppercase tracking-widest transition-opacity hover:opacity-80"
            style={{ backgroundColor: NEON.orange + '20', color: NEON.orange, border: `1px solid ${NEON.orange}40` }}>
            <span className="material-symbols-outlined text-[13px]">open_in_new</span>
            HubSpot
          </a>
          <button onClick={() => queryClient.invalidateQueries({ queryKey: ['deal_details', tenant?.id, dealId] })}
            className="flex items-center gap-1.5 px-3 py-2 rounded text-xs font-mono uppercase tracking-widest transition-colors"
            style={{ backgroundColor: '#111', color: '#555', border: '1px solid #222' }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = '#555'}>
            <span className="material-symbols-outlined text-[13px]">refresh</span>
            Sync
          </button>
        </div>
      </div>

      {/* ── Score cards ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* CAL — Deal Potentiality Score */}
        <div className="rounded-lg p-4 flex flex-col" style={{ background: '#0d0d0d', border: `1px solid ${potColor}25` }}>
          <div className="flex items-start gap-3 flex-1">
            <div className="shrink-0 text-center">
              <div className="mb-2">
                <span className="font-mono text-[8px] uppercase tracking-widest block" style={{ color: potColor }}>CAL</span>
                <span className="font-mono text-[7px] lowercase tracking-wide block mt-0.5" style={{ color: '#666' }}>potentiality</span>
              </div>
              <span className="font-black" style={{ 
                fontSize: '3.5rem', color: potColor, lineHeight: 1, 
                textShadow: `0 0 30px ${potColor}60`,
                background: `${potColor}15`,
                padding: '0.5rem 0.75rem',
                borderRadius: '0.5rem',
                display: 'inline-block'
              }}>
                {potScore}
              </span>
              {deal.threshold?.label && (
                <div className="mt-2">
                  <span className="font-mono text-[7px] uppercase tracking-widest px-1 py-0.5 rounded inline-block"
                    style={{ color: potColor, background: potColor + '15', border: `1px solid ${potColor}30` }}>
                    {deal.threshold.label}
                  </span>
                </div>
              )}
            </div>
            <div className="flex-1 flex flex-col gap-1.5 min-w-0">
              {p.valor_actual && (
                <Prop icon="payments" label="Valor" value={`€${parseFloat(p.valor_actual).toLocaleString()}`} />
              )}
              {p.sector_partida && (
                <Prop icon="category" label="Sector" value={p.sector_partida} />
              )}
              {p.ubicacion_provincia_obra__proyecto && (
                <Prop icon="location_on" label="Provincia" value={p.ubicacion_provincia_obra__proyecto} />
              )}
              {p.tipo_de_obra__proyecto && (
                <Prop icon="construction" label="Tipo" value={p.tipo_de_obra__proyecto} />
              )}
              {p.madurez_en_adjudicacion_obra__proyecto && (
                <Prop icon="task_alt" label="Estado" value={p.madurez_en_adjudicacion_obra__proyecto} />
              )}
            </div>
          </div>
        </div>

        {/* SAL — Deal Health Score */}
        <div className="rounded-lg p-4 flex flex-col" style={{ background: '#0d0d0d', border: `1px solid ${hColor}25` }}>
          <div className="flex items-start gap-3 flex-1">
            <div className="shrink-0 text-center">
              <div className="mb-2">
                <span className="font-mono text-[8px] uppercase tracking-widest block" style={{ color: hColor }}>SAL</span>
                <span className="font-mono text-[7px] lowercase tracking-wide block mt-0.5" style={{ color: '#666' }}>health score</span>
              </div>
              {healthScore != null ? (
                <>
                  <span className="font-black" style={{ 
                    fontSize: '3.5rem', color: hColor, lineHeight: 1, 
                    textShadow: `0 0 30px ${hColor}60`,
                    background: `${hColor}15`,
                    padding: '0.5rem 0.75rem',
                    borderRadius: '0.5rem',
                    display: 'inline-block'
                  }}>
                    {healthScore}
                  </span>
                  <div className="mt-2">
                    <span className="font-mono text-[7px] uppercase tracking-widest px-1 py-0.5 rounded inline-block"
                      style={{ color: hColor, background: hColor + '15', border: `1px solid ${hColor}30` }}>
                      {healthScore < 50 ? 'BAJO' : healthScore < 75 ? 'MEDIO' : 'ALTO'}
                    </span>
                  </div>
                  {healthDelta !== null && (
                    <div className="mt-1">
                      <span className="font-mono text-[9px] font-bold"
                        style={{ color: healthDelta >= 0 ? NEON.green : NEON.red }}>
                        {healthDelta >= 0 ? '↑' : '↓'} {Math.abs(healthDelta)}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <span className="font-mono text-[10px]" style={{ color: '#555' }}>N/A</span>
              )}
            </div>
            <div className="flex-1 flex flex-col gap-1.5 min-w-0">
              {stageLabel && <Prop icon="swap_horiz" label="Etapa" value={stageLabel} />}
              {daysCreated != null && <Prop icon="calendar_today" label="Creación" value={`${daysCreated}d`} />}
              {daysInStage != null && <Prop icon="schedule" label="En etapa" value={`${daysInStage}d`} />}
              <Prop icon="event_available" label="Últ. actividad" value={formatDate(p.notes_last_activity) || '—'} />
              <Prop icon="event_upcoming" label="Próx. actividad" value={formatDate(p.hs_next_activity_date)} highlight />
            </div>
          </div>
        </div>

        {/* DMI — Deal Momentum Index */}
        <div className="rounded-lg p-4 flex flex-col" style={{
          background: '#0d0d0d',
          border: `2px solid ${dmiColor}50`,
          boxShadow: `0 0 30px ${dmiColor}15, inset 0 1px 0 ${dmiColor}10`
        }}>
          <div className="flex items-start gap-3 flex-1">
            <div className="shrink-0 text-center">
              <div className="mb-2">
                <span className="font-mono text-[8px] uppercase tracking-widest font-black block" style={{ color: dmiColor }}>DMI</span>
                <span className="font-mono text-[7px] lowercase tracking-wide block mt-0.5" style={{ color: '#666' }}>momentum</span>
              </div>
              <span className="font-black" style={{
                fontSize: '4.5rem', color: dmiColor, lineHeight: 1,
                textShadow: `0 0 60px ${dmiColor}, 0 0 100px ${dmiColor}80, 0 0 150px ${dmiColor}40`,
                background: `${dmiColor}20`,
                padding: '0.75rem 1rem',
                borderRadius: '0.5rem',
                display: 'inline-block',
                letterSpacing: '0.1em'
              }}>
                {dmi ?? '—'}
              </span>
              <div className="mt-2">
                <span className="font-mono text-[7px] px-1 py-0.5 rounded inline-block font-bold"
                  style={{ color: dmiColor, background: dmiColor + '15', border: `1px solid ${dmiColor}30` }}>
                  {dmiStatus.label}
                </span>
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-1.5 min-w-0">
              <Prop icon="flash_on" label="CAL" value={potScore != null ? `${potScore} / 100` : '—'} />
              <Prop icon="favorite" label="SAL" value={healthScore != null ? `${healthScore} / 100` : '—'} />
              <Prop icon="trending_up" label="Tendencia"
                value={healthDelta != null ? (healthDelta >= 0 ? `↑ +${healthDelta}` : `↓ ${healthDelta}`) : '—'} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {healthChartData.length >= 1 && (
          <div className="rounded-lg p-5" style={{ background: '#0d0d0d', border: '1px solid #1e1e1e' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-widest" style={{ color: NEON.blue }}>SAL · Evolución</p>
                <p className="font-mono text-[9px] mt-0.5" style={{ color: '#333' }}>
                  {p.hs_deal_score ? 'hs_deal_score' : 'hs_predictive_deal_score'} · HubSpot AI
                </p>
              </div>
              <span className="font-mono text-[9px]" style={{ color: '#333' }}>{healthChartData.length} pts</span>
            </div>
            <StockChart data={healthChartData} color={NEON.blue} />
          </div>
        )}
        {dmiChartData.length >= 1 && (
          <div className="rounded-lg p-5" style={{ background: '#0d0d0d', border: '1px solid #1e1e1e' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-widest" style={{ color: dmiColor }}>DMI · Evolución</p>
                <p className="font-mono text-[9px] mt-0.5" style={{ color: '#333' }}>35% cal · 45% sal · 20% tendencia</p>
              </div>
              <span className="font-mono text-[9px]" style={{ color: '#333' }}>{dmiChartData.length} pts</span>
            </div>
            <StockChart data={dmiChartData} color={dmiColor} />
          </div>
        )}
      </div>

      {/* ── Criterion Breakdown ── */}
      <div>
        <p className="font-mono text-[9px] uppercase tracking-widest mb-3" style={{ color: '#333' }}>
          ── Criterion Breakdown · Potencialidad
        </p>
        {deal.detail?.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {deal.detail.map((item, idx) => {
              const pts = item.weight * item.multiplier;
              const pos = pts > 0; const neg = pts < 0;
              const tColor = pos ? NEON.green : neg ? NEON.red : '#555';
              return (
                <div key={idx} className="rounded-lg p-4" style={{ background: '#0d0d0d', border: `1px solid ${tColor}20` }}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="font-mono text-[10px] font-bold leading-tight" style={{ color: '#ccc' }}>{item.criterion}</p>
                      <p className="font-mono text-[9px] mt-1">
                        <span style={{ color: '#333' }}>match: </span>
                        <span style={{ color: '#888' }}>{item.matchedLabel || '—'}</span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-base font-black" style={{ color: tColor, textShadow: `0 0 10px ${tColor}60` }}>
                        {pos ? '+' : ''}{pts.toFixed(1)}
                      </p>
                      <p className="font-mono text-[8px] uppercase tracking-widest mt-0.5" style={{ color: tColor + '80' }}>
                        {pos ? 'SUMA' : neg ? 'RESTA' : 'NEUTRO'}
                      </p>
                    </div>
                  </div>
                  <div className="w-full rounded-sm h-0.5" style={{ background: '#1a1a1a' }}>
                    <div className="h-full rounded-sm"
                      style={{ width: `${Math.min(Math.abs(item.multiplier) * 25, 100)}%`, backgroundColor: tColor, boxShadow: `0 0 6px ${tColor}60` }} />
                  </div>
                  <p className="font-mono text-[8px] mt-1.5" style={{ color: '#2a2a2a' }}>peso {item.weight} × {item.multiplier}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg p-8 text-center" style={{ background: '#0d0d0d', border: '1px solid #1e1e1e' }}>
            <p className="font-mono text-xs" style={{ color: '#333' }}>Sin criterios evaluados</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScoringDetailPage;
