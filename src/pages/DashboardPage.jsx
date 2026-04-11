import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { calculateScore, getScoreThreshold } from '../lib/scoringEngine';
import Spinner from '../components/Spinner';

const ScoreChip = ({ score }) => {
  const color =
    score >= 70 ? 'bg-green-500/15 text-green-400' :
    score >= 45 ? 'bg-yellow-500/15 text-yellow-400' :
    'bg-red-500/15 text-red-400';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${color}`}>
      {score}
    </span>
  );
};

const StatCard = ({ icon, label, value, accent }) => (
  <div className="bg-[#1c1b1c] border border-[#44474a] rounded-lg p-4 flex items-center gap-4">
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accent || 'bg-[#2a2a2a]'}`}>
      <span className="material-symbols-outlined text-[20px] text-[#c5c6ca]">{icon}</span>
    </div>
    <div>
      <p className="text-[#c5c6ca] text-xs">{label}</p>
      <p className="text-white text-xl font-bold">{value}</p>
    </div>
  </div>
);

const DashboardPage = () => {
  const { tenant } = useAuth();
  const navigate = useNavigate();
  const [deals, setDeals] = useState([]);
  const [filteredDeals, setFilteredDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stageLabels, setStageLabels] = useState({});
  const [filterScore, setFilterScore] = useState('all');
  const [filterStages, setFilterStages] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showStageDropdown, setShowStageDropdown] = useState(false);

  useEffect(() => {
    if (tenant) fetchData();
    else setLoading(false);
  }, [tenant]);

  useEffect(() => {
    let result = deals;
    if (filterScore !== 'all') {
      result = result.filter(deal => {
        if (filterScore === 'high') return deal.score >= 70;
        if (filterScore === 'medium') return deal.score >= 45 && deal.score < 70;
        if (filterScore === 'low') return deal.score < 45;
        return true;
      });
    }
    if (filterStages.length > 0) result = result.filter(deal => filterStages.includes(deal.properties.dealstage));
    if (searchTerm) result = result.filter(deal => deal.properties.dealname?.toLowerCase().includes(searchTerm.toLowerCase()));
    setFilteredDeals(result);
  }, [deals, filterScore, filterStages, searchTerm]);

  const fetchAllDeals = async () => {
    const properties = [
      'dealname','amount','dealstage','unidad_de_negocio_deal',
      'prioridad_de_obra__proyecto','ubicacion_provincia_obra__proyecto',
      'madurez_en_adjudicacion_obra__proyecto','tipo_de_obra__proyecto',
      'valor_actual','numero_total_de_depositos','sector_partida',
      'peso_total_cmr_toneladas','hubspot_owner_id'
    ];
    const baseUrl = `${import.meta.env.VITE_PROXY_URL}/proxy/crm/v3/objects/deals`;
    let allDeals = [];
    let after = null;
    do {
      const url = `${baseUrl}?limit=100&properties=${properties.join(',')}${after ? `&after=${after}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      allDeals = allDeals.concat(data.results || []);
      after = data.paging?.next?.after ?? null;
    } while (after);
    return allDeals;
  };

  const fetchStageLabels = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_PROXY_URL}/proxy/crm/v3/pipelines/deals`);
      const data = await res.json();
      const map = {};
      (data.results || []).forEach(pipeline => {
        (pipeline.stages || []).forEach(stage => { map[stage.id] = stage.label; });
      });
      setStageLabels(map);
    } catch (e) { console.warn('No se pudieron cargar las etapas:', e.message); }
  };

  const saveDealScores = async (deals, matrix, tenantId) => {
    const rows = deals.map(deal => ({
      tenant_id: tenantId, matrix_id: matrix.id,
      hubspot_deal_id: deal.id, deal_name: deal.properties.dealname || null,
      score: deal.score, threshold_label: deal.threshold?.label || null,
      threshold_color: deal.threshold?.color || null, score_detail: deal.detail,
      deal_amount: deal.properties.amount ? parseFloat(deal.properties.amount) : null,
      hubspot_owner: deal.properties.hubspot_owner_id || null,
    }));
    const { error } = await supabase.from('deal_scores').insert(rows);
    if (error) console.error('Error saving deal scores:', error.message);
  };

  const writeScoresToHubSpot = async (deals) => {
    const inputs = deals.map(deal => ({ id: deal.id, properties: { score_rcm: String(deal.score) } }));
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/proxy/hubspot/crm/v3/objects/deals/batch/update`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': String(tenant.id) },
          body: JSON.stringify({ inputs }),
        }
      );
      if (!res.ok) console.error('Error writing scores to HubSpot:', await res.json());
    } catch (err) { console.error('writeScoresToHubSpot failed:', err.message); }
  };

  const fetchData = async () => {
    try {
      const { data: matrix, error: matrixError } = await supabase
        .from('scoring_matrices')
        .select('*, criteria(*, criterion_options(*)), score_thresholds(*)')
        .eq('tenant_id', tenant.id).eq('active', true).limit(1).maybeSingle();

      if (matrixError || !matrix) { setDeals([]); setLoading(false); return; }

      const [hubspotDeals] = await Promise.all([fetchAllDeals(), fetchStageLabels()]);

      const dealsWithScores = hubspotDeals.map(deal => {
        const { score, detail } = calculateScore(matrix.criteria || [], deal.properties);
        const threshold = getScoreThreshold(score, matrix.score_thresholds || []);
        return { ...deal, score, detail, threshold };
      });

      setDeals(dealsWithScores);
      saveDealScores(dealsWithScores, matrix, tenant.id);
      writeScoresToHubSpot(dealsWithScores);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const stats = {
    total: deals.length,
    high: deals.filter(d => d.score >= 70).length,
    medium: deals.filter(d => d.score >= 45 && d.score < 70).length,
    low: deals.filter(d => d.score < 45).length,
  };

  const stageOptions = [...new Set(deals.map(d => d.properties.dealstage).filter(Boolean))];
  const getStageLabel = (stageId) => stageLabels[stageId] || stageId;

  const toggleStage = (stageId) => {
    setFilterStages(prev =>
      prev.includes(stageId) ? prev.filter(s => s !== stageId) : [...prev, stageId]
    );
  };

  const topDeals = [...deals].sort((a, b) => b.score - a.score).slice(0, 10);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <Spinner />
        <p className="mt-4 text-sm text-[#c5c6ca]">Cargando deals...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-[#c5c6ca] text-sm mt-1">Puntuación automática de oportunidades</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon="inventory_2" label="Total deals" value={stats.total} />
        <StatCard icon="trending_up" label="Alto (≥70)" value={stats.high} accent="bg-green-500/15" />
        <StatCard icon="remove" label="Medio (45–69)" value={stats.medium} accent="bg-yellow-500/15" />
        <StatCard icon="trending_down" label="Bajo (<45)" value={stats.low} accent="bg-red-500/15" />
      </div>

      {/* Top 10 horizontal scroll */}
      {topDeals.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[#c5c6ca] mb-3 uppercase tracking-wider">Top 10 deals</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
            {topDeals.map(deal => (
              <button
                key={deal.id}
                onClick={() => navigate(`/deal/${deal.id}`)}
                className="flex-none w-44 bg-[#1c1b1c] border border-[#44474a] rounded-lg p-3 text-left hover:border-accent transition-colors"
              >
                <p className="text-white text-xs font-medium line-clamp-2 mb-2">{deal.properties.dealname}</p>
                <ScoreChip score={deal.score} />
                {deal.properties.amount && (
                  <p className="text-[#c5c6ca] text-xs mt-1">€{parseFloat(deal.properties.amount).toLocaleString()}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2 bg-[#1c1b1c] border border-[#44474a] rounded-lg px-3 py-2 flex-1 min-w-[200px]">
          <span className="material-symbols-outlined text-[18px] text-[#c5c6ca]">search</span>
          <input
            type="text"
            placeholder="Buscar deal..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent text-white placeholder-[#c5c6ca] text-sm focus:outline-none flex-1"
          />
        </div>

        <select
          value={filterScore}
          onChange={(e) => setFilterScore(e.target.value)}
          className="bg-[#1c1b1c] border border-[#44474a] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent cursor-pointer"
        >
          <option value="all">Todos los scores</option>
          <option value="high">Alto (≥70)</option>
          <option value="medium">Medio (45–69)</option>
          <option value="low">Bajo (&lt;45)</option>
        </select>

        {/* Stage multi-select */}
        <div className="relative">
          <button
            onClick={() => setShowStageDropdown(p => !p)}
            className="flex items-center gap-2 bg-[#1c1b1c] border border-[#44474a] rounded-lg px-3 py-2 text-sm text-white hover:border-accent transition-colors"
          >
            <span className="material-symbols-outlined text-[16px] text-[#c5c6ca]">filter_list</span>
            Etapas
            {filterStages.length > 0 && (
              <span className="bg-accent text-white text-xs rounded-full px-1.5 py-0.5">{filterStages.length}</span>
            )}
          </button>
          {showStageDropdown && (
            <div className="absolute top-full mt-1 left-0 bg-[#201f20] border border-[#44474a] rounded-lg shadow-xl z-20 min-w-[200px] max-h-60 overflow-y-auto">
              {filterStages.length > 0 && (
                <button
                  onClick={() => setFilterStages([])}
                  className="w-full text-left px-3 py-2 text-xs text-[#c5c6ca] hover:bg-[#2a2a2a] border-b border-[#44474a]"
                >
                  Limpiar ({filterStages.length})
                </button>
              )}
              {stageOptions.map(stage => (
                <button
                  key={stage}
                  onClick={() => toggleStage(stage)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-[#2a2a2a] ${
                    filterStages.includes(stage) ? 'text-accent' : 'text-[#c5c6ca]'
                  }`}
                >
                  {filterStages.includes(stage) && (
                    <span className="material-symbols-outlined text-[14px]">check</span>
                  )}
                  <span className={filterStages.includes(stage) ? '' : 'ml-5'}>{getStageLabel(stage)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#1c1b1c] border border-[#44474a] rounded-lg overflow-hidden">
        {deals.length === 0 ? (
          <div className="p-12 text-center">
            <span className="material-symbols-outlined text-[48px] text-[#44474a] block mb-3">inbox</span>
            <p className="text-[#c5c6ca]">No hay deals para mostrar</p>
            <p className="text-[#c5c6ca] text-sm mt-1">Configura una matriz de scoring activa para comenzar</p>
          </div>
        ) : filteredDeals.length === 0 ? (
          <div className="p-12 text-center">
            <span className="material-symbols-outlined text-[48px] text-[#44474a] block mb-3">search_off</span>
            <p className="text-[#c5c6ca]">Sin resultados para los filtros aplicados</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#44474a]">
                <th className="text-left text-xs font-medium text-[#c5c6ca] px-4 py-3 uppercase tracking-wider">Deal</th>
                <th className="text-left text-xs font-medium text-[#c5c6ca] px-4 py-3 uppercase tracking-wider hidden md:table-cell">Etapa</th>
                <th className="text-right text-xs font-medium text-[#c5c6ca] px-4 py-3 uppercase tracking-wider hidden sm:table-cell">Importe</th>
                <th className="text-right text-xs font-medium text-[#c5c6ca] px-4 py-3 uppercase tracking-wider">Score</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#44474a]/50">
              {filteredDeals.map(deal => (
                <tr
                  key={deal.id}
                  className="hover:bg-[#201f20] transition-colors cursor-pointer"
                  onClick={() => navigate(`/deal/${deal.id}`)}
                >
                  <td className="px-4 py-3">
                    <p className="text-white text-sm font-medium">{deal.properties.dealname}</p>
                    <p className="text-[#c5c6ca] text-xs mt-0.5 md:hidden">{getStageLabel(deal.properties.dealstage)}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-[#c5c6ca] text-sm">{getStageLabel(deal.properties.dealstage)}</span>
                  </td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell">
                    <span className="text-white text-sm">
                      {deal.properties.amount ? `€${parseFloat(deal.properties.amount).toLocaleString()}` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ScoreChip score={deal.score} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="material-symbols-outlined text-[18px] text-[#44474a]">chevron_right</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {deals.length > 0 && filteredDeals.length > 0 && (
          <div className="border-t border-[#44474a] px-4 py-2 flex justify-between items-center">
            <p className="text-[#c5c6ca] text-xs">
              Mostrando {filteredDeals.length} de {deals.length} deals
            </p>
            <button
              onClick={fetchData}
              className="flex items-center gap-1 text-xs text-[#c5c6ca] hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">refresh</span>
              Actualizar
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
