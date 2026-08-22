'use strict';

const { buildBenchmarkContext } = require('./benchmark-peer-engine.cjs');
const { scoreShopeeAchadinhoCandidate } = require('../../../scripts/shopee-achadinho-v12.cjs');

const COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION = 'commercial-opportunity-vnext/1';

const WEIGHTS_VNEXT = Object.freeze({
  competitiveness: 30,
  demandAcceleration: 20,
  offerStrength: 15,
  economicReturn: 10,
  reputation: 10,
  internalConversion: 10,
  executionQuality: 5,
});

function finite(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

function parsePercentage(value) {
  const number = finite(value);
  if (number === null) return null;
  if (number > 0 && number < 1) return Math.round(number * 10000) / 100;
  return Math.round(number * 100) / 100;
}

function classifyCommercialDecisionVNext(total) {
  if (total >= 80) return 'PRIORIDADE';
  if (total >= 65) return 'TESTAR';
  if (total >= 50) return 'OBSERVAR';
  return 'IGNORAR';
}

function applyPriorityEconomicsGate(candidate = {}, economic = {}, rawDecision = 'IGNORAR') {
  if (rawDecision !== 'PRIORIDADE') return rawDecision;
  const marketplace = String(candidate.marketplace || candidate.platform || '').trim();
  const isShopee = /shopee/i.test(marketplace);
  if (isShopee && economic?.status !== 'observed') return 'TESTAR';
  return rawDecision;
}

function evaluateIntegrityGate(candidate = {}) {
  const marketplace = String(candidate.marketplace || candidate.platform || '').trim();
  const isShopee = /shopee/i.test(marketplace);
  const isMl = /mercado\s*livre|mercadolivre|meli/i.test(marketplace);
  const itemId = String(candidate.itemId || candidate.item_id || '').trim();
  const productId = String(candidate.productId || candidate.product_id || '').trim();
  const shopId = String(candidate.shopId || candidate.shop_id || '').trim();
  const price = finite(candidate.currentPrice ?? candidate.price);
  const link = String(candidate.permalink || candidate.product_url || candidate.url || '').trim();
  const image = String(candidate.imageUrl || candidate.image_url || candidate.thumbnail || '').trim();
  const provenance = String(candidate.provenance || '').trim();

  const checks = {
    marketplace: isShopee || isMl,
    identity: isShopee ? Boolean(itemId && shopId) : Boolean(itemId || productId),
    price: price !== null && price > 0,
    link: /^https:\/\//i.test(link),
    image: /^https:\/\//i.test(image),
    provenance: Boolean(provenance),
  };

  return {
    passed: Object.values(checks).every(Boolean),
    checks,
    failed: Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name),
  };
}

function scoreCompetitiveness(candidate, benchmark) {
  if (!benchmark || benchmark.benchmarkStatus !== 'authoritative') return 0;
  const currentPrice = finite(candidate.currentPrice ?? candidate.price);
  const min = finite(benchmark.peerPriceMin);
  if (!(currentPrice > 0) || !(min > 0)) return 0;

  const ratio = currentPrice / min;
  if (ratio <= 1.02) return 30;
  if (ratio <= 1.05) return 26;
  if (ratio <= 1.10) return 22;
  if (ratio <= 1.15) return 18;
  if (ratio <= 1.25) return 10;
  if (ratio <= 1.35) return 5;
  return 0;
}

function scoreDemandAcceleration(candidate, velocityInfo = {}) {
  const velocity = velocityInfo?.velocity_status === 'computed' ? finite(velocityInfo.sales_velocity) : null;
  if (velocity !== null && velocity > 0) {
    if (velocity >= 500) return 20;
    if (velocity >= 200) return 18;
    if (velocity >= 100) return 16;
    if (velocity >= 50) return 14;
    if (velocity >= 10) return 11;
    return 8;
  }

  const evidence = candidate.marketplaceDemandEvidence;
  if (evidence?.type === 'BEST_SELLER') {
    const position = finite(evidence.position);
    if (position !== null && position <= 5) return 18;
    if (position !== null && position <= 20) return 16;
    return 14;
  }

  const sales = Math.max(0, finite(candidate.sales ?? candidate.sold_quantity) || 0);
  if (sales >= 20000) return 14;
  if (sales >= 10000) return 13;
  if (sales >= 5000) return 12;
  if (sales >= 1000) return 10;
  if (sales >= 100) return 7;
  if (sales > 0) return 3;
  return 0;
}

