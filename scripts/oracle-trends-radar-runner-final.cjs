'use strict';

const engine = require('./oracle-trends-radar-engine.cjs');
const { isRadarVNextShadowEnabled, buildShadowSourceHealth, persistRadarVNextShadowDiagnostics } = require('./radar-vnext-shadow-runtime.cjs');
const { buildRadarVNextShadowComparison } = require('./radar-vnext-shadow.cjs');
const { selectRadarVNext } = require('../src/core/trends/radar-vnext-selector.cjs');
const { COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION } = require('../src/core/trends/commercial-opportunity-score-vnext.cjs');

const VNEXT_OFFICIAL_ENV = 'TRENDS_RADAR_VNEXT_OFFICIAL';

function isRadarVNextOfficialEnabled(env = process.env) {
  const value = String(env?.[VNEXT_OFFICIAL_ENV] ?? '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function normalizeShopeeCommissionPercent(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') return null;
  const num = Number(String(rawValue).replace(',', '.'));
  if (!Number.isFinite(num) || num <= 0) return null;
  if (num > 0 && num < 1) return Math.round(num * 10000) / 100;
  return Math.round(num * 100) / 100;
}

function resolveShopeeCommission(node = {}) {
  const shopeeCommissionPercent = normalizeShopeeCommissionPercent(node.commissionRate);
  const sellerCommissionPercent = normalizeShopeeCommissionPercent(node.sellerCommissionRate);

  if (sellerCommissionPercent !== null) {
    const effectiveCommissionPercent = Math.round(((shopeeCommissionPercent || 0) + sellerCommissionPercent) * 100) / 100;
    return {
      commissionSource: 'observed',
      shopeeCommissionPercent,
      sellerCommissionPercent,
      effectiveCommissionPercent,
    };
  }

  if (shopeeCommissionPercent !== null) {
    return {
      commissionSource: 'observed',
      shopeeCommissionPercent,
      sellerCommissionPercent: null,
      effectiveCommissionPercent: shopeeCommissionPercent,
    };
  }

  return {
    commissionSource: 'unknown',
    shopeeCommissionPercent: null,
    sellerCommissionPercent: null,
    effectiveCommissionPercent: 0,
  };
}

function normalizePriceIntegrity(node = {}) {
  const parseNum = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };

  const rawPrice = parseNum(node.price);
  const priceMin = parseNum(node.priceMin);
  const priceMax = parseNum(node.priceMax);
  const priceDiscountRate = parseNum(node.priceDiscountRate);
  const officialOldPrice = parseNum(node.officialOldPrice);

  const rangeAmbiguous = priceMin !== null && priceMax !== null && priceMax > priceMin;

  let currentPrice = rawPrice;
  let priceAuthority = 'observed_price';

  if (currentPrice === null || currentPrice <= 0) {
    if (priceMin !== null && priceMin > 0) {
      currentPrice = priceMin;
      priceAuthority = rangeAmbiguous ? 'range_min_conservative' : 'range_exact';
    } else if (priceMax !== null && priceMax > 0) {
      currentPrice = priceMax;
      priceAuthority = 'range_max_fallback';
    }
  }

  let oldPrice = officialOldPrice;
  let oldPriceAuthority = officialOldPrice ? 'official_old_price' : null;
  let discountPercent = null;
  let discountAuthority = null;

  if (priceDiscountRate !== null && priceDiscountRate > 0) {
    discountPercent = priceDiscountRate > 0 && priceDiscountRate < 1
      ? Math.round(priceDiscountRate * 10000) / 100
      : Math.round(priceDiscountRate * 100) / 100;
    discountAuthority = 'marketplace_reported';

    if (!oldPrice && currentPrice && discountPercent > 0 && discountPercent < 100) {
      oldPrice = Math.round((currentPrice / (1 - (discountPercent / 100))) * 100) / 100;
      oldPriceAuthority = 'derived_from_reported_discount';
    }
  } else if (oldPrice && currentPrice && oldPrice > currentPrice) {
    discountPercent = Math.round(((oldPrice - currentPrice) / oldPrice) * 10000) / 100;
    discountAuthority = 'derived_from_prices';
  }

  return {
    currentPrice: currentPrice || 0,
    oldPrice,
    discountPercent,
    rangeAmbiguous,
    priceAuthority,
    oldPriceAuthority,
    discountAuthority,
  };
}

