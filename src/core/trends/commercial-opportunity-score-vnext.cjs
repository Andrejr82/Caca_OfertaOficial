'use strict';

const { buildBenchmarkContext } = require('./benchmark-peer-engine.cjs');
const { scoreShopeeAchadinhoCandidate } = require('../../../scripts/shopee-achadinho-v12.cjs');

const COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION = 'commercial-opportunity-vnext/1';

const WEIGHTS_VNEXT = Object.freeze({
  campaignability: 30,
  purchaseIntent: 25,
  offerStrength: 20,
  monetization: 15,
  commercialRiskPenalty: 25,
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
  const score = Number(total) || 0;
  if (score >= 80) return 'PRIORIDADE';
  if (score >= 65) return 'TESTAR';
  if (score >= 50) return 'OBSERVAR';
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

function scoreEconomicReturn(candidate) {
  const price = finite(candidate.currentPrice ?? candidate.price);
  const base = parsePercentage(candidate.commissionRate ?? candidate.commissionPercent);
  const seller = parsePercentage(candidate.sellerCommissionRate ?? candidate.sellerCommissionPercent);
  const effectivePercent = (base || 0) + (seller || 0);

  if (!(price > 0) || effectivePercent <= 0) {
    return { score: 0, effectiveCommissionPercent: null, estimatedCommissionPerSale: null, status: 'unknown' };
  }

  // Normalização de anomalias: taxas > 35% ou > 50% (ex: 143%, 83%, 41%)
  // Taxas anômalas no mercado de afiliados são tratadas como inválidas sem conceder bônus artificial
  if (effectivePercent > 35) {
    return {
      score: 0,
      effectiveCommissionPercent: null,
      estimatedCommissionPerSale: null,
      status: 'invalid',
      rawEffectivePercent: effectivePercent,
    };
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

function evaluateCampaignPotential(candidate = {}, context = {}) {
  const normTitle = String(candidate.productName || candidate.product_term || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const pool = Array.isArray(context.pool) ? context.pool : [];
  const benchmark = context.benchmark || buildBenchmarkContext(candidate, pool);
  const economic = scoreEconomicReturn(candidate);

  // 1. ATRIBUTOS SEMÂNTICOS DE DEMONSTRAÇÃO VISUAL (0 - 30)
  // Faixas discriminantes baseadas em transformação visível, interação física e facilidade de roteiro curto:
  // Tier 1 (26 - 30): Transformação/resultado visual imediato, alto impacto em vídeo curto (limpa, escova, corta, fatia, rala, tritura, processa, sela, aspira, ventila, ilumina c/ sensor, imprime)
  // Tier 2 (20 - 25): Forte demonstrabilidade mecânica/eletrônica interativa (câmeras 360, consoles retrô, ferramentas ativas, suportes articulados)
  // Tier 3 (14 - 19): Benefício funcional estabelecido com demonstração moderada (áudio TWS, smartwatch, suportes simples, garrafas, mochilas)
  // Tier 4 (8 - 13): Commodities, produtos estáticos ou baixo diferencial visual (adaptadores simples, benjamim, meias, panos, sabonetes)

  const TIER1_TRANSFORMATION_PATTERNS = [
    /escova\s*(de\s*)?(limpeza|eletrica|giratoria)/i,
    /mop\s*(giratorio|spray|triangular|limpeza)/i,
    /aspirador\s*(portatil|robo|veicular|sem\s*fio)/i,
    /fatiador|ralador|cortador\s*(de\s*)?(legumes|vegetais|verduras|alimentos|frutas)/i,
    /triturador|processador\s*(de\s*)?(alimentos|manual|eletrico)|mini\s*processador/i,
    /mini\s*mixer|mixer\s*(eletrico|portatil|batedor)/i,
    /seladora\s*(de\s*)?(embalagens?|plastico|sacos)/i,
    /ventilador\s*luminaria|luminaria\s*ventilador/i,
    /luminaria\s*(sensor|magnetica|touch)|lampada\s*(sensor|led\s*6\s*pas)/i,
    /mini\s*impressora|impressora\s*termica/i,
    /fita\s*dupla\s*face\s*magica/i,
    /rolo\s*tira\s*pelos|esponja\s*magica|desentupidor\s*pressao/i,
  ];

  const TIER2_DEMONSTRABLE_PATTERNS = [
    /camera\s*(de\s*)?(seguranca|wifi|360|ip|lampada|lente\s*dupla|externa)/i,
    /video\s*game\s*(stick|retro|portatil)|console\s*(portatil|r36s|retro)/i,
    /parafusadeira|furadeira|chave\s*catraca|kit\s*ferramentas|trena\s*laser/i,
    /suporte\s*(articulado|pistao|monitor|tablet|veicular|dobravel|braco\s*articulado)/i,
    /ring\s*light|iluminador\s*led/i,
    /umidificador|difusor(\s*de)?\s*ar|aromatizador/i,
  ];

  const TIER3_FUNCTIONAL_PATTERNS = [
    /fone\s*(de\s*ouvido\s*)?(bluetooth|tws|sem\s*fio|wireless)/i,
    /smartwatch|relogio\s*inteligente/i,
    /suporte\s*(celular|notebook|mesa|parede)/i,
    /power\s*bank|carregador\s*portatil/i,
    /mochila\s*antifurto/i,
    /garrafa\s*(motivacional|squeeze|termica\s*digital)/i,
    /organizador|porta\s*temperos|escorredor/i,
    /chaleira\s*eletrica/i,
    /livro\s*interativo/i,
    /kit\s*2\s*camisetas\s*dry|bermuda\s*compressao/i,
  ];

  let campaignabilityScore = 10;
  const reasons = [];

  if (TIER1_TRANSFORMATION_PATTERNS.some(p => p.test(normTitle))) {
    campaignabilityScore = 28;
    reasons.push('Demonstração visual imediata e alto impacto em vídeo');
  } else if (TIER2_DEMONSTRABLE_PATTERNS.some(p => p.test(normTitle))) {
    campaignabilityScore = 22;
    reasons.push('Utilidade prática com boa demonstrabilidade');
  } else if (TIER3_FUNCTIONAL_PATTERNS.some(p => p.test(normTitle))) {
    campaignabilityScore = 16;
    reasons.push('Benefício funcional estabelecido');
  } else {
    campaignabilityScore = 10;
  }

  // 2. INTENÇÃO DE COMPRA (0 - 25)
  const sales = Math.max(0, finite(candidate.sales ?? candidate.sold_quantity) || 0);
  const rating = finite(candidate.ratingStar ?? candidate.rating) || 4.7;
  let purchaseIntentScore = 0;

  if (sales >= 10000) purchaseIntentScore += 15;
  else if (sales >= 3000) purchaseIntentScore += 12;
  else if (sales >= 1000) purchaseIntentScore += 9;
  else if (sales >= 200) purchaseIntentScore += 6;
  else if (sales > 0) purchaseIntentScore += 3;

  if (rating >= 4.8) purchaseIntentScore += 7;
  else if (rating >= 4.6) purchaseIntentScore += 5;
  else if (rating >= 4.3) purchaseIntentScore += 3;

  if (candidate.marketplaceDemandEvidence?.isBestSeller || context.velocityInfo?.velocity_status === 'computed') {
    purchaseIntentScore += 3;
  }
  purchaseIntentScore = clamp(purchaseIntentScore, 0, 25);
  if (purchaseIntentScore >= 12) {
    reasons.push(`Demanda validada (${sales > 0 ? sales + ' vendas' : 'ativa'}, rating ${rating})`);
  }

  // 3. FORÇA DA OFERTA (0 - 20)
  const price = finite(candidate.currentPrice ?? candidate.price) || 50;
  let offerStrengthScore = 0;
  if (price >= 15 && price <= 80) offerStrengthScore += 7;
  else if (price > 80 && price <= 150) offerStrengthScore += 5;
  else if (price > 150 && price <= 250) offerStrengthScore += 3;
  else offerStrengthScore += 1;

  if (benchmark && benchmark.benchmarkStatus === 'authoritative') {
    if (benchmark.peerConfidence === 'HIGH' || benchmark.peerConfidence === 'MEDIUM') {
      if (typeof benchmark.priceVsMedianPercent === 'number' && benchmark.priceVsMedianPercent >= 0) {
        offerStrengthScore += 8;
        reasons.push(`Preço competitivo (${benchmark.priceVsMedianPercent}% abaixo da mediana)`);
      } else {
        offerStrengthScore += 5;
      }
    }
  } else {
    const discount = finite(candidate.discountPercent ?? candidate.discount_percent) || 0;
    if (discount >= 30) offerStrengthScore += 5;
  }
  offerStrengthScore = clamp(offerStrengthScore, 0, 20);

  // 4. MONETIZAÇÃO (0 - 15)
  let monetizationScore = 0;
  if (economic.status === 'observed' && economic.effectiveCommissionPercent && economic.effectiveCommissionPercent <= 35) {
    const est = economic.estimatedCommissionPerSale || 0;
    if (est >= 10) monetizationScore = 15;
    else if (est >= 5) monetizationScore = 12;
    else if (est >= 2.5) monetizationScore = 9;
    else if (est >= 1.0) monetizationScore = 6;
    else monetizationScore = 3;
    reasons.push(`Comissão factual ${economic.effectiveCommissionPercent}% (~R$ ${est.toFixed(2).replace('.', ',')}/venda)`);
  } else if (economic.status === 'unknown') {
    monetizationScore = 3;
  } else {
    monetizationScore = 0;
  }

  // 5. RISCO COMERCIAL (0 - 25)
  let commercialRiskPenalty = 0;

  const SENSITIVE_CLAIM_PATTERNS = [
    /clareador|manchas|melasma|virilha|axila/i,
    /emagrecer|perder\s*peso|queima\s*gordura|secador\s*barriga/i,
    /calvice|queda\s*cabelo|crescimento\s*capilar/i,
    /creatina|whey|bcaa|termogenico|suplemento/i,
    /rejuvenescimento|antirugas|anti\s*idade/i,
  ];

  const GENERIC_COMMODITY_PATTERNS = [
    /saquinhos\s*maternidade|saco\s*organizador\s*bebe/i,
    /areia\s*(gato|catbio|sanitaria)/i,
    /sabonete\s*liquido|refil\s*sabonete/i,
    /saches\s*para\s*cuidados|amostras\s*gratis/i,
    /kit\s*\d+\s*(pares\s*)?meias?\s*soquete/i,
    /pano\s*de\s*prato|guardanapo/i,
    /elastico\s*(de\s*)?cabelo|xuxinha/i,
  ];

  if (SENSITIVE_CLAIM_PATTERNS.some(p => p.test(normTitle))) {
    commercialRiskPenalty += 24;
  }

  if (GENERIC_COMMODITY_PATTERNS.some(p => p.test(normTitle))) {
    commercialRiskPenalty += 14;
  }

  if (economic.status === 'invalid') {
    commercialRiskPenalty += 6;
  }

  const rawTotal = campaignabilityScore + purchaseIntentScore + offerStrengthScore + monetizationScore - commercialRiskPenalty;
  const totalScore = clamp(Math.round(rawTotal), 0, 100);

  return {
    campaignabilityScore,
    purchaseIntentScore,
    offerStrengthScore,
    monetizationScore,
    commercialRiskPenalty,
    totalScore,
    reasons: reasons.slice(0, 3),
  };
}

function calculateCommercialOpportunityScoreVNext(candidate = {}, context = {}) {
  const pool = Array.isArray(context.pool) ? context.pool : [];
  const benchmark = context.benchmark || buildBenchmarkContext(candidate, pool);
  const integrity = evaluateIntegrityGate(candidate);
  const economic = scoreEconomicReturn(candidate);
  const internal = candidate.internalPerformance || context.internalPerformance || null;

  const campaign = evaluateCampaignPotential(candidate, { ...context, pool, benchmark, economic });

  const total = campaign.totalScore;
  const rawDecision = classifyCommercialDecisionVNext(total);
  const economicsDecision = applyPriorityEconomicsGate(candidate, economic, rawDecision);
  const decision = integrity.passed ? economicsDecision : 'IGNORAR';
  const isShopee = /shopee/i.test(String(candidate.marketplace || candidate.platform || ''));
  const economicsPassedForPriority = !(isShopee && economic.status !== 'observed');

  // Competitiveness for backwards compatibility / benchmark inspection
  let compScore = 0;
  if (benchmark && benchmark.benchmarkStatus === 'authoritative') {
    const currentPrice = finite(candidate.currentPrice ?? candidate.price);
    const min = finite(benchmark.peerPriceMin);
    if (currentPrice > 0 && min > 0) {
      const ratio = currentPrice / min;
      if (ratio <= 1.05) compScore = 30;
      else if (ratio <= 1.15) compScore = 20;
      else if (ratio <= 1.30) compScore = 10;
    }
  }

  const breakdown = {
    campaignability: campaign.campaignabilityScore,
    purchaseIntent: campaign.purchaseIntentScore,
    offerStrength: campaign.offerStrengthScore,
    monetization: campaign.monetizationScore,
    commercialRiskPenalty: campaign.commercialRiskPenalty,
    competitiveness: compScore,
    demandAcceleration: campaign.purchaseIntentScore,
    economicReturn: economic.score,
    reputation: 10,
    executionQuality: 5,
  };

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
    reasons: campaign.reasons,
    determining_reasons: campaign.reasons,
    campaignPotential: campaign,
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
  scoreEconomicReturn,
  evaluateCampaignPotential,
  calculateCommercialOpportunityScoreVNext,
  buildRadarVNextExplainability,
};
