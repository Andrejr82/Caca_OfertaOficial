'use strict';

/**
 * Commercial Price Competitiveness & Quantity Normalization — Caça Ofertas Oficial
 *
 * Responsabilidades:
 * 1. Extração determinística de quantidade, volume e unidades a partir do título do produto.
 * 2. Normalização de preço (R$/L, R$/kg, R$/unidade).
 * 3. Identificação de famílias comerciais equivalentes dentro do mesmo run.
 * 4. Avaliação de competitividade relativa de preço entre pares concorrentes.
 */

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(String(value).replace(',', '.'));
  return Number.isFinite(num) ? num : fallback;
}

/**
 * Extrai unidade e quantidade normalizadas a partir do título do produto.
 * Retorna: { unit: 'L' | 'kg' | 'unit' | null, quantity: number | null, rawUnit: string | null }
 */
function extractProductUnitAndQuantity(title = '') {
  const normalized = normalizeText(title);
  if (!normalized) return { unit: null, quantity: null, rawUnit: null };

  // 1. Multiplicadores compostos (ex: 2x 5L, 3x 500ml, 2x 1kg, 4x 500g, 2x 3 un)
  const multMatch = normalized.match(/\b(\d{1,3})\s*x\s*(\d+(?:[.,]\d+)?)\s*(l|litros?|lt|lts|ml|mls|kg|quilos?|kilos?|g|gr|gramas?|unidades?|unids?|un|pecas?|peca|pares?|par|itens|item)\b/);
  if (multMatch) {
    const count = parseInt(multMatch[1], 10);
    const subAmount = parseNumber(multMatch[2], 0);
    const rawUnit = multMatch[3];

    if (count > 0 && subAmount > 0) {
      if (/^(?:l|litros?|lt|lts)$/.test(rawUnit)) {
        return { unit: 'L', quantity: count * subAmount, rawUnit: 'L' };
      }
      if (/^(?:ml|mls)$/.test(rawUnit)) {
        return { unit: 'L', quantity: (count * subAmount) / 1000, rawUnit: 'ml' };
      }
      if (/^(?:kg|quilos?|kilos?)$/.test(rawUnit)) {
        return { unit: 'kg', quantity: count * subAmount, rawUnit: 'kg' };
      }
      if (/^(?:g|gr|gramas?)$/.test(rawUnit)) {
        return { unit: 'kg', quantity: (count * subAmount) / 1000, rawUnit: 'g' };
      }
      if (/^(?:unidades?|unids?|un|pecas?|peca|pares?|par|itens|item)$/.test(rawUnit)) {
        return { unit: 'unit', quantity: count * subAmount, rawUnit: 'unit' };
      }
    }
  }

  // 2. Volume em Litros (L, litros, lt)
  const literMatch = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(?:l|litros?|lt|lts)\b/);
  if (literMatch) {
    const qty = parseNumber(literMatch[1], null);
    if (qty !== null && qty > 0) {
      return { unit: 'L', quantity: qty, rawUnit: 'L' };
    }
  }

  // 3. Volume em Mililitros (ml, mls)
  const mlMatch = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(?:ml|mls)\b/);
  if (mlMatch) {
    const ml = parseNumber(mlMatch[1], null);
    if (ml !== null && ml > 0) {
      return { unit: 'L', quantity: ml / 1000, rawUnit: 'ml' };
    }
  }

  // 4. Peso em Quilos (kg, quilos, kilos)
  const kgMatch = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(?:kg|quilos?|kilos?)\b/);
  if (kgMatch) {
    const qty = parseNumber(kgMatch[1], null);
    if (qty !== null && qty > 0) {
      return { unit: 'kg', quantity: qty, rawUnit: 'kg' };
    }
  }

  // 5. Peso em Gramas (g, gr, gramas)
  const gMatch = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(?:g|gr|gramas?)\b/);
  if (gMatch) {
    const g = parseNumber(gMatch[1], null);
    if (g !== null && g > 0) {
      return { unit: 'kg', quantity: g / 1000, rawUnit: 'g' };
    }
  }

  // 6. Kit / Combo / Pack com N unidades (ex: kit 2, kit com 3, pack 10)
  const kitMatch = normalized.match(/\b(?:kit|combo|pack|conjunto)\s*(?:com|de)?\s*(\d{1,4})\b/);
  if (kitMatch) {
    const count = parseInt(kitMatch[1], 10);
    if (count > 0) {
      return { unit: 'unit', quantity: count, rawUnit: 'kit' };
    }
  }

  // 7. Unidades explícitas (ex: 10 unidades, 2 peças, 5 pares, 3 un)
  const unitMatch = normalized.match(/\b(\d{1,4})\s*(?:unidades?|unids?|un|pecas?|peca|pares?|par|itens|item)\b/);
  if (unitMatch) {
    const count = parseInt(unitMatch[1], 10);
    if (count > 0) {
      return { unit: 'unit', quantity: count, rawUnit: 'unit' };
    }
  }

  return { unit: null, quantity: null, rawUnit: null };
}

