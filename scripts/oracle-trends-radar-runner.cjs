'use strict';

/**
 * Oracle Trends Radar Runner V2 — Caça Ofertas Oficial
 *
 * Orquestrador principal do Radar com descoberta paginada, refill loop,
 * viabilidade comercial V2, recência de histórico e observabilidade completa.
 */

const { createClient } = require('@supabase/supabase-js');
const engine = require('./oracle-trends-radar-engine.cjs');
const {
  COMMERCIAL_VIABILITY_STRATEGY_VERSION,
  calculateCommercialViabilityV2,
  isViableForRadar,
} = require('./commercial-viability-v2.cjs');
const {
  DEFAULT_RECENCY_DAYS,
  fetchCompletedRadarIdentityKeys,
  fetchExistingOfferIdentityKeys,
  filterCandidatesWithRecency,
  getMarketplaceIdentityKey,
  getMarketplaceImageUrl,
  withMarketplaceImageEvidence,
} = require('./oracle-trends-radar-freshness.cjs');
const {
  extractSemanticClusterKey,
  deduplicateCatalogAndSemantic,
  applyFamilyDiversityCap,
} = require('./radar-semantic-dedup-v2.cjs');

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

/**
 * Executa o ciclo de processamento de solicitações pendentes do Radar.
 */
