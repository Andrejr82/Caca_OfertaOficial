'use strict';

const { createClient } = require('@supabase/supabase-js');
const engine = require('./oracle-trends-radar-engine.cjs');
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
    .select('source_health')
    .eq('id', runId)
    .maybeSingle();
  if (readError || !run) return;

  await client
    .from('trend_radar_runs')
    .update({
      source_health: {
        ...(run.source_health || {}),
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

async function processPendingTrendRadarRuns(options = {}) {
  if (isEditorialTrendRadarConsumer(options)) {
    return {
      processed: false,
      reason: 'editorial_consumer_retired',
      googleTrendsUsed: false,
      publishCalls: 0,
      postsWrites: 0,
      offersWrites: 0,
    };
  }

  if (!shouldRunTrendRadarConsumer(options)) {
    return {
      processed: false,
      reason: 'dedicated_runtime_enabled',
      googleTrendsUsed: false,
      publishCalls: 0,
      postsWrites: 0,
      offersWrites: 0,
    };
  }

  const env = options.env || process.env;
  const client = options.client || createRadarAdminClient(env);
  if (!client) return engine.processPendingTrendRadarRuns(options);

  const pendingRun = await engine.findPendingTrendRadarRun(client);
  if (!pendingRun) return engine.processPendingTrendRadarRuns({ ...options, client });

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
  };

  const baseShopeeCollector = options.shopeeCollector || engine.collectShopeeMarketplaceCandidates;
  const baseMlCollector = options.mlCollector || engine.collectMercadoLivreMarketplaceCandidates;

  const filterCollector = async (baseCollector, collectorOptions, historicalKey, existingOfferKey) => {
    const candidates = await baseCollector(collectorOptions);
    const withoutHistorical = filterCandidatesOutsidePreviousSnapshot(candidates, radarHistory.identityKeys);
    const withoutExistingOffers = filterCandidatesOutsidePreviousSnapshot(withoutHistorical.fresh, existingOfferIdentityKeys);
    freshness[historicalKey] = withoutHistorical.excluded.length;
    freshness[existingOfferKey] = withoutExistingOffers.excluded.length;
    for (const candidate of withoutExistingOffers.fresh) {
      const key = getMarketplaceIdentityKey(candidate);
      const imageUrl = getMarketplaceImageUrl(candidate);
      if (key && imageUrl) candidateImages.set(key, imageUrl);
    }
    return withoutExistingOffers.fresh;
  };

  const shopeeCollector = (collectorOptions = {}) => filterCollector(
    baseShopeeCollector,
    collectorOptions,
    'shopeeHistoricalExcluded',
    'shopeeExistingOfferExcluded',
  );

  const mlCollector = (collectorOptions = {}) => filterCollector(
    baseMlCollector,
    collectorOptions,
    'mlHistoricalExcluded',
    'mlExistingOfferExcluded',
  );

  const result = await engine.processPendingTrendRadarRuns({
    ...options,
    env,
    client,
    shopeeCollector,
    mlCollector,
  });

  if (result.processed && !options.dryRun) {
    await persistSnapshotImages(client, result.runId, candidateImages);
    await persistFreshnessHealth(client, result.runId, freshness);
  }

  return {
    ...result,
    freshness,
  };
}

module.exports = {
  ...engine,
  DEDICATED_RUNTIME_ENV,
  isDedicatedTrendRadarRuntimeEnabled,
  isEditorialTrendRadarConsumer,
  shouldRunTrendRadarConsumer,
  createRadarAdminClient,
  persistFreshnessHealth,
  persistSnapshotImages,
  processPendingTrendRadarRuns,
};