async function collectShopeeMarketplaceCandidatesSafe(options = {}) {
  const {
    caller = engine.callShopeeApiWithAuth,
    targetCategories = [0],
    page = 1,
    limit = 50,
    pages = 2,
    sortType = 2,
    isAMSOffer = true,
  } = options;

  const GRAPHQL_CONTRACTS = {
    productOfferV2: {
      query: `query productOfferV2($page: Int, $limit: Int, $productCatId: Int, $sortType: Int, $isAMSOffer: Boolean) {
        productOfferV2(page: $page, limit: $limit, productCatId: $productCatId, sortType: $sortType, isAMSOffer: $isAMSOffer) {
          nodes {
            itemId
            shopId
            shopName
            productName
            price
            priceMin
            priceMax
            priceDiscountRate
            officialOldPrice
            sales
            ratingStar
            commissionRate
            sellerCommissionRate
            offerLink
            productLink
            imageUrl
            shopType
          }
          pageInfo {
            page
            limit
            hasNextPage
          }
        }
      }`,
    },
  };

  const candidates = [];
  const seenIdentities = new Set();
  const pagesToScan = Math.max(1, Number(pages) || 1);
  const pageLimit = Math.max(1, Math.min(100, Number(limit) || 50));
  const basePage = Math.max(1, Number(page) || 1);

  for (const catId of targetCategories) {
    try {
      for (let offset = 0; offset < pagesToScan; offset += 1) {
        const currentPage = basePage + offset;
        const variables = {
          page: currentPage,
          limit: pageLimit,
          sortType: typeof sortType === 'number' ? sortType : 2,
        };
        if (catId) variables.productCatId = catId;
        if (typeof isAMSOffer === 'boolean') variables.isAMSOffer = isAMSOffer;

        const response = await caller(
          'ShopeePromotionOffers',
          GRAPHQL_CONTRACTS.productOfferV2.query,
          variables,
          { timeoutMs: 15000 },
        );

        const nodes = response?.data?.data?.productOfferV2?.nodes || [];
        if (!Array.isArray(nodes) || nodes.length === 0) break;

        for (const node of nodes) {
          const itemId = String(node.itemId || '').trim();
          const shopId = String(node.shopId || '').trim();
          const productName = String(node.productName || '').trim();
          if (!itemId || !productName) continue;

          const identityKey = `${shopId || '0'}:${itemId}`;
          if (seenIdentities.has(identityKey)) continue;
          seenIdentities.add(identityKey);

          const priceIntegrity = normalizePriceIntegrity({
            price: node.price,
            priceMin: node.priceMin,
            priceMax: node.priceMax,
            priceDiscountRate: node.priceDiscountRate,
            officialOldPrice: node.officialOldPrice,
          });
          const price = priceIntegrity.currentPrice;
          if (!(price > 0)) continue;

          const oldPrice = priceIntegrity.oldPrice;
          const discount = priceIntegrity.discountPercent ?? 0;
          const marketplaceReportedDiscountPercent = engine.parseNumber(node.priceDiscountRate, 0);
          const sales = parseInt(String(node.sales || '0'), 10) || 0;
          const ratingStar = engine.parseNumber(node.ratingStar, 0);
          const commission = resolveShopeeCommission(node);
          const effectiveCommissionPercent = commission.effectiveCommissionPercent || 0;
          const shopType = Array.isArray(node.shopType) ? node.shopType : [];
          const link = String(node.offerLink || node.productLink || '');

          candidates.push({
            marketplace: 'Shopee',
            itemId,
            shopId,
            shopName: String(node.shopName || ''),
            productName,
            category: 'Marketplace Deals',
            currentPrice: price,
            oldPrice,
            priceDiscountRate: engine.parseNumber(node.priceDiscountRate, discount),
            discountPercent: discount || engine.parseNumber(node.priceDiscountRate, 0),
            marketplaceReportedDiscountPercent,
            priceRangeAmbiguous: priceIntegrity.rangeAmbiguous,
            priceAuthority: priceIntegrity.priceAuthority,
            oldPriceAuthority: priceIntegrity.oldPriceAuthority,
            discountAuthority: priceIntegrity.discountAuthority,
            sales,
            ratingStar: ratingStar > 0 ? ratingStar : null,
            rating: ratingStar > 0 ? ratingStar : null,
            commissionRate: effectiveCommissionPercent,
            commissionPercent: effectiveCommissionPercent,
            sellerCommissionRate: 0,
            shopeeCommissionRate: commission.shopeeCommissionPercent,
            sellerCommissionRateObserved: commission.sellerCommissionPercent,
            commissionSource: commission.commissionSource,
            shopType,
            permalink: link,
            imageUrl: String(node.imageUrl || ''),
            provenance: 'shopee_openapi_productOfferV2',
            observedAt: new Date().toISOString(),
          });
        }

        const pageInfo = response?.data?.data?.productOfferV2?.pageInfo;
        if (pageInfo && pageInfo.hasNextPage === false) break;
      }
    } catch (_err) {
      // Falha isolada de categoria não aborta a coleta geral.
    }
  }

  return candidates;
}

