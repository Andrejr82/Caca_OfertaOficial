'use strict';

const COMMERCIAL_VIABILITY_VERSION = 'shopee-commercial-viability-v2';

function finiteOptional(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function classifyTicketBand(priceValue) {
  const price = finiteOptional(priceValue);
  if (price === null || price <= 0) return 'unknown';
  if (price < 10) return 'micro';
  if (price < 30) return 'low';
  if (price < 100) return 'medium';
  return 'high';
}

function resolveEffectiveCommissionPercent(candidate = {}) {
  const base = finiteOptional(candidate.commissionRate ?? candidate.commissionPercent);
  const seller = finiteOptional(candidate.sellerCommissionRate);
  if (base === null && seller === null) return null;
  return round(Math.min(100, Math.max(0, base || 0) + Math.max(0, seller || 0)), 4);
}

function resolveDemandStrength(candidate = {}, velocityInfo = null) {
  const computedVelocity = velocityInfo?.velocity_status === 'computed'
    ? finiteOptional(velocityInfo.sales_velocity)
    : null;

  if (computedVelocity !== null) {
    let strength = 0.2;
    if (computedVelocity >= 500) strength = 1.5;
    else if (computedVelocity >= 200) strength = 1.3;
    else if (computedVelocity >= 100) strength = 1.2;
    else if (computedVelocity >= 50) strength = 1.1;
    else if (computedVelocity >= 10) strength = 1;
    else if (computedVelocity > 0) strength = 0.9;

    return {
      demandBasis: 'sales_velocity',
      demandStrength: strength,
      observedSales: finiteOptional(candidate.sales),
      observedSalesVelocity: computedVelocity,
    };
  }

  const sales = finiteOptional(candidate.sales);
  if (sales === null) {
    return {
      demandBasis: 'none',
      demandStrength: 0,
      observedSales: null,
      observedSalesVelocity: null,
    };
  }

  let strength = 0;
  if (sales >= 10000) strength = 1;
  else if (sales >= 5000) strength = 0.85;
  else if (sales >= 1000) strength = 0.65;
  else if (sales >= 100) strength = 0.4;
  else if (sales > 0) strength = 0.2;

  return {
    demandBasis: 'sales',
    demandStrength: strength,
    observedSales: sales,
    observedSalesVelocity: null,
  };
}

function classifyViability({
  price,
  effectiveCommissionPercent,
  estimatedCommissionPerSale,
  demandBasis,
  demandStrength,
}) {
  if (
    price === null
    || price <= 0
    || effectiveCommissionPercent === null
    || estimatedCommissionPerSale === null
    || demandBasis === 'none'
  ) {
    return 'insufficient_data';
  }

  const potentialReturnIndex = estimatedCommissionPerSale * demandStrength;
  if (potentialReturnIndex >= 5) return 'high';
  if (potentialReturnIndex >= 1) return 'medium';
  if (potentialReturnIndex >= 0.5 && demandStrength >= 0.85) return 'medium';
  return 'low';
}

function assessCommercialViabilityV2(candidate = {}, velocityInfo = null) {
  const price = finiteOptional(candidate.currentPrice);
  const ticketBand = classifyTicketBand(price);
  const effectiveCommissionPercent = resolveEffectiveCommissionPercent(candidate);
  const estimatedCommissionPerSale = (
    price !== null
    && price > 0
    && effectiveCommissionPercent !== null
  )
    ? round(price * effectiveCommissionPercent / 100, 4)
    : null;

  const demand = resolveDemandStrength(candidate, velocityInfo);
  const potentialReturnIndex = estimatedCommissionPerSale === null
    ? null
    : round(estimatedCommissionPerSale * demand.demandStrength, 4);

  const commercialViabilityStatus = classifyViability({
    price,
    effectiveCommissionPercent,
    estimatedCommissionPerSale,
    demandBasis: demand.demandBasis,
    demandStrength: demand.demandStrength,
  });

  const priceRangeAmbiguous = candidate.priceRangeAmbiguous === true;
  const priceAuthority = candidate.priceAuthority ?? null;
  const reasons = [];

  if (ticketBand !== 'unknown') reasons.push(`Faixa de ticket: ${ticketBand}`);
  if (effectiveCommissionPercent === null) reasons.push('Comissão não disponível; retorno por venda não calculado');
  else reasons.push(`Comissão efetiva observada: ${effectiveCommissionPercent}%`);

  if (demand.demandBasis === 'none') reasons.push('Demanda real indisponível');
  else if (demand.demandBasis === 'sales_velocity') reasons.push('Demanda baseada em velocidade de vendas calculada');
  else reasons.push('Demanda baseada em volume de vendas observado');

  if (priceRangeAmbiguous) {
    reasons.push('Preço representa faixa/variação; usar retorno apenas como estimativa diagnóstica');
  }

  reasons.push(`Viabilidade comercial: ${commercialViabilityStatus}`);

  return {
    version: COMMERCIAL_VIABILITY_VERSION,
    ticketBand,
    price,
    priceAuthority,
    priceRangeAmbiguous,
    effectiveCommissionPercent,
    estimatedCommissionPerSale,
    demandBasis: demand.demandBasis,
    demandStrength: demand.demandStrength,
    observedSales: demand.observedSales,
    observedSalesVelocity: demand.observedSalesVelocity,
    potentialReturnIndex,
    commercialViabilityStatus,
    reasons,
  };
}

module.exports = {
  COMMERCIAL_VIABILITY_VERSION,
  assessCommercialViabilityV2,
  classifyTicketBand,
  resolveDemandStrength,
  resolveEffectiveCommissionPercent,
};
