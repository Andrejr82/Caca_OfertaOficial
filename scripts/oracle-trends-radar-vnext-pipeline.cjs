'use strict';

/**
 * Radar VNext Canonical Pipeline
 *
 * Pipeline oficial e determinístico:
 * discovery -> normalize -> freshness/dedupe -> enrich -> benchmark -> score -> select -> materialize -> persist
 */

const path = require('node:path');
const engine = require('./oracle-trends-radar-engine.cjs');
const freshness = require('./oracle-trends-radar-freshness.cjs');
const dedup = require('./radar-semantic-dedup-v2.cjs');
const { buildBenchmarkContext } = require('../src/core/trends/benchmark-peer-engine.cjs');
const {
  COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION,
  calculateCommercialOpportunityScoreVNext,
} = require('../src/core/trends/commercial-opportunity-score-vnext.cjs');
const { selectRadarVNext } = require('../src/core/trends/radar-vnext-selector.cjs');

const VNEXT_RUNNER_CONTRACT_VERSION = 'trend-executive.oracle-radar-runner/vnext-official-1';

function normalizeShopeeCandidate(item, now = new Date()) {
  const priceIntegrity = engine.normalizePriceIntegrity ? engine.normalizePriceIntegrity({
    price: item.price,
    priceMin: item.priceMin,
    priceMax: item.priceMax,
    priceDiscountRate: item.priceDiscountRate,
    officialOldPrice: item.officialOldPrice,
  }) : { currentPrice: Number(item.currentPrice || item.price || 0), oldPrice: item.oldPrice, discountPercent: item.discountPercent };

  const currentPrice = priceIntegrity.currentPrice || Number(item.currentPrice || item.price || 0);
  const sales = parseInt(String(item.sales || '0'), 10) || (item.sales !== null && item.sales !== undefined ? Number(item.sales) : null);
  const ratingStar = Number(item.ratingStar ?? item.rating) || null;
  const commissionRate = Number(item.commissionPercent ?? item.commissionRate) || 0;
  const sellerCommissionRate = Number(item.sellerCommissionRate) || 0;

  return {
    marketplace: 'Shopee',
    itemId: String(item.itemId || item.item_id || '').trim(),
    productId: null,
    shopId: String(item.shopId || item.shop_id || '').trim(),
    shopName: String(item.shopName || item.shop_name || '').trim(),
    productName: String(item.productName || item.product_name || item.title || '').trim(),
    category: String(item.category || 'Marketplace Deals'),
    currentPrice,
    oldPrice: priceIntegrity.oldPrice || item.oldPrice || null,
    discountPercent: priceIntegrity.discountPercent ?? item.discountPercent ?? 0,
    sales: sales > 0 ? sales : null,
    rating: ratingStar > 0 ? ratingStar : null,
    commissionRate,
    sellerCommissionRate,
    commissionSource: item.commissionSource || (commissionRate > 0 ? 'observed_affiliate_api' : null),
    marketplaceDemandEvidence: {
      salesVolume: sales,
      isBestSeller: sales >= 5000,
      rankingPosition: item.position || null,
    },
    permalink: String(item.permalink || item.offerLink || item.productLink || ''),
    imageUrl: String(item.imageUrl || item.image_url || ''),
    provenance: item.provenance || 'shopee_openapi_productOfferV2',
    evidenceStatus: item.evidenceStatus || 'verified',
    observedAt: item.observedAt || now.toISOString(),
  };
}

