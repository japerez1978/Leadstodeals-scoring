// Motor de scoring
// Score = ((Σ(peso × multiplicador) + totalPesos) / (totalPesos × 2)) × 100
// Semáforo: ≥70 Alto (green), ≥45 Medio (yellow), <45 Bajo (red)

export function calculateScore(criteria, dealProperties) {
  let sum = 0;
  let totalWeights = 0;
  const detail = [];

  criteria.forEach(criterion => {
    const dealValue = dealProperties[criterion.hubspot_property] ?? null;
    const option = dealValue != null
      ? criterion.criterion_options.find(o => o.hubspot_value === dealValue)
      : null;

    if (option) {
      sum += criterion.weight * option.multiplier;
    }
    totalWeights += criterion.weight;

    detail.push({
      criterion: criterion.name,
      weight: criterion.weight,
      value: dealValue,
      option_label: option?.label ?? null,
      multiplier: option?.multiplier ?? null,
    });
  });

  const score = Math.round(((sum + totalWeights) / (totalWeights * 2)) * 100);
  return { score, detail };
}

export function getScoreThreshold(score, thresholds) {
  const threshold = thresholds.find(th => score >= th.min_score && score <= th.max_score);
  return threshold || { label: 'Desconocido', color: 'gray', emoji: '❓' };
}