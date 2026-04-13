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
      
      // Stable sorting in frontend to prevent UI jumping
      const sorted = (data || []).map(matrix => ({
        ...matrix,
        criteria: (matrix.criteria || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
        score_thresholds: (matrix.score_thresholds || []).sort((a, b) => b.min_score - a.min_score),
      })).map(matrix => ({
        ...matrix,
        criteria: matrix.criteria.map(c => ({
          ...c,
          criterion_options: (c.criterion_options || c.criterion_option || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || b.multiplier - a.multiplier)
        }))
      }));

      return sorted;
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
    queryKey: ['dashboard', tenantId],
    queryFn: async () => {
      // 1. Fetch ALL active Scoring Matrices for this Tenant
      const { data: matricesRaw, error: matricesError } = await supabase
        .from('scoring_matrices')
        .select('*, criteria(*, criterion_options(*)), score_thresholds(*)')
        .eq('tenant_id', tenantId)
        .eq('active', true);

      if (matricesError || !matricesRaw || matricesRaw.length === 0) {
        return { deals: [], labels: {}, probs: {} };
      }

      console.log("[ARCHITECT-AUDIT] Starting Audit..."); // Stable sorting for all matrices
      const allMatrices = matricesRaw.map(mRaw => ({
        ...mRaw,
        criteria: (mRaw.criteria || [])
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          .map(c => ({
            ...c,
            criterion_options: (c.criterion_options || c.criterion_option || [])
              .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || b.multiplier - a.multiplier)
          })),
        score_thresholds: (mRaw.score_thresholds || [])
          .sort((a, b) => b.min_score - a.min_score)
      }));

      // Helper to find matrix by business unit
      const getMatrixForDeal = (d) => {
        const unit = (
          d.properties.unidad_de_negocio_deal || 
          d.properties.unidad_de_negocio || 
          d.properties.unidad_negocio || 
          d.properties.negocio || 
          ''
        ).toLowerCase().trim();
        
        // Match by name or fallback to first
        return allMatrices.find(m => m.name.toLowerCase().trim() === unit) || allMatrices[0];
      };

      // 2. Build dynamic properties list from ALL criteria
      const baseProperties = [
        'dealname','amount','dealstage','hubspot_owner_id',
        'hs_deal_score','hs_predictive_deal_score',
        'unidad_de_negocio_deal', 'unidad_de_negocio', 'unidad_negocio', 'negocio', 'province', 'nivel_de_cliente', 'nivel_de_cliente_partida'
      ];
      const allCriteriaProps = allMatrices.flatMap(m => (m.criteria || []).map(c => c.hubspot_property)).filter(Boolean);
      const allProperties = [...new Set([...baseProperties, ...allCriteriaProps])];

      // 3. Fetch deals
      const baseUrl = `${HUBSPOT_PROXY_URL}/objects/deals`;
      let hubspotDeals = [];
      let after = null;
      do {
        const url = `${baseUrl}?limit=100&properties=${allProperties.join(',')}&associations=companies${after ? `&after=${after}` : ''}`;
        const res = await fetch(url);
        const data = await res.json();
        hubspotDeals = hubspotDeals.concat(data.results || []);
        after = data.paging?.next?.after ?? null;
      } while (after);

      // 4. Fetch pipelines (labels & probs)
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

      // 5. Fetch owners
      const ownerMap = {};
      try {
        const ownerRes = await fetch(`${HUBSPOT_PROXY_URL}/owners?limit=100`);
        if (ownerRes.ok) {
          const ownerData = await ownerRes.json();
          (ownerData.results || []).forEach(o => {
            ownerMap[String(o.id)] = `${o.firstName || ''} ${o.lastName || ''}`.trim() || o.email || '—';
          });
        }
      } catch (e) { console.warn('Owners API skipped'); }

      // 6. Fetch company names
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

      // 7. Calculate scores
      const dealsWithScores = hubspotDeals.map(deal => {
        const matrix = getMatrixForDeal(deal);
        const { score, detail } = calculateScore(matrix.criteria || [], deal.properties ?? {});
        const threshold = getScoreThreshold(score, matrix.score_thresholds || []);
        
        // Resolve Health Score (health_property from matrix config)
        const healthProp = matrix.config?.health_property || 'hs_deal_score';
        const rawHealth = deal.properties[healthProp];
        const healthScore = rawHealth ? Math.round(parseFloat(rawHealth)) : null;

        const trend = 0;
        const dmi = score != null && healthScore != null
          ? Math.round((score * 0.50) + (healthScore * 0.30) + (trend * 0.20))
          : score;

        return { 
          ...deal, 
          score, 
          detail, 
          threshold, 
          healthScore, 
          dmi,
          matrixName: matrix.name 
        };
      });

      return { deals: dealsWithScores, labels: labelMap, probs: probMap, timestamp: Date.now(), ownerMap, companyMap };
    },
    enabled: !!tenantId,
  });
};



