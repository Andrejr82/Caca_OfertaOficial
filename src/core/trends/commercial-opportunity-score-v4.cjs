'use strict';

/**
 * Commercial Opportunity Score V4 — Caça Ofertas Oficial
 *
 * Strategy Version: commercial-opportunity-v4
 * Total Máximo: 100 pontos
 *
 * Distribuição:
 * - marketplaceDemand: 25
 * - economicReturn: 20
 * - internalConversion: 20
 * - reputation: 10
 * - offerCompetitiveness: 10
 * - identityTraceability: 10
 * - visualPotential: 5
 */

const COMMERCIAL_OPPORTUNITY_V4_STRATEGY_VERSION = 'commercial-opportunity-v4';

const WEIGHTS_V4 = Object.freeze({
  marketplaceDemand: 25,
  economicReturn: 20,
  internalConversion: 20,
  reputation: 10,
  offerCompetitiveness: 10,
  identityTraceability: 10,
  visualPotential: 5,
});

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parsePercentage(value) {
  const num = finite(value);
  if (num === null) return null;
  if (num > 0 && num <= 1) return Math.round(num * 10000) / 100;
  return Math.round(num * 100) / 100;
}

/**
 * Classificação estrutural de ticket conforme preço observado:
 * - impulse: price < 100
 * - core: 100 <= price < 500
 * - upper: 500 <= price < 1500
 * - premium: price >= 1500
 */
function classifyTicket(priceValue) {
  const price = finite(priceValue);
  if (price === null || price <= 0) return 'unknown';
  if (price < 100) return 'impulse';
  if (price < 500) return 'core';
  if (price < 1500) return 'upper';
  return 'premium';
}

/**
 * 1. Marketplace Demand — 25 pontos
 * Prioridade:
 * 1. sales_velocity computada (velocity_status === 'computed' && sales_velocity > 0)
 * 2. vendas observadas (fallback)
 * 3. evidência oficial de marketplace (BEST_SELLER ou trend)
 */
function calculateMarketplaceDemand(candidate, velocityInfo) {
  const isVelocityComputed = velocityInfo?.velocity_status === 'computed' &&
    typeof velocityInfo?.sales_velocity === 'number' &&
    Number.isFinite(velocityInfo.sales_velocity);
  const velocity = isVelocityComputed ? velocityInfo.sales_velocity : null;

  if (velocity !== null && velocity > 0) {
    let score = 10;
    if (velocity >= 500) score = 25;
    else if (velocity >= 200) score = 22;
    else if (velocity >= 100) score = 19;
    else if (velocity >= 50) score = 16;
    else if (velocity >= 10) score = 13;
    return {
      score: clamp(score, 0, WEIGHTS_V4.marketplaceDemand),
      reason: `Alta aceleração de vendas comprovada (velocity +${velocity})`,
    };
  }

  // Fallback por vendas observadas
  const rawSales = finite(candidate?.sales ?? candidate?.sold_quantity);
  const sales = rawSales !== null && rawSales > 0 ? Math.floor(rawSales) : null;
  let salesScore = 0;
  if (sales !== null) {
    if (sales >= 10000) salesScore = 16;
    else if (sales >= 5000) salesScore = 14;
    else if (sales >= 1000) salesScore = 12;
    else if (sales >= 100) salesScore = 8;
    else if (sales > 0) salesScore = 4;
  }

  // Evidência oficial de marketplace (Highlights BEST_SELLER ou trending)
  const demandEvidence = candidate?.marketplaceDemandEvidence;
  let officialEvidenceScore = 0;
  let officialEvidenceType = null;
  if (demandEvidence?.type === 'BEST_SELLER') {
    const pos = finite(demandEvidence.position);
    officialEvidenceType = 'BEST_SELLER';
    if (pos !== null && pos <= 5) officialEvidenceScore = 14;
    else if (pos !== null && pos <= 20) officialEvidenceScore = 12;
    else officialEvidenceScore = 10;
  }

  const finalDemandScore = Math.max(salesScore, officialEvidenceScore);

  let reason = 'Sem evidência temporal de demanda observada';
  if (sales !== null && sales >= 1000) {
    reason = `Volume de vendas consolidado (${sales} vendas)`;
  } else if (officialEvidenceType === 'BEST_SELLER') {
    reason = `Destaque oficial Mais Vendido (${demandEvidence.position ? `Top #${demandEvidence.position}` : 'BEST_SELLER'})`;
  } else if (sales !== null && sales >= 100) {
    reason = `Volume de vendas moderado (${sales} vendas)`;
  } else if (sales !== null && sales > 0) {
    reason = `Vendas iniciais observadas (${sales} vendas)`;
  }

  return {
    score: clamp(finalDemandScore, 0, WEIGHTS_V4.marketplaceDemand),
    reason,
  };
}