/**
 * Calcula o preço normalizado por unidade padrão (R$/L, R$/kg ou R$/unidade).
 */
function calculateNormalizedPrice(priceValue, unitInfo = null) {
  const price = parseNumber(priceValue, null);
  if (price === null || price <= 0) {
    return {
      normalized_price: null,
      normalized_unit: null,
      normalized_quantity: null,
    };
  }

  const unit = unitInfo?.unit || null;
  const quantity = unitInfo?.quantity || null;

  if (unit && quantity && quantity > 0) {
    const normalizedPrice = Math.round((price / quantity) * 100) / 100;
    return {
      normalized_price: normalizedPrice,
      normalized_unit: unit,
      normalized_quantity: quantity,
    };
  }

  return {
    normalized_price: price,
    normalized_unit: 'unit',
    normalized_quantity: 1,
  };
}

const STOP_WORDS_FAMILY = new Set([
  'de', 'da', 'do', 'das', 'dos', 'com', 'para', 'e', 'em', 'a', 'o', 'as', 'os',
  'um', 'uma', 'por', 'na', 'no', 'se', 'ao', 'sem', 'mais', 'menos', 'novo', 'nova',
  'promocao', 'oferta', 'frete', 'gratis', 'original', 'oficial', 'desconto', 'barato',
  'qualidade', 'super', 'alta', 'plus', 'pro', 'max', 'ultra', 'refil', 'galao', 'garrafa',
  'liquido', 'liquida', 'po', 'em', 'frasco', 'pacote', 'embalagem', 'leve', 'pague',
  'kit', 'combo', 'pack', 'conjunto', 'unidades', 'unidade', 'pecas', 'peca', 'pares', 'par'
]);

/**
 * Extrai a chave de família comercial determinística para comparação de preços equivalentes.
 */
