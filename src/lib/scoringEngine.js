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
  const props =
    dealProperties != null && typeof dealProperties === 'object' && !Array.isArray(dealProperties)
      ? dealProperties
      : {};

  let sum = 0;
  let totalWeights = 0;
  const detail = [];

  for (const criterion of criteria) {
    // [HEALTH-CHECK] Auto-detect type if missing based on options presence
    const hasOptions = (criterion.criterion_options?.length > 0 || criterion.criterion_option?.length > 0);
    const type = criterion.type || (hasOptions ? 'enum' : 'text');
    
    // [HEALTH-CHECK] Ensure config is never truly empty for level-based items
    const config = { 
      default_multiplier: 0,
      ...(criterion.config || {})
    };
    
    const rawValue = props[criterion.hubspot_property] ?? null;
    const weight = parseFloat(criterion.weight) || 0;
    totalWeights += weight;

    let multiplier = config.default_multiplier ?? 0;
    let matchedLabel = rawValue ? `${rawValue} (No mapeado)` : 'Sin dato';

    if (type === 'enum') {
      const opt = (criterion.criterion_options || []).find(o => {
        // Aggressive normalization
        const clean = (val) => String(val || '').toLowerCase().trim().replace(/\s+/g, '');
        const rVal = clean(rawValue);
        
        // Match against BOTH value and label
        const hVal = clean(o.hubspot_value);
        const lVal = clean(o.label);
        
        return hVal === rVal || lVal === rVal || 
               (rVal.length > 2 && (hVal.includes(rVal) || lVal.includes(rVal)));
      });
      if (opt) {
        multiplier = parseFloat(opt.multiplier || 0);
        matchedLabel = opt.label || opt.hubspot_value || String(rawValue);
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
      const opt = (criterion.criterion_options || []).find(o => {
        const hVal = String(o.hubspot_value || '').trim().toLowerCase();
        const rVal = String(rawValue || '').trim().toLowerCase();
        return hVal === rVal;
      });
      if (opt) {
        multiplier = parseFloat(opt.multiplier);
        matchedLabel = opt.label || opt.hubspot_value;
      } else if (rawValue !== null) {
        matchedLabel = `${rawValue} (Muy baja)`;
        multiplier = config.default_multiplier || -1.0;
      }
    }

    // --- GLOBAL INFERENCE ENGINE (Shadow Logic) ---
    // Si no hay match (multiplicador 0 o No mapeado) y el nombre sugiere niveles, deducimos el score del texto
    if (multiplier === 0 || matchedLabel.includes('No mapeado')) {
      const cleanVal = (v) => String(v || '').toLowerCase().trim();
      const rVal = cleanVal(rawValue);
      const name = (criterion.name || '').toLowerCase();
      
      if (name.includes('nivel') || name.includes('tier') || name.includes('prioridad')) {
        console.log(`[ARCHITECT-AUDIT] Running inference for: "${criterion.name}" -> Value: "${rawValue}"`);
        
        if (rVal.includes('1') || rVal.includes('alto') || rVal.includes('alta')) {
          multiplier = 1.0;
          matchedLabel = `${rawValue} (Inferido: Muy Alto)`;
        } else if (rVal.includes('2') || rVal.includes('medio')) {
          multiplier = 0.5;
          matchedLabel = `${rawValue} (Inferido: Medio)`;
        } else if (rVal.includes('3') || rVal.includes('bajo') || rVal.includes('baja')) {
          multiplier = -1.0;
          matchedLabel = `${rawValue} (Inferido: Muy Bajo)`;
        }
        
        if (matchedLabel.includes('Inferido')) {
          console.log(`[ARCHITECT-AUDIT] INFERENCE APPLIED: ${multiplier} for "${criterion.name}"`);
        }
      }
    }

    sum += weight * multiplier;

    detail.push({
      criterion: criterion.name,
      code: criterion.code,
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
