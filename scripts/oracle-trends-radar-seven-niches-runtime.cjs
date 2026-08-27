'use strict';

const trendCore = require('./trend-radar-seven-niches-v1.cjs');

function createObservationAwareRecencyFilter(getCandidateIdentityKeys) {
  return function filterCandidatesWithRecencyObservation(
    candidates = [],
    recentIdentityKeys = new Set(),
    existingOfferKeys = new Set(),
  ) {
    const fresh = [];
    const observedRecentHistory = [];
    const excludedExistingOffers = [];
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      const keys = getCandidateIdentityKeys(candidate);
      const isExistingOffer = keys.some((key) => existingOfferKeys?.has(key));
      if (isExistingOffer) {
        excludedExistingOffers.push(candidate);
        continue;
      }
      const isRecent = keys.some((key) => recentIdentityKeys?.has(key));
      if (isRecent) observedRecentHistory.push(candidate);
      fresh.push(candidate);
    }
    return {
      fresh,
      excludedRecentHistory: [],
      observedRecentHistory,
      excludedExistingOffers,
    };
  };
}

function canonicalShopeeCategoryIds(contracts = {}) {
  const byNiche = contracts.SHOPEE_CATEGORIES_BY_NICHE || {};
  return [...new Set(Object.values(byNiche).flatMap((ids) => Array.isArray(ids) ? ids : []))];
}

function createShopeeSevenNicheCollector(originalCollector, contracts = {}) {
  const categoryIds = canonicalShopeeCategoryIds(contracts);
  return async function collectShopeeSevenNiches(options = {}) {
    return originalCollector({ ...options, categoryIds: categoryIds.length ? categoryIds : options.categoryIds });
  };
}

function normalizeAmazonProduct(product = {}) {
  const title = String(product.title || '').trim();
  const nicheId = trendCore.classifyNiche({ productName: title, category: product.category });
  if (!title || !nicheId) return null;
  return {
    marketplace: 'Amazon',
    itemId: String(product.asin || '').trim(),
    productId: String(product.asin || '').trim(),
    asin: String(product.asin || '').trim(),
    productName: title,
    category: trendCore.NICHE_LABELS[nicheId],
    nicheId,
    currentPrice: Number(product.price) || null,
    oldPrice: Number(product.original_price) || null,
    discountPercent: Number(product.discount) || 0,
    rating: Number(product.marketplaceMetrics?.rating) || null,
    ratingStar: Number(product.marketplaceMetrics?.rating) || null,
    sales: null,
    rank: Number(product.rank) || null,
    sourcePosition: Number(product.rank) || null,
    rankSource: 'Amazon Best Sellers',
    amazonBestSeller: Number(product.rank) > 0,
    bestSeller: Number(product.rank) > 0,
    permalink: String(product.canonical_url || ''),
    imageUrl: String(product.image || ''),
    provenance: 'amazon_best_sellers',
    observedAt: new Date().toISOString(),
  };
}

function createAmazonSevenNicheCollector(runAmazonNativeTop20) {
  return async function collectAmazonSevenNiches(options = {}) {
    if (typeof runAmazonNativeTop20 !== 'function') return [];
    const result = await runAmazonNativeTop20({
      fetchImpl: options.fetchImpl || global.fetch,
      maxCategories: options.maxCategories || 20,
      maxSubcategoriesPerCategory: options.maxSubcategoriesPerCategory || 2,
      knownAsins: options.knownAsins || new Set(),
    });
    return (result?.products || []).map(normalizeAmazonProduct).filter(Boolean);
  };
}

async function fetchMlTrendTerms(url, fetchImpl) {
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });
    if (!response?.ok) return [];
    const payload = await response.json();
    return (Array.isArray(payload) ? payload : payload?.results || payload?.content || [])
      .map((item) => String(item?.keyword || item?.name || item?.title || '').trim())
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

async function enrichMercadoLivreCategoryTrends(candidates = [], { fetchImpl = global.fetch } = {}) {
  const categories = [...new Set((candidates || []).map((c) => String(c.categoryId || '').trim()).filter(Boolean))];
  const trendTermsByCategory = new Map();
  for (const categoryId of categories) {
    trendTermsByCategory.set(categoryId, await fetchMlTrendTerms(`https://api.mercadolibre.com/trends/MLB/${encodeURIComponent(categoryId)}`, fetchImpl));
  }
  const globalTerms = await fetchMlTrendTerms('https://api.mercadolibre.com/trends/MLB', fetchImpl);
  return (candidates || []).map((candidate) => {
    const categoryId = String(candidate.categoryId || '').trim();
    const name = trendCore.normalize(candidate.productName || candidate.title);
    const categoryMatch = (trendTermsByCategory.get(categoryId) || []).find((term) => name.includes(trendCore.normalize(term)));
    const globalMatch = globalTerms.find((term) => name.includes(trendCore.normalize(term)));
    const match = categoryMatch || globalMatch;
    return match ? {
      ...candidate,
      nativeTrend: true,
      marketplaceTrendEvidence: {
        source: categoryMatch ? 'mercadolivre_category_trends' : 'mercadolivre_global_trends',
        categoryId: categoryId || null,
        keyword: match,
      },
    } : candidate;
  });
}

