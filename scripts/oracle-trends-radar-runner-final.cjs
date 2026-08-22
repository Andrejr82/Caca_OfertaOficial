'use strict';

const engine = require('./oracle-trends-radar-engine.cjs');
const {
  GRAPHQL_CONTRACTS,
  createSignedRequest,
  normalizePriceIntegrity,
} = require('./shopee-openapi-shadow-engine-v1.cjs');
const {
  buildRadarVNextShadowComparison,
} = require('./radar-vnext-shadow.cjs');
const {
  isRadarVNextShadowEnabled,
  buildShadowSourceHealth,
  persistRadarVNextShadowDiagnostics,
} = require('./radar-vnext-shadow-runtime.cjs');

function normalizeShopeeCommissionPercent(value) {
  const num = engine.parseOptionalNumber(value);
  if (num === null || num <= 0) return null;
  const percent = num < 1 ? num * 100 : num;
  const rounded = Math.round(percent * 100) / 100;
  return rounded > 0 && rounded <= 100 ? rounded : null;
}

function resolveShopeeCommission(node = {}) {
  const total = normalizeShopeeCommissionPercent(node.commissionRate);
  const shopee = normalizeShopeeCommissionPercent(node.shopeeCommissionRate);
  const seller = normalizeShopeeCommissionPercent(node.sellerCommissionRate);

  if (total !== null) {
    return {
      effectiveCommissionPercent: total,
      shopeeCommissionPercent: shopee,
      sellerCommissionPercent: seller,
      commissionSource: 'commissionRate_total',
    };
  }

  const components = Math.round(((shopee || 0) + (seller || 0)) * 100) / 100;
  if (components > 0 && components <= 100) {
    return {
      effectiveCommissionPercent: components,
      shopeeCommissionPercent: shopee,
      sellerCommissionPercent: seller,
      commissionSource: 'official_components',
    };
  }

  return {
    effectiveCommissionPercent: null,
    shopeeCommissionPercent: shopee,
    sellerCommissionPercent: seller,
    commissionSource: 'unknown',
  };
}

function defaultShopeeApiCaller(env = process.env) {
  const appId = env.SHOPEE_APP_ID;
  const appSecret = env.SHOPEE_APP_SECRET;
  if (!appId || !appSecret) return null;
  return createSignedRequest({
    appId,
    appSecret,
    request: async ({ body, headers }) => {
      const response = await fetch('https://open-api.affiliate.shopee.com.br/graphql', {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(30000),
      });
      return { status: response.status, data: await response.json() };
    },
  });
}

async function collectShopeeMarketplaceCandidatesSafe({
  request = null,
  categoryIds = engine.SHOPEE_BROAD_DISCOVERY_CATEGORIES,
  maxPerCategory = 40,
  maxPagesPerCategory = 2,
  page = 1,
  sortType = 2,
  isAMSOffer = undefined,
  env = process.env,
} = {}) {
  const caller = request || defaultShopeeApiCaller(env);
  if (!caller) return [];

  const candidates = [];
  const seenIdentities = new Set();
  const targetCategories = Array.isArray(categoryIds) && categoryIds.length > 0 ? categoryIds : [null];
  const pageLimit = Math.max(5, Math.min(50, Number(maxPerCategory) || 40));
  const pagesToScan = Math.max(1, Math.min(5, Math.floor(Number(maxPagesPerCategory) || 2)));
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

function buildTrendRadarProductsFromCandidatesWithPersistedDecision(options = {}) {
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
  const result = await runner.processPendingTrendRadarRuns(options);
  const env = options.env || process.env;

  if (!isRadarVNextShadowEnabled(env) || !result?.processed || !latestBuildContext) {
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
  normalizeShopeeCommissionPercent,
  resolveShopeeCommission,
  collectShopeeMarketplaceCandidatesSafe,
  buildTrendRadarProductsFromCandidates: buildTrendRadarProductsFromCandidatesWithPersistedDecision,
  processPendingTrendRadarRuns: processPendingTrendRadarRunsWithVNextShadow,
};