function scoreOfferStrength(candidate, pool = []) {
  try {
    const row = scoreShopeeAchadinhoCandidate(candidate, pool);
    const achadinho = clamp(row?.achadinhoValue, 0, 25);
    const catalogPenalty = Math.min(0, finite(row?.catalogPenalty) || 0);
    const scaled = Math.round((achadinho / 25) * 15);
    return clamp(scaled + Math.round(catalogPenalty / 5), 0, 15);
  } catch (_error) {
    return 0;
  }
}

function scoreEconomicReturn(candidate) {
  const price = finite(candidate.currentPrice ?? candidate.price);
  const base = parsePercentage(candidate.commissionRate ?? candidate.commissionPercent);
  const seller = parsePercentage(candidate.sellerCommissionRate ?? candidate.sellerCommissionPercent);
  const effectivePercent = (base || 0) + (seller || 0);
  if (!(price > 0) || effectivePercent <= 0) {
    return { score: 0, effectiveCommissionPercent: null, estimatedCommissionPerSale: null, status: 'unknown' };
  }

  const estimated = Math.round((price * effectivePercent / 100) * 100) / 100;
  let rateScore = 1;
  if (effectivePercent >= 10) rateScore = 5;
  else if (effectivePercent >= 7) rateScore = 4;
  else if (effectivePercent >= 5) rateScore = 3;
  else if (effectivePercent >= 3) rateScore = 2;

  let valueScore = 1;
  if (estimated >= 20) valueScore = 5;
  else if (estimated >= 10) valueScore = 4;
  else if (estimated >= 5) valueScore = 3;
  else if (estimated >= 2) valueScore = 2;

  return {
    score: clamp(rateScore + valueScore, 0, 10),
    effectiveCommissionPercent: Math.round(effectivePercent * 100) / 100,
    estimatedCommissionPerSale: estimated,
    status: 'observed',
  };
}

function scoreReputation(candidate) {
  const rating = finite(candidate.ratingStar ?? candidate.rating);
  if (rating === null) return 0;
  if (rating >= 4.8) return 10;
  if (rating >= 4.6) return 8;
  if (rating >= 4.3) return 6;
  if (rating >= 4.0) return 4;
  if (rating >= 3.5) return 2;
  return 0;
}

function scoreInternalConversion(internalPerformance) {
  if (!internalPerformance || internalPerformance.matched !== true) {
    return { score: 0, status: 'no_internal_history' };
  }

  const clicks = Math.max(0, finite(internalPerformance.humanProbableClicks ?? internalPerformance.human_probable_clicks) || 0);
  const sales = Math.max(0, finite(internalPerformance.attributedSales ?? internalPerformance.attributed_sales) || 0);

  if (sales > 0) {
    const rate = clicks > 0 ? sales / clicks : 1;
    let score = 5;
    if (rate >= 0.10 || sales >= 5) score = 10;
    else if (rate >= 0.05 || sales >= 2) score = 8;
    else if (rate >= 0.02 || sales >= 1) score = 6;
    return { score, status: 'observed_conversion' };
  }

  if (clicks >= 10) return { score: 0, status: 'observed_zero_conversion' };
  return { score: 0, status: 'insufficient_history' };
}

function scoreExecutionQuality(candidate, integrity) {
  let score = 0;
  if (integrity.checks.identity) score += 1;
  if (integrity.checks.link) score += 1;
  if (integrity.checks.image) score += 1;
  if (integrity.checks.provenance) score += 1;
  if (String(candidate.productName || candidate.product_term || '').trim().length >= 12) score += 1;
  return clamp(score, 0, 5);
}

function calculateCommercialOpportunityScoreVNext(candidate = {}, context = {}) {
  const pool = Array.isArray(context.pool) ? context.pool : [];
  const benchmark = context.benchmark || buildBenchmarkContext(candidate, pool);
  const integrity = evaluateIntegrityGate(candidate);
  const economic = scoreEconomicReturn(candidate);
  const internal = scoreInternalConversion(context.internalPerformance || candidate.internalPerformance);

  const breakdown = {
    competitiveness: scoreCompetitiveness(candidate, benchmark),
    demandAcceleration: scoreDemandAcceleration(candidate, context.velocityInfo || candidate.velocityInfo || {}),
    offerStrength: scoreOfferStrength(candidate, pool),
    economicReturn: economic.score,
    reputation: scoreReputation(candidate),
    internalConversion: internal.score,
    executionQuality: scoreExecutionQuality(candidate, integrity),
  };

  const total = clamp(Object.values(breakdown).reduce((sum, value) => sum + value, 0), 0, 100);
  const rawDecision = classifyCommercialDecisionVNext(total);
  const economicsDecision = applyPriorityEconomicsGate(candidate, economic, rawDecision);
  const decision = integrity.passed ? economicsDecision : 'IGNORAR';
  const isShopee = /shopee/i.test(String(candidate.marketplace || candidate.platform || ''));
  const economicsPassedForPriority = !(isShopee && economic.status !== 'observed');

  return {
    strategyVersion: COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION,
    strategy_version: COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION,
    total,
    commercial_score: total,
    raw_decision: rawDecision,
    decision,
    selection_decision: decision,
    breakdown,
    benchmark,
    economicReturn: economic,
    internalConversion: internal,
    gates: {
      integrity,
      benchmark: {
        passed: benchmark.benchmarkStatus === 'authoritative',
        status: benchmark.benchmarkStatus,
      },
      economics: {
        passedForPriority: economicsPassedForPriority,
        status: economic.status,
      },
    },
  };
}