function createMercadoLivrePlusAmazonCollector(originalCollector, amazonCollector, { fetchImpl = global.fetch } = {}) {
  return async function collectMarketplaceCandidates(options = {}) {
    const [mlRaw, amazon] = await Promise.all([
      originalCollector(options),
      amazonCollector({ fetchImpl }),
    ]);
    const ml = await enrichMercadoLivreCategoryTrends(mlRaw, { fetchImpl });
    return [...ml, ...amazon];
  };
}

function candidateTrendSignals(candidate, velocityInfo) {
  const demand = candidate.marketplaceDemandEvidence || {};
  const bestSellerPosition = Number(demand.position || candidate.bestSellerPosition || candidate.rank || 0) || null;
  return {
    ...candidate,
    nativeTrend: Boolean(candidate.nativeTrend || candidate.marketplaceTrendEvidence),
    bestSeller: Boolean(candidate.bestSeller || demand.type === 'BEST_SELLER' || candidate.amazonBestSeller),
    rank: candidate.marketplace === 'Amazon' ? candidate.rank : bestSellerPosition,
    rankSource: candidate.marketplace === 'Amazon'
      ? candidate.rankSource
      : (demand.type === 'BEST_SELLER' ? 'Mercado Livre Highlights' : candidate.rankSource),
    salesVelocity: velocityInfo?.sales_velocity ?? null,
    salesDelta: velocityInfo?.sales_delta ?? null,
  };
}

function createEnhancedHistoryFetcher(originalFetcher) {
  return async function fetchRecentTrendObservationMap(client, tenantId = null) {
    const map = typeof originalFetcher === 'function' ? await originalFetcher(client, tenantId) : new Map();
    if (!client) return map;
    try {
      let runQuery = client.from('trend_radar_runs').select('id, created_at').eq('status', 'completed').order('created_at', { ascending: false }).limit(3);
      if (tenantId) runQuery = runQuery.eq('user_id', tenantId);
      const { data: runs, error: runError } = await runQuery;
      if (runError || !Array.isArray(runs) || !runs.length) return map;
      const { data: products, error: productError } = await client.from('trend_radar_products')
        .select('direct_evidence, created_at').in('radar_run_id', runs.map((r) => r.id)).order('created_at', { ascending: false });
      if (productError || !Array.isArray(products)) return map;
      for (const product of products) {
        const evidence = Array.isArray(product.direct_evidence) ? product.direct_evidence[0] : null;
        const itemId = String(evidence?.marketplace_identity?.itemId || evidence?.marketplace_identity?.productId || '').trim();
        if (!itemId) continue;
        const temporal = evidence?.temporal_metrics || {};
        const rank = Number(temporal.current_rank ?? evidence?.rank_position);
        const current = map.get(itemId) || { itemId, sales: evidence?.commercial_metrics?.sales ?? evidence?.sold_quantity ?? null, observedAt: evidence?.observed_at || product.created_at };
        if (Number.isFinite(rank) && rank > 0) current.rank = rank;
        if (!current.observedAt) current.observedAt = evidence?.observed_at || product.created_at;
        map.set(itemId, current);
      }
    } catch (_) {}
    return map;
  };
}