/**
 * 2. Economic Return — 20 pontos
 * Quando existir comissão factual observada:
 * estimatedCommissionPerSale = price * effectiveCommissionPercent / 100
 *
 * Bandas determinísticas em Reais:
 * >= R$ 40,00: 20 pts
 * >= R$ 20,00: 17 pts
 * >= R$ 10,00: 14 pts
 * >= R$ 5,00: 10 pts
 * >= R$ 2,00: 6 pts
 * > R$ 0,00: 3 pts
 *
 * Sem comissão observada: estimatedCommissionPerSale = null, commissionStatus = 'unknown', 0 pts.
 */
function calculateEconomicReturn(candidate) {
  const price = finite(candidate?.currentPrice ?? candidate?.price);

  const rawBase = parsePercentage(candidate?.commissionRate ?? candidate?.commissionPercent);
  const rawSeller = parsePercentage(candidate?.sellerCommissionRate ?? candidate?.sellerCommissionPercent);

  const hasObservedBase = rawBase !== null && rawBase > 0;
  const hasObservedSeller = rawSeller !== null && rawSeller > 0;

  if (!hasObservedBase && !hasObservedSeller) {
    return {
      score: 0,
      estimatedCommissionPerSale: null,
      effectiveCommissionPercent: null,
      commissionStatus: 'unknown',
      reason: 'Comissão de afiliado não informada publicamente pela fonte',
    };
  }

  const effectiveCommissionPercent = Math.round(((rawBase || 0) + (rawSeller || 0)) * 100) / 100;
  if (!(price > 0) || effectiveCommissionPercent <= 0) {
    return {
      score: 0,
      estimatedCommissionPerSale: 0,
      effectiveCommissionPercent,
      commissionStatus: 'observed',
      reason: 'Comissão observada com retorno financeiro zero',
    };
  }

  const estimatedCommissionPerSale = Math.round((price * effectiveCommissionPercent / 100) * 100) / 100;

  let score = 0;
  if (estimatedCommissionPerSale >= 40.0) score = 20;
  else if (estimatedCommissionPerSale >= 20.0) score = 17;
  else if (estimatedCommissionPerSale >= 10.0) score = 14;
  else if (estimatedCommissionPerSale >= 5.0) score = 10;
  else if (estimatedCommissionPerSale >= 2.0) score = 6;
  else if (estimatedCommissionPerSale > 0.0) score = 3;

  return {
    score: clamp(score, 0, WEIGHTS_V4.economicReturn),
    estimatedCommissionPerSale,
    effectiveCommissionPercent,
    commissionStatus: 'observed',
    reason: `Retorno estimado de R$ ${estimatedCommissionPerSale.toFixed(2)} por venda (${effectiveCommissionPercent.toFixed(1)}%)`,
  };
}

/**
 * 3. Internal Conversion — 20 pontos
 * Somente matching determinístico por IDs oficiais (itemId, shopId, productId, external_id, offerId).
 * NUNCA por nome aproximado.
 *
 * Sinais:
 * - humanProbableClicks
 * - attributedSales
 * - conversionRate = attributedSales / humanProbableClicks
 *
 * Estados:
 * - no_internal_history: sem oferta interna correspondente por ID (score 0, neutro)
 * - insufficient_history: humanProbableClicks < 10 e attributedSales === 0 (score 0, neutro)
 * - observed_conversion: attributedSales > 0 (10 a 20 pts)
 * - observed_zero_conversion: humanProbableClicks >= 10 e attributedSales === 0 (score 0)
 */