function normalizeMlCandidate(item, now = new Date()) {
  const currentPrice = Number(item.currentPrice || item.price || 0);
  const oldPrice = Number(item.oldPrice || item.original_price || item.originalPrice) || null;
  const discountPercent = Number(item.discountPercent || item.discount_percent || item.discount) || (oldPrice && oldPrice > currentPrice ? Math.round(((oldPrice - currentPrice) / oldPrice) * 100) : 0);
  const soldQuantity = item.sales !== null && item.sales !== undefined ? Number(item.sales) : (item.sold_quantity !== null && item.sold_quantity !== undefined ? Number(item.sold_quantity) : null);
  const rating = Number(item.ratingStar ?? item.rating) || null;

  return {
    marketplace: 'Mercado Livre',
    itemId: String(item.itemId || item.item_id || item.id || '').trim(),
    productId: String(item.productId || item.product_id || '').trim() || null,
    shopId: String(item.shopId || item.seller_id || '').trim() || null,
    shopName: String(item.shopName || item.seller_name || item.seller || '').trim(),
    productName: String(item.productName || item.product_term || item.title || '').trim(),
    category: String(item.category || 'Mercado Livre Deals'),
    currentPrice,
    oldPrice,
    discountPercent,
    sales: soldQuantity,
    rating,
    commissionRate: Number(item.commissionPercent ?? item.commissionRate) || 0,
    sellerCommissionRate: 0,
    commissionSource: item.commissionSource || (Number(item.commissionPercent) > 0 ? 'observed' : null),
    marketplaceDemandEvidence: {
      salesVolume: soldQuantity,
      isBestSeller: Boolean(item.is_best_seller || item.isBestSeller || (item.tags && item.tags.includes('best_seller'))),
      rankingPosition: item.position || item.ranking_position || null,
      highlights: item.highlights || [],
    },
    permalink: String(item.permalink || item.url || item.link || ''),
    imageUrl: String(item.imageUrl || item.image_url || item.thumbnail || ''),
    provenance: item.provenance || 'mercadolivre_offers_ssr',
    evidenceStatus: item.evidenceStatus || 'verified',
    observedAt: item.observedAt || now.toISOString(),
  };
}