function extractCompetitivenessFamilyKey(candidate = {}) {
  const title = candidate.productName || candidate.product_term || candidate.title || '';
  const normalized = normalizeText(title);
  if (!normalized) return 'unknown:unknown';

  // Marcas/linhas comerciais conhecidas com produtos equivalentes frequentes
  const BRANDS_PATTERNS = [
    { brand: 'omo', pattern: /\bomo\b/ },
    { brand: 'ariel', pattern: /\bariel\b/ },
    { brand: 'downy', pattern: /\bdowny\b/ },
    { brand: 'comfort', pattern: /\bcomfort\b/ },
    { brand: 'ypê', pattern: /\b(ype|ype)\b/ },
    { brand: 'dove', pattern: /\bdove\b/ },
    { brand: 'nivea', pattern: /\bnivea\b/ },
    { brand: 'red-bull', pattern: /\bred\s*bull\b/ },
    { brand: 'monster', pattern: /\bmonster\b/ },
    { brand: 'nespresso', pattern: /\bnespresso\b/ },
    { brand: 'dolce-gusto', pattern: /\bdolce\s*gusto\b/ },
    { brand: '3coracoes', pattern: /\b(3\s*coracoes|tres\s*coracoes)\b/ },
    { brand: 'pampers', pattern: /\bpampers\b/ },
    { brand: 'huggies', pattern: /\bhuggies\b/ },
    { brand: 'head-shoulders', pattern: /\bhead\s*(?:&|e)\s*shoulders\b/ },
    { brand: 'pantene', pattern: /\bpantene\b/ },
    { brand: 'elseve', pattern: /\belseve\b/ },
    { brand: 'cremer', pattern: /\bcremer\b/ },
  ];

  for (const { brand, pattern } of BRANDS_PATTERNS) {
    if (pattern.test(normalized)) {
      // Extrai a linha ou sub-produto específico (ex: lavagem perfeita, lavanda, concentrado, etc.)
      const words = normalized.split(/\s+/).filter((w) => {
        if (STOP_WORDS_FAMILY.has(w)) return false;
        if (/^\d+(?:[.,]\d+)?(?:l|ml|kg|g|un)?$/.test(w)) return false;
        if (/^\d+$/.test(w)) return false;
        return true;
      });

      const coreWords = words.filter((w) => !pattern.test(w)).slice(0, 3);
      const subKey = coreWords.length ? coreWords.join('-') : 'geral';
      return `family:${brand}:${subKey}`;
    }
  }

  // Para produtos genéricos / tech / acessórios: extrai tokens essenciais sem ruído
  const tokens = normalized.split(/\s+/).filter((w) => {
    if (STOP_WORDS_FAMILY.has(w)) return false;
    if (/^\d+(?:[.,]\d+)?(?:l|ml|kg|g|un)?$/.test(w)) return false;
    if (/^\d+$/.test(w)) return false;
    return w.length >= 3;
  });

  if (tokens.length >= 2) {
    return `family:${tokens.slice(0, 3).join('-')}`;
  }

  return `family:${tokens[0] || 'geral'}`;
}

/**
 * Avalia se dois candidatos possuem unidades compatíveis para comparação direta de preço.
 */
function areUnitsComparable(unitA, unitB) {
  if (unitA === unitB) return true;
  // Sabão / detergente / produtos de limpeza / consumíveis: L e kg são comparáveis na mesma família
  if ((unitA === 'L' && unitB === 'kg') || (unitA === 'kg' && unitB === 'L')) {
    return true;
  }
  return false;
}

/**
 * Avalia a competitividade de preço de um candidato em relação a seus concorrentes (peers) no mesmo run.
 */
