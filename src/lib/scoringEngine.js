/**
 * Motor de scoring — compatible con criterios de tipo:
 *   enum         → match exacto de string (case-insensitive) en criterion_options
 *   range        → comparación numérica contra config.ranges
 *   province_map → busca en criterion_options, default config.default_multiplier
 *   sector_map   → igual que province_map
 *
 * Fórmula: ((Σ(peso × multiplicador) + totalPesos) / (totalPesos × 2)) × 100
 * Semáforo: ≥70 Alto, ≥45 Medio, <45 Bajo
 */

export function calculateScore(criteria, dealProperties) {
  let sum = 0;
  let totalWeights = 0;
  const detail = [];

  for (const criterion of criteria) {
    const type = criterion.type || 'enum';
    const config = criterion.config || {};
    const rawValue = dealProperties[criterion.hubspot_property] ?? null;
    const weight = parseFloat(criterion.weight) || 0;
    totalWeights += weight;

    let multiplier = config.default_multiplier ?? 0;
    let matchedLabel = 'Sin dato';

    if (type === 'enum') {
      const opt = (criterion.criterion_options || []).find(o =>
        String(o.hubspot_value).toLowerCase() === String(rawValue ?? '').toLowerCase()
      );
      if (opt) {
        multiplier = parseFloat(opt.multiplier);
        matchedLabel = opt.label || opt.hubspot_value;
      } else if (rawValue !== null) {
        matchedLabel = `${rawValue} (no mapeado)`;
      }

    } else if (type === 'range') {
      const num = parseFloat(rawValue);
      if (!isNaN(num)) {
        const range = (config.ranges || []).find(r =>
          (r.min === null || num >= r.min) && (r.max === null || num < r.max)
        );
        if (range) {
          multiplier = range.multiplier;
          matchedLabel = formatRange(range);
        } else {
          matchedLabel = `${num} (fuera de rango)`;
        }
      }

    } else if (type === 'province_map' || type === 'sector_map') {
      // Busca en criterion_options; si no está, usa default_multiplier
      const opt = (criterion.criterion_options || []).find(o =>
        String(o.hubspot_value).toLowerCase() === String(rawValue ?? '').toLowerCase()
      );
      if (opt) {
        multiplier = parseFloat(opt.multiplier);
        matchedLabel = opt.label || opt.hubspot_value;
      } else if (rawValue !== null) {
        matchedLabel = `${rawValue} (Muy baja)`;
        multiplier = config.default_multiplier ?? -1.0;
      }
    }

    sum += weight * multiplier;

    detail.push({
      criterion: criterion.name,
      type,
      weight,
      multiplier,
      value: rawValue,
      matchedLabel,
    });
  }

  const score = totalWeights > 0
    ? Math.round(((sum + totalWeights) / (totalWeights * 2)) * 100)
    : 0;

  return { score: Math.max(0, Math.min(100, score)), detail };
}

export function getScoreThreshold(score, thresholds) {
  const threshold = thresholds.find(th => score >= th.min_score && score <= th.max_score);
  return threshold || { label: 'Desconocido', color: 'gray', emoji: '❓' };
}

function formatRange(range) {
  if (range.min === null) return `< ${range.max}`;
  if (range.max === null) return `> ${range.min}`;
  return `${range.min} – ${range.max}`;
}
