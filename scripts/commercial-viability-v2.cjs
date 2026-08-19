'use strict';

/**
 * Commercial Viability V2 — Caça Ofertas Oficial
 *
 * Princípios fundamentais:
 * 1. Fatos observados: nunca inventar preço, vendas, rating, comissão, desconto ou velocidade.
 * 2. Comportamento fail-closed para dados ausentes.
 * 3. Classificação: high | medium | low | insufficient_data.
 * 4. Ticket como diagnóstico: ticket baixo não é reprovado se tiver demanda e comissão fortes.
 * 5. sales_velocity somente quando velocity_status === 'computed'.
 * 6. low é excluído do Radar; insufficient_data não ocupa vagas comerciais principais.
 */

const COMMERCIAL_VIABILITY_STRATEGY_VERSION = 'commercial-viability/v2';

function parseNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(String(value).replace(',', '.'));
  return Number.isFinite(num) ? num : fallback;
}

function normalizePercentage(value) {
  const num = parseNumber(value, null);
  if (num === null) return null;
  if (num > 0 && num < 1) return Math.round(num * 10000) / 100;
  return Math.round(num * 100) / 100;
}

/**
 * Avalia a viabilidade comercial de um candidato para o Radar.
 */
function calculateCommercialViabilityV2(candidate = {}, options = {}) {
  const marketplace = String(candidate.marketplace || candidate.platform || 'unknown').trim();
  const price = parseNumber(candidate.currentPrice ?? candidate.price, null);

  // 1. Verificação de dados mínimos essenciais (Preço)
  if (price === null || price <= 0) {
    return {
      strategy_version: COMMERCIAL_VIABILITY_STRATEGY_VERSION,
      classification: 'insufficient_data',
      effectiveCommissionPercent: 0,
      estimatedCommissionPerSale: null,
      reasons: ['Preço ausente ou não positivo no runtime'],
      isViable: false,
      diagnostic: {
        price_observed: price,
        sales_observed: null,
        rating_observed: null,
        commission_observed: null,
        sales_velocity: null,
        velocity_used: false,
        ticket_class: 'invalid',
      },
    };
  }

  // 2. Extração de comissão observada
  const rawComm = normalizePercentage(candidate.commissionRate ?? candidate.commissionPercent);
  const rawSellerComm = normalizePercentage(candidate.sellerCommissionRate ?? candidate.sellerCommissionPercent);
  const effectiveCommissionPercent = (rawComm !== null && rawComm > 0 ? rawComm : 0) +
    (rawSellerComm !== null && rawSellerComm > 0 ? rawSellerComm : 0);

  const hasObservedCommission = rawComm !== null && rawComm > 0;
  const estimatedCommissionPerSale = hasObservedCommission && effectiveCommissionPercent > 0 && price > 0
    ? Math.round((price * effectiveCommissionPercent / 100) * 100) / 100
    : null;

  // 3. Extração de demanda e velocidade
  const rawSales = parseNumber(candidate.sales ?? candidate.sold_quantity, null);
  const sales = rawSales !== null && rawSales >= 0 ? Math.floor(rawSales) : null;

  const rawRating = parseNumber(candidate.ratingStar ?? candidate.rating, null);
  const rating = rawRating !== null && rawRating >= 1 && rawRating <= 5 ? Math.round(rawRating * 100) / 100 : null;

  const discountPercent = parseNumber(candidate.discountPercent ?? candidate.priceDiscountRate, 0);

  // 4. Tratamento estrito de sales_velocity
  const velocityInfo = candidate.velocityInfo || candidate.velocity_info || {};
  const isVelocityComputed = velocityInfo.velocity_status === 'computed' &&
    typeof velocityInfo.sales_velocity === 'number' &&
    Number.isFinite(velocityInfo.sales_velocity);
  const salesVelocity = isVelocityComputed ? velocityInfo.sales_velocity : null;

  // 5. Diagnóstico de ticket
  let ticketClass = 'medium_ticket';
  if (price < 10) ticketClass = 'micro_ticket';
  else if (price < 30) ticketClass = 'low_ticket';
  else if (price >= 150) ticketClass = 'high_ticket';

  const reasons = [];

  // 6. Regras de descarte estrito (LOW)
  if (rating !== null && rating < 3.5) {
    reasons.push(`poor_rating_below_threshold: Reprovado por avaliação baixa (${rating} < 3.5)`);
    return {
      strategy_version: COMMERCIAL_VIABILITY_STRATEGY_VERSION,
      classification: 'low',
      effectiveCommissionPercent,
      estimatedCommissionPerSale,
      reasons,
      isViable: false,
      diagnostic: {
        price_observed: price,
        sales_observed: sales,
        rating_observed: rating,
        commission_observed: rawComm,
        sales_velocity: salesVelocity,
        velocity_used: isVelocityComputed,
        ticket_class: ticketClass,
      },
    };
  }

  if (price < 5 && (estimatedCommissionPerSale === null || estimatedCommissionPerSale < 0.20) && (sales === null || sales < 50)) {
    reasons.push(`micro_ticket_negligible_return: Descartado por micro ticket sem retorno viável (preço R$ ${price.toFixed(2)} e baixa demanda)`);
    return {
      strategy_version: COMMERCIAL_VIABILITY_STRATEGY_VERSION,
      classification: 'low',
      effectiveCommissionPercent,
      estimatedCommissionPerSale,
      reasons,
      isViable: false,
      diagnostic: {
        price_observed: price,
        sales_observed: sales,
        rating_observed: rating,
        commission_observed: rawComm,
        sales_velocity: salesVelocity,
        velocity_used: isVelocityComputed,
        ticket_class: ticketClass,
      },
    };
  }

  // 7. Classificação HIGH
  const hasStrongSales = sales !== null && sales >= 100;
  const hasStrongVelocity = isVelocityComputed && salesVelocity !== null && salesVelocity > 0;
  const hasViableCommissionValue = estimatedCommissionPerSale !== null && estimatedCommissionPerSale >= 2.00;
  const hasStrongCommissionRate = effectiveCommissionPercent >= 5.0;

  let isHigh = false;

  if ((hasStrongSales || hasStrongVelocity) && (hasViableCommissionValue || hasStrongCommissionRate) && price >= 15) {
    isHigh = true;
    reasons.push('Forte demanda com comissão comercialmente viável');
  } else if (price >= 80 && sales !== null && sales >= 20 && (effectiveCommissionPercent >= 3.0 || (estimatedCommissionPerSale !== null && estimatedCommissionPerSale >= 3.0))) {
    isHigh = true;
    reasons.push('Alto ticket com demanda e comissão atrativas');
  } else if (price < 30 && sales !== null && sales >= 400 && (estimatedCommissionPerSale !== null && estimatedCommissionPerSale >= 1.0)) {
    isHigh = true;
    reasons.push('Alta demanda de giro rápido com retorno viável por venda');
  }

  if (isHigh) {
    return {
      strategy_version: COMMERCIAL_VIABILITY_STRATEGY_VERSION,
      classification: 'high',
      effectiveCommissionPercent,
      estimatedCommissionPerSale,
      reasons,
      isViable: true,
      diagnostic: {
        price_observed: price,
        sales_observed: sales,
        rating_observed: rating,
        commission_observed: rawComm,
        sales_velocity: salesVelocity,
        velocity_used: isVelocityComputed,
        ticket_class: ticketClass,
      },
    };
  }

  // 8. Guard de evidência mínima antes de classificar como MEDIUM
  // Sem vendas observadas, sem comissão, sem velocity e sem destaque oficial (ex: BEST_SELLER) → não há base factual para medium.
  // Fail-closed: retorna insufficient_data para não ocupar vagas comerciais principais.
  const hasMarketplaceBestSeller = candidate?.marketplaceDemandEvidence?.type === 'BEST_SELLER';
  const hasObservedDemand = (sales !== null && sales >= 1) || hasMarketplaceBestSeller;
  const hasObservedRevenue = effectiveCommissionPercent > 0 || (estimatedCommissionPerSale !== null && estimatedCommissionPerSale > 0);
  const hasObservedVelocity = isVelocityComputed;

  if (!hasObservedDemand && !hasObservedRevenue && !hasObservedVelocity) {
    return {
      strategy_version: COMMERCIAL_VIABILITY_STRATEGY_VERSION,
      classification: 'insufficient_data',
      effectiveCommissionPercent,
      estimatedCommissionPerSale,
      reasons: ['Preço válido mas sem evidência de demanda, comissão, velocidade ou destaque comprovado observado'],
      isViable: false,
      diagnostic: {
        price_observed: price,
        sales_observed: sales,
        rating_observed: rating,
        commission_observed: rawComm,
        sales_velocity: salesVelocity,
        velocity_used: isVelocityComputed,
        ticket_class: ticketClass,
        best_seller_evidence: hasMarketplaceBestSeller ? candidate.marketplaceDemandEvidence : null,
      },
    };
  }

  // 9. Classificação MEDIUM — há pelo menos uma evidência factual de viabilidade
  if (hasMarketplaceBestSeller) {
    const pos = candidate.marketplaceDemandEvidence.position ? ` pos #${candidate.marketplaceDemandEvidence.position}` : '';
    reasons.push(`Destaque oficial comprovado no marketplace (${candidate.marketplaceDemandEvidence.source}: ${candidate.marketplaceDemandEvidence.type}${pos})`);
  } else {
    reasons.push('Viabilidade comercial padrão validada');
  }
  return {
    strategy_version: COMMERCIAL_VIABILITY_STRATEGY_VERSION,
    classification: 'medium',
    effectiveCommissionPercent,
    estimatedCommissionPerSale,
    reasons,
    isViable: true,
    diagnostic: {
      price_observed: price,
      sales_observed: sales,
      rating_observed: rating,
      commission_observed: rawComm,
      sales_velocity: salesVelocity,
      velocity_used: isVelocityComputed,
      ticket_class: ticketClass,
    },
  };
}

function isViableForRadar(viabilityResult = {}) {
  const classification = viabilityResult.classification || 'insufficient_data';
  return classification === 'high' || classification === 'medium';
}

module.exports = {
  COMMERCIAL_VIABILITY_STRATEGY_VERSION,
  calculateCommercialViabilityV2,
  isViableForRadar,
};
