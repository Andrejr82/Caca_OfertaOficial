'use strict';

const engine = require('./oracle-trends-radar-engine.cjs');

const DEDICATED_RUNTIME_ENV = 'TRENDS_RADAR_DEDICATED_RUNTIME';

function isDedicatedTrendRadarRuntimeEnabled(env = process.env) {
  const value = String(env?.[DEDICATED_RUNTIME_ENV] ?? '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function shouldRunTrendRadarConsumer({ env = process.env, dedicatedRuntime = false } = {}) {
  return dedicatedRuntime || !isDedicatedTrendRadarRuntimeEnabled(env);
}

async function processPendingTrendRadarRuns(options = {}) {
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

  return engine.processPendingTrendRadarRuns(options);
}

module.exports = {
  ...engine,
  DEDICATED_RUNTIME_ENV,
  isDedicatedTrendRadarRuntimeEnabled,
  shouldRunTrendRadarConsumer,
  processPendingTrendRadarRuns,
};
