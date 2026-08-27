'use strict';

/**
 * Runner de Teste Isolado de Eficácia: Configuração dos 7 Nichos Comerciais vs Legacy.
 *
 * Executa estritamente a comparação:
 * MESMO MOTOR + CONFIGURAÇÃO LEGACY
 * VERSUS
 * MESMO MOTOR + CONFIGURAÇÃO NOVA
 *
 * Totalmente isolado do runtime ativo: zero persistência, zero writes, zero chamadas a Supabase.
 */

const { getCommercialNiche, COMMERCIAL_NICHE_IDS } = require('../commercial-niche-config.cjs');
const { buildNicheMarketplacePlan } = require('../commercial-niche-runtime-adapter.cjs');
const { getMarketplaceScenarioContract } = require('../marketplace-scenario-contracts.cjs');

const { runAmazonScenarioDryRun } = require('../amazon-native-top20-v5.cjs');
const {
  GRAPHQL_CONTRACTS,
  normalizeProductOffer,
  SCENARIO_QUERY_PLANS,
} = require('../shopee-openapi-shadow-engine-v1.cjs');
const { runMercadoLivreOfficialIntentCoverage, refreshAccessToken } = require('../mercadolivre-official-intents-v5.cjs');
const { evaluateFirstDiscoveryCandidate } = require('../first-discovery-candidate-quality.cjs');
const { assessFirstDiscoveryReadiness, matchesFirstDiscoveryIntent } = require('../first-discovery-quality.cjs');

const NICHE_TO_LEGACY_SCENARIOS = Object.freeze({
  casa_cozinha_organizacao: ['casa_cozinha_editorial', 'organizacao_editorial'],
  beleza: ['beleza_editorial'],
  moda: ['moda_editorial'],
  eletrodomesticos: ['eletrodomesticos_editorial'],
  informatica: ['informatica_editorial'],
  ferramentas: ['ferramentas_editorial'],
  pet: ['pet_editorial'],
});

