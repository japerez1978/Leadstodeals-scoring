// Motor de scoring
// Score = ((Σ(peso × multiplicador) + totalPesos) / (totalPesos × 2)) × 100
// Semáforo: ≥70 Alto (green), ≥45 Medio (yellow), <45 Bajo (red)

export function calculateScore(criteria, dealProperties) {
  let sum = 0;
  let totalWeights = 0;

  criteria.forEach(criterion => {
    const hubspotProperty = criterion.hubspot_property;
    const dealValue = dealProperties[hubspotProperty];

    if (dealValue !== undefined && dealValue !== null) {
      const option = criterion.criterion_options.find(opt => opt.hubspot_value === dealValue);
      if (option) {
        sum += criterion.weight * option.multiplier;
      }
    }
    totalWeights += criterion.weight;
  });

  const score = ((sum + totalWeights) / (totalWeights * 2)) * 100;
  return Math.round(score);
}

export function getScoreThreshold(score, thresholds) {
  const threshold = thresholds.find(th => score >= th.min_score && score <= th.max_score);
  return threshold || { label: 'Desconocido', color: 'gray', emoji: '❓' };
}