function calculateInternalConversion(candidate, options = {}) {
  const internalData = options.internalPerformance || candidate?.internalPerformance;

  if (!internalData || internalData.matched !== true) {
    return {
      score: 0,
      internalConversionStatus: 'no_internal_history',
      humanProbableClicks: 0,
      attributedSales: 0,
      internalConversionRate: null,
      reason: 'Sem histórico de cliques ou conversão interna para este produto',
    };
  }

  const humanClicks = Math.max(0, finite(internalData.humanProbableClicks ?? internalData.human_probable_clicks) || 0);
  const sales = Math.max(0, finite(internalData.attributedSales ?? internalData.attributed_sales) || 0);

  // Venda atribuída é evidência positiva real
  if (sales > 0) {
    const rate = humanClicks > 0 ? (sales / humanClicks) : 1;
    let score = 10;
    if (rate >= 0.10 || sales >= 5) score = 20;
    else if (rate >= 0.05 || sales >= 2) score = 16;
    else if (rate >= 0.02 || sales >= 1) score = 12;

    return {
      score: clamp(score, 0, WEIGHTS_V4.internalConversion),
      internalConversionStatus: 'observed_conversion',
      humanProbableClicks: humanClicks,
      attributedSales: sales,
      internalConversionRate: Math.round(rate * 10000) / 100,
      reason: `Conversão interna comprovada (${sales} venda${sales > 1 ? 's' : ''} atribuída${sales > 1 ? 's' : ''}, ${humanClicks} cliques humanos)`,
    };
  }

  // Amostra representativa sem conversão
  if (humanClicks >= 10) {
    return {
      score: 0,
      internalConversionStatus: 'observed_zero_conversion',
      humanProbableClicks: humanClicks,
      attributedSales: 0,
      internalConversionRate: 0,
      reason: `Amostra interna representativa sem conversão (${humanClicks} cliques humanos, 0 vendas)`,
    };
  }

  // Amostra insuficiente
  return {
    score: 0,
    internalConversionStatus: 'insufficient_history',
    humanProbableClicks: humanClicks,
    attributedSales: 0,
    internalConversionRate: 0,
    reason: `Amostra interna inicial insuficiente (${humanClicks} cliques humanos, 0 vendas)`,
  };
}

/**
 * 4. Reputation — 10 pontos
 * Baseado no rating observado:
 * >= 4.8: 10 pts
 * >= 4.6: 8 pts
 * >= 4.3: 6 pts
 * >= 4.0: 4 pts
 * >= 3.5: 2 pts
 * < 3.5 ou ausente: 0 pts
 */
function calculateReputation(candidate) {
  const rating = finite(candidate?.ratingStar ?? candidate?.rating);
  if (rating === null) {
    return {
      score: 0,
      reason: 'Avaliação da loja/anúncio não informada',
    };
  }

  let score = 0;
  if (rating >= 4.8) score = 10;
  else if (rating >= 4.6) score = 8;
  else if (rating >= 4.3) score = 6;
  else if (rating >= 4.0) score = 4;
  else if (rating >= 3.5) score = 2;

  return {
    score: clamp(score, 0, WEIGHTS_V4.reputation),
    reason: rating >= 4.5
      ? `Avaliação excelente do anunciante (${rating.toFixed(1)}★)`
      : `Avaliação do anunciante (${rating.toFixed(1)}★)`,
  };
}

/**
 * 5. Offer Competitiveness — 10 pontos
 * Desconto real e autoridade de preço:
 * >= 50%: 10 pts
 * >= 35%: 8 pts
 * >= 20%: 6 pts
 * >= 10%: 4 pts
 * > 0%: 2 pts
 * preço regular: 1 pt
 */
function calculateOfferCompetitiveness(candidate) {
  const discount = Math.max(0, finite(candidate?.discountPercent ?? candidate?.priceDiscountRate) || 0);
  const price = finite(candidate?.currentPrice ?? candidate?.price);
  if (price === null || price <= 0) {
    return { score: 0, reason: 'Preço inválido ou ausente' };
  }

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
    score: clamp(score, 0, WEIGHTS_V4.offerCompetitiveness),
    reason,
  };
}

/**
 * 6. Identity Traceability — 10 pontos
 * Rastreabilidade oficial de produto e monetização:
 * - itemId presente: 5 pts
 * - shopId ou productId presente: 2 pts
 * - permalink válido: 2 pts
 * - imageUrl presente: 1 pt
 */
function calculateIdentityTraceability(candidate) {
  let score = 0;
  const hasItem = Boolean(String(candidate?.itemId || '').trim());
  const hasShopOrProduct = Boolean(String(candidate?.shopId || candidate?.productId || '').trim());
  const hasLink = Boolean(String(candidate?.permalink || '').trim());
  const hasImage = Boolean(String(candidate?.imageUrl || '').trim());

  if (hasItem) score += 5;
  if (hasShopOrProduct) score += 2;
  if (hasLink) score += 2;
  if (hasImage) score += 1;

  let reason = 'Identidade comercial de produto e link verificados';
  if (!hasItem || !hasLink) {
    reason = 'Identidade comercial parcial';
  }

  return {
    score: clamp(score, 0, WEIGHTS_V4.identityTraceability),
    reason,
  };
}

