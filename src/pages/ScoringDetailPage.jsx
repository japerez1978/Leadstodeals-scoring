import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { calculateScore, getScoreThreshold } from '../lib/scoringEngine';
import Spinner from '../components/Spinner';

// ─── SVG Stock Chart ──────────────────────────────────────────────────────────
const StockChart = ({ data, color }) => {
  if (!data || data.length < 2) return null;
  const W = 800; const H = 120; const PAD = 10;
  const values = data.map(d => d.value);
  const min = Math.min(...values) - 8;
  const max = Math.max(...values) + 8;
  const sx = (i) => PAD + (i / (data.length - 1)) * (W - PAD * 2);
  const sy = (v) => H - PAD - ((v - min) / (max - min)) * (H - PAD * 2 - 12);
  const pts = data.map((d, i) => `${sx(i)},${sy(d.value)}`).join(' ');
  const area = `${sx(0)},${H} ${pts} ${sx(data.length - 1)},${H}`;
  const gradId = `grad${color.replace('#', '')}`;
  const lastX = sx(data.length - 1);
  const lastY = sy(values[values.length - 1]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 120 }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[25, 50, 75].map(v => {
        const y = sy(v);
        if (y < 0 || y > H) return null;
        return <line key={v} x1={PAD} x2={W - PAD} y1={y} y2={y} stroke="#44474a" strokeWidth="0.5" strokeDasharray="4,4" />;
      })}
      <polygon points={area} fill={`url(#${gradId})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <circle key={i} cx={sx(i)} cy={sy(d.value)} r="3" fill="#131313" stroke={color} strokeWidth="2" />
      ))}
      <circle cx={lastX} cy={lastY} r="5" fill={color} />
      <text x={lastX + 8} y={lastY + 4} fill={color} fontSize="11" fontWeight="bold">{values[values.length - 1]}</text>
      {data.map((d, i) => (
        <text key={i} x={sx(i)} y={H} fill="#44474a" fontSize="9" textAnchor="middle">{d.label}</text>
      ))}
    </svg>
  );
};

// ─── Prop helper ──────────────────────────────────────────────────────────────
const Prop = ({ icon, label, value, highlight }) => (
  <div className="flex items-center gap-2">
    <span className="material-symbols-outlined text-[14px] text-[#44474a]">{icon}</span>
    <div>
      <p className="text-[#44474a] text-[9px] uppercase tracking-wider leading-none">{label}</p>
      <p className={`text-sm font-semibold leading-tight mt-0.5 ${highlight ? 'text-accent' : 'text-white'}`}>
        {value || '—'}
      </p>
    </div>
  </div>
);

// ─── Color helpers ────────────────────────────────────────────────────────────
const sc  = (v) => v >= 70 ? '#4ade80' : v >= 45 ? '#facc15' : '#f87171';
const sb  = (v) => v >= 70 ? 'border-green-500/20' : v >= 45 ? 'border-yellow-500/20' : 'border-red-500/20';
const sbg = (v) => v >= 70 ? 'bg-green-500/5'      : v >= 45 ? 'bg-yellow-500/5'      : 'bg-red-500/5';

// ─── Main Page ────────────────────────────────────────────────────────────────
const ScoringDetailPage = () => {
  const { dealId } = useParams();
  const navigate = useNavigate();
  const { tenant } = useAuth();

  const [deal, setDeal] = useState(null);
  const [healthChartData, setHealthChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stageLabels, setStageLabels] = useState({});
  const [hubspotUrl, setHubspotUrl] = useState(null);

  useEffect(() => {
    if (tenant && dealId) fetchDetails();
  }, [tenant, dealId]);

  const fetchDetails = async () => {
    try {
      // Matrix
      const { data: matrix } = await supabase
        .from('scoring_matrices')
        .select('*, criteria(*, criterion_options(*)), score_thresholds(*)')
        .eq('tenant_id', tenant.id).eq('active', true).limit(1).maybeSingle();

      // Stage labels
      try {
        const r = await fetch(`${import.meta.env.VITE_PROXY_URL}/proxy/crm/v3/pipelines/deals`);
        const d = await r.json();
        const map = {};
        (d.results || []).forEach(p => (p.stages || []).forEach(s => { map[s.id] = s.label; }));
        setStageLabels(map);
      } catch (e) { console.warn(e); }

      // Portal ID
      let portalId = tenant?.hubspot_portal_id;
      if (!portalId) {
        try {
          const r = await fetch(`${import.meta.env.VITE_PROXY_URL}/proxy/account-info/v3/details`);
          const d = await r.json();
          portalId = d.portalId;
          if (portalId) await supabase.from('tenants').update({ hubspot_portal_id: String(portalId) }).eq('id', tenant.id);
        } catch (e) { console.warn(e); }
      }
      setHubspotUrl(portalId
        ? `https://app.hubspot.com/contacts/${portalId}/deal/${dealId}`
        : `https://app.hubspot.com/contacts/deal/${dealId}`
      );

      // Deal + propertiesWithHistory for health score
      const props = [
        'dealname', 'amount', 'dealstage', 'hs_predictive_deal_score',
        'hs_createdate', 'notes_last_activity', 'hs_next_activity_date',
        'unidad_de_negocio_deal', 'prioridad_de_obra__proyecto',
        'ubicacion_provincia_obra__proyecto', 'madurez_en_adjudicacion_obra__proyecto',
        'tipo_de_obra__proyecto', 'valor_actual', 'numero_total_de_depositos',
        'sector_partida', 'peso_total_cmr_toneladas', 'hubspot_owner_id',
      ];
      const res = await fetch(
        `${import.meta.env.VITE_PROXY_URL}/proxy/crm/v3/objects/deals/${dealId}` +
        `?properties=${props.join(',')}&propertiesWithHistory=hs_predictive_deal_score`
      );
      const dealData = await res.json();

      // Calculate potencialidad score
      const { score, detail } = calculateScore(matrix?.criteria || [], dealData.properties);
      const threshold = getScoreThreshold(score, matrix?.score_thresholds || []);
      setDeal({ ...dealData, score, detail, threshold });

      // Build chart data: first merge propertiesWithHistory (oldest→newest) + our saved snapshots
      const hsHistory = (dealData.propertiesWithHistory?.hs_predictive_deal_score || [])
        .map(h => ({ value: Math.round(parseFloat(h.value)), ts: new Date(h.timestamp) }))
        .filter(h => !isNaN(h.value))
        .reverse();  // oldest first

      // Save latest health score snapshot to Supabase (if changed)
      const currentHealth = dealData.properties.hs_predictive_deal_score
        ? Math.round(parseFloat(dealData.properties.hs_predictive_deal_score))
        : null;

      if (currentHealth !== null) {
        // Check last saved value
        const { data: lastSaved } = await supabase
          .from('deal_health_scores')
          .select('score')
          .eq('tenant_id', tenant.id)
          .eq('hubspot_deal_id', dealId)
          .order('recorded_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!lastSaved || lastSaved.score !== currentHealth) {
          await supabase.from('deal_health_scores').insert({
            tenant_id: tenant.id,
            hubspot_deal_id: dealId,
            deal_name: dealData.properties.dealname,
            score: currentHealth,
            source: 'poll',
          });
        }

        // Fetch all our saved snapshots for the chart
        const { data: savedHistory } = await supabase
          .from('deal_health_scores')
          .select('score, recorded_at')
          .eq('tenant_id', tenant.id)
          .eq('hubspot_deal_id', dealId)
          .order('recorded_at', { ascending: true });

        // Prefer our saved history (richer), fall back to propertiesWithHistory
        const sourceData = (savedHistory && savedHistory.length > 1)
          ? savedHistory.map(r => ({ value: r.score, ts: new Date(r.recorded_at) }))
          : hsHistory;

        // Deduplicate consecutive equal values & format labels
        const chartData = sourceData
          .filter((d, i, arr) => i === 0 || d.value !== arr[i - 1].value)
          .map((d, i, arr) => ({
            value: d.value,
            label: formatChartDate(d.ts, i, arr.length),
          }));

        setHealthChartData(chartData);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatChartDate = (d, i, total) => {
    if (i === total - 1) return 'HOY';
    const now = new Date();
    const diff = Math.floor((now - d) / 86400000);
    if (diff === 0) return 'HOY';
    if (diff === 1) return 'AYER';
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).toUpperCase();
  };

  const formatDate = (isoStr) => {
    if (!isoStr) return null;
    const d = new Date(isoStr);
    if (isNaN(d)) return null;
    const now = new Date();
    const diff = Math.floor((now - d) / 86400000);
    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Ayer';
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const daysSince = (isoStr) => {
    if (!isoStr) return null;
    const d = new Date(isoStr);
    return isNaN(d) ? null : Math.floor((Date.now() - d) / 86400000);
  };

  const getStageLabel = (id) => stageLabels[id] || id;

  if (loading) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center">
      <Spinner /><p className="mt-4 text-sm text-[#c5c6ca]">Cargando detalles...</p>
    </div>
  );
  if (!deal) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
      <span className="material-symbols-outlined text-[64px] text-[#44474a] mb-4">search_off</span>
      <p className="text-xl text-[#c5c6ca] mb-4">Deal no encontrado</p>
      <button onClick={() => navigate('/dashboard')} className="px-4 py-2 bg-accent text-white rounded-lg text-sm">
        Volver al Dashboard
      </button>
    </div>
  );

  const potScore = deal.score;
  const healthScore = deal.properties.hs_predictive_deal_score
    ? Math.round(parseFloat(deal.properties.hs_predictive_deal_score)) : null;
  const prevHealth = healthChartData.length >= 2
    ? healthChartData[healthChartData.length - 2]?.value : null;
  const healthDelta = healthScore != null && prevHealth != null ? healthScore - prevHealth : null;

  const daysCreated = daysSince(deal.properties.hs_createdate);
  const stageLabel = getStageLabel(deal.properties.dealstage);

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <button onClick={() => navigate('/dashboard')}
        className="flex items-center gap-1 text-[#c5c6ca] hover:text-white transition-colors text-sm">
        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
        Dashboard
      </button>

      {/* Deal name */}
      <h1 className="text-4xl font-black text-white leading-tight tracking-tight">
        {deal.properties.dealname}
      </h1>

      {/* ── Dual score cards ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Score de Potencialidad */}
        <div className={`border rounded-xl p-5 ${sb(potScore)} ${sbg(potScore)}`}>
          <p className="text-[9px] font-bold uppercase tracking-widest text-[#c5c6ca] mb-3">
            Score de Potencialidad
          </p>
          <div className="flex items-stretch gap-5">
            <div className="flex items-end gap-2 shrink-0">
              <span className="font-black" style={{ fontSize: '5.5rem', color: sc(potScore), lineHeight: 1 }}>
                {potScore}
              </span>
              {deal.threshold?.label && (
                <span className="mb-1.5 px-2 py-0.5 rounded-full text-xs font-bold uppercase border"
                  style={{ color: sc(potScore), borderColor: sc(potScore) + '50', backgroundColor: sc(potScore) + '15' }}>
                  {deal.threshold.label}
                </span>
              )}
            </div>
            <div className="flex-1 border-l border-[#44474a]/40 pl-5 flex flex-col justify-center gap-3">
              {deal.properties.amount && (
                <Prop icon="payments" label="Importe"
                  value={`€${parseFloat(deal.properties.amount).toLocaleString()}`} />
              )}
              {stageLabel && <Prop icon="swap_horiz" label="Etapa" value={stageLabel} />}
              {daysCreated != null && (
                <Prop icon="schedule" label="Días desde creación" value={`${daysCreated} días`} />
              )}
            </div>
          </div>
          <p className="text-[#44474a] text-[10px] mt-3">Estático · criterios de calificación de negocio</p>
        </div>

        {/* Deal Health Score */}
        <div className={`border rounded-xl p-5 ${healthScore != null ? sb(healthScore) : 'border-[#44474a]'} ${healthScore != null ? sbg(healthScore) : ''}`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-[#c5c6ca]">Deal Health Score</p>
            <span className="text-[9px] font-mono text-[#44474a] bg-[#201f20] px-2 py-0.5 rounded">HubSpot AI</span>
          </div>

          {healthScore != null ? (
            <div className="flex items-stretch gap-5">
              <div className="shrink-0">
                <div className="flex items-end gap-2">
                  <span className="font-black" style={{ fontSize: '5.5rem', color: sc(healthScore), lineHeight: 1 }}>
                    {healthScore}
                  </span>
                </div>
                {healthDelta !== null && (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="material-symbols-outlined text-[16px]"
                      style={{ color: healthDelta >= 0 ? '#4ade80' : '#f87171' }}>
                      {healthDelta >= 0 ? 'trending_up' : 'trending_down'}
                    </span>
                    <span className="text-sm font-bold"
                      style={{ color: healthDelta >= 0 ? '#4ade80' : '#f87171' }}>
                      {healthDelta >= 0 ? '+' : ''}{healthDelta}
                    </span>
                    <span className="text-[#44474a] text-[10px]">vs anterior</span>
                  </div>
                )}
              </div>
              <div className="flex-1 border-l border-[#44474a]/40 pl-5 flex flex-col justify-center gap-3">
                {stageLabel && <Prop icon="swap_horiz" label="Etapa" value={stageLabel} />}
                <Prop icon="event_available" label="Última actividad"
                  value={formatDate(deal.properties.notes_last_activity) || 'Sin actividad'} />
                <Prop icon="event_upcoming" label="Próxima actividad"
                  value={formatDate(deal.properties.hs_next_activity_date)} highlight />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 py-4">
              <span className="material-symbols-outlined text-[32px] text-[#44474a]">query_stats</span>
              <div>
                <p className="text-[#c5c6ca] text-sm font-medium">No disponible</p>
                <p className="text-[#44474a] text-xs mt-0.5">Requiere Sales Hub Pro / Enterprise</p>
              </div>
            </div>
          )}
          <p className="text-[#44474a] text-[10px] mt-3">
            Probabilidad de cierre · se actualiza automáticamente cada ~6h
          </p>
        </div>
      </div>

      {/* ── Buttons ── */}
      <div className="grid grid-cols-2 gap-3">
        <a href={hubspotUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
          style={{ backgroundColor: '#FF7A00', color: '#fff', boxShadow: '0 0 20px #FF7A0040' }}>
          <span className="material-symbols-outlined text-[16px]">open_in_new</span>
          Abrir en HubSpot
        </a>
        <button onClick={fetchDetails}
          className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-[#201f20] hover:bg-[#2a2a2a] text-[#c5c6ca] hover:text-white border border-[#44474a] rounded-xl text-sm font-medium transition-colors">
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          Actualizar
        </button>
      </div>

      {/* ── Health Score Chart ── */}
      {healthChartData.length >= 2 && (
        <div className="bg-[#1c1b1c] border border-[#44474a] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-white font-semibold text-sm">Evolución Deal Health Score</p>
              <p className="text-[#44474a] text-xs mt-0.5">hs_predictive_deal_score · HubSpot AI</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sc(healthScore) }} />
              <span className="text-[#c5c6ca] text-xs">{healthChartData.length} registros</span>
            </div>
          </div>
          <StockChart data={healthChartData} color={sc(healthScore)} />
        </div>
      )}

      {/* ── Criterion Breakdown ── */}
      <div>
        <p className="text-[9px] font-bold uppercase tracking-widest text-[#c5c6ca] mb-3">
          Criterion Breakdown — Potencialidad
        </p>
        {deal.detail?.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {deal.detail.map((item, idx) => {
              const pts = item.weight * item.multiplier;
              const pos = pts > 0; const neg = pts < 0;
              const barColor = pos ? '#4ade80' : neg ? '#f87171' : '#44474a';
              const textColor = pos ? '#4ade80' : neg ? '#f87171' : '#c5c6ca';
              return (
                <div key={idx} className="bg-[#1c1b1c] border border-[#44474a] rounded-xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0 pr-2">
                      <h3 className="text-white text-xs font-semibold leading-tight">{item.criterion}</h3>
                      <p className="text-[10px] mt-0.5">
                        <span className="text-[#44474a]">Matched: </span>
                        <span className="text-white font-medium">{item.matchedLabel || '—'}</span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold leading-none" style={{ color: textColor }}>
                        {pos ? '+' : ''}{pts.toFixed(1)}
                      </p>
                      <p className="text-[9px] font-bold uppercase tracking-wider mt-0.5" style={{ color: textColor }}>
                        {pos ? 'Contribution' : neg ? 'Deduction' : 'Neutral'}
                      </p>
                    </div>
                  </div>
                  <div className="w-full bg-[#131313] rounded-full h-1">
                    <div className="h-full rounded-full"
                      style={{ width: `${Math.min(Math.abs(item.multiplier) * 25, 100)}%`, backgroundColor: barColor }} />
                  </div>
                  <p className="text-[#44474a] text-[9px] mt-1">peso {item.weight} × {item.multiplier}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-[#1c1b1c] border border-[#44474a] rounded-xl p-8 text-center">
            <p className="text-[#c5c6ca] text-sm">Sin criterios evaluados</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScoringDetailPage;
