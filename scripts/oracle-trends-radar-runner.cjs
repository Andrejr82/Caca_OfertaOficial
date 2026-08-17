'use strict';

const { createClient } = require('@supabase/supabase-js');
const engine = require('./oracle-trends-radar-engine.cjs');
const achadinhoV12 = require('./shopee-achadinho-v12.cjs');
const mlDiscoveryV1 = require('./mercadolivre-radar-discovery-v1.cjs');
const mlOpportunityV1 = require('./mercadolivre-opportunity-v1.cjs');
const {
  fetchCompletedRadarIdentityKeys,
  fetchExistingOfferIdentityKeys,
  filterCandidatesOutsidePreviousSnapshot,
  getMarketplaceIdentityKey,
  getMarketplaceImageUrl,
  withMarketplaceImageEvidence,
} = require('./oracle-trends-radar-freshness.cjs');

const DEDICATED_RUNTIME_ENV = 'TRENDS_RADAR_DEDICATED_RUNTIME';

function isDedicatedTrendRadarRuntimeEnabled(env = process.env) {
  const value = String(env?.[DEDICATED_RUNTIME_ENV] ?? '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function isEditorialTrendRadarConsumer(options = {}) {
  return Boolean(options?.stageLogger) && options?.dedicatedRuntime !== true;
}

function shouldRunTrendRadarConsumer({ env = process.env, dedicatedRuntime = false, stageLogger = null } = {}) {
  if (stageLogger && !dedicatedRuntime) return false;
  return dedicatedRuntime || !isDedicatedTrendRadarRuntimeEnabled(env);
}

function createRadarAdminClient(env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function persistFreshnessHealth(client, runId, freshness) {
  if (!client || !runId) return;
  const { data: run, error: readError } = await client
    .from('trend_radar_runs')
    .select('source_health,executive_summary')
    .eq('id', runId)
    .maybeSingle();
  if (readError || !run) return;

  await client
    .from('trend_radar_runs')
    .update({
      source_health: {
        ...(run.source_health || {}),
        strategy_version: achadinhoV12.ACHADINHO_STRATEGY_VERSION,
        shopee_strategy_version: achadinhoV12.ACHADINHO_STRATEGY_VERSION,
        mercado_livre_strategy_version: mlOpportunityV1.ML_OPPORTUNITY_STRATEGY_VERSION,
        freshness_gate: 'exclude_all_completed_radar_and_existing_offers',
        latest_completed_run_id: freshness.latestCompletedRunId,
        completed_run_count: freshness.completedRunCount,
        historical_radar_identity_count: freshness.historicalRadarIdentityCount,
        existing_offer_identity_count: freshness.existingOfferIdentityCount,
        shopee_historical_candidates_excluded: freshness.shopeeHistoricalExcluded,
        mercado_livre_historical_candidates_excluded: freshness.mlHistoricalExcluded,
        shopee_existing_offer_candidates_excluded: freshness.shopeeExistingOfferExcluded,
        mercado_livre_existing_offer_candidates_excluded: freshness.mlExistingOfferExcluded,
        historical_candidates_excluded: freshness.shopeeHistoricalExcluded + freshness.mlHistoricalExcluded,
        existing_offer_candidates_excluded: freshness.shopeeExistingOfferExcluded + freshness.mlExistingOfferExcluded,
        shopee_peer_reference_count: freshness.shopeePeerReferenceCount || 0,
        mercado_livre_candidates_selected: freshness.mlOpportunitySelected || 0,
        mercado_livre_candidates_discarded_by_gate: freshness.mlOpportunityDiscarded || 0,
      },
      executive_summary: {
        ...(run.executive_summary || {}),
        strategy_version: achadinhoV12.ACHADINHO_STRATEGY_VERSION,
        mercado_livre_strategy_version: mlOpportunityV1.ML_OPPORTUNITY_STRATEGY_VERSION,
        generated_by: 'oracle_marketplace_quality_v1',
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId);
}

async function persistSnapshotImages(client, runId, candidateImages) {
  if (!client || !runId || !(candidateImages instanceof Map) || candidateImages.size === 0) return 0;
  const { data: products, error } = await client
    .from('trend_radar_products')
    .select('id,marketplace,product_term,normalized_product_term,direct_evidence')
    .eq('radar_run_id', runId);
  if (error || !Array.isArray(products)) return 0;

  let updated = 0;
  for (const product of products) {
    const key = getMarketplaceIdentityKey(product);
    const imageUrl = key ? candidateImages.get(key) : null;
    if (!imageUrl) continue;
    const directEvidence = withMarketplaceImageEvidence(product.direct_evidence, imageUrl);
    const { error: updateError } = await client
      .from('trend_radar_products')
      .update({ direct_evidence: directEvidence })
      .eq('id', product.id)
      .eq('radar_run_id', runId);
    if (!updateError) updated += 1;
  }
  return updated;
}

function buildShopeePeerScoringPool(eligibleCandidates = [], excludedCandidates = []) {
  const peerReferences = excludedCandidates.map((candidate) => ({
    ...candidate,
    itemId: null,
    shopId: null,
    imageUrl: '',
    permalink: '',
    peerReferenceOnly: true,
  }));
  return [...eligibleCandidates, ...peerReferences];
}

function buildMercadoLivreRadarProductsV1({ radarRunId, selectedRows = [] } = {}) {
  return selectedRows.map((row, index) => {
    const candidate = row.candidate || {};
    const priority = index + 1;
    const sales = row.sales ?? null;
    const rating = candidate.ratingStar ?? candidate.rating ?? null;
    const currentPrice = candidate.currentPrice ?? null;
    const oldPrice = candidate.oldPrice ?? null;
    const discountPercent = oldPrice > currentPrice
      ? Math.round((((oldPrice - currentPrice) / oldPrice) * 100) * 100) / 100
      : 0;

    return {
      radar_run_id: radarRunId,
      priority,
      product_term: candidate.productName,
      normalized_product_term: engine.normalizeText(candidate.productName),
      category: candidate.category || null,
      marketplace: 'Mercado Livre',
      evidence_status: 'verified',
      source_count: 1,
      commercial_score: row.finalScore,
      score_breakdown: {
        real_offer: row.offerScore,
        official_evidence: row.officialEvidenceScore,
        data_confidence: row.dataConfidenceScore,
        price_accessibility: row.priceAccessibilityScore,
        demand: row.demandScore,
      },
      determining_reasons: [
        `Desconto real validado: ${discountPercent}%`,
        `Evidência oficial ML: ${row.officialEvidenceScore}`,
        sales === null ? 'Vendas não fornecidas; demanda não pontuada' : `Vendas reais consideradas: ${sales}`,
        'Comissão não utilizada no score',
      ],
      confidence: Math.min(95, 60 + Math.round(row.officialEvidenceScore / 2) + Math.round(row.dataConfidenceScore / 2)),
      direct_evidence: [
        {
          claim: 'Oportunidade comercial validada no Mercado Livre',
          evidence_type: 'marketplace_snapshot',
          provenance: candidate.provenance || 'mercadolivre_official_intent',
          source_url: candidate.permalink || null,
          observed_at: candidate.observedAt || new Date().toISOString(),
          rank_position: priority,
          best_seller_flag: sales !== null && sales >= 50,
          trending_flag: false,
          sold_quantity: sales,
          price: currentPrice,
          old_price: oldPrice,
          discount_percent: discountPercent,
          rating,
          decision: row.finalScore >= 70 ? 'TESTAR' : 'OBSERVAR',
          strategy_version: mlOpportunityV1.ML_OPPORTUNITY_STRATEGY_VERSION,
          marketplace_identity: {
            itemId: candidate.itemId || null,
            productId: candidate.productId || null,
            shopId: null,
            shopType: null,
          },
          commercial_metrics: {
            sales,
            ratingStar: rating,
            price: currentPrice,
            priceDiscountRate: discountPercent,
            commissionRate: 0,
            sellerCommissionRate: 0,
          },
          mercado_livre_opportunity: {
            source_intent: candidate.sourceIntent || null,
            macro_group: candidate.macroGroup || null,
            domain_id: candidate.domainId || null,
            category_id: candidate.categoryId || null,
            source_position: candidate.sourcePosition || null,
            offer_score: row.offerScore,
            official_evidence_score: row.officialEvidenceScore,
            data_confidence_score: row.dataConfidenceScore,
            price_accessibility_score: row.priceAccessibilityScore,
            demand_score: row.demandScore,
          },
        },
      ],
      inferred_signals: [
        'mercadolivre_opportunity_v1',
        'real_old_price_discount',
        sales === null ? 'sales_unavailable_neutral' : 'sales_observed',
        'commission_not_scored',
      ],
      affiliate_potential: 'medium',
      visual_content_potential: 'medium',
      recommended_channel: null,
      recommended_format: null,
      match_status: 'pending',
      opportunity_id: null,
      is_focus: priority <= 3,
    };
  });
}

function combineMarketplaceProductsByScore(shopeeProducts = [], mlProducts = [], maxProducts = 20) {
  return [...shopeeProducts, ...mlProducts]
    .sort((a, b) => {
      const scoreDiff = Number(b.commercial_score || 0) - Number(a.commercial_score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return String(a.product_term || '').localeCompare(String(b.product_term || ''), 'pt-BR');
    })
    .slice(0, Math.max(0, maxProducts))
    .map((product, index) => {
      const priority = index + 1;
      const directEvidence = Array.isArray(product.direct_evidence)
        ? product.direct_evidence.map((evidence) => ({ ...evidence, rank_position: priority }))
        : product.direct_evidence;
      return {
        ...product,
        priority,
        is_focus: priority <= 3,
        direct_evidence: directEvidence,
      };
    });
}

async function processPendingTrendRadarRuns(options = {}) {
  if (isEditorialTrendRadarConsumer(options)) {
    return { processed: false, reason: 'editorial_consumer_retired', googleTrendsUsed: false, publishCalls: 0, postsWrites: 0, offersWrites: 0 };
  }

  if (!shouldRunTrendRadarConsumer(options)) {
    return { processed: false, reason: 'dedicated_runtime_enabled', googleTrendsUsed: false, publishCalls: 0, postsWrites: 0, offersWrites: 0 };
  }

  const env = options.env || process.env;
  const client = options.client || createRadarAdminClient(env);
  if (!client) {
    return { processed: false, reason: 'supabase_unavailable', googleTrendsUsed: false, publishCalls: 0, postsWrites: 0, offersWrites: 0 };
  }

  const pendingRun = await engine.findPendingTrendRadarRun(client);
  if (!pendingRun) {
    return { processed: false, reason: 'no_pending_requests', googleTrendsUsed: false, publishCalls: 0, postsWrites: 0, offersWrites: 0 };
  }

  const radarHistory = await fetchCompletedRadarIdentityKeys(client, pendingRun.user_id);
  const existingOfferIdentityKeys = await fetchExistingOfferIdentityKeys(client, pendingRun.user_id);
  const candidateImages = new Map();
  const freshness = {
    latestCompletedRunId: radarHistory.latestRunId,
    completedRunCount: radarHistory.runCount,
    historicalRadarIdentityCount: radarHistory.identityKeys.size,
    existingOfferIdentityCount: existingOfferIdentityKeys.size,
    shopeeHistoricalExcluded: 0,
    mlHistoricalExcluded: 0,
    shopeeExistingOfferExcluded: 0,
    mlExistingOfferExcluded: 0,
    shopeePeerReferenceCount: 0,
    mlOpportunitySelected: 0,
    mlOpportunityDiscarded: 0,
  };

  const baseShopeeCollector = options.shopeeCollector || achadinhoV12.collectShopeeMarketplaceCandidates;
  const baseMlCollector = options.mlCollector || mlDiscoveryV1.collectMercadoLivreRadarDiscoveryV1;

  const filterCandidates = (candidates, historicalKey, existingOfferKey) => {
    const withoutHistorical = filterCandidatesOutsidePreviousSnapshot(candidates, radarHistory.identityKeys);
    const withoutExistingOffers = filterCandidatesOutsidePreviousSnapshot(withoutHistorical.fresh, existingOfferIdentityKeys);
    freshness[historicalKey] = withoutHistorical.excluded.length;
    freshness[existingOfferKey] = withoutExistingOffers.excluded.length;
    for (const candidate of withoutExistingOffers.fresh) {
      const key = getMarketplaceIdentityKey(candidate);
      const imageUrl = getMarketplaceImageUrl(candidate);
      if (key && imageUrl) candidateImages.set(key, imageUrl);
    }
    return {
      fresh: withoutExistingOffers.fresh,
      excluded: [...withoutHistorical.excluded, ...withoutExistingOffers.excluded],
    };
  };

  const runId = pendingRun.id;
  const radarDate = pendingRun.radar_date;
  if (!options.dryRun) {
    await engine.markTrendRadarRunRunning(client, runId, pendingRun.source_health || {});
  }

  let shopeeCandidates = [];
  let shopeePeerReferences = [];
  try {
    const rawShopeeCandidates = await baseShopeeCollector({ env });
    const filteredShopee = filterCandidates(rawShopeeCandidates, 'shopeeHistoricalExcluded', 'shopeeExistingOfferExcluded');
    shopeeCandidates = filteredShopee.fresh;
    shopeePeerReferences = filteredShopee.excluded;
    freshness.shopeePeerReferenceCount = shopeePeerReferences.length;
    console.log(`[Oracle Trends Radar] Shopee V1.2: ${shopeeCandidates.length} candidatos frescos; ${shopeePeerReferences.length} referências de peer`);
  } catch (err) {
    console.error(`[Oracle Trends Radar] Erro Shopee V1.2: ${err.message}`);
  }

  let mlCandidates = [];
  try {
    const rawMlCandidates = await baseMlCollector({ env });
    mlCandidates = filterCandidates(rawMlCandidates, 'mlHistoricalExcluded', 'mlExistingOfferExcluded').fresh;
    console.log(`[Oracle Trends Radar] Mercado Livre Discovery V1: ${mlCandidates.length} candidatos frescos`);
  } catch (err) {
    console.error(`[Oracle Trends Radar] Erro ML Discovery V1: ${err.message}`);
  }

  const shopeeScoringPool = buildShopeePeerScoringPool(shopeeCandidates, shopeePeerReferences);
  const shopeeProducts = achadinhoV12.buildShopeeRadarProductsV12({
    radarRunId: runId,
    shopeeCandidates: shopeeScoringPool,
    maxProducts: 20,
  });

  const mlSelectedRows = mlOpportunityV1.selectMercadoLivreOpportunitiesV1(mlCandidates, { maxProducts: 20 });
  freshness.mlOpportunitySelected = mlSelectedRows.length;
  freshness.mlOpportunityDiscarded = Math.max(0, mlCandidates.length - mlSelectedRows.length);
  const mlProducts = buildMercadoLivreRadarProductsV1({ radarRunId: runId, selectedRows: mlSelectedRows });

  const products = combineMarketplaceProductsByScore(shopeeProducts, mlProducts, 20);
  const finalShopeeCount = products.filter((product) => product.marketplace === 'Shopee').length;
  const finalMlCount = products.filter((product) => product.marketplace === 'Mercado Livre').length;

  const result = await engine.persistTrendRadarSnapshot({
    client,
    run: pendingRun,
    products,
    shopeeCount: shopeeCandidates.length,
    mlCount: mlCandidates.length,
    dryRun: Boolean(options.dryRun),
  });

  if (result.persisted) {
    await persistSnapshotImages(client, result.runId, candidateImages);
    await persistFreshnessHealth(client, result.runId, freshness);
  }

  return {
    processed: true,
    runId,
    radarDate,
    productsCount: products.length,
    shopeeProductsCount: finalShopeeCount,
    mercadoLivreProductsCount: finalMlCount,
    shopeeCandidatesCount: shopeeCandidates.length,
    shopeePeerReferencesCount: shopeePeerReferences.length,
    mlCandidatesCount: mlCandidates.length,
    mlOpportunitySelectedCount: mlSelectedRows.length,
    mlOpportunityDiscardedCount: freshness.mlOpportunityDiscarded,
    persisted: result.persisted,
    strategyVersion: achadinhoV12.ACHADINHO_STRATEGY_VERSION,
    mercadoLivreStrategyVersion: mlOpportunityV1.ML_OPPORTUNITY_STRATEGY_VERSION,
    googleTrendsUsed: false,
    publishCalls: 0,
    postsWrites: 0,
    offersWrites: 0,
    freshness,
  };
}

module.exports = {
  ...engine,
  ACHADINHO_STRATEGY_VERSION: achadinhoV12.ACHADINHO_STRATEGY_VERSION,
  ML_OPPORTUNITY_STRATEGY_VERSION: mlOpportunityV1.ML_OPPORTUNITY_STRATEGY_VERSION,
  DEDICATED_RUNTIME_ENV,
  isDedicatedTrendRadarRuntimeEnabled,
  isEditorialTrendRadarConsumer,
  shouldRunTrendRadarConsumer,
  createRadarAdminClient,
  persistFreshnessHealth,
  persistSnapshotImages,
  buildShopeePeerScoringPool,
  buildMercadoLivreRadarProductsV1,
  combineMarketplaceProductsByScore,
  processPendingTrendRadarRuns,
};
