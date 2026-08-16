'use strict';

const COMMERCIAL_OPPORTUNITY_STRATEGY_VERSION = 'commercial-opportunity-v3';

const WEIGHTS = Object.freeze({
  marketplaceDemand: 25,
  identityQuality: 20,
  priceCompetitiveness: 15,
  commissionPotential: 15,
  visualPotential: 10,
  internalHistory: 10,
  reputation: 5,
});

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function demandScore(candidate, velocityInfo) {
  const velocity = velocityInfo?.velocity_status === 'computed' ? finite(velocityInfo.sales_velocity) : null;
  const sales = Math.max(0, finite(candidate?.sales) || 0);

  if (velocity !== null && velocity > 0) {
    if (velocity >= 500) return 25;
    if (velocity >= 200) return 22;
    if (velocity >= 100) return 19;
    if (velocity >= 50) return 16;
    if (velocity >= 10) return 13;
    return 10;
  }

  // Sem série temporal, volume absoluto é apenas fallback e não pode valer como tendência plena.
  if (sales >= 10000) return 15;
  if (sales >= 5000) return 13;
  if (sales >= 1000) return 11;
  if (sales >= 100) return 8;
  if (sales > 0) return 4;
  return 0;
}

function demandReason(candidate, velocityInfo) {
  const velocity = velocityInfo?.velocity_status === 'computed' ? finite(velocityInfo.sales_velocity) : null;
  const sales = Math.max(0, finite(candidate?.sales) || 0);

  if (velocity !== null && velocity > 0) {
    return `Alta aceleração de vendas (velocity +${velocity})`;
  }
  if (sales >= 1000) {
    return `Volume de vendas consolidado (${sales} vendas)`;
  }
  if (sales >= 100) {
    return `Volume de vendas moderado (${sales} vendas)`;
  }
  return 'Histórico de vendas inicial ou insuficiente';
}

function identityScore(candidate) {
  let score = 0;
  if (String(candidate?.itemId || '').trim()) score += 12;
  if (String(candidate?.permalink || '').trim()) score += 5;
  if (String(candidate?.shopId || candidate?.productId || '').trim()) score += 3;
  return clamp(score, 0, WEIGHTS.identityQuality);
}

function identityReason(candidate) {
  const hasItem = Boolean(String(candidate?.itemId || '').trim());
  const hasLink = Boolean(String(candidate?.permalink || '').trim());
  if (hasItem && hasLink) return 'Identidade de produto e link de marketplace verificados';
  if (hasItem) return 'Identidade de item de marketplace verificada';
  return 'Identidade de marketplace pendente ou parcial';
}

function priceScore(candidate) {
  const discount = Math.max(0, finite(candidate?.discountPercent ?? candidate?.priceDiscountRate) || 0);
  const price = finite(candidate?.currentPrice);
  if (price === null || price <= 0) return 0;
  if (discount >= 40) return 15;
  if (discount >= 25) return 12;
  if (discount >= 15) return 9;
  if (discount >= 5) return 5;
  return 2;
}

function priceReason(candidate) {
  const discount = Math.max(0, finite(candidate?.discountPercent ?? candidate?.priceDiscountRate) || 0);
  if (discount >= 25) return `Desconto competitivo de ${Math.round(discount)}%`;
  if (discount > 0) return `Desconto promocional de ${Math.round(discount)}%`;
  return 'Preço comercial regular sem desconto ativo';
}

function commissionScore(candidate) {
  const base = Math.max(0, finite(candidate?.commissionRate ?? candidate?.commissionPercent) || 0);
  const seller = Math.max(0, finite(candidate?.sellerCommissionRate) || 0);
  const total = base + seller;
  if (total >= 15) return 15;
  if (total >= 10) return 13;
  if (total >= 7) return 10;
  if (total >= 5) return 8;
  if (total >= 3) return 5;
  if (total > 0) return 2;
  return 0;
}

function commissionReason(candidate) {
  const base = Math.max(0, finite(candidate?.commissionRate ?? candidate?.commissionPercent) || 0);
  const seller = Math.max(0, finite(candidate?.sellerCommissionRate) || 0);
  const total = base + seller;
  if (total >= 7) return `Comissão de afiliado expressiva (${total.toFixed(1)}%)`;
  if (total > 0) return `Comissão de afiliado ativa (${total.toFixed(1)}%)`;
  return 'Sem comissão de afiliado registrada';
}

function visualScore(candidate) {
  let score = 0;
  if (String(candidate?.imageUrl || '').trim()) score += 6;
  if (String(candidate?.productName || '').trim().length >= 12) score += 2;
  if ((finite(candidate?.discountPercent ?? candidate?.priceDiscountRate) || 0) > 0) score += 2;
  return clamp(score, 0, WEIGHTS.visualPotential);
}

function visualReason(candidate) {
  if (String(candidate?.imageUrl || '').trim()) return 'Catálogo com imagem disponível para conversão';
  return 'Imagem de catálogo ausente';
}

function historyScore(internalPerformance) {
  if (!internalPerformance || internalPerformance.verified !== true) return 0;
  return clamp(internalPerformance.score, 0, WEIGHTS.internalHistory);
}

function historyReason(internalPerformance) {
  if (internalPerformance?.verified === true) return `Histórico interno verificado (${internalPerformance.score}/10)`;
  return 'Sem histórico interno validado';
}

function reputationScore(candidate) {
  const rating = finite(candidate?.ratingStar ?? candidate?.rating);
  if (rating === null) return 0;
  if (rating >= 4.8) return 5;
  if (rating >= 4.6) return 4;
  if (rating >= 4.3) return 3;
  if (rating >= 4.0) return 2;
  return 0;
}

function reputationReason(candidate) {
  const rating = finite(candidate?.ratingStar ?? candidate?.rating);
  if (rating !== null && rating >= 4.5) return `Avaliação positiva do anunciante (${rating.toFixed(1)}★)`;
  return 'Avaliação comercial padrão';
}

function classifyCommercialDecision(total) {
  if (total >= 80) return 'PRIORIDADE';
  if (total >= 60) return 'TESTAR';
  return 'IGNORAR';
}

function calculateCommercialOpportunityScoreV3(candidate, options = {}) {
  const velocityInfo = options.velocityInfo || candidate?.velocityInfo;
  const internalPerformance = options.internalPerformance || candidate?.internalPerformance;

  const breakdown = {
    marketplaceDemand: demandScore(candidate, velocityInfo),
    identityQuality: identityScore(candidate),
    priceCompetitiveness: priceScore(candidate),
    commissionPotential: commissionScore(candidate),
    visualPotential: visualScore(candidate),
    internalHistory: historyScore(internalPerformance),
    reputation: reputationScore(candidate),
  };

  const total = clamp(
    Object.values(breakdown).reduce((sum, value) => sum + value, 0),
    0,
    100,
  );

  const determining_reasons = [
    demandReason(candidate, velocityInfo),
    identityReason(candidate),
    priceReason(candidate),
    commissionReason(candidate),
    visualReason(candidate),
    historyReason(internalPerformance),
    reputationReason(candidate),
  ].filter(Boolean);

  return {
    strategyVersion: COMMERCIAL_OPPORTUNITY_STRATEGY_VERSION,
    total,
    commercial_score: total,
    decision: classifyCommercialDecision(total),
    breakdown,
    score_breakdown: breakdown,
    determining_reasons,
  };
}

module.exports = {
  COMMERCIAL_OPPORTUNITY_STRATEGY_VERSION,
  WEIGHTS,
  calculateCommercialOpportunityScoreV3,
  classifyCommercialDecision,
};