function createSevenNicheBuilder({ legacyBuilder, computeCandidateSalesVelocity }) {
  return function buildSevenNicheTrendRows(options = {}) {
    const candidates = [...(options.shopeeCandidates || []), ...(options.mlCandidates || [])];
    const legacyRows = typeof legacyBuilder === 'function' ? legacyBuilder(options) : [];
    const legacyByKey = new Map();
    for (const row of legacyRows) {
      const evidence = row.direct_evidence?.[0] || {};
      const identity = evidence.marketplace_identity || {};
      const keys = [identity.itemId, identity.productId, row.product_term].filter(Boolean).map(String);
      for (const key of keys) legacyByKey.set(`${row.marketplace || ''}:${key}`, row);
    }

    const prepared = candidates.map((candidate) => {
      const velocityInfo = typeof computeCandidateSalesVelocity === 'function'
        ? computeCandidateSalesVelocity(candidate, options.previousItemsMap || new Map())
        : null;
      const enriched = candidateTrendSignals(candidate, velocityInfo);
      const identity = String(candidate.itemId || candidate.productId || candidate.asin || candidate.productName || '');
      const previous = options.previousItemsMap instanceof Map ? options.previousItemsMap.get(identity) : null;
      const evaluated = trendCore.evaluateCandidate(enriched, previous);
      const legacy = legacyByKey.get(`${candidate.marketplace || ''}:${identity}`)
        || legacyByKey.get(`${candidate.marketplace || ''}:${candidate.productName || ''}`)
        || null;
      return {
        ...enriched,
        ...evaluated,
        identityKey: identity,
        direct_evidence: legacy?.direct_evidence || [{
          claim: `Tendência observada em ${candidate.marketplace}`,
          evidence_type: 'marketplace_trend_snapshot',
          provenance: candidate.provenance || null,
          source_url: candidate.permalink || null,
          image_url: candidate.imageUrl || null,
          marketplace_identity: {
            itemId: candidate.itemId || null,
            productId: candidate.productId || null,
            shopId: candidate.shopId || null,
          },
          commercial_metrics: {
            sales: candidate.sales ?? null,
            ratingStar: candidate.ratingStar ?? candidate.rating ?? null,
            price: candidate.currentPrice ?? null,
            priceDiscountRate: candidate.discountPercent ?? null,
            commissionRate: candidate.commissionRate ?? candidate.commissionPercent ?? null,
            sellerCommissionRate: candidate.sellerCommissionRate ?? null,
          },
        }],
        commercialScore: legacy?.commercial_score ?? candidate.commercialScore ?? candidate.score ?? 0,
        reasons: evaluated.reasons || [],
        temporal: {
          ...(evaluated.temporal || {}),
          previousSales: velocityInfo?.previous_sales ?? evaluated.temporal?.previousSales ?? null,
          currentSales: velocityInfo?.current_sales ?? evaluated.temporal?.currentSales ?? candidate.sales ?? null,
          salesDelta: velocityInfo?.sales_delta ?? evaluated.temporal?.salesDelta ?? null,
          salesVelocity: velocityInfo?.sales_velocity ?? evaluated.temporal?.salesVelocity ?? null,
        },
      };
    });

    const selection = trendCore.buildTrendRadarSelection(prepared, options.previousItemsMap || new Map(), { maxRows: 20, maxPerNiche: 3 });
    const selectedIds = new Set(selection.selected.map((candidate) => String(candidate.identityKey || '')));
    const observations = selection.observations
      .filter((candidate) => !selectedIds.has(String(candidate.identityKey || '')))
      .sort((a, b) => b.trendScore - a.trendScore || b.commercialScore - a.commercialScore);
    const persisted = [...selection.selected, ...observations].slice(0, trendCore.MAX_SNAPSHOT_ROWS);
    return persisted.map((candidate, index) => ({
      ...trendCore.toPersistedRow(candidate, index + 1, options.radarRunId),
      selection_decision: null,
    }));
  };
}

function installSevenNicheRuntime({
  freshness,
  engine,
  marketplaceContracts,
  amazonModule,
  fetchImpl = global.fetch,
} = {}) {
  if (!freshness || !engine) throw new Error('Runtime dependencies missing');

  freshness.filterCandidatesWithRecency = createObservationAwareRecencyFilter(freshness.getCandidateIdentityKeys);

  const originalShopee = engine.collectShopeeMarketplaceCandidates;
  const originalMl = engine.collectMercadoLivreMarketplaceCandidates;
  const legacyBuilder = engine.buildTrendRadarProductsFromCandidates;
  const originalHistoryFetcher = engine.fetchRecentSnapshotItemsMap;

  engine.collectShopeeMarketplaceCandidates = createShopeeSevenNicheCollector(originalShopee, marketplaceContracts || {});
  const amazonCollector = createAmazonSevenNicheCollector(amazonModule?.runAmazonNativeTop20);
  engine.collectMercadoLivreMarketplaceCandidates = createMercadoLivrePlusAmazonCollector(originalMl, amazonCollector, { fetchImpl });
  engine.fetchRecentSnapshotItemsMap = createEnhancedHistoryFetcher(originalHistoryFetcher);
  engine.buildTrendRadarProductsFromCandidates = createSevenNicheBuilder({
    legacyBuilder,
    computeCandidateSalesVelocity: engine.computeCandidateSalesVelocity,
  });

  return engine;
}

module.exports = {
  createObservationAwareRecencyFilter,
  canonicalShopeeCategoryIds,
  createShopeeSevenNicheCollector,
  normalizeAmazonProduct,
  createAmazonSevenNicheCollector,
  enrichMercadoLivreCategoryTrends,
  createMercadoLivrePlusAmazonCollector,
  createEnhancedHistoryFetcher,
  createSevenNicheBuilder,
  installSevenNicheRuntime,
};
