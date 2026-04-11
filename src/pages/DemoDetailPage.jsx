import React from 'react';

// ─── Mock data ────────────────────────────────────────────────────────────────
const POT_SCORE = 84;
const HEALTH_SCORE = 59;
const HEALTH_DELTA = -4;

const DEAL = {
  name: 'Acme Corp — Expansión Q4',
  amount: 2473680,
  stage: 'Negociación',
  lastActivity: '09 ABR, 16:20',
  nextActivity: '15 ABR, 10:00',
  daysSinceCreate: 34,
};

// Reversed for chart (oldest → newest)
const HEALTH_HISTORY = [
  { value: 48, ts: '01 ABR' },
  { value: 55, ts: '04 ABR' },
  { value: 62, ts: '07 ABR' },
  { value: 71, ts: '09 ABR' },
  { value: 68, ts: '11 ABR' },
  { value: 63, ts: '13 ABR' },
  { value: 59, ts: 'HOY' },
];

const CRITERIA = [
  { criterion: 'Tipo de partida',         matchedLabel: 'Nuevo',        weight: 15, multiplier: 1 },
  { criterion: 'Peso Total RCM Tn',       matchedLabel: '500 – 1000',   weight: 20, multiplier: 1 },
  { criterion: 'Valor de la partida',     matchedLabel: '> 1.000.000',  weight: 20, multiplier: 1 },
  { criterion: 'Ubicación Provincia',     matchedLabel: 'Vizcaya',      weight: 15, multiplier: 0.5 },
  { criterion: 'Prioridad de la partida', matchedLabel: 'Muy Alta',     weight: 2,  multiplier: 1 },
  { criterion: 'Estado de la partida',    matchedLabel: 'Adjudicada',   weight: 20, multiplier: 0.5 },
  { criterion: 'Madurez adjudicación',    matchedLabel: 'Baja',         weight: 8,  multiplier: -0.5 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const scoreColor  = (v) => v >= 70 ? '#4ade80' : v >= 45 ? '#facc15' : '#f87171';
const scoreBorder = (v) => v >= 70 ? 'border-green-500/20' : v >= 45 ? 'border-yellow-500/20' : 'border-red-500/20';
const scoreBg     = (v) => v >= 70 ? 'bg-green-500/5'      : v >= 45 ? 'bg-yellow-500/5'      : 'bg-red-500/5';

// ─── SVG Stock Chart ──────────────────────────────────────────────────────────
const StockChart = ({ data, color }) => {
  if (!data || data.length < 2) return null;
  const W = 800; const H = 120; const PAD = 8;
  const values = data.map(d => d.value);
  const min = Math.min(...values) - 8;
  const max = Math.max(...values) + 8;
  const scaleX = (i) => PAD + (i / (data.length - 1)) * (W - PAD * 2);
  const scaleY = (v) => H - PAD - ((v - min) / (max - min)) * (H - PAD * 2);

  const pts = data.map((d, i) => `${scaleX(i)},${scaleY(d.value)}`).join(' ');
  const area = `${scaleX(0)},${H} ${pts} ${scaleX(data.length - 1)},${H}`;
  const lastX = scaleX(data.length - 1);
  const lastY = scaleY(values[values.length - 1]);
  const gradId = `grad-${color.replace('#', '')}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 120 }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[0, 25, 50, 75, 100].map(v => {
        const y = scaleY(v); if (y < 0 || y > H) return null;
        return <line key={v} x1={PAD} x2={W - PAD} y1={y} y2={y} stroke="#44474a" strokeWidth="0.5" strokeDasharray="4,4" />;
      })}
      {/* Area fill */}
      <polygon points={area} fill={`url(#${gradId})`} />
      {/* Line */}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {/* Dots */}
      {data.map((d, i) => (
        <circle key={i} cx={scaleX(i)} cy={scaleY(d.value)} r="3.5"
          fill="#131313" stroke={color} strokeWidth="2" />
      ))}
      {/* Last value label */}
      <circle cx={lastX} cy={lastY} r="5" fill={color} />
      <text x={lastX + 8} y={lastY + 4} fill={color} fontSize="11" fontWeight="bold">{values[values.length - 1]}</text>
      {/* X labels */}
      {data.map((d, i) => (
        <text key={i} x={scaleX(i)} y={H} fill="#44474a" fontSize="9" textAnchor="middle">{d.ts}</text>
      ))}
    </svg>
  );
};

// ─── Prop row helper ──────────────────────────────────────────────────────────
const Prop = ({ icon, label, value, highlight }) => (
  <div className="flex items-center gap-2">
    <span className="material-symbols-outlined text-[14px] text-[#44474a]">{icon}</span>
    <div>
      <p className="text-[#44474a] text-[9px] uppercase tracking-wider leading-none">{label}</p>
      <p className={`text-sm font-semibold leading-tight mt-0.5 ${highlight ? 'text-accent' : 'text-white'}`}>{value}</p>
    </div>
  </div>
);

// ─── Component ────────────────────────────────────────────────────────────────
export default function DemoDetailPage() {
  return (
    <div className="min-h-screen bg-[#131313] text-[#e5e2e1] flex">

      {/* Sidebar */}
      <aside className="w-60 bg-[#1c1b1c] border-r border-[#44474a] flex-col shrink-0 hidden lg:flex">
        <div className="p-4 border-b border-[#44474a] flex items-center gap-2">
          <div className="w-7 h-7 bg-[#4d90fe] rounded-md flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-[16px]">trending_up</span>
          </div>
          <div>
            <p className="font-semibold text-white text-sm">LeadsToDeals</p>
            <p className="text-[#c5c6ca] text-xs">Intranox</p>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {[{ icon: 'dashboard', label: 'Dashboard' }, { icon: 'tune', label: 'Scoring Config' }, { icon: 'admin_panel_settings', label: 'Admin' }]
            .map(({ icon, label }) => (
              <div key={label} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[#c5c6ca] text-sm">
                <span className="material-symbols-outlined text-[20px]">{icon}</span>
                <span>{label}</span>
              </div>
            ))}
        </nav>
        <div className="p-3 border-t border-[#44474a] flex items-center gap-2 px-5 py-3">
          <div className="w-7 h-7 bg-[#2a2a2a] rounded-full flex items-center justify-center">
            <span className="material-symbols-outlined text-[#c5c6ca] text-[16px]">person</span>
          </div>
          <div>
            <p className="text-white text-xs font-medium">juan.angel.perez</p>
            <p className="text-[#c5c6ca] text-[10px]">Superadmin</p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 p-6 overflow-auto space-y-5">

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-sm text-[#c5c6ca]">
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Dashboard
        </div>

        {/* Deal name */}
        <h1 className="text-4xl font-black text-white leading-tight tracking-tight">
          {DEAL.name}
        </h1>

        {/* ── Dual score cards ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Score de Potencialidad */}
          <div className={`border rounded-xl p-5 ${scoreBorder(POT_SCORE)} ${scoreBg(POT_SCORE)}`}>
            <p className="text-[9px] font-bold uppercase tracking-widest text-[#c5c6ca] mb-3">
              Score de Potencialidad
            </p>
            <div className="flex items-stretch gap-5">
              {/* Big score */}
              <div className="flex items-end gap-2 shrink-0">
                <span className="font-black" style={{ fontSize: '5.5rem', color: scoreColor(POT_SCORE), lineHeight: 1 }}>
                  {POT_SCORE}
                </span>
                <span className="mb-1.5 px-2 py-0.5 rounded-full text-xs font-bold uppercase border"
                  style={{ color: scoreColor(POT_SCORE), borderColor: scoreColor(POT_SCORE) + '50', backgroundColor: scoreColor(POT_SCORE) + '15' }}>
                  Alto
                </span>
              </div>
              {/* Props */}
              <div className="flex-1 border-l border-[#44474a]/40 pl-5 flex flex-col justify-center gap-3">
                <Prop icon="payments" label="Importe" value={`€${DEAL.amount.toLocaleString()}`} />
                <Prop icon="swap_horiz" label="Etapa" value={DEAL.stage} />
                <Prop icon="schedule" label="Días transcurridos" value={`${DEAL.daysSinceCreate} días`} />
              </div>
            </div>
            <p className="text-[#44474a] text-[10px] mt-3">Estático · criterios de calificación de negocio</p>
          </div>

          {/* Deal Health Score */}
          <div className={`border rounded-xl p-5 ${scoreBorder(HEALTH_SCORE)} ${scoreBg(HEALTH_SCORE)}`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-[#c5c6ca]">
                Deal Health Score
              </p>
              <span className="text-[9px] font-mono text-[#44474a] bg-[#201f20] px-2 py-0.5 rounded">HubSpot AI</span>
            </div>
            <div className="flex items-stretch gap-5">
              {/* Big score + delta */}
              <div className="shrink-0">
                <div className="flex items-end gap-2">
                  <span className="font-black" style={{ fontSize: '5.5rem', color: scoreColor(HEALTH_SCORE), lineHeight: 1 }}>
                    {HEALTH_SCORE}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <span className="material-symbols-outlined text-[16px]" style={{ color: '#f87171' }}>trending_down</span>
                  <span className="text-sm font-bold" style={{ color: '#f87171' }}>{HEALTH_DELTA}</span>
                  <span className="text-[#44474a] text-[10px]">vs ayer</span>
                </div>
              </div>
              {/* Props */}
              <div className="flex-1 border-l border-[#44474a]/40 pl-5 flex flex-col justify-center gap-3">
                <Prop icon="swap_horiz"       label="Etapa"                value={DEAL.stage} />
                <Prop icon="event_available"  label="Última actividad"     value={DEAL.lastActivity} />
                <Prop icon="event_upcoming"   label="Próxima actividad"    value={DEAL.nextActivity} highlight />
              </div>
            </div>
            <p className="text-[#44474a] text-[10px] mt-3">
              Probabilidad de cierre · se actualiza automáticamente cada ~6h
            </p>
          </div>
        </div>

        {/* ── Buttons side by side ── */}
        <div className="grid grid-cols-2 gap-3">
          <button className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl font-semibold text-sm"
            style={{ backgroundColor: '#FF7A00', color: '#fff', boxShadow: '0 0 20px #FF7A0040' }}>
            <span className="material-symbols-outlined text-[16px]">open_in_new</span>
            Abrir en HubSpot
          </button>
          <button className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-[#201f20] text-[#c5c6ca] border border-[#44474a] rounded-xl text-sm font-medium hover:bg-[#2a2a2a] transition-colors">
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            Actualizar
          </button>
        </div>

        {/* ── Health Score chart ── */}
        <div className="bg-[#1c1b1c] border border-[#44474a] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-white font-semibold text-sm">Evolución Deal Health Score</p>
              <p className="text-[#44474a] text-xs mt-0.5">hs_predictive_deal_score · HubSpot AI</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: scoreColor(HEALTH_SCORE) }} />
              <span className="text-[#c5c6ca] text-xs">Últimos 14 días</span>
            </div>
          </div>
          <StockChart data={HEALTH_HISTORY} color={scoreColor(HEALTH_SCORE)} />
        </div>

        {/* ── Criterion Breakdown ── */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-[#c5c6ca] mb-3">
            Criterion Breakdown — Potencialidad
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {CRITERIA.map((item, idx) => {
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
                        <span className="text-white font-medium">{item.matchedLabel}</span>
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
        </div>

      </div>
    </div>
  );
}
