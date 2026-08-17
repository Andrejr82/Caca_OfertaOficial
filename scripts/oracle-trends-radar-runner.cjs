'use strict';

const { createClient } = require('@supabase/supabase-js');
const engine = require('./oracle-trends-radar-engine.cjs');
const {
  fetchLatestCompletedSnapshotIdentityKeys,
  filterCandidatesOutsidePreviousSnapshot,
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
        freshness_gate: 'exclude_latest_completed_snapshot',
        previous_snapshot_run_id: freshness.previousSnapshotRunId,
        previous_snapshot_identity_count: freshness.previousSnapshotIdentityCount,
        shopee_repeated_candidates_excluded: freshness.shopeeExcluded,
        mercado_livre_repeated_candidates_excluded: freshness.mlExcluded,
        repeated_candidates_excluded: freshness.shopeeExcluded + freshness.mlExcluded,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId);
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

  const previousSnapshot = await fetchLatestCompletedSnapshotIdentityKeys(client, pendingRun.user_id);
  const freshness = {
    previousSnapshotRunId: previousSnapshot.runId,
    previousSnapshotIdentityCount: previousSnapshot.identityKeys.size,
    shopeeExcluded: 0,
    mlExcluded: 0,
  };

  const baseShopeeCollector = options.shopeeCollector || engine.collectShopeeMarketplaceCandidates;
  const baseMlCollector = options.mlCollector || engine.collectMercadoLivreMarketplaceCandidates;

  const shopeeCollector = async (collectorOptions = {}) => {
    const candidates = await baseShopeeCollector(collectorOptions);
    const filtered = filterCandidatesOutsidePreviousSnapshot(candidates, previousSnapshot.identityKeys);
    freshness.shopeeExcluded = filtered.excluded.length;
    return filtered.fresh;
  };

  const mlCollector = async (collectorOptions = {}) => {
    const candidates = await baseMlCollector(collectorOptions);
    const filtered = filterCandidatesOutsidePreviousSnapshot(candidates, previousSnapshot.identityKeys);
    freshness.mlExcluded = filtered.excluded.length;
    return filtered.fresh;
  };

  const result = await engine.processPendingTrendRadarRuns({
    ...options,
    env,
    client,
    shopeeCollector,
    mlCollector,
  });

  if (result.processed && !options.dryRun) {
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
  processPendingTrendRadarRuns,
};