const originalBuildTrendRadarProductsFromCandidates = engine.buildTrendRadarProductsFromCandidates;
let latestBuildContext = null;

function buildTrendRadarProductsVNextOfficial(options = {}) {
  const shopeeCandidates = Array.isArray(options.shopeeCandidates) ? options.shopeeCandidates : [];
  const mlCandidates = Array.isArray(options.mlCandidates) ? options.mlCandidates : [];
  const candidatePool = [...shopeeCandidates, ...mlCandidates];
  const maxProducts = Number(options.maxProducts) || 20;
  const minScore = Number.isFinite(Number(options.minScore)) ? Number(options.minScore) : 50;
  const radarRunId = options.radarRunId || null;
  const now = options.now || new Date();

  const selectedRows = selectRadarVNext(candidatePool, {
    maxProducts,
    minScore,
    maxPerStore: options.maxPerStore || 2,
    maxPerFamily: options.maxPerFamily || 3,
    scoreCandidate: options.scoreCandidate,
    contextForCandidate: options.contextForCandidate,
  });

  const products = selectedRows.map((row, idx) => engine.materializeTrendRadarProduct({
    candidate: row.candidate,
    score: row.score,
    strategyVersion: COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION,
    rank: idx + 1,
    radarRunId,
    now,
  }));

  latestBuildContext = {
    candidatePool,
    v4Products: products,
    maxProducts,
  };

  return products;
}