function evaluatePeerPriceCompetitiveness(candidate = {}, peers = []) {
  const price = parseNumber(candidate.currentPrice ?? candidate.price, null);
  const discount = Math.max(0, parseNumber(candidate.discountPercent ?? candidate.priceDiscountRate, 0));

  if (price === null || price <= 0) {
    return {
      score: 0,
      family_key: 'unknown',
      normalized_unit: null,
      normalized_price: null,
      peer_count: 0,
      relative_price_position: 'unfavorable',
      competitiveness_reason: 'Preço inválido ou ausente',
    };
  }

  const title = candidate.productName || candidate.product_term || candidate.title || '';
  const unitInfo = extractProductUnitAndQuantity(title);
  const priceNorm = calculateNormalizedPrice(price, unitInfo);
  const familyKey = extractCompetitivenessFamilyKey(candidate);

  // Filtra pares da mesma família que possuam preço normalizado válido e unidades compatíveis
  const relevantPeers = Array.isArray(peers) ? peers.filter((p) => {
    const peerPrice = parseNumber(p.currentPrice ?? p.price, null);
    if (peerPrice === null || peerPrice <= 0) return false;

    const peerKey = extractCompetitivenessFamilyKey(p);
    if (peerKey !== familyKey) return false;

    const peerTitle = p.productName || p.product_term || p.title || '';
    const peerUnitInfo = extractProductUnitAndQuantity(peerTitle);
    return areUnitsComparable(priceNorm.normalized_unit, peerUnitInfo.unit || 'unit');
  }) : [];

  const peerCount = Math.max(1, relevantPeers.length);

  // Caso 1: Sem concorrentes comparáveis no run (peer_count === 1)
  // Preserva avaliação intrínseca de desconto comercial
  if (relevantPeers.length <= 1) {
    let score = 1;
    if (discount >= 50) score = 10;
    else if (discount >= 35) score = 8;
    else if (discount >= 20) score = 6;
    else if (discount >= 10) score = 4;
    else if (discount > 0) score = 2;

    const reason = discount >= 20
      ? `Desconto promocional expressivo de ${Math.round(discount)}%`
      : (discount > 0 ? `Desconto de ${Math.round(discount)}%` : 'Preço comercial regular');

    return {
      score,
      family_key: familyKey,
      normalized_unit: priceNorm.normalized_unit,
      normalized_price: priceNorm.normalized_price,
      peer_count: 1,
      relative_price_position: 'solo',
      competitiveness_reason: reason,
    };
  }

  // Caso 2: Existem concorrentes comparáveis da mesma família
  const peerNormalizedPrices = relevantPeers.map((p) => {
    const peerPrice = parseNumber(p.currentPrice ?? p.price, 0);
    const peerTitle = p.productName || p.product_term || p.title || '';
    const peerUnitInfo = extractProductUnitAndQuantity(peerTitle);
    return calculateNormalizedPrice(peerPrice, peerUnitInfo).normalized_price;
  }).filter((p) => p !== null && p > 0);

  const minPeerPrice = Math.min(...peerNormalizedPrices);
  const myNormPrice = priceNorm.normalized_price;

  const ratio = myNormPrice / minPeerPrice;
  const unitLabel = priceNorm.normalized_unit === 'unit' ? 'un' : (priceNorm.normalized_unit || 'un');

  let score = 1;
  let relativePosition = 'unfavorable';
  let reason = '';

  if (ratio <= 1.02) {
    // Melhor preço relativo da família
    score = 10;
    relativePosition = 'best_in_family';
    reason = `Melhor preço relativo da família (R$ ${myNormPrice.toFixed(2)}/${unitLabel} vs mín R$ ${minPeerPrice.toFixed(2)})`;
  } else if (ratio <= 1.15) {
    // Até 15% acima do mínimo -> altamente competitivo
    score = discount >= 20 ? 8 : 7;
    relativePosition = 'competitive';
    reason = `Preço competitivo na família (+${Math.round((ratio - 1) * 100)}% do mínimo R$ ${minPeerPrice.toFixed(2)}/${unitLabel})`;
  } else if (ratio <= 1.35) {
    // Até 35% acima do mínimo -> intermediário
    score = discount >= 20 ? 5 : 4;
    relativePosition = 'average';
    reason = `Preço intermediário na família (+${Math.round((ratio - 1) * 100)}% do mínimo R$ ${minPeerPrice.toFixed(2)}/${unitLabel})`;
  } else {
    // Claramente mais caro que os concorrentes da mesma família -> penalidade (score 1)
    score = 1;
    relativePosition = 'unfavorable';
    reason = `Preço desfavorável em relação aos pares da família (R$ ${myNormPrice.toFixed(2)}/${unitLabel} vs mín R$ ${minPeerPrice.toFixed(2)})`;
  }

  return {
    score,
    family_key: familyKey,
    normalized_unit: priceNorm.normalized_unit,
    normalized_price: priceNorm.normalized_price,
    peer_count: peerCount,
    relative_price_position: relativePosition,
    competitiveness_reason: reason,
  };
}

module.exports = {
  extractProductUnitAndQuantity,
  calculateNormalizedPrice,
  extractCompetitivenessFamilyKey,
  areUnitsComparable,
  evaluatePeerPriceCompetitiveness,
};
