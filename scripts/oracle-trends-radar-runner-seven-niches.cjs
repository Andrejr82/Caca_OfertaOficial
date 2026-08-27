'use strict';

const DEDICATED_RUNTIME_ENV = 'TRENDS_RADAR_DEDICATED_RUNTIME';

function isDedicatedTrendRadarRuntimeEnabled(env = process.env) {
  const value = String(env?.[DEDICATED_RUNTIME_ENV] ?? '').trim().toLowerCase();
  return ['1','true','yes','on'].includes(value);
}

function createRadarAdminClient(env = process.env) {
  const { createClient } = require('@supabase/supabase-js');
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function buildDefaultDependencies() {
  const engine = require('./oracle-trends-radar-engine.cjs');
  const amazon = require('./amazon-native-top20-v5.cjs');
  const runtime = require('./oracle-trends-radar-seven-niches-runtime.cjs');
  const contracts = require('./commercial-niche-contracts.cjs');
  const nicheConfig = require('./commercial-niche-config.cjs');
  const trend = require('./trend-radar-seven-niches-authoritative.cjs');
  const { calculateCommercialOpportunityScoreV4 } = require('../src/core/trends/commercial-opportunity-score-v4.cjs');
  return { engine, amazon, runtime, contracts, nicheConfig, trend, calculateCommercialOpportunityScoreV4, fetchImpl: global.fetch };
}

function uniqueByIdentity(candidates = [], trend) {
  const seen = new Set();
  const out = [];
  for (const candidate of candidates) {
    const key = trend.resolveIdentity(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key); out.push(candidate);
  }
  return out;
}

function buildMercadoLivreKeywords(niches = {}) {
  const terms = [];
  for (const niche of Object.values(niches)) {
    const core = Array.isArray(niche?.coreProducts) ? niche.coreProducts.slice(0, 2) : [];
    const expansion = Array.isArray(niche?.expansionProducts) ? niche.expansionProducts.slice(0, 1) : [];
    terms.push(...core, ...expansion);
  }
  return [...new Set(terms.map((x) => String(x || '').trim()).filter(Boolean))];
}

async function collectShopee({ engine, contracts, env, collector = null }) {
  const fn = collector || engine.collectShopeeMarketplaceCandidates;
  const categoryIds = [...new Set(Object.values(contracts.SHOPEE_CATEGORIES_BY_NICHE || {}).flat())];
  const all = [];
  let calls = 0;
  let failures = 0;
  for (const categoryId of categoryIds) {
    try {
      calls += 1;
      const rows = await fn({ categoryIds: [categoryId], maxPerCategory: 30, maxPagesPerCategory: 1, page: 1, sortType: 2, env });
      for (const row of rows || []) all.push({ ...row, sourceCategoryId: categoryId, observedAt: row.observedAt || new Date().toISOString() });
    } catch (_) { failures += 1; }
  }
  return { candidates: all, health: { calls, failures, status: all.length ? (failures ? 'partial' : 'completed') : (failures ? 'failed' : 'empty') } };
}

async function collectMercadoLivre({ engine, runtime, nicheConfig, env, fetchImpl, collector = null }) {
  const fn = collector || engine.collectMercadoLivreMarketplaceCandidates;
  const keywords = buildMercadoLivreKeywords(nicheConfig.COMMERCIAL_NICHES || {});
  const batchSize = 7;
  const rounds = Math.max(1, Math.ceil(keywords.length / batchSize));
  const all = [];
  let failures = 0;
  for (let page = 1; page <= rounds; page += 1) {
    try {
      const rows = await fn({ keywords, nativeCollector: null, page, batchSize, maxPerIntent: 4, env, fetchImpl });
      all.push(...(rows || []));
    } catch (_) { failures += 1; }
  }
  let enriched = uniqueBySimpleMl(all);
  try {
    enriched = await engine.enrichMercadoLivreWithHighlightsAndReviews(enriched, { env, fetchImpl });
  } catch (_) { failures += 1; }
  try {
    enriched = await runtime.enrichMercadoLivreCategoryTrends(enriched, { fetchImpl });
  } catch (_) { failures += 1; }
  return { candidates: enriched, health: { keywords: keywords.length, rounds, failures, status: enriched.length ? (failures ? 'partial' : 'completed') : (failures ? 'failed' : 'empty') } };
}

function uniqueBySimpleMl(rows = []) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = String(row.productId || row.itemId || row.productName || '');
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function normalizeAmazonProduct(product = {}) {
  return {
    marketplace: 'Amazon', itemId: String(product.asin || '').trim(), productId: String(product.asin || '').trim(), asin: String(product.asin || '').trim(),
    productName: String(product.title || '').trim(), currentPrice: Number(product.price) || null, oldPrice: Number(product.original_price) || null,
    discountPercent: Number(product.discount) || 0, rating: Number(product.marketplaceMetrics?.rating) || null, ratingStar: Number(product.marketplaceMetrics?.rating) || null,
    sales: null, rank: Number(product.rank) || null, sourcePosition: Number(product.rank) || null, rankSource: 'Amazon Best Sellers', rankAuthoritative: true,
    amazonBestSeller: Number(product.rank) > 0, bestSeller: Number(product.rank) > 0, permalink: String(product.canonical_url || ''), imageUrl: String(product.image || ''),
    provenance: 'amazon_best_sellers', observedAt: new Date().toISOString(), sourceCategory: product.category || null, sourceSubcategory: product.subcategory || null,
  };
}

async function collectAmazon({ amazon, fetchImpl, collector = null }) {
  const fn = collector || amazon.runAmazonNativeTop20;
  try {
    const result = await fn({ fetchImpl, maxCategories: 20, maxSubcategoriesPerCategory: 1, knownAsins: new Set() });
    const candidates = (result?.products || []).map(normalizeAmazonProduct).filter((x) => x.itemId && x.productName && x.currentPrice > 0);
    return { candidates, health: { http_calls: result?.http_calls ?? null, status: candidates.length ? 'completed' : 'empty' } };
  } catch (error) {
    return { candidates: [], health: { status: 'failed', error_code: String(error?.code || 'AMAZON_SOURCE_ERROR').slice(0,80) } };
  }
}

function prepareTrendSignals(candidate = {}) {
  if (candidate.marketplace === 'Mercado Livre') {
    const demand = candidate.marketplaceDemandEvidence || {};
    if (demand.type === 'BEST_SELLER') {
      return { ...candidate, bestSeller: true, rank: Number(demand.position) || null, rankSource: 'Mercado Livre Highlights', rankAuthoritative: true, nativeTrend: Boolean(candidate.marketplaceTrendEvidence) };
    }
    return { ...candidate, nativeTrend: Boolean(candidate.marketplaceTrendEvidence) };
  }
  return candidate;
}

async function fetchHistory(client, tenantId, trend) {
  const map = new Map();
  if (!client) return map;
  try {
    let runQuery = client.from('trend_radar_runs').select('id,created_at').eq('status','completed').order('created_at',{ascending:false}).limit(5);
    if (tenantId) runQuery = runQuery.eq('user_id', tenantId);
    const { data: runs, error: runError } = await runQuery;
    if (runError || !Array.isArray(runs) || !runs.length) return map;
    const { data: products, error: productError } = await client.from('trend_radar_products')
      .select('marketplace,direct_evidence,created_at').in('radar_run_id',runs.map((r)=>r.id)).order('created_at',{ascending:false});
    if (productError || !Array.isArray(products)) return map;
    for (const product of products) {
      const evidence = Array.isArray(product.direct_evidence) ? product.direct_evidence[0] : null;
      if (!evidence) continue;
      const identity = evidence.marketplace_identity || {};
      const rawId = String(identity.itemId || identity.productId || '').trim();
      if (!rawId) continue;
      const key = `${product.marketplace || ''}:${rawId}`;
      if (map.has(key)) continue;
      const temporal = evidence.temporal_metrics || {};
      const entry = {
        sales: temporal.current_sales ?? evidence.sold_quantity ?? evidence.commercial_metrics?.sales ?? null,
        rank: temporal.current_rank ?? evidence.rank_position ?? null,
        observedAt: evidence.observed_at || product.created_at,
      };
      map.set(key, entry);
      if (!map.has(rawId)) map.set(rawId, entry);
    }
  } catch (_) {}
  return map;
}

function summarizeBy(items = [], keyFn) {
  const out = {};
  for (const item of items) { const key = keyFn(item); if (!key) continue; out[key] = (out[key] || 0) + 1; }
  return out;
}

function buildCompletionMetadata({ run, rows, evaluated, selection, health, trend }) {
  const sourceHealth = {
    runtime:'oracle', status:'completed', completed_at:new Date().toISOString(), request_reason:run.source_health?.request_reason || null,
    strategy_version:trend.TREND_STRATEGY_VERSION, engine:'seven_niche_authoritative', google_trends_used:false,
    snapshot_row_cap:trend.MAX_SNAPSHOT_ROWS, displayed_trends_count:selection.verified.length, observation_count:selection.observations.length,
    persisted_row_count:rows.length, completion_reason:'trend_scan_completed', marketplaces_scanned:['Shopee','Mercado Livre','Amazon'],
    source_status:health, candidates_by_marketplace:summarizeBy(evaluated,(x)=>x.marketplace), canonical_candidates_by_niche:summarizeBy(evaluated,(x)=>x.nicheId),
    verified_by_niche:summarizeBy(selection.verified,(x)=>x.nicheId), verified_by_marketplace:summarizeBy(selection.verified,(x)=>x.marketplace),
  };
  const executiveSummary = {
    contract:'trend-radar-seven-niches/v2', generated_by:'oracle_radar_seven_niche_trend_engine', strategy_version:trend.TREND_STRATEGY_VERSION,
    verified_trends_count:selection.verified.length, observations_count:selection.observations.length,
    marketplaces:['Shopee','Mercado Livre','Amazon'], top_trend:selection.verified[0]?.productName || null, top_trend_score:selection.verified[0]?.trendScore || null,
  };
  return { sourceHealth, executiveSummary };
}

async function persistSnapshot({ client, run, rows, evaluated, selection, health, trend, dryRun = false }) {
  if (dryRun || !client) return { persisted: false, productsCount: rows.length };
  const { error: deleteError } = await client.from('trend_radar_products').delete().eq('radar_run_id',run.id);
  if (deleteError) throw new Error(`Falha ao limpar snapshot: ${deleteError.message}`);
  if (rows.length) {
    const { error: insertError } = await client.from('trend_radar_products').insert(rows);
    if (insertError) throw new Error(`Falha ao persistir snapshot: ${insertError.message}`);
  }
  const { sourceHealth, executiveSummary } = buildCompletionMetadata({ run, rows, evaluated, selection, health, trend });
  const { error:updateError } = await client.from('trend_radar_runs').update({
    status:'completed', strategy_version:trend.TREND_STRATEGY_VERSION, source_health:sourceHealth, executive_summary:executiveSummary,
    generated_at:new Date().toISOString(), updated_at:new Date().toISOString(),
  }).eq('id',run.id);
  if (updateError) throw new Error(`Falha ao concluir Radar: ${updateError.message}`);
  return { persisted:true, productsCount:rows.length, sourceHealth, executiveSummary };
}

function createAuthoritativeRadarRunner(customDeps = {}) {
  const defaults = customDeps.__skipDefaults ? {} : buildDefaultDependencies();
  const deps = { ...defaults, ...customDeps };
  delete deps.__skipDefaults;
  return async function processPendingTrendRadarRuns(options = {}) {
    const env = options.env || process.env;
    if (!options.dedicatedRuntime && isDedicatedTrendRadarRuntimeEnabled(env)) {
      return { processed:false, reason:'dedicated_runtime_enabled', publishCalls:0, postsWrites:0, offersWrites:0 };
    }
    const client = options.client || (options.dryRun ? null : createRadarAdminClient(env));
    if (!client && !options.dryRun) return { processed:false, reason:'supabase_unavailable', publishCalls:0, postsWrites:0, offersWrites:0 };
    const run = client ? await deps.engine.findPendingTrendRadarRun(client) : { id:'dry-run-execution', user_id:'dry-run-user', radar_date:new Date().toISOString().slice(0,10), source_health:{request_reason:'dry_run'} };
    if (!run) return { processed:false, reason:'no_pending_requests', publishCalls:0, postsWrites:0, offersWrites:0 };
    if (client && !options.dryRun) await deps.engine.markTrendRadarRunRunning(client,run.id,run.source_health||{});

    try {
      const previous = await fetchHistory(client,run.user_id,deps.trend);
      const [shopee, ml, amazon] = await Promise.all([
        collectShopee({ engine:deps.engine, contracts:deps.contracts, env, collector:options.shopeeCollector }),
        collectMercadoLivre({ engine:deps.engine, runtime:deps.runtime, nicheConfig:deps.nicheConfig, env, fetchImpl:deps.fetchImpl, collector:options.mlCollector }),
        collectAmazon({ amazon:deps.amazon, fetchImpl:deps.fetchImpl, collector:options.amazonCollector }),
      ]);
      const raw = uniqueByIdentity([
        ...shopee.candidates.map(prepareTrendSignals), ...ml.candidates.map(prepareTrendSignals), ...amazon.candidates.map(prepareTrendSignals),
      ], deps.trend);
      const evaluated = deps.trend.evaluateCandidates(raw,previous,{ niches:deps.nicheConfig.COMMERCIAL_NICHES, commercialScorer:deps.calculateCommercialOpportunityScoreV4 });
      const selection = deps.trend.selectSnapshot(evaluated,{ maxRows:deps.trend.MAX_SNAPSHOT_ROWS, maxVerifiedPerNiche:deps.trend.MAX_VERIFIED_PER_NICHE });
      const rows = selection.persisted.map((item,index)=>deps.trend.toPersistedRow(item,index+1,run.id));
      const sourceHealth = { Shopee:shopee.health, 'Mercado Livre':ml.health, Amazon:amazon.health };
      const persisted = await persistSnapshot({ client,run,rows,evaluated,selection,health:sourceHealth,trend:deps.trend,dryRun:Boolean(options.dryRun) });
      return { processed:true, runId:run.id, productsCount:rows.length, verifiedTrendsCount:selection.verified.length, observationsCount:selection.observations.length,
        persisted:persisted.persisted, sourceHealth, publishCalls:0, postsWrites:0, offersWrites:0 };
    } catch (error) {
      if (client && !options.dryRun) {
        try { await client.from('trend_radar_runs').update({ status:'failed', failure_code:error.code||'TREND_RADAR_V2_ERROR',
          source_health:{ runtime:'oracle',status:'failed',strategy_version:deps.trend.TREND_STRATEGY_VERSION,error_message:String(error.message||error).slice(0,300),failed_at:new Date().toISOString() },
          updated_at:new Date().toISOString() }).eq('id',run.id); } catch (_) {}
      }
      throw error;
    }
  };
}

let defaultRunner = null;
async function processPendingTrendRadarRuns(options = {}) {
  if (!defaultRunner) defaultRunner = createAuthoritativeRadarRunner();
  return defaultRunner(options);
}

module.exports = {
  DEDICATED_RUNTIME_ENV, isDedicatedTrendRadarRuntimeEnabled, createRadarAdminClient, buildMercadoLivreKeywords,
  normalizeAmazonProduct, prepareTrendSignals, fetchHistory, buildCompletionMetadata, persistSnapshot, createAuthoritativeRadarRunner, processPendingTrendRadarRuns,
};