function buildTrendRadarProductsFromCandidatesWithPersistedDecision(options = {}) {
  const env = options.env || process.env;

  if (isRadarVNextOfficialEnabled(env)) {
    return buildTrendRadarProductsVNextOfficial(options);
  }

  const shopeeByIdentity = new Map();
  for (const candidate of options.shopeeCandidates || []) {
    const itemId = String(candidate.itemId || '').trim();
    const shopId = String(candidate.shopId || '').trim();
    if (itemId) shopeeByIdentity.set(`${shopId || '0'}:${itemId}`, candidate);
  }

  const products = originalBuildTrendRadarProductsFromCandidates(options).map((product) => {
    const decision = product.selection_decision
      || product.direct_evidence?.[0]?.selection_decision
      || product.direct_evidence?.[0]?.decision
      || null;

    const directEvidence = Array.isArray(product.direct_evidence)
      ? product.direct_evidence.map((entry, index) => {
          if (index !== 0 || product.marketplace !== 'Shopee') return entry;

          const itemId = String(entry?.marketplace_identity?.itemId || '').trim();
          const shopId = String(entry?.marketplace_identity?.shopId || '').trim();
          const candidate = shopeeByIdentity.get(`${shopId || '0'}:${itemId}`);
          if (!candidate) return entry;

          return {
            ...entry,
            commission_source: candidate.commissionSource || null,
            shopee_commission_percent: candidate.shopeeCommissionRate ?? null,
            seller_commission_percent: candidate.sellerCommissionRateObserved ?? null,
            commercial_metrics: {
              ...(entry.commercial_metrics || {}),
              commissionRate: candidate.commissionRate || candidate.commissionPercent || 0,
              shopeeCommissionRate: candidate.shopeeCommissionRate ?? null,
              sellerCommissionRate: candidate.sellerCommissionRateObserved ?? null,
              commissionSource: candidate.commissionSource || null,
            },
          };
        })
      : product.direct_evidence;

    return {
      ...product,
      selection_decision: decision,
      direct_evidence: directEvidence,
    };
  });

  latestBuildContext = {
    candidatePool: [
      ...(Array.isArray(options.shopeeCandidates) ? options.shopeeCandidates : []),
      ...(Array.isArray(options.mlCandidates) ? options.mlCandidates : []),
    ],
    v4Products: products,
    maxProducts: Number(options.maxProducts) || 20,
  };

  return products;
}

engine.collectShopeeMarketplaceCandidates = collectShopeeMarketplaceCandidatesSafe;
engine.buildTrendRadarProductsFromCandidates = buildTrendRadarProductsFromCandidatesWithPersistedDecision;

const runner = require('./oracle-trends-radar-runner.cjs');

async function processPendingTrendRadarRunsWithVNextShadow(options = {}) {
  latestBuildContext = null;
  const runnerFn = options.runnerProcessPendingTrendRadarRuns || runner.processPendingTrendRadarRuns;
  const result = await runnerFn(options);
  const env = options.env || process.env;

  const isOfficialOn = isRadarVNextOfficialEnabled(env);
  const isShadowOn = isRadarVNextShadowEnabled(env);

  if (isOfficialOn && isShadowOn) {
    const skippedHealth = {
      ...(result?.sourceHealth || {}),
      vnext_shadow: {
        skipped: true,
        reason: 'vnext_official_active',
      },
    };
    if (!options.dryRun) {
      const client = options.client || runner.createRadarAdminClient(env);
      if (client && result?.runId) {
        await persistRadarVNextShadowDiagnostics(client, result.runId, skippedHealth);
      }
    }
    return {
      ...result,
      sourceHealth: skippedHealth,
    };
  }

  if (!isShadowOn || !result?.processed || !latestBuildContext) {
    return result;
  }

  try {
    const comparison = buildRadarVNextShadowComparison({
      candidatePool: latestBuildContext.candidatePool,
      v4Products: latestBuildContext.v4Products,
      maxProducts: latestBuildContext.maxProducts,
      minScore: 50,
    });
    const sourceHealth = buildShadowSourceHealth(result.sourceHealth, comparison);

    if (!options.dryRun) {
      const client = options.client || runner.createRadarAdminClient(env);
      if (client && result.runId) {
        await persistRadarVNextShadowDiagnostics(client, result.runId, sourceHealth);
      }
    }

    return {
      ...result,
      sourceHealth,
    };
  } catch (error) {
    console.error(`[Oracle Radar VNext Shadow] diagnóstico ignorado após falha isolada: ${error.message}`);
    return result;
  }
}

module.exports = {
  ...runner,
  VNEXT_OFFICIAL_ENV,
  isRadarVNextOfficialEnabled,
  normalizeShopeeCommissionPercent,
  resolveShopeeCommission,
  collectShopeeMarketplaceCandidatesSafe,
  buildTrendRadarProductsVNextOfficial,
  buildTrendRadarProductsFromCandidates: buildTrendRadarProductsFromCandidatesWithPersistedDecision,
  processPendingTrendRadarRuns: processPendingTrendRadarRunsWithVNextShadow,
};