async function runRadarVNext({
  run,
  client,
  env = process.env,
  now = new Date(),
  shopeeCollector = null,
  mlCollector = null,
  recencyCollector = null,
  offersCollector = null,
  historyCollector = null,
  dryRun = false,
  maxProducts = 20,
  minScore = 0,
} = {}) {
  const startTime = Date.now();
  const runId = run?.id || 'dry-run';
  const radarDate = run?.radar_date || now.toISOString().slice(0, 10);

  // 1. DISCOVERY
  let shopeeResult = { status: 'success', candidates: [], rawCount: 0, errorCode: null, errorMessage: null };
  let mlResult = { status: 'success', candidates: [], rawCount: 0, errorCode: null, errorMessage: null };

  try {
    const rawShopee = shopeeCollector
      ? await shopeeCollector({ env, page: 1 })
      : await engine.collectShopeeMarketplaceCandidates({ env, page: 1 });
    const shopeeArr = Array.isArray(rawShopee) ? rawShopee : (rawShopee?.candidates || []);
    shopeeResult.candidates = shopeeArr.map((item) => normalizeShopeeCandidate(item, now));
    shopeeResult.rawCount = shopeeArr.length;
    shopeeResult.status = shopeeArr.length > 0 ? 'success' : 'empty';
  } catch (err) {
    shopeeResult.status = 'error';
    shopeeResult.errorCode = err.code || 'SHOPEE_COLLECTION_ERROR';
    shopeeResult.errorMessage = err.message || String(err);
    shopeeResult.candidates = [];
  }

  try {
    const rawMl = mlCollector
      ? await mlCollector({ env, page: 1 })
      : await engine.collectMercadoLivreMarketplaceCandidates({ env });
    const mlArr = Array.isArray(rawMl) ? rawMl : (rawMl?.candidates || []);
    mlResult.candidates = mlArr.map((item) => normalizeMlCandidate(item, now));
    mlResult.rawCount = mlArr.length;
    mlResult.status = mlArr.length > 0 ? 'success' : 'empty';
  } catch (err) {
    mlResult.status = 'error';
    mlResult.errorCode = err.code || 'ML_COLLECTION_ERROR';
    mlResult.errorMessage = err.message || String(err);
    mlResult.candidates = [];
  }

  const allRawCandidates = [...shopeeResult.candidates, ...mlResult.candidates];

  // 2. FRESHNESS & DEDUPLICATION
  const recencyInfo = recencyCollector
    ? await recencyCollector(client, now, env)
    : (client ? await freshness.fetchCompletedRadarIdentityKeys(client, now, env) : { recentIdentityKeys: new Set(), runCount: 0 });
  const recentKeys = recencyInfo?.recentIdentityKeys || new Set();

  const existingOfferKeys = offersCollector
    ? await offersCollector(client)
    : (client ? await freshness.fetchExistingOfferIdentityKeys(client) : new Set());

  const previousItemsMap = historyCollector
    ? await historyCollector(client, now, env)
    : (client ? await engine.fetchRecentSnapshotItemsMap(client, now, env) : new Map());

  const internalPerformanceMap = client && engine.fetchInternalPerformanceMap
    ? await engine.fetchInternalPerformanceMap(client, now, env)
    : new Map();

  const freshCandidates = allRawCandidates.filter((candidate) => {
    const key = freshness.getMarketplaceIdentityKey(candidate);
    if (!key) return false;
    if (recentKeys.has(key)) return false;
    if (existingOfferKeys.has(key)) return false;
    return true;
  });

  const dedupResult = dedup.deduplicateCatalogAndSemantic
    ? dedup.deduplicateCatalogAndSemantic(freshCandidates)
    : { uniqueCandidates: freshCandidates };
  const dedupedCandidates = Array.isArray(dedupResult) ? dedupResult : (dedupResult?.uniqueCandidates || freshCandidates);

  // 3. ENRICHMENT & SCORING
  const contextForCandidate = (candidate) => {
    const key = freshness.getMarketplaceIdentityKey(candidate);
    const prev = key && previousItemsMap?.get ? previousItemsMap.get(key) : null;
    const velocityInfo = prev && engine.calculateItemSalesVelocity ? engine.calculateItemSalesVelocity(candidate, prev, now) : null;
    const internalPerformance = key && internalPerformanceMap?.get ? internalPerformanceMap.get(key) : null;

    return {
      benchmark: buildBenchmarkContext(candidate, freshCandidates),
      velocityInfo,
      internalPerformance,
      previousItemsMap,
      internalPerformanceMap,
    };
  };

  const vnextDecisionCounts = { PRIORIDADE: 0, TESTAR: 0, OBSERVAR: 0, IGNORAR: 0 };
  const benchmarkConfidenceCounts = { HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0 };
  const scores = [];

  for (const candidate of dedupedCandidates) {
    const ctx = contextForCandidate(candidate);
    const score = calculateCommercialOpportunityScoreVNext(candidate, { ...ctx, pool: dedupedCandidates });
    scores.push(score.total);

    if (score?.decision && vnextDecisionCounts[score.decision] !== undefined) {
      vnextDecisionCounts[score.decision] += 1;
    }
    const conf = score?.benchmark?.peerConfidence || 'NONE';
    if (benchmarkConfidenceCounts[conf] !== undefined) {
      benchmarkConfidenceCounts[conf] += 1;
    }
  }

  // 4. SELECTION
  const selectedRows = selectRadarVNext(dedupedCandidates, {
    maxProducts,
    minScore,
    maxPerStore: 2,
    maxPerFamily: 3,
    contextForCandidate,
  });

  const selectedProducts = selectedRows.map((row, idx) => engine.materializeTrendRadarProduct({
    candidate: row.candidate,
    score: row.score,
    strategyVersion: COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION,
    rank: idx + 1,
    radarRunId: runId,
    now,
  }));

  const shopeeSelected = selectedProducts.filter((p) => p.marketplace === 'Shopee').length;
  const mlSelected = selectedProducts.filter((p) => p.marketplace === 'Mercado Livre').length;

  const scoreStats = scores.length ? {
    min: Math.min(...scores),
    max: Math.max(...scores),
    avg: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
    median: scores.slice().sort((a, b) => a - b)[Math.floor(scores.length / 2)],
  } : { min: null, max: null, avg: null, median: null };

  const isShopeeError = shopeeResult.status === 'error' || shopeeResult.status === 'rate_limited';
  const isMlError = mlResult.status === 'error' || mlResult.status === 'rate_limited';
  let overallStatus = 'completed';
  if (isShopeeError && isMlError) {
    overallStatus = 'error';
  } else if (isShopeeError || isMlError) {
    overallStatus = 'degraded';
  }

  const strongOpportunityCount = scores.filter(s => s >= 50).length;
  const lowConfidenceSelectedCount = selectedProducts.filter(p => p.commercial_score < 50 || p.selection_decision === 'IGNORAR').length;

  const sourceHealth = {
    runtime: 'oracle',
    status: overallStatus,
    completed_at: new Date().toISOString(),
    duration_ms: Date.now() - startTime,
    official_strategy: COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION,
    vnext_official: true,
    strategy_version: COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION,
    score_strategy_version: COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION,
    viability_version: null,
    shopee_status: shopeeResult.status,
    shopee_candidates_raw: shopeeResult.rawCount,
    shopee_candidates_unique: shopeeResult.candidates.length,
    shopee_selected_count: shopeeSelected,
    shopee_error: shopeeResult.errorMessage,
    mercado_livre_status: mlResult.status,
    mercado_livre_candidates_raw: mlResult.rawCount,
    mercado_livre_candidates_unique: mlResult.candidates.length,
    mercado_livre_selected_count: mlSelected,
    mercado_livre_error: mlResult.errorMessage,
    total_candidates_raw: allRawCandidates.length,
    candidate_pool_count: dedupedCandidates.length,
    valid_candidate_count: dedupedCandidates.length,
    vnext_scored_count: scores.length,
    selected_count: selectedProducts.length,
    total_products_selected: selectedProducts.length,
    strong_opportunity_count: strongOpportunityCount,
    low_confidence_selected_count: lowConfidenceSelectedCount,
    vnext_decision_counts: vnextDecisionCounts,
    benchmark_confidence_counts: benchmarkConfidenceCounts,
    score_distribution: scoreStats,
  };

  const executiveSummary = {
    products_count: selectedProducts.length,
    valid_candidate_count: dedupedCandidates.length,
    strong_opportunity_count: strongOpportunityCount,
    low_confidence_selected_count: lowConfidenceSelectedCount,
    marketplaces: ['Shopee', 'Mercado Livre'],
    top_product: selectedProducts[0]?.product_term || null,
    top_product_score: selectedProducts[0]?.commercial_score || null,
    top_product_decision: selectedProducts[0]?.direct_evidence?.[0]?.decision || null,
    strategy_version: COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION,
    generated_by: 'oracle_radar_commercial_opportunity_vnext_engine',
    contract: VNEXT_RUNNER_CONTRACT_VERSION,
  };

  // 5. PERSISTENCE
  if (client && !dryRun && run?.id) {
    // Delete existing products for this run if any
    await client.from('trend_radar_products').delete().eq('radar_run_id', run.id);

    // Insert new products if any
    if (selectedProducts.length > 0) {
      const { error: insErr } = await client.from('trend_radar_products').insert(selectedProducts);
      if (insErr) throw insErr;
    }

    // Update run
    const { error: updErr } = await client.from('trend_radar_runs').update({
      status: 'completed',
      source_health: sourceHealth,
      executive_summary: executiveSummary,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', run.id);

    if (updErr) throw updErr;
  }

  return {
    processed: true,
    runId,
    productsCount: selectedProducts.length,
    products: selectedProducts,
    sourceHealth,
    executiveSummary,
  };
}

module.exports = {
  VNEXT_RUNNER_CONTRACT_VERSION,
  normalizeShopeeCandidate,
  normalizeMlCandidate,
  runRadarVNext,
};
