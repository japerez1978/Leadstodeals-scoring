import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { calculateScore, getScoreThreshold } from '../lib/scoringEngine';

// Fetch matrices with criteria and thresholds
export const useScoringMatrices = (tenantId) => {
  return useQuery({
    queryKey: ['scoring_matrices', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scoring_matrices')
        .select('*, criteria(*, criterion_options(*)), score_thresholds(*)')
        .eq('tenant_id', tenantId)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });
};

// Hubspot API base
const HUBSPOT_PROXY_URL = `${import.meta.env.VITE_PROXY_URL}/proxy/crm/v3`;

// Fetch properties/stages
export const useStageLabels = () => {
  return useQuery({
    queryKey: ['hubspot_stages'],
    queryFn: async () => {
      const labelMap = {};
      const probMap = {};
      const res = await fetch(`${HUBSPOT_PROXY_URL}/pipelines/deals`);
      if (!res.ok) throw new Error('Failed to fetch pipelines');
      const data = await res.json();
      (data.results || []).forEach(pipeline => {
        (pipeline.stages || []).forEach(stage => {
          labelMap[stage.id] = stage.label;
          const prob = stage.metadata?.probability;
          probMap[stage.id] = prob != null ? Math.round(parseFloat(prob) * 100) : null;
        });
      });
      return { labelMap, probMap };
    },
    staleTime: 60 * 60 * 1000,
  });
};

const saveDealScores = async (deals, matrix, tenantId) => {
  if (!tenantId || !matrix?.id || !deals.length) return;
  const rows = deals.map(deal => ({
    tenant_id: tenantId, matrix_id: matrix.id,
    hubspot_deal_id: deal.id, deal_name: deal.properties.dealname || null,
    score: deal.score, threshold_label: deal.threshold?.label || null,
    threshold_color: deal.threshold?.color || null, score_detail: deal.detail,
    deal_amount: deal.properties.amount ? parseFloat(deal.properties.amount) : null,
    hubspot_owner: deal.properties.hubspot_owner_id || null,
  }));
  
  // NOTE: assuming unique constraint on tenant_id, hubspot_deal_id. If missing, we should use standard insert and handle errors
  const { error } = await supabase.from('deal_scores').upsert(rows);
  if (error) console.error('Error saving deal scores:', error.message);

  const dmiRows = deals
    .filter(deal => deal.dmi != null)
    .map(deal => ({
      tenant_id: tenantId,
      hubspot_deal_id: deal.id,
      deal_name: deal.properties.dealname || null,
      dmi: deal.dmi,
      source: 'poll',
    }));
  if (dmiRows.length > 0) {
    const { error: dmiError } = await supabase.from('deal_momentum_index').upsert(dmiRows);
    if (dmiError) console.error('Error saving DMI scores:', dmiError.message);
  }
};

export const useDashboardData = (tenantId) => {
  return useQuery({
    queryKey: ['dashboard_data', tenantId],
    queryFn: async () => {
      // Fetch matrix
      const { data: matrix, error: matrixError } = await supabase
        .from('scoring_matrices')
        .select('*, criteria(*, criterion_options(*)), score_thresholds(*)')
        .eq('tenant_id', tenantId).eq('active', true).limit(1).maybeSingle();

      if (matrixError || !matrix) {
        return { deals: [], labels: {}, probs: {} };
      }

      // Fetch deals
      const properties = [
        'dealname','amount','dealstage','unidad_de_negocio_deal',
        'prioridad_de_obra__proyecto','ubicacion_provincia_obra__proyecto',
        'madurez_en_adjudicacion_obra__proyecto','tipo_de_obra__proyecto',
        'valor_actual','numero_total_de_depositos','sector_partida',
        'peso_total_cmr_toneladas','hubspot_owner_id',
        'hs_deal_score','hs_predictive_deal_score',
      ];
      const baseUrl = `${HUBSPOT_PROXY_URL}/objects/deals`;
      let hubspotDeals = [];
      let after = null;
      do {
        const url = `${baseUrl}?limit=100&properties=${properties.join(',')}${after ? `&after=${after}` : ''}`;
        const res = await fetch(url);
        const data = await res.json();
        hubspotDeals = hubspotDeals.concat(data.results || []);
        after = data.paging?.next?.after ?? null;
      } while (after);

      // Fetch pipelines
      const labelMap = {};
      const probMap = {};
      const res = await fetch(`${HUBSPOT_PROXY_URL}/pipelines/deals`);
      const pipeData = await res.json();
      (pipeData.results || []).forEach(pipeline => {
        (pipeline.stages || []).forEach(stage => {
          labelMap[stage.id] = stage.label;
          const prob = stage.metadata?.probability;
          probMap[stage.id] = prob != null ? Math.round(parseFloat(prob) * 100) : null;
        });
      });

      // Calculate scores
      const dealsWithScores = hubspotDeals.map(deal => {
        const { score, detail } = calculateScore(matrix.criteria || [], deal.properties ?? {});
        const threshold = getScoreThreshold(score, matrix.score_thresholds || []);
        const healthScore = deal.properties.hs_deal_score
          ? Math.round(parseFloat(deal.properties.hs_deal_score))
          : (deal.properties.hs_predictive_deal_score
            ? Math.round(parseFloat(deal.properties.hs_predictive_deal_score))
            : null);
        const trend = 0;
        const dmi = score != null && healthScore != null
          ? Math.round((score * 0.35) + (healthScore * 0.45) + (trend * 0.20))
          : null;
        return { ...deal, score, detail, threshold, healthScore, dmi };
      });

      // Fire and forget save
      saveDealScores(dealsWithScores, matrix, tenantId);

      return { deals: dealsWithScores, labels: labelMap, probs: probMap, timestamp: Date.now() };
    },
    enabled: !!tenantId,
  });
};