/**
 * 7. Visual Potential — 5 pontos
 * Imagem e potencial de conversão visual:
 * - Imagem oficial válida: 3 pts
 * - Título claro e descritivo (>= 15 chars): 1 pt
 * - Sinal de demonstração visual (desconto > 0 ou vídeo ou atributos visuais): 1 pt
 */
function calculateVisualPotential(candidate) {
  let score = 0;
  const hasImage = Boolean(String(candidate?.imageUrl || '').trim());
  const nameLen = String(candidate?.productName || '').trim().length;
  const hasVisualSignal = (finite(candidate?.discountPercent ?? candidate?.priceDiscountRate) || 0) > 0 ||
    Boolean(candidate?.hasVideo);

  if (hasImage) score += 3;
  if (nameLen >= 15) score += 1;
  if (hasVisualSignal) score += 1;

  const reason = hasImage
    ? 'Imagem oficial e apresentação visual adequadas para criativos'
    : 'Apresentação visual básica sem imagem oficial';

  return {
    score: clamp(score, 0, WEIGHTS_V4.visualPotential),
    reason,
  };
}

function classifyCommercialDecision(total) {
  if (total >= 80) return 'PRIORIDADE';
  if (total >= 60) return 'TESTAR';
  return 'IGNORAR';
}

/**
 * Calcula o Commercial Opportunity Score V4 completo de um candidato.
 */
function calculateCommercialOpportunityScoreV4(candidate = {}, options = {}) {
  const velocityInfo = options.velocityInfo || candidate?.velocityInfo;
  const price = finite(candidate?.currentPrice ?? candidate?.price);
  const ticketClass = classifyTicket(price);

  const demand = calculateMarketplaceDemand(candidate, velocityInfo);
  const economic = calculateEconomicReturn(candidate);
  const internal = calculateInternalConversion(candidate, options);
  const reputation = calculateReputation(candidate);
  const competitiveness = calculateOfferCompetitiveness(candidate);
  const traceability = calculateIdentityTraceability(candidate);
  const visual = calculateVisualPotential(candidate);

  const breakdown = {
    marketplaceDemand: demand.score,
    economicReturn: economic.score,
    internalConversion: internal.score,
    reputation: reputation.score,
    offerCompetitiveness: competitiveness.score,
    identityTraceability: traceability.score,
    visualPotential: visual.score,
  };

  const total = clamp(
    Object.values(breakdown).reduce((sum, value) => sum + value, 0),
    0,
    100,
  );

  const determining_reasons = [
    demand.reason,
    economic.reason,
    internal.reason,
    reputation.reason,
    competitiveness.reason,
    traceability.reason,
    visual.reason,
  ].filter(Boolean);

  return {
    strategyVersion: COMMERCIAL_OPPORTUNITY_V4_STRATEGY_VERSION,
    strategy_version: COMMERCIAL_OPPORTUNITY_V4_STRATEGY_VERSION,
    total,
    commercial_score: total,
    commercial_score_v4: total,
    ticket_class: ticketClass,
    decision: classifyCommercialDecision(total),
    breakdown,
    score_breakdown: breakdown,
    determining_reasons,
    economic_return: {
      estimatedCommissionPerSale: economic.estimatedCommissionPerSale,
      effectiveCommissionPercent: economic.effectiveCommissionPercent,
      commissionStatus: economic.commissionStatus,
    },
    internal_conversion: {
      internalConversionStatus: internal.internalConversionStatus,
      humanProbableClicks: internal.humanProbableClicks,
      attributedSales: internal.attributedSales,
      internalConversionRate: internal.internalConversionRate,
    },
  };
}

module.exports = {
  COMMERCIAL_OPPORTUNITY_V4_STRATEGY_VERSION,
  WEIGHTS_V4,
  classifyTicket,
  calculateEconomicReturn,
  calculateInternalConversion,
  calculateMarketplaceDemand,
  calculateReputation,
  calculateOfferCompetitiveness,
  calculateIdentityTraceability,
  calculateVisualPotential,
  classifyCommercialDecision,
  calculateCommercialOpportunityScoreV4,
};
