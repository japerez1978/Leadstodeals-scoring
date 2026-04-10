import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { calculateScore, getScoreThreshold } from '../lib/scoringEngine';
import ScoreBadge from '../components/ScoreBadge';
import Spinner from '../components/Spinner';

const DashboardPage = () => {
  console.log('DashboardPage render');
  const { tenant } = useAuth();
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [criteria, setCriteria] = useState([]);
  const [thresholds, setThresholds] = useState([]);

  useEffect(() => {
    if (tenant) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [tenant]);

  const fetchData = async () => {
    try {
      // Fetch active matrix
      const { data: matrix, error: matrixError } = await supabase
        .from('scoring_matrices')
        .select('*, criteria(*, criterion_options(*)), score_thresholds(*)')
        .eq('tenant_id', tenant.id)
        .eq('active', true)
        .limit(1)
        .maybeSingle();

      if (matrixError) {
        console.error('Supabase error fetching matrix:', matrixError);
        setDeals([]);
        setCriteria([]);
        setThresholds([]);
        setLoading(false);
        return;
      }

      console.log('Matrices data:', matrix);

      if (!matrix) {
        console.warn('No active matrix found for tenant:', tenant.id);
        setDeals([]);
        setCriteria([]);
        setThresholds([]);
        setLoading(false);
        return;
      }

      setCriteria(matrix.criteria || []);
      setThresholds(matrix.score_thresholds || []);

      // Fetch deals from HubSpot proxy
      const properties = [
        'dealname',
        'amount',
        'dealstage',
        'unidad_de_negocio_deal',
        'prioridad_de_obra__proyecto',
        'ubicacion_provincia_obra__proyecto',
        'madurez_en_adjudicacion_obra__proyecto',
        'tipo_de_obra__proyecto',
        'valor_actual',
        'numero_total_de_depositos',
        'sector_partida',
        'peso_total_cmr_toneladas',
        'hubspot_owner_id'
      ];
      const proxyUrl = `${import.meta.env.VITE_PROXY_URL}/proxy/crm/v3/objects/deals?limit=100&properties=${properties.join(',')}`;
      console.log('DashboardPage fetching deals from proxy URL:', proxyUrl);
      const response = await fetch(proxyUrl);
      console.log('DashboardPage proxy response status:', response.status);
      const hubspotResponse = await response.json();
      const hubspotDeals = hubspotResponse.results || [];
      console.log('DashboardPage proxy first data:', hubspotDeals.slice(0, 3));

      // Calculate scores
      const dealsWithScores = hubspotDeals.map(deal => {
        const score = calculateScore(matrix.criteria || [], deal.properties);
        const threshold = getScoreThreshold(score, matrix.score_thresholds || []);
        return { ...deal, score, threshold };
      });

      setDeals(dealsWithScores);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-[#e8edf5]">
        <Spinner />
        <p className="mt-4 text-sm">Cargando deals...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-[#e8edf5]">
      <h1 className="text-3xl font-bold text-accent">Dashboard</h1>
      <div className="grid gap-4">
        {deals.length === 0 ? (
          <div className="bg-card p-6 rounded-lg border border-border text-[#e8edf5]">
            No hay deals
          </div>
        ) : (
          deals.map(deal => (
            <div key={deal.id} className="bg-card p-4 rounded-lg border border-border">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-[#e8edf5]">{deal.properties.dealname}</h3>
                  <div className="mt-2 flex flex-col gap-1 text-sm text-[#b8bef5]">
                    {deal.properties.amount && (
                      <p>Importe: <span className="font-semibold text-[#e8edf5]">${deal.properties.amount.toLocaleString()}</span></p>
                    )}
                    <p>Score: <span className="font-semibold text-accent">{deal.score}</span></p>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <ScoreBadge score={deal.score} threshold={deal.threshold} />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DashboardPage;