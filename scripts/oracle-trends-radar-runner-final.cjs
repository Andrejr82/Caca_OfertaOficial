'use strict';

/**
 * Oracle Trends Radar Runner Final — Consolidated Official Entrypoint
 *
 * Roteamento determinístico sem monkey patches:
 * - VNext ON: runRadarVNext (pipeline oficial canônico)
 * - VNext OFF: runner.processPendingTrendRadarRuns (V4 rollback preservado)
 * - Shadow Mode: mantido para backward compatibility quando VNext OFF
 */

const engine = require('./oracle-trends-radar-engine.cjs');
const runner = require('./oracle-trends-radar-runner.cjs');
const dedup = require('./radar-semantic-dedup-v2.cjs');
const { buildBenchmarkContext } = require('../src/core/trends/benchmark-peer-engine.cjs');
const {
  COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION,
  calculateCommercialOpportunityScoreVNext,
} = require('../src/core/trends/commercial-opportunity-score-vnext.cjs');
const { selectRadarVNext } = require('../src/core/trends/radar-vnext-selector.cjs');
const {
  runRadarVNext,
  normalizeShopeeCandidate,
  normalizeMlCandidate,
  VNEXT_RUNNER_CONTRACT_VERSION,
} = require('./oracle-trends-radar-vnext-pipeline.cjs');

const VNEXT_OFFICIAL_ENV = 'TRENDS_RADAR_VNEXT_OFFICIAL';
const VNEXT_SHADOW_ENV = 'TRENDS_RADAR_VNEXT_SHADOW';

function isRadarVNextOfficialEnabled(env = process.env) {
  const raw = String(env?.[VNEXT_OFFICIAL_ENV] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function isRadarVNextShadowEnabled(env = process.env) {
  const raw = String(env?.[VNEXT_SHADOW_ENV] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function buildTrendRadarProductsFromCandidates(options = {}) {
  const env = options.env || process.env;
  if (isRadarVNextOfficialEnabled(env)) {
    const shopeeRaw = Array.isArray(options.shopeeCandidates) ? options.shopeeCandidates : [];
    const mlRaw = Array.isArray(options.mlCandidates) ? options.mlCandidates : [];

    const pool = [
      ...shopeeRaw.map(c => normalizeShopeeCandidate(c, options.now)),
      ...mlRaw.map(c => normalizeMlCandidate(c, options.now)),
    ];

    const dedupResult = dedup.deduplicateCatalogAndSemantic
      ? dedup.deduplicateCatalogAndSemantic(pool)
      : { uniqueCandidates: pool };
    const dedupedCandidates = Array.isArray(dedupResult) ? dedupResult : (dedupResult?.uniqueCandidates || pool);

    const contextForCandidate = (candidate) => ({
      benchmark: buildBenchmarkContext(candidate, pool),
      pool,
    });

    const scoreFn = typeof options.scoreCandidate === 'function'
      ? options.scoreCandidate
      : (candidate, context) => calculateCommercialOpportunityScoreVNext(candidate, context);

    const selectedRows = selectRadarVNext(dedupedCandidates, {
      maxProducts: options.maxProducts || 20,
      minScore: options.minScore !== undefined ? options.minScore : 0,
      maxPerStore: 2,
      maxPerFamily: 3,
      contextForCandidate,
      scoreCandidate: scoreFn,
    });

    return selectedRows.map((row, idx) => engine.materializeTrendRadarProduct({
      candidate: row.candidate,
      score: row.score,
      strategyVersion: COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION,
      rank: idx + 1,
      radarRunId: options.radarRunId || 'test-run',
      now: options.now || new Date(),
    }));
  }

  // V4 legacy fallback
  return engine.buildTrendRadarProductsFromCandidates(options);
}

async function processPendingTrendRadarRuns(options = {}) {
  const env = options.env || process.env;
  const isOfficialOn = isRadarVNextOfficialEnabled(env);
  const isShadowOn = isRadarVNextShadowEnabled(env);

  if (isOfficialOn) {
    if (typeof options.runnerProcessPendingTrendRadarRuns === 'function') {
      const res = await options.runnerProcessPendingTrendRadarRuns(options);
      if (res && res.sourceHealth && isShadowOn) {
        res.sourceHealth.vnext_shadow = {
          skipped: true,
          reason: 'vnext_official_active',
        };
      }
      return res;
    }

    const client = options.client || (options.dryRun ? null : runner.createRadarAdminClient(env));
    const pendingRun = client ? await runner.findPendingTrendRadarRun(client) : (options.dryRun ? { id: 'dry-run-123' } : null);
    if (!pendingRun) return { processed: false, reason: 'no_pending_runs' };

    if (client && pendingRun.id && !options.dryRun) {
      await runner.markTrendRadarRunRunning(client, pendingRun.id, pendingRun.source_health || {});
    }

    const result = await runRadarVNext({
      run: pendingRun,
      client,
      env,
      shopeeCollector: options.shopeeCollector,
      mlCollector: options.mlCollector,
      recencyCollector: options.recencyCollector,
      offersCollector: options.offersCollector,
      historyCollector: options.historyCollector,
      dryRun: options.dryRun,
      maxProducts: options.maxProducts || 20,
    });

    if (result && result.sourceHealth && isShadowOn) {
      result.sourceHealth.vnext_shadow = {
        skipped: true,
        reason: 'vnext_official_active',
      };
    }

    return result;
  }

  // Legacy V4 rollback path
  const runnerFn = typeof options.runnerProcessPendingTrendRadarRuns === 'function'
    ? options.runnerProcessPendingTrendRadarRuns
    : runner.processPendingTrendRadarRuns;

  const result = await runnerFn(options);

  if (result && result.sourceHealth && isShadowOn) {
    result.sourceHealth.vnext_shadow = {
      version: 'radar-vnext-shadow/v1',
      mode: 'shadow',
      evaluated_at: new Date().toISOString(),
    };
  }

  return result;
}

module.exports = {
  ...runner,
  VNEXT_OFFICIAL_ENV,
  VNEXT_SHADOW_ENV,
  VNEXT_RUNNER_CONTRACT_VERSION,
  isRadarVNextOfficialEnabled,
  isRadarVNextShadowEnabled,
  buildTrendRadarProductsFromCandidates,
  processPendingTrendRadarRuns,
  runRadarVNext,
};
