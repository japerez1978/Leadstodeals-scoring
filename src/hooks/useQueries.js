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

// Removed saveDealScores to reduce DB calls as per user request

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
        const url = `${baseUrl}?limit=100&properties=${properties.join(',')}&associations=companies${after ? `&after=${after}` : ''}`;
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

      // Owners API disabled to avoid 403 Forbidden console noise until token has permissions
      const ownerMap = {};
      /*
      try {
        const ownerRes = await fetch(`${HUBSPOT_PROXY_URL}/owners?limit=100`);
        if (ownerRes.ok) { ... }
      } catch (e) { ... }
      */

      // Fetch company names via associations with ID validation and chunking (HubSpot limit is 100)
      const companyMap = {};
      try {
        const companyIds = [...new Set(
          hubspotDeals
            .flatMap(d => (d.associations?.companies?.results || []).map(c => c.id))
            .filter(id => id && id !== 'null' && id !== 'undefined')
        )];
        
        if (companyIds.length > 0) {
          const CHUNK_SIZE = 100;
          for (let i = 0; i < companyIds.length; i += CHUNK_SIZE) {
            const chunk = companyIds.slice(i, i + CHUNK_SIZE);
            const compRes = await fetch(
              `${HUBSPOT_PROXY_URL}/objects/companies/batch/read`,
              { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inputs: chunk.map(id => ({ id })), properties: ['name'] }) 
              }
            );
            if (compRes.ok) {
              const compData = await compRes.json();
              (compData.results || []).forEach(c => { companyMap[c.id] = c.properties?.name || '—'; });
            }
          }
        }
      } catch (e) { console.warn('Company batch skipped:', e.message); }

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

      return { deals: dealsWithScores, labels: labelMap, probs: probMap, timestamp: Date.now(), ownerMap, companyMap };
    },
    enabled: !!tenantId,
  });
};

const formatChartDate = (d, i, total) => {
  if (i === total - 1) return 'HOY';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).toUpperCase();
};

export const useDealDetails = (tenantId, dealId) => {
  return useQuery({
    queryKey: ['deal_details', tenantId, dealId],
    queryFn: async () => {
      // 1. Matrix
      const { data: matrix } = await supabase
        .from('scoring_matrices')
        .select('*, criteria(*, criterion_options(*)), score_thresholds(*)')
        .eq('tenant_id', tenantId).eq('active', true).limit(1).maybeSingle();

      // 2. Stage labels
      const labelMap = {};
      try {
        const r = await fetch(`${HUBSPOT_PROXY_URL}/pipelines/deals`);
        const d = await r.json();
        (d.results || []).forEach(p => (p.stages || []).forEach(s => { labelMap[s.id] = s.label; }));
      } catch (e) { console.warn('pipelines error:', e); }

      // 3. Portal / Hubspot URL
      let portalId = null;
      try {
        const { data: tData } = await supabase.from('tenants').select('hubspot_portal_id').eq('id', tenantId).single();
        if (tData?.hubspot_portal_id) {
          portalId = tData.hubspot_portal_id;
        } else {
          const r = await fetch(`${import.meta.env.VITE_PROXY_URL}/proxy/account-info/v3/details`);
          const d = await r.json();
          portalId = d.portalId;
          if (portalId) await supabase.from('tenants').update({ hubspot_portal_id: String(portalId) }).eq('id', tenantId);
        }
      } catch (e) {
        console.warn('portal id error:', e);
      }
      const hubspotUrl = portalId
        ? `https://app.hubspot.com/contacts/${portalId}/deal/${dealId}`
        : `https://app.hubspot.com/contacts/deal/${dealId}`;

      // 4. Deal Properties
      const props = [
        'dealname', 'amount', 'dealstage', 'hs_deal_score', 'hs_predictive_deal_score',
        'hs_createdate', 'notes_last_activity', 'hs_next_activity_date',
        'unidad_de_negocio_deal', 'prioridad_de_obra__proyecto',
        'ubicacion_provincia_obra__proyecto', 'madurez_en_adjudicacion_obra__proyecto',
        'tipo_de_obra__proyecto', 'valor_actual', 'numero_total_de_depositos',
        'sector_partida', 'peso_total_cmr_toneladas', 'hubspot_owner_id',
      ];
      const res = await fetch(
        `${HUBSPOT_PROXY_URL}/objects/deals/${dealId}?properties=${props.join(',')}&propertiesWithHistory=hs_deal_score,hs_predictive_deal_score,dealstage`
      );
      if (!res.ok) throw new Error('Failed to fetch deal from HubSpot');
      const dealData = await res.json();
      if (!dealData?.properties || Array.isArray(dealData.properties)) throw new Error('Invalid deal properties');

      const { score, detail } = calculateScore(matrix?.criteria || [], dealData.properties);
      const threshold = getScoreThreshold(score, matrix?.score_thresholds || []);
      const enrichedDeal = { ...dealData, score, detail, threshold };

      // 5. Historical Data
      const healthScoreProp = dealData.properties.hs_deal_score ? 'hs_deal_score' : 'hs_predictive_deal_score';
      const hsHistory = (dealData.propertiesWithHistory?.[healthScoreProp] || [])
        .map(h => ({ value: Math.round(parseFloat(h.value)), ts: new Date(h.timestamp) }))
        .filter(h => !isNaN(h.value))
        .reverse();

      const currentHealth = dealData.properties[healthScoreProp]
        ? Math.round(parseFloat(dealData.properties[healthScoreProp]))
        : null;

      // 5. Build Chart Data purely from HubSpot History (No Supabase DB calls)
      const healthChartData = hsHistory.map((d, i, arr) => ({
        value: d.value, label: formatChartDate(d.ts, i, arr.length),
      }));

      // DMI and Quality history are not available without DB persistence
      const dmiChartData = [];

      return {
        deal: enrichedDeal,
        healthChartData,
        dmiChartData,
        hsHealthHistory: hsHistory,
        labels: labelMap,
        hubspotUrl
      };
    },
    enabled: !!tenantId && !!dealId,
  });
};