async function processPendingTrendRadarRuns(options = {}) {
  if (isEditorialTrendRadarConsumer(options)) {
    return { processed: false, reason: 'editorial_consumer_retired', googleTrendsUsed: false, publishCalls: 0, postsWrites: 0, offersWrites: 0 };
  }

  if (!shouldRunTrendRadarConsumer(options)) {
    return { processed: false, reason: 'dedicated_runtime_enabled', googleTrendsUsed: false, publishCalls: 0, postsWrites: 0, offersWrites: 0 };
  }

  const env = options.env || process.env;
  const client = options.client || (options.dryRun ? null : createRadarAdminClient(env));
  if (!client && !options.dryRun) {
    return { processed: false, reason: 'supabase_unavailable', googleTrendsUsed: false, publishCalls: 0, postsWrites: 0, offersWrites: 0 };
  }

  let pendingRun = null;
  if (client) {
    pendingRun = await engine.findPendingTrendRadarRun(client);
    if (!pendingRun) {
      return { processed: false, reason: 'no_pending_requests', googleTrendsUsed: false, publishCalls: 0, postsWrites: 0, offersWrites: 0 };
    }
  } else {
    pendingRun = {
      id: 'dry-run-execution',
      radar_date: new Date().toISOString().slice(0, 10),
      user_id: 'dry-run-user',
      source_health: { runtime: 'oracle' },
    };
  }

  const runId = pendingRun.id;
  const radarDate = pendingRun.radar_date;

  if (client && !options.dryRun) {
    await engine.markTrendRadarRunRunning(client, runId, pendingRun.source_health || {});
  }

  // 1. Carrega histórico na janela de recência e ofertas existentes
  const recencyWindowDays = options.recencyDays || DEFAULT_RECENCY_DAYS;
  const radarHistory = await fetchCompletedRadarIdentityKeys(client, pendingRun.user_id, {
    recencyDays: recencyWindowDays,
    now: options.now || new Date(),
  });
  const existingOfferKeys = await fetchExistingOfferIdentityKeys(client, pendingRun.user_id);
  const previousItemsMap = await engine.fetchRecentSnapshotItemsMap(client, pendingRun.user_id);

  const candidateImages = new Map();

  // 2. Métricas de observabilidade de source_health
  const targetProducts = 20;
  const minimumProducts = 10;
  const maxRefillRounds = Math.max(1, Math.min(5, Number(options.maxRefillRounds) || 3));

  let shopeeCandidatesRaw = 0;
  let shopeeCandidatesUnique = 0;
  let shopeePagesScanned = 0;
  let shopeeRecentHistoryExcluded = 0;
  let shopeeExistingOfferExcluded = 0;
  let shopeeNativeDuplicatesExcluded = 0;
  let shopeeSemanticDuplicatesExcluded = 0;
  let shopeeLowViabilityExcluded = 0;
  let shopeeInsufficientDataExcluded = 0;

  let mlCandidatesRaw = 0;
  let mlCandidatesUnique = 0;
  let mlRecentHistoryExcluded = 0;
  let mlExistingOfferExcluded = 0;
  let mlCatalogDuplicatesExcluded = 0;
  let mlSemanticDuplicatesExcluded = 0;
  let mlLowViabilityExcluded = 0;
  let mlInsufficientDataExcluded = 0;

  const candidatesPerRefillRound = [];
  const aggregatedShopeeCandidates = [];
  const aggregatedMlCandidates = [];

  const seenShopeeNativeKeys = new Set();
  const seenMlNativeKeys = new Set();

  const baseShopeeCollector = options.shopeeCollector || engine.collectShopeeMarketplaceCandidates;
  const baseMlCollector = options.mlCollector || engine.collectMercadoLivreMarketplaceCandidates;

  let finalProducts = [];
  let actualRoundsRun = 0;

  // 3. Loop de Refill & Descoberta
  for (let round = 1; round <= maxRefillRounds; round++) {
    actualRoundsRun = round;
    let roundShopeeRaw = 0;
    let roundMlRaw = 0;

    // 3.1 Coleta Shopee
    try {
      const rawShopee = await baseShopeeCollector({ page: round, env });
      shopeePagesScanned += 1;
      roundShopeeRaw = rawShopee.length;
      shopeeCandidatesRaw += rawShopee.length;

      for (const item of rawShopee) {
        const key = getMarketplaceIdentityKey(item);
        const imageUrl = getMarketplaceImageUrl(item);
        if (key && imageUrl) candidateImages.set(key, imageUrl);

        if (!key || seenShopeeNativeKeys.has(key)) {
          shopeeNativeDuplicatesExcluded += 1;
          continue;
        }
        seenShopeeNativeKeys.add(key);

        const freshnessCheck = filterCandidatesWithRecency([item], radarHistory.recentIdentityKeys, existingOfferKeys);
        if (freshnessCheck.excludedRecentHistory.length) {
          shopeeRecentHistoryExcluded += 1;
          continue;
        }
        if (freshnessCheck.excludedExistingOffers.length) {
          shopeeExistingOfferExcluded += 1;
          continue;
        }

        aggregatedShopeeCandidates.push(item);
      }
      shopeeCandidatesUnique = seenShopeeNativeKeys.size;
    } catch (err) {
      console.error(`[Oracle Radar] Erro Shopee round ${round}: ${err.message}`);
    }

    // 3.2 Coleta Mercado Livre
    try {
      const rawMl = await baseMlCollector({ page: round, env });
      roundMlRaw = rawMl.length;
      mlCandidatesRaw += rawMl.length;

      for (const item of rawMl) {
        const key = getMarketplaceIdentityKey(item);
        const imageUrl = getMarketplaceImageUrl(item);
        if (key && imageUrl) candidateImages.set(key, imageUrl);

        if (!key || seenMlNativeKeys.has(key)) {
          continue;
        }
        seenMlNativeKeys.add(key);

        const freshnessCheck = filterCandidatesWithRecency([item], radarHistory.recentIdentityKeys, existingOfferKeys);
        if (freshnessCheck.excludedRecentHistory.length) {
          mlRecentHistoryExcluded += 1;
          continue;
        }
        if (freshnessCheck.excludedExistingOffers.length) {
          mlExistingOfferExcluded += 1;
          continue;
        }

        aggregatedMlCandidates.push(item);
      }
      mlCandidatesUnique = seenMlNativeKeys.size;
    } catch (err) {
      console.error(`[Oracle Radar] Erro Mercado Livre round ${round}: ${err.message}`);
    }

    // 3.3 Construção preliminar do Radar com a piscina agregada
    finalProducts = engine.buildTrendRadarProductsFromCandidates({
      radarRunId: runId,
      shopeeCandidates: aggregatedShopeeCandidates,
      mlCandidates: aggregatedMlCandidates,
      previousItemsMap,
      maxProducts: targetProducts,
    });

    candidatesPerRefillRound.push({
      round,
      shopee_raw: roundShopeeRaw,
      ml_raw: roundMlRaw,
      shopee_pool: aggregatedShopeeCandidates.length,
      ml_pool: aggregatedMlCandidates.length,
      eligible_after_round: finalProducts.length,
    });

    // Se já atingiu 20 produtos ou não há novos candidatos brutos retornando, encerra o loop
    if (finalProducts.length >= targetProducts || (roundShopeeRaw === 0 && roundMlRaw === 0)) {
      break;
    }
  }

  // 4. Contabilidade de deduplicações e descarte de viabilidade
  const dedupAudit = deduplicateCatalogAndSemantic([...aggregatedShopeeCandidates, ...aggregatedMlCandidates]);
  mlCatalogDuplicatesExcluded = dedupAudit.excludedCatalogDuplicates.length;

  for (const excluded of dedupAudit.excludedSemanticDuplicates) {
    if (excluded.marketplace === 'Shopee') shopeeSemanticDuplicatesExcluded += 1;
    else mlSemanticDuplicatesExcluded += 1;
  }

  for (const candidate of dedupAudit.uniqueCandidates) {
    const viability = calculateCommercialViabilityV2(candidate);
    if (viability.classification === 'low') {
      if (candidate.marketplace === 'Shopee') shopeeLowViabilityExcluded += 1;
      else mlLowViabilityExcluded += 1;
    } else if (viability.classification === 'insufficient_data') {
      if (candidate.marketplace === 'Shopee') shopeeInsufficientDataExcluded += 1;
      else mlInsufficientDataExcluded += 1;
    }
  }

  // 5. Determinação da razão de conclusão (completion_reason)
  let completionReason = 'target_reached';
  if (finalProducts.length >= targetProducts) {
    completionReason = 'target_reached';
  } else if (finalProducts.length >= minimumProducts) {
    completionReason = 'minimum_reached';
  } else {
    completionReason = 'eligible_sources_exhausted';
  }

  // 6. Diversidade de famílias
  const representedFamilies = new Set(
    finalProducts.map((p) => extractSemanticClusterKey({
      productName: p.product_term,
      category: p.category,
      marketplace: p.marketplace,
    }))
  );

  // 7. Montagem do source_health consolidado
  const sourceHealth = {
    google_trends_used: false,
    target_products: targetProducts,
    minimum_products: minimumProducts,
    target_reached: finalProducts.length >= targetProducts,
    completion_reason: completionReason,
    shopee_candidates_raw: shopeeCandidatesRaw,
    shopee_candidates_unique: shopeeCandidatesUnique,
    shopee_pages_scanned: shopeePagesScanned,
    shopee_recent_history_excluded: shopeeRecentHistoryExcluded,
    shopee_existing_offer_excluded: shopeeExistingOfferExcluded,
    shopee_native_duplicates_excluded: shopeeNativeDuplicatesExcluded,
    shopee_semantic_duplicates_excluded: shopeeSemanticDuplicatesExcluded,
    shopee_low_viability_excluded: shopeeLowViabilityExcluded,
    shopee_insufficient_data_excluded: shopeeInsufficientDataExcluded,
    mercado_livre_candidates_raw: mlCandidatesRaw,
    mercado_livre_candidates_unique: mlCandidatesUnique,
    mercado_livre_recent_history_excluded: mlRecentHistoryExcluded,
    mercado_livre_existing_offer_excluded: mlExistingOfferExcluded,
    mercado_livre_catalog_duplicates_excluded: mlCatalogDuplicatesExcluded,
    mercado_livre_semantic_duplicates_excluded: mlSemanticDuplicatesExcluded,
    mercado_livre_low_viability_excluded: mlLowViabilityExcluded,
    mercado_livre_insufficient_data_excluded: mlInsufficientDataExcluded,
    refill_rounds: actualRoundsRun,
    candidates_per_refill_round: candidatesPerRefillRound,
    total_products_selected: finalProducts.length,
    families_selected: representedFamilies.size,
    recency_window_days: recencyWindowDays,
    completed_runs_in_window: radarHistory.runCount,
  };

  // 8. Persistência do snapshot
  const persistResult = await engine.persistTrendRadarSnapshot({
    client,
    run: pendingRun,
    products: finalProducts,
    sourceHealthOverrides: sourceHealth,
    dryRun: Boolean(options.dryRun || !client),
  });

  if (persistResult.persisted && client) {
    await persistSnapshotImages(client, runId, candidateImages);
  }

  const finalShopeeCount = finalProducts.filter((p) => p.marketplace === 'Shopee').length;
  const finalMlCount = finalProducts.filter((p) => p.marketplace === 'Mercado Livre').length;

  return {
    processed: true,
    runId,
    radarDate,
    productsCount: finalProducts.length,
    shopeeProductsCount: finalShopeeCount,
    mercadoLivreProductsCount: finalMlCount,
    persisted: persistResult.persisted,
    googleTrendsUsed: false,
    publishCalls: 0,
    postsWrites: 0,
    offersWrites: 0,
    sourceHealth,
  };
}

module.exports = {
  ...engine,
  COMMERCIAL_VIABILITY_STRATEGY_VERSION,
  DEDICATED_RUNTIME_ENV,
  isDedicatedTrendRadarRuntimeEnabled,
  isEditorialTrendRadarConsumer,
  shouldRunTrendRadarConsumer,
  createRadarAdminClient,
  persistSnapshotImages,
  processPendingTrendRadarRuns,
};