/**
 * Helper de explainability pura (somente leitura) para auditoria e inspeção do Radar VNext.
 * Extrai todos os blocos determinísticos a partir de um registro de produto materializado/persistido.
 */
function buildRadarVNextExplainability(product = {}) {
  const directEvidence = Array.isArray(product.direct_evidence) && product.direct_evidence.length > 0
    ? (product.direct_evidence[0] || {})
    : {};

  const strategyVersion = directEvidence.strategy_version
    || directEvidence.score_strategy_version
    || null;

  const total = typeof product.commercial_score === 'number'
    ? product.commercial_score
    : (typeof directEvidence.commercial_score === 'number' ? directEvidence.commercial_score : null);

  const decision = product.selection_decision
    ?? directEvidence.selection_decision
    ?? directEvidence.decision
    ?? null;

  const rawDecision = directEvidence.raw_decision
    ?? product.raw_decision
    ?? null;

  const breakdown = product.score_breakdown
    ?? directEvidence.score_breakdown
    ?? null;

  const benchmarkRaw = directEvidence.benchmark ?? null;
  const benchmark = benchmarkRaw ? {
    peerCount: typeof benchmarkRaw.peerCount === 'number' ? benchmarkRaw.peerCount : null,
    peerConfidence: benchmarkRaw.peerConfidence ?? null,
    benchmarkStatus: benchmarkRaw.benchmarkStatus ?? null,
    peerPriceMin: typeof benchmarkRaw.peerPriceMin === 'number' ? benchmarkRaw.peerPriceMin : null,
    peerPriceMedian: typeof benchmarkRaw.peerPriceMedian === 'number' ? benchmarkRaw.peerPriceMedian : null,
    peerPriceMax: typeof benchmarkRaw.peerPriceMax === 'number' ? benchmarkRaw.peerPriceMax : null,
    priceVsMedianPercent: typeof benchmarkRaw.priceVsMedianPercent === 'number' ? benchmarkRaw.priceVsMedianPercent : null,
  } : null;

  const econRaw = directEvidence.economic_return ?? null;
  const economics = {
    status: econRaw?.status ?? directEvidence.commission_status ?? null,
    effectiveCommissionPercent: typeof econRaw?.effectiveCommissionPercent === 'number'
      ? econRaw.effectiveCommissionPercent
      : (typeof directEvidence.effective_commission_percent === 'number' ? directEvidence.effective_commission_percent : null),
    estimatedCommissionPerSale: typeof econRaw?.estimatedCommissionPerSale === 'number'
      ? econRaw.estimatedCommissionPerSale
      : (typeof directEvidence.estimated_commission_per_sale === 'number' ? directEvidence.estimated_commission_per_sale : null),
  };

  const marketplaceIdentity = directEvidence.marketplace_identity ?? null;
  const commercialMetrics = directEvidence.commercial_metrics ?? null;

  return {
    strategyVersion,
    total,
    decision,
    rawDecision,
    breakdown,
    benchmark,
    economics,
    marketplaceIdentity,
    commercialMetrics,
  };
}

module.exports = {
  COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION,
  WEIGHTS_VNEXT,
  classifyCommercialDecisionVNext,
  applyPriorityEconomicsGate,
  evaluateIntegrityGate,
  scoreCompetitiveness,
  scoreDemandAcceleration,
  scoreOfferStrength,
  scoreEconomicReturn,
  scoreReputation,
  scoreInternalConversion,
  scoreExecutionQuality,
  calculateCommercialOpportunityScoreVNext,
  buildRadarVNextExplainability,
};