export const useDealDetails = (tenantId, dealId) => {
  return useQuery({
    queryKey: ['deal', tenantId, dealId],
    queryFn: async () => {
      // 1. Fetch ALL active Scoring Matrices for this Tenant
      const { data: matricesRaw, error: matricesError } = await supabase
        .from('scoring_matrices')
        .select('*, criteria(*, criterion_options(*)), score_thresholds(*)')
        .eq('tenant_id', tenantId)
        .eq('active', true);

      if (matricesError || !matricesRaw || matricesRaw.length === 0) {
        throw new Error('No active scoring matrices found');
      }

      console.log("[ARCHITECT-AUDIT] Starting Audit..."); // Stable sorting for all matrices
      const allMatrices = matricesRaw.map(mRaw => ({
        ...mRaw,
        criteria: (mRaw.criteria || [])
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          .map(c => ({
            ...c,
            criterion_options: (c.criterion_options || c.criterion_option || [])
              .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || b.multiplier - a.multiplier)
          })),
        score_thresholds: (mRaw.score_thresholds || [])
          .sort((a, b) => b.min_score - a.min_score)
      }));

      // [DEBUG-LOG] DETAILED MATRIX MATCHING
      console.log('[DEBUG-MATRIX] All available matrices:', allMatrices.map(m => m.name));
      const getMatrixForDeal = (props) => {
        const unit = (
          props.unidad_de_negocio_deal || 
          props.unidad_de_negocio || 
          props.unidad_negocio || 
          props.negocio || 
          ''
        ).toLowerCase().trim();

        console.log(`[DEBUG-MATRIX] Unit from HubSpot: "${unit}"`);
        
        if (!unit) return allMatrices[0];

        // Flexible finding
        const found = allMatrices.find(m => {
          const mName = m.name.toLowerCase().trim();
          return mName === unit || mName.includes(unit) || unit.includes(mName);
        });

        console.log(`[DEBUG-MATRIX] MATCHED: ${found ? found.name : 'FALLBACK TO FIRST MATRIX'}`);
        return found || allMatrices[0];
      };

      // 2. Resolve Properties
      const baseProperties = [
        'dealname', 'amount', 'dealstage', 'hs_deal_score', 'hs_predictive_deal_score',
        'hs_createdate', 'notes_last_activity', 'hs_next_activity_date', 'hubspot_owner_id', 
        'sector', 'province', 'unidad_de_negocio_deal', 'unidad_de_negocio', 'unidad_negocio', 'negocio', 'nivel_de_cliente', 'nivel_de_cliente_partida'
      ];
      const allCriteriaProps = allMatrices.flatMap(m => (m.criteria || []).map(c => c.hubspot_property)).filter(Boolean);
      const allProperties = [...new Set([...baseProperties, ...allCriteriaProps])];

      // A. Fetch DEAL CORE properties first
      const coreRes = await fetch(`${HUBSPOT_PROXY_URL}/objects/deals/${dealId}?properties=${allProperties.join(',')}`);
      if (!coreRes.ok) throw new Error('Deal not found');
      const coreData = await coreRes.json();

      // B. Identify Matrix and Health Property
      const matrix = getMatrixForDeal(coreData.properties || {});
      const healthProp = matrix.config?.health_property || 'hs_deal_score';

      // C. Fetch HISTORY for the identified health property
      const historyRes = await fetch(`${HUBSPOT_PROXY_URL}/objects/deals/${dealId}?properties=${allProperties.join(',')}&propertiesWithHistory=${healthProp},hs_deal_score,hs_predictive_deal_score,dealstage`);
      const dealData = await historyRes.json();

      // 3. Stage labels
      const labelMap = {};
      try {
        const r = await fetch(`${HUBSPOT_PROXY_URL}/pipelines/deals`);
        const d = await r.json();
        (d.results || []).forEach(p => (p.stages || []).forEach(s => { labelMap[s.id] = s.label; }));
      } catch (e) { console.warn('pipelines error:', e); }

      // 4. Portal / Hubspot URL
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
      } catch (e) { console.warn('portal id error:', e); }
      
      const hubspotUrl = portalId
        ? `https://app.hubspot.com/contacts/${portalId}/deal/${dealId}`
        : `https://app.hubspot.com/contacts/deal/${dealId}`;

      // 5. Final Calculations (DOUBLE NET CONSOLIDATION)
      // Merge properties from core fetch and history fetch to ensure complete data
      const scoringProps = { 
        ...coreData.properties,
        ...dealData.properties 
      };

      // [DEBUG-MATRIX] Audit the consolidated props
      console.log('[DEBUG-PROPS] Consolidated keys:', Object.keys(scoringProps).filter(k => k.includes('nivel') || k.includes('tier')));

      // Universal Sync: Prioritize 'nivel_de_cliente' found in HubSpot
      // Normalize 'masterValue' to ensure we have a clean string for comparison
      const masterLevelValue = String(
        scoringProps.nivel_de_cliente || 
        scoringProps.nivel_de_cliente_partida || 
        scoringProps.tier || 
        ''
      ).trim();
      
      if (masterLevelValue) {
        matrix.criteria?.forEach(c => {
          const propName = (c.hubspot_property || '').toLowerCase();
          const critName = (c.name || '').toLowerCase();
          
          // Typo normalization (handles double underscores '__')
          const normalizedProp = propName.replace(/_+/g, '_');
          const isLevelCriteria = 
            critName.includes('nivel') || 
            critName.includes('tier') || 
            normalizedProp.includes('nivel') || 
            normalizedProp.includes('tier');

          if (isLevelCriteria) {
            // Force injection into BOTH the original property (handle typos) and current scoring context
            scoringProps[c.hubspot_property] = masterLevelValue;
            console.log(`[DEBUG-SYNC] Injected "${masterLevelValue}" into criterion "${c.name}" (${c.hubspot_property})`);
          }
        });
      }

      const { score, detail } = calculateScore(matrix.criteria || [], scoringProps);
      const threshold = getScoreThreshold(score, matrix.score_thresholds || []);
      
      // HEALTH ENGINE (Triple Fallback)
      // 1. Try matrix property, 2. Predictive score, 3. Legacy score, 4. Current calculation as fallback
      const healthSourceProp = matrix.config?.health_property || 'hs_deal_score';
      const rawHealth = dealData.properties[healthSourceProp] || dealData.properties.hs_predictive_deal_score || dealData.properties.hs_deal_score;
      const currentHealth = rawHealth ? Math.round(parseFloat(rawHealth)) : score; // Use current score as last resort

      const trend = 0; 
      const dmi = score != null && currentHealth != null
        ? Math.round((score * 0.50) + (currentHealth * 0.30) + (trend * 0.20))
        : score;

      const enrichedDeal = { 
        ...dealData, 
        score: Number(score) || 0, 
        healthScore: currentHealth,
        dmi,
        matrixName: matrix.name,
        detail: (detail || []).map(d => ({
          ...d,
          weight: Number(d.weight) || 0,
          multiplier: Number(d.multiplier) || 0
        })), 
        threshold, 
      };

      // 6. Historical Data (Search for any valid history)
      const potentialHistoryProps = [healthSourceProp, 'hs_predictive_deal_score', 'hs_deal_score'];
      let hsHistory = [];
      
      for (const prop of potentialHistoryProps) {
        const hist = (dealData.propertiesWithHistory?.[prop] || [])
          .map(h => ({ value: Math.round(parseFloat(h.value)), ts: new Date(h.timestamp) }))
          .filter(h => !isNaN(h.value))
          .reverse();
        
        if (hist.length > 0) {
          hsHistory = hist;
          break;
        }
      }

      // If NO history exists anywhere, generate a flat line based on current score
      if (hsHistory.length === 0) {
        const now = new Date();
        const start = new Date(dealData.properties.hs_createdate || now);
        hsHistory = [
          { value: currentHealth, ts: start },
          { value: currentHealth, ts: now }
        ];
      }

      // 7. Chart Data
      const healthChartData = hsHistory.map((d, i, arr) => ({
        value: d.value, label: formatChartDate(d.ts, i, arr.length),
      }));

      return {
        deal: enrichedDeal,
        healthChartData,
        dmiChartData: [],
        hsHealthHistory: hsHistory,
        labels: labelMap,
        hubspotUrl
      };
    },
    enabled: !!tenantId && !!dealId,
  });
};

function formatChartDate(date, index, total) {
  if (total <= 1) return 'Hoy';
  if (index === 0) return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  if (index === total - 1) return 'Hoy';
  return '';
}
