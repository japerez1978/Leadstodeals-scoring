import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import Spinner from '../components/Spinner';

const ScoringPage = () => {
  const { tenant } = useAuth();
  const [matrices, setMatrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatrix, setSelectedMatrix] = useState(null);

  useEffect(() => {
    if (tenant) {
      fetchMatrices();
    }
  }, [tenant]);

  const fetchMatrices = async () => {
    try {
      const { data } = await supabase
        .from('scoring_matrices')
        .select(`
          *,
          criteria (
            *,
            criterion_options (*)
          ),
          score_thresholds (*)
        `)
        .eq('tenant_id', tenant.id)
        .order('name');

      setMatrices(data);
      if (data.length > 0) {
        setSelectedMatrix(data[0]);
      }
    } catch (error) {
      console.error('Error fetching matrices:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateCriterion = async (criterionId, field, value) => {
    await supabase
      .from('criteria')
      .update({ [field]: value })
      .eq('id', criterionId);
    fetchMatrices();
  };

  const updateOption = async (optionId, field, value) => {
    await supabase
      .from('criterion_options')
      .update({ [field]: value })
      .eq('id', optionId);
    fetchMatrices();
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-accent">Scoring Configuration</h1>
      <div className="flex space-x-4">
        <div className="w-1/4">
          <h2 className="text-xl font-semibold text-text mb-4">Matrices</h2>
          {matrices.map(matrix => (
            <div
              key={matrix.id}
              className={`p-2 cursor-pointer rounded ${selectedMatrix?.id === matrix.id ? 'bg-accent text-background' : 'bg-card text-text'}`}
              onClick={() => setSelectedMatrix(matrix)}
            >
              {matrix.name}
            </div>
          ))}
        </div>
        <div className="w-3/4">
          {selectedMatrix && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-text">{selectedMatrix.name}</h2>
              <div>
                <h3 className="text-lg font-semibold text-text mb-4">Criteria</h3>
                {selectedMatrix.criteria.map(criterion => (
                  <div key={criterion.id} className="bg-card p-4 rounded-lg border border-border mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-md font-semibold text-text">{criterion.name}</h4>
                      <input
                        type="number"
                        value={criterion.weight}
                        onChange={(e) => updateCriterion(criterion.id, 'weight', parseFloat(e.target.value))}
                        className="w-20 p-1 bg-background border border-border rounded text-text font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      {criterion.criterion_options.map(option => (
                        <div key={option.id} className="flex justify-between items-center">
                          <span className="text-text">{option.label}</span>
                          <input
                            type="number"
                            step="0.1"
                            value={option.multiplier}
                            onChange={(e) => updateOption(option.id, 'multiplier', parseFloat(e.target.value))}
                            className="w-20 p-1 bg-background border border-border rounded text-text font-mono"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-text mb-4">Thresholds</h3>
                {selectedMatrix.score_thresholds.map(threshold => (
                  <div key={threshold.id} className="bg-card p-2 rounded border border-border mb-2">
                    <span className="text-text">{threshold.label}: {threshold.min_score} - {threshold.max_score} ({threshold.color})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScoringPage;