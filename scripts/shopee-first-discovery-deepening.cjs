'use strict';

const {
  GRAPHQL_CONTRACTS,
  SCENARIO_CONTRACTS,
  runScenarioPlan,
  runShadow,
  resolveAuxiliaryOffers,
} = require('./shopee-openapi-shadow-engine-v1.cjs');
const { getFirstDiscoveryQualityMode } = require('./first-discovery-flags.cjs');
const { resolveNichePlanFromLegacyScenario } = require('./commercial-niche-runtime-adapter.cjs');

const DEFAULTS = Object.freeze({ maxQueries: 10, maxPagesPerQuery: 2, pageSize: 20, maxFeedRows: 100, maxAuxiliaryPerSource: 3, concurrency: 3 });

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function scenarioResult(result, scenarioId) {
  return result?.scenarios?.[scenarioId] || { top: [], rejected: [], metrics: {} };
}

function getShopeeFirstDiscoveryDeepeningPlan(scenarioId, env = process.env) {
  if (getFirstDiscoveryQualityMode(env) !== 'active') return Object.freeze({ enabled: false, reason: 'first_discovery_not_active' });
  const resolution = resolveNichePlanFromLegacyScenario(scenarioId, ['Shopee']);
  const firstDiscovery = resolution?.plans?.Shopee?.firstDiscovery;
  if (!firstDiscovery?.intents?.length) return Object.freeze({ enabled: false, reason: 'first_discovery_plan_missing' });
  const limits = Object.freeze({
    maxQueries: Math.max(1, Number(env.SHOPEE_FIRST_DISCOVERY_DEEPEN_MAX_QUERIES || DEFAULTS.maxQueries)),
    maxPagesPerQuery: Math.max(1, Number(env.SHOPEE_FIRST_DISCOVERY_DEEPEN_MAX_PAGES || DEFAULTS.maxPagesPerQuery)),
    pageSize: Math.max(1, Math.min(50, Number(env.SHOPEE_FIRST_DISCOVERY_DEEPEN_PAGE_SIZE || DEFAULTS.pageSize))),
    maxFeedRows: Math.max(0, Number(env.SHOPEE_FIRST_DISCOVERY_DEEPEN_FEED_ROWS || DEFAULTS.maxFeedRows)),
    maxAuxiliaryPerSource: Math.max(0, Number(env.SHOPEE_FIRST_DISCOVERY_DEEPEN_AUX_PER_SOURCE || DEFAULTS.maxAuxiliaryPerSource)),
    concurrency: Math.max(1, Number(env.SHOPEE_FIRST_DISCOVERY_DEEPEN_CONCURRENCY || DEFAULTS.concurrency)),
  });
  return Object.freeze({
    enabled: true,
    scenarioId,
    nicheId: resolution.nicheId,
    queries: Object.freeze(uniqueStrings(firstDiscovery.intents.flatMap((intent) => intent.queries || [intent.term])).slice(0, limits.maxQueries)),
    minCandidates: Number(firstDiscovery.targets?.minStrongCandidates || 12),
    targetCandidates: Number(firstDiscovery.targets?.targetStrongCandidates || 18),
    limits,
  });
}

function responseErrors(response) {
  return Array.isArray(response?.data?.errors) ? response.data.errors : [];
}

async function collectIntentProducts({ request, plan, signal }) {
  const products = [];
  const calls = [];
  const tasks = plan.queries.map((keyword) => async () => {
    for (let page = 1; page <= plan.limits.maxPagesPerQuery; page += 1) {
      if (signal?.aborted) break;
      let response;
      try {
        response = await request('ShopeePromotionOffers', GRAPHQL_CONTRACTS.productOfferV2.query, { keyword, page, limit: plan.limits.pageSize, sortType: 2, isAMSOffer: true }, { signal });
      } catch (error) {
        calls.push({ source: 'first_discovery.intent', keyword, page, returned: 0, stopReason: 'source_error', error: error?.message || String(error) });
        break;
      }
      const errors = responseErrors(response);
      const nodes = response?.data?.data?.productOfferV2?.nodes || [];
      const pageInfo = response?.data?.data?.productOfferV2?.pageInfo || null;
      if (Number(response?.status || 0) >= 400 || errors.length > 0) {
        calls.push({ source: 'first_discovery.intent', keyword, page, status: Number(response?.status || 0), returned: 0, stopReason: 'source_error' });
        break;
      }
      products.push(...nodes);
      const evidence = { source: 'first_discovery.intent', keyword, page, status: Number(response?.status || 200), returned: nodes.length };
      if (nodes.length === 0) { calls.push({ ...evidence, stopReason: 'empty_page' }); break; }
      if (pageInfo?.hasNextPage !== true) { calls.push({ ...evidence, stopReason: 'has_next_page_false' }); break; }
      calls.push(page >= plan.limits.maxPagesPerQuery ? { ...evidence, stopReason: 'page_limit' } : evidence);
    }
  });
  let cursor = 0;
  const workers = new Array(Math.min(plan.limits.concurrency, Math.max(1, tasks.length))).fill(null).map(async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor++];
      await task();
    }
  });
  await Promise.all(workers);
  return { products, calls };
}

async function collectDelta({ request, plan, signal }) {
  if (plan.limits.maxFeedRows <= 0 || signal?.aborted) return { rows: [], datafeedId: null, calls: [] };
  const calls = [];
  try {
    const feedResponse = await request('ListItemFeeds', GRAPHQL_CONTRACTS.listItemFeeds.query, {}, { signal });
    const feeds = feedResponse?.data?.data?.listItemFeeds?.feeds || [];
    calls.push({ source: 'listItemFeeds.DELTA', status: Number(feedResponse?.status || 200), returned: feeds.length });
    const datafeedId = feeds[0]?.datafeedId || null;
    if (!datafeedId) return { rows: [], datafeedId: null, calls };
    const dataResponse = await request('GetItemFeedData', GRAPHQL_CONTRACTS.getItemFeedData.query, { datafeedId, offset: 0, limit: plan.limits.maxFeedRows }, { signal });
    const rows = dataResponse?.data?.data?.getItemFeedData?.rows || [];
    calls.push({ source: 'getItemFeedData.DELTA', status: Number(dataResponse?.status || 200), returned: rows.length });
    return { rows, datafeedId, calls };
  } catch (error) {
    calls.push({ source: 'DELTA', returned: 0, stopReason: 'source_error', error: error?.message || String(error) });
    return { rows: [], datafeedId: null, calls };
  }
}

async function collectAuxiliary({ request, plan, signal }) {
  if (plan.limits.maxAuxiliaryPerSource <= 0 || signal?.aborted) return { shopOffers: [], shopeeOffers: [], calls: [] };
  const calls = [];
  try {
    const [shopResponse, shopeeResponse] = await Promise.all([
      request('ShopOfferV2', GRAPHQL_CONTRACTS.shopOfferV2.query, { page: 1, limit: 20 }, { signal }),
      request('ShopeeOfferV2', GRAPHQL_CONTRACTS.shopeeOfferV2.query, { page: 1, limit: 20 }, { signal }),
    ]);
    const shopOffers = shopResponse?.data?.data?.shopOfferV2?.nodes || [];
    const shopeeOffers = shopeeResponse?.data?.data?.shopeeOfferV2?.nodes || [];
    calls.push({ source: 'shopOfferV2', status: Number(shopResponse?.status || 200), returned: shopOffers.length });
    calls.push({ source: 'shopeeOfferV2', status: Number(shopeeResponse?.status || 200), returned: shopeeOffers.length });
    const resolved = await resolveAuxiliaryOffers({
      request: (operationName, query, variables = {}, options = {}) => request(operationName, query, variables, { ...options, signal: options.signal || signal }),
      shopOffers,
      shopeeOffers,
      maxPerSource: plan.limits.maxAuxiliaryPerSource,
    });
    return { ...resolved, calls };
  } catch (error) {
    calls.push({ source: 'auxiliary', returned: 0, stopReason: 'source_error', error: error?.message || String(error) });
    return { shopOffers: [], shopeeOffers: [], calls };
  }
}

function mergeTop(primary = [], supplemental = []) {
  const byItemId = new Map();
  for (const product of [...primary, ...supplemental]) {
    const itemId = String(product?.itemId || '').trim();
    if (!itemId) continue;
    const existing = byItemId.get(itemId);
    if (!existing || Number(product?.score || 0) > Number(existing?.score || 0)) byItemId.set(itemId, product);
  }
  return [...byItemId.values()].sort((left, right) => Number(right?.score || 0) - Number(left?.score || 0) || String(left?.itemId || '').localeCompare(String(right?.itemId || '')));
}

function mergeMetrics(primary = {}, supplemental = {}, finalCount = 0) {
  const merged = { ...primary };
  for (const key of ['raw', 'parsed', 'normalized', 'technicalRejected', 'intentRejected', 'approvedContract', 'duplicates', 'scoreable']) merged[key] = Number(primary?.[key] || 0) + Number(supplemental?.[key] || 0);
  merged.final = finalCount;
  merged.categories = Math.max(Number(primary?.categories || 0), Number(supplemental?.categories || 0));
  merged.shops = Math.max(Number(primary?.shops || 0), Number(supplemental?.shops || 0));
  merged.families = Math.max(Number(primary?.families || 0), Number(supplemental?.families || 0));
  merged.rejections = { ...(primary?.rejections || {}) };
  for (const [reason, count] of Object.entries(supplemental?.rejections || {})) merged.rejections[reason] = Number(merged.rejections[reason] || 0) + Number(count || 0);
  return merged;
}

function runSupplemental(scenarioId, sources) {
  const contract = SCENARIO_CONTRACTS[scenarioId];
  if (!contract) return { scenarios: { [scenarioId]: { top: [], rejected: [], metrics: {} } } };
  return runShadow({ sources, contracts: { [scenarioId]: contract }, topLimit: Number.POSITIVE_INFINITY, applyDiversityCaps: false });
}

async function runShopeeFirstDiscoveryDeepening(scenarioId, options = {}) {
  const primary = await runScenarioPlan(scenarioId, { request: options.request, maxKeywords: options.maxKeywords, maxCategories: options.maxCategories, signal: options.signal, includeDelta: false, includeAuxiliary: false, sharedSources: options.sharedSources || {} });
  const plan = getShopeeFirstDiscoveryDeepeningPlan(scenarioId, options.env || process.env);
  const primaryScenario = scenarioResult(primary, scenarioId);
  if (!plan.enabled || Number(primaryScenario.top?.length || 0) >= plan.minCandidates || typeof options.request !== 'function') {
    return { ...primary, deepening: { applied: false, reason: plan.enabled ? 'primary_pool_sufficient' : plan.reason, primaryTop: Number(primaryScenario.top?.length || 0) } };
  }
  const intent = await collectIntentProducts({ request: options.request, plan, signal: options.signal });
  let delta = { rows: [], datafeedId: null, calls: [] };
  let auxiliary = { shopOffers: [], shopeeOffers: [], calls: [] };
  let supplemental = runSupplemental(scenarioId, { productOffers: intent.products, deltaRows: [], shopOffers: [], shopeeOffers: [] });
  let supplementalScenario = scenarioResult(supplemental, scenarioId);
  let mergedTop = mergeTop(primaryScenario.top || [], supplementalScenario.top || []);
  if (mergedTop.length < plan.minCandidates && !options.signal?.aborted) {
    [delta, auxiliary] = await Promise.all([collectDelta({ request: options.request, plan, signal: options.signal }), collectAuxiliary({ request: options.request, plan, signal: options.signal })]);
    supplemental = runSupplemental(scenarioId, { productOffers: intent.products, deltaRows: delta.rows, datafeedId: delta.datafeedId, shopOffers: auxiliary.shopOffers, shopeeOffers: auxiliary.shopeeOffers, maxFeedRows: plan.limits.maxFeedRows });
    supplementalScenario = scenarioResult(supplemental, scenarioId);
    mergedTop = mergeTop(primaryScenario.top || [], supplementalScenario.top || []);
  }
  const scenarios = { ...(primary.scenarios || {}), [scenarioId]: { ...primaryScenario, top: mergedTop, rejected: [...(primaryScenario.rejected || []), ...(supplementalScenario.rejected || [])], metrics: mergeMetrics(primaryScenario.metrics || {}, supplementalScenario.metrics || {}, mergedTop.length) } };
  return {
    ...primary,
    scenarios,
    queryEvidence: { ...(primary.queryEvidence || {}), calls: [...(primary.queryEvidence?.calls || []), ...intent.calls, ...delta.calls, ...auxiliary.calls], productOffers: Number(primary.queryEvidence?.productOffers || 0) + intent.products.length, deltaRows: delta.rows.length, shopOffers: auxiliary.shopOffers.length, shopeeOffers: auxiliary.shopeeOffers.length },
    deepening: { applied: true, reason: 'primary_pool_below_minimum', nicheId: plan.nicheId, primaryTop: Number(primaryScenario.top?.length || 0), finalTop: mergedTop.length, targetCandidates: plan.targetCandidates, minCandidates: plan.minCandidates, queriesAttempted: plan.queries.length, intentProducts: intent.products.length, deltaRows: delta.rows.length, auxiliaryResolved: auxiliary.shopOffers.filter((item) => item?.resolved).length + auxiliary.shopeeOffers.filter((item) => item?.resolved).length },
  };
}

module.exports = { DEFAULTS, getShopeeFirstDiscoveryDeepeningPlan, runShopeeFirstDiscoveryDeepening };