function normalizeText(val) {
  return String(val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function containsTerm(haystack, needle) {
  const normH = ` ${normalizeText(haystack)} `;
  const normN = ` ${normalizeText(needle)} `;
  return normN.trim() ? normH.includes(normN) : false;
}

/**
 * Executor de teste Shopee GraphQL OpenAPI (Test Harness isolado).
 * Reutiliza exatamente GRAPHQL_CONTRACTS.productOfferV2.query e normalizeProductOffer do motor existente,
 * recebendo keywords e categoryIds diretamente da configuração a ser testada (legacy ou new niche).
 */
async function executeShopeeHarnessQuery({
  keywords = [],
  categoryIds = [],
  request,
  maxPages = 1,
  pageSize = 20,
} = {}) {
  if (typeof request !== 'function') throw new Error('executeShopeeHarnessQuery requer request injetado');

  const calls = [];
  const productOffers = [];

  const callProduct = async (variables, sourcePlan) => {
    for (let page = 1; page <= maxPages; page += 1) {
      try {
        const response = await request(
          'ShopeePromotionOffers',
          GRAPHQL_CONTRACTS.productOfferV2.query,
          { ...variables, page, limit: pageSize, sortType: 2, isAMSOffer: true }
        );
        const nodes = response?.data?.data?.productOfferV2?.nodes || [];
        calls.push({
          source: sourcePlan,
          page,
          status: response?.status || 200,
          requested: variables,
          returned: nodes.length,
        });
        productOffers.push(...nodes);
        if (nodes.length === 0) break;
      } catch (err) {
        calls.push({
          source: sourcePlan,
          page,
          status: 'error',
          requested: variables,
          error: err.message || String(err),
        });
        break;
      }
    }
  };

  for (const keyword of keywords) {
    await callProduct({ keyword }, 'productOfferV2.keyword');
  }

  for (const productCatId of categoryIds) {
    await callProduct({ productCatId: Number(productCatId) }, 'productOfferV2.category');
  }

  const products = productOffers.map((node) => {
    const norm = normalizeProductOffer(node, { source: 'productOfferV2' });
    return norm.product;
  });

  return { products, queries: calls };
}

/**
 * Calcula métricas objetivas a partir de uma lista de produtos e do contrato do nicho.
 */
function extractEfficacyMetrics(products = [], queries = [], nicheContract = null, options = {}) {
  const rawCount = products.length;
  const niche = nicheContract || {};
  const coreList = niche.coreProducts || [];
  const expansionList = niche.expansionProducts || [];
  const allowedTerms = niche.guardrails?.allowedProductTerms || [];
  const blockedTerms = niche.guardrails?.blockedProductTerms || [];

  const seenIds = new Set();
  let duplicateCount = 0;
  let invalidPriceCount = 0;
  let outOfNicheCount = 0;
  let accessoriesNoiseCount = 0;
  let validCount = 0;
  let strongCandidatesCount = 0;

  const distinctFoundFamilies = new Set();
  const coveredCore = new Set();
  const coveredExpansion = new Set();

  let ratingSum = 0;
  let ratingCount = 0;
  let discountSum = 0;
  let discountCount = 0;
  let salesSum = 0;
  let salesCount = 0;
  let outOfStockCount = null; // null se indisponível no marketplace

  const rejectionReasons = {
    blocked_term: 0,
    out_of_niche: 0,
    invalid_price: 0,
    duplicate: 0,
  };

  for (const p of products) {
    const id = String(p.asin || p.sourceItemId || p.item_id || p.product_id || p.itemId || p.id || p.canonical_url || '');
    if (id && seenIds.has(id)) {
      duplicateCount += 1;
      rejectionReasons.duplicate += 1;
      continue;
    }
    if (id) seenIds.add(id);

    const title = p.title || p.productName || p.product_name || '';
    const price = Number(p.price || p.priceMin || p.current_price || p.currentPrice || 0);

    if (!price || price <= 0) {
      invalidPriceCount += 1;
      rejectionReasons.invalid_price += 1;
      continue;
    }

    // Checagem de ruído / acessórios bloqueados
    const hasBlocked = blockedTerms.some((term) => containsTerm(title, term));
    if (hasBlocked) {
      accessoriesNoiseCount += 1;
      rejectionReasons.blocked_term += 1;
      continue;
    }

    // Checagem de pertencimento ao nicho
    const hasAllowed = allowedTerms.length === 0 || allowedTerms.some((term) => containsTerm(title, term));
    if (!hasAllowed) {
      outOfNicheCount += 1;
      rejectionReasons.out_of_niche += 1;
      continue;
    }

    validCount += 1;

    // Avaliação de candidato forte vinculado à intent correspondente
    const matchingIntent = options.intents?.find((i) => matchesFirstDiscoveryIntent(i, p.title || p.productName || ''));
    const candidateEval = evaluateFirstDiscoveryCandidate({
      marketplace: options.marketplace || 'Generic',
      candidate: p,
      intent: matchingIntent,
    });
    if (candidateEval.strong) {
      strongCandidatesCount += 1;
    }

    // Cobertura Core e Expansion
    for (const core of coreList) {
      if (containsTerm(title, core)) {
        coveredCore.add(core);
        distinctFoundFamilies.add(core);
      }
    }
    for (const exp of expansionList) {
      if (containsTerm(title, exp)) {
        coveredExpansion.add(exp);
        distinctFoundFamilies.add(exp);
      }
    }

    // Ratings / Descontos / Vendas quando disponíveis
    if (p.rating != null && !isNaN(Number(p.rating))) {
      ratingSum += Number(p.rating);
      ratingCount += 1;
    } else if (p.ratingStar != null && !isNaN(Number(p.ratingStar))) {
      ratingSum += Number(p.ratingStar);
      ratingCount += 1;
    }

    if (p.discount != null && !isNaN(Number(p.discount))) {
      discountSum += Number(p.discount);
      discountCount += 1;
    } else if (p.priceDiscountRate != null && !isNaN(Number(p.priceDiscountRate))) {
      discountSum += Number(p.priceDiscountRate);
      discountCount += 1;
    }

    if (p.sales != null && !isNaN(Number(p.sales))) {
      salesSum += Number(p.sales);
      salesCount += 1;
    }

    if (p.out_of_stock != null) {
      if (outOfStockCount === null) outOfStockCount = 0;
      if (p.out_of_stock) outOfStockCount += 1;
    }
  }

  const rejectedCount = rawCount - validCount;
  const coreCoveragePercent = coreList.length > 0 ? (coveredCore.size / coreList.length) * 100 : 0;
  const expansionCoveragePercent = expansionList.length > 0 ? (coveredExpansion.size / expansionList.length) * 100 : 0;
  const productDiversity = distinctFoundFamilies.size;

  const relevancePercent = rawCount > 0 ? (validCount / rawCount) * 100 : 0;
  const noisePercent = rawCount > 0 ? ((accessoriesNoiseCount + outOfNicheCount) / rawCount) * 100 : 0;

  const apiErrors = (queries || []).filter((q) => q.status === 'error' || q.error).map((q) => q.error || q.status);
  const rateLimit429Count = (queries || []).filter((q) => String(q.error || '').includes('429') || q.status === 429).length;

  const queriesAttempted = Array.isArray(queries) ? queries.length : 0;
  const queriesSucceeded = Array.isArray(queries)
    ? queries.filter((q) => q.status === 'ok' || q.status === 200 || !q.error).length
    : 0;

  const readiness = assessFirstDiscoveryReadiness({
    affinity: options.affinity || 2,
    extracted: rawCount,
    afterRelevance: validCount,
    afterQualityGate: validCount,
    strongCandidates: strongCandidatesCount,
    distinctEditorialFamilies: distinctFoundFamilies.size,
    coreFamiliesCovered: coveredCore.size,
    queriesAttempted,
    queriesSucceeded,
  }, { affinity: options.affinity || 2, targets: options.targets });

  return {
    rawCount,
    validCount,
    rejectedCount,
    rejectionReasons,
    duplicateCount,
    productDiversity,
    familyCoverage: distinctFoundFamilies.size,
    strongCandidates: strongCandidatesCount,
    sourceHealth: readiness.reasons.includes('source_health_degraded') ? 'degraded' : 'healthy',
    readiness: readiness.ready ? 'ready' : 'not_ready',
    readinessReasons: readiness.reasons,
    readinessDetails: readiness,
    coreCoveragePercent: Number(coreCoveragePercent.toFixed(1)),
    expansionCoveragePercent: Number(expansionCoveragePercent.toFixed(1)),
    outOfNicheCount,
    accessoriesNoiseCount,
    invalidPriceCount,
    outOfStockCount, // null se não suportado pelo marketplace
    rating: ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(2)) : null,
    salesPopularity: salesCount > 0 ? Number((salesSum / salesCount).toFixed(0)) : null,
    discount: discountCount > 0 ? Number((discountSum / discountCount).toFixed(1)) : null,
    latencyMs: Number(options.latencyMs || 0),
    apiErrors,
    rateLimit429Count,
    eligibleCount: validCount,
    scores: {
      relevance: Number(relevancePercent.toFixed(1)),
      coreCoverage: Number(coreCoveragePercent.toFixed(1)),
      quality: validCount > 0 ? Number(((validCount / Math.max(1, rawCount)) * 100).toFixed(1)) : 0,
      noise: Number(noisePercent.toFixed(1)),
      diversity: productDiversity,
      familyCoverage: distinctFoundFamilies.size,
      strongCandidates: strongCandidatesCount,
    },
  };
}

/**
 * Avalia delta entre legacy e new para uma métrica numérica.
 */
function evaluateMetricDelta(legacyVal, newVal, higherIsBetter = true) {
  if (legacyVal == null || newVal == null) {
    return { legacy: legacyVal, new: newVal, delta: null, deltaPercent: null, status: 'INSUFFICIENT_DATA' };
  }

  const delta = Number((newVal - legacyVal).toFixed(2));
  const deltaPercent = legacyVal !== 0 ? Number(((delta / Math.abs(legacyVal)) * 100).toFixed(1)) : (newVal > 0 ? 100 : 0);

  let status = 'EQUIVALENT';
  if (Math.abs(delta) > 0.01) {
    if (higherIsBetter) {
      status = delta > 0 ? 'IMPROVED' : 'WORSE';
    } else {
      status = delta < 0 ? 'IMPROVED' : 'WORSE';
    }
  }

  return { legacy: legacyVal, new: newVal, delta, deltaPercent, status };
}

/**
 * Compara dois conjuntos de métricas de eficácia.
 */
function compareEfficacyMetrics(legacyMetrics, newMetrics) {
  return {
    rawCount: evaluateMetricDelta(legacyMetrics.rawCount, newMetrics.rawCount, true),
    validCount: evaluateMetricDelta(legacyMetrics.validCount, newMetrics.validCount, true),
    rejectedCount: evaluateMetricDelta(legacyMetrics.rejectedCount, newMetrics.rejectedCount, false),
    duplicateCount: evaluateMetricDelta(legacyMetrics.duplicateCount, newMetrics.duplicateCount, false),
    productDiversity: evaluateMetricDelta(legacyMetrics.productDiversity, newMetrics.productDiversity, true),
    familyCoverage: evaluateMetricDelta(legacyMetrics.familyCoverage, newMetrics.familyCoverage, true),
    strongCandidates: evaluateMetricDelta(legacyMetrics.strongCandidates, newMetrics.strongCandidates, true),
    coreCoveragePercent: evaluateMetricDelta(legacyMetrics.coreCoveragePercent, newMetrics.coreCoveragePercent, true),
    expansionCoveragePercent: evaluateMetricDelta(legacyMetrics.expansionCoveragePercent, newMetrics.expansionCoveragePercent, true),
    accessoriesNoiseCount: evaluateMetricDelta(legacyMetrics.accessoriesNoiseCount, newMetrics.accessoriesNoiseCount, false),
    outOfNicheCount: evaluateMetricDelta(legacyMetrics.outOfNicheCount, newMetrics.outOfNicheCount, false),
    invalidPriceCount: evaluateMetricDelta(legacyMetrics.invalidPriceCount, newMetrics.invalidPriceCount, false),
    rating: evaluateMetricDelta(legacyMetrics.rating, newMetrics.rating, true),
    discount: evaluateMetricDelta(legacyMetrics.discount, newMetrics.discount, true),
    latencyMs: evaluateMetricDelta(legacyMetrics.latencyMs, newMetrics.latencyMs, false),
    eligibleCount: evaluateMetricDelta(legacyMetrics.eligibleCount, newMetrics.eligibleCount, true),
    relevanceScore: evaluateMetricDelta(legacyMetrics.scores?.relevance, newMetrics.scores?.relevance, true),
    noiseScore: evaluateMetricDelta(legacyMetrics.scores?.noise, newMetrics.scores?.noise, false),
  };
}

/**
 * Executa comparação de eficácia para um nicho em um marketplace específico.
 * Usa estritamente o MESMO motor/executor para legacy e new.
 */
async function runMarketplaceNicheEfficacyComparison(nicheId, marketplace, options = {}) {
  const niche = getCommercialNiche(nicheId);
  if (!niche) throw new Error(`Nicho comercial não encontrado: ${nicheId}`);

  const legacyScenarios = NICHE_TO_LEGACY_SCENARIOS[nicheId] || [];
  const market = String(marketplace || '').trim();

  const newPlan = buildNicheMarketplacePlan(nicheId, market, options);

  let legacyProducts = [];
  let legacyQueries = [];
  let legacyLatencyMs = 0;
  let newProducts = [];
  let newQueries = [];
  let newLatencyMs = 0;

  // Extrair lista de queries do novo plano (usando intents do firstDiscovery quando disponíveis)
  const newKeywords = newPlan.firstDiscovery?.intents
    ? newPlan.firstDiscovery.intents.flatMap((i) => i.queries)
    : (newPlan.terms.all || []);

  // 1. AMAZON: Motor = runAmazonScenarioDryRun
  if (market === 'Amazon') {
    const executor = options.amazonExecutor || runAmazonScenarioDryRun;

    // Execução Legacy (mescla cenários legados se múltiplos, ex: casa + organização)
    const legStart = Date.now();
    for (const legId of legacyScenarios) {
      const legContract = getMarketplaceScenarioContract(legId, 'Amazon');
      if (!legContract) continue;
      const res = await executor({
        scenario: {
          id: legId,
          scenarioId: legId,
          keywords: legContract.keywords || [],
          browseNodeIds: legContract.browseNodeIds || [],
          allowedProductTerms: legContract.allowedProductTerms || [],
          blockedProductTerms: legContract.blockedProductTerms || [],
        },
        candidateLimit: 10,
        fetchImpl: options.fetchImpl,
      });
      if (Array.isArray(res?.products)) legacyProducts.push(...res.products);
      if (Array.isArray(res?.queries)) legacyQueries.push(...res.queries);
    }
    legacyLatencyMs = Date.now() - legStart;

    // Execução New Niche
    const newStart = Date.now();
    const newRes = await executor({
      scenario: {
        id: newPlan.nicheId,
        scenarioId: newPlan.nicheId,
        keywords: newKeywords,
        browseNodeIds: newPlan.contract?.amazonBrowseNodes || [],
        allowedProductTerms: newPlan.contract?.guardrails?.allowedProductTerms || [],
        blockedProductTerms: newPlan.contract?.guardrails?.blockedProductTerms || [],
      },
      candidateLimit: newPlan.rules?.candidateLimit || 10,
      fetchImpl: options.fetchImpl,
    });
    newLatencyMs = Date.now() - newStart;
    if (Array.isArray(newRes?.products)) newProducts.push(...newRes.products);
    if (Array.isArray(newRes?.queries)) newQueries.push(...newRes.queries);
  }

  // 2. SHOPEE: Motor = executeShopeeHarnessQuery (Reutilizando GRAPHQL_CONTRACTS e normalizeProductOffer)
  else if (market === 'Shopee') {
    const executor = options.shopeeExecutor || executeShopeeHarnessQuery;

    // Execução Legacy (Keywords e categorias do contrato legacy)
    const legStart = Date.now();
    for (const legId of legacyScenarios) {
      const legContract = getMarketplaceScenarioContract(legId, 'Shopee');
      const legPlan = SCENARIO_QUERY_PLANS[legId];
      const legKeywords = legPlan?.keywords || legContract?.keywords || [];
      const legCategories = legPlan?.categoryIds || legContract?.apiCategories || [];

      const res = await executor({
        keywords: legKeywords,
        categoryIds: legCategories,
        request: options.shopeeRequest,
      });
      if (Array.isArray(res?.products)) legacyProducts.push(...res.products);
      if (Array.isArray(res?.queries)) legacyQueries.push(...res.queries);
    }
    legacyLatencyMs = Date.now() - legStart;

    // Execução New Niche (Keywords e categorias do newPlan)
    const newStart = Date.now();
    const newRes = await executor({
      keywords: newKeywords,
      categoryIds: newPlan.contract?.shopeeApiCategories || [],
      request: options.shopeeRequest,
    });
    newLatencyMs = Date.now() - newStart;
    if (Array.isArray(newRes?.products)) newProducts.push(...newRes.products);
    if (Array.isArray(newRes?.queries)) newQueries.push(...newRes.queries);
  }

  // 3. MERCADO LIVRE: Motor = runMercadoLivreOfficialIntentCoverage
  else if (market === 'Mercado Livre') {
    const executor = options.mercadoLivreExecutor || runMercadoLivreOfficialIntentCoverage;
    const accessToken = options.accessToken || (typeof refreshAccessToken === 'function' ? await refreshAccessToken({ persist: false }) : null);

    // Execução Legacy
    const legStart = Date.now();
    for (const legId of legacyScenarios) {
      const legContract = getMarketplaceScenarioContract(legId, 'Mercado Livre');
      if (!legContract) continue;
      const res = await executor({
        accessToken,
        keywords: legContract.keywords || [],
        maxPerIntent: 10,
        delayMs: options.delayMs ?? 300,
        fetchImpl: options.fetchImpl,
      });
      if (Array.isArray(res?.products)) legacyProducts.push(...res.products);
      if (Array.isArray(res?.queries)) legacyQueries.push(...res.queries);
    }
    legacyLatencyMs = Date.now() - legStart;

    // Execução New Niche
    const newStart = Date.now();
    const newRes = await executor({
      accessToken,
      keywords: newKeywords,
      maxPerIntent: newPlan.rules?.candidateLimit || 10,
      delayMs: options.delayMs ?? 300,
      fetchImpl: options.fetchImpl,
    });
    newLatencyMs = Date.now() - newStart;
    if (Array.isArray(newRes?.products)) newProducts.push(...newRes.products);
    if (Array.isArray(newRes?.queries)) newQueries.push(...newRes.queries);
  }

  const legacyMetrics = extractEfficacyMetrics(legacyProducts, legacyQueries, niche, {
    latencyMs: legacyLatencyMs,
    marketplace: market,
    affinity: newPlan?.affinity,
    targets: newPlan?.firstDiscovery?.targets,
    intents: newPlan?.firstDiscovery?.intents,
  });
  const newMetrics = extractEfficacyMetrics(newProducts, newQueries, niche, {
    latencyMs: newLatencyMs,
    marketplace: market,
    affinity: newPlan?.affinity,
    targets: newPlan?.firstDiscovery?.targets,
    intents: newPlan?.firstDiscovery?.intents,
  });
  const comparison = compareEfficacyMetrics(legacyMetrics, newMetrics);

  return {
    nicheId,
    nicheName: niche.name,
    marketplace: market,
    legacyScenarios,
    affinity: newPlan?.affinity,
    legacy: legacyMetrics,
    new: newMetrics,
    comparison,
  };
}

/**
 * Executa a suíte completa de eficácia (7 nichos x 3 marketplaces) e gera relatório estruturado.
 */
async function runFullCommercialNicheEfficacySuite(options = {}) {
  const startedAt = new Date().toISOString();
  const marketplaces = options.marketplaces || ['Amazon', 'Shopee', 'Mercado Livre'];
  const nicheIds = options.nicheIds || COMMERCIAL_NICHE_IDS;

  const comparisons = [];
  let improvedCount = 0;
  let equivalentCount = 0;
  let worseCount = 0;
  let insufficientDataCount = 0;

  for (const nicheId of nicheIds) {
    for (const marketplace of marketplaces) {
      try {
        const result = await runMarketplaceNicheEfficacyComparison(nicheId, marketplace, options);
        comparisons.push(result);

        // Agregação de status
        for (const metricComparison of Object.values(result.comparison || {})) {
          if (metricComparison.status === 'IMPROVED') improvedCount += 1;
          else if (metricComparison.status === 'EQUIVALENT') equivalentCount += 1;
          else if (metricComparison.status === 'WORSE') worseCount += 1;
          else if (metricComparison.status === 'INSUFFICIENT_DATA') insufficientDataCount += 1;
        }
      } catch (err) {
        comparisons.push({
          nicheId,
          marketplace,
          error: err.message || String(err),
          status: 'EXECUTION_FAILED',
        });
      }
    }
  }

  return {
    generatedAt: startedAt,
    mode: 'read_only_efficacy_test',
    totalComparisons: comparisons.length,
    comparisons,
    summary: {
      totalMetricsEvaluated: improvedCount + equivalentCount + worseCount + insufficientDataCount,
      improvedMetrics: improvedCount,
      equivalentMetrics: equivalentCount,
      worseMetrics: worseCount,
      insufficientDataMetrics: insufficientDataCount,
    },
    writes: {
      supabase: 0,
      offers: 0,
      posts: 0,
      publications: 0,
    },
  };
}

module.exports = {
  NICHE_TO_LEGACY_SCENARIOS,
  executeShopeeHarnessQuery,
  extractEfficacyMetrics,
  evaluateMetricDelta,
  compareEfficacyMetrics,
  runMarketplaceNicheEfficacyComparison,
  runFullCommercialNicheEfficacySuite,
};
