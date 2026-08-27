'use strict';

const baseRunner = require('./oracle-trends-radar-runner-seven-niches.cjs');
const engine = require('./oracle-trends-radar-engine.cjs');
const amazon = require('./amazon-native-top20-v5.cjs');
const runtime = require('./oracle-trends-radar-seven-niches-runtime.cjs');
const contracts = require('./commercial-niche-contracts.cjs');
const nicheConfig = require('./commercial-niche-config.cjs');
const trend = require('./trend-radar-seven-niches-v3.cjs');
const { calculateCommercialOpportunityScoreV4 } = require('../src/core/trends/commercial-opportunity-score-v4.cjs');

const v3Runner = baseRunner.createAuthoritativeRadarRunner({
  engine,
  amazon,
  runtime,
  contracts,
  nicheConfig,
  trend,
  calculateCommercialOpportunityScoreV4,
  fetchImpl: global.fetch,
});

async function processPendingTrendRadarRuns(options = {}) {
  return v3Runner(options);
}

module.exports = {
  ...baseRunner,
  processPendingTrendRadarRuns,
  TREND_STRATEGY_VERSION: trend.TREND_STRATEGY_VERSION,